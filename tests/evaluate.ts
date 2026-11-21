import http from 'http';
import assert from 'assert';
import { createApp } from '../server.ts';
import { db } from '../server/db.ts';
import { runPlaywrightScan } from '../server/scanner.ts';
import { buildConsentFingerprint, compareScans } from '../server/comparison.ts';
import { classifyCookie } from '../server/rules.ts';
import { validateScanTargetUrl, hashPassword } from '../server/security.ts';

async function main() {
  const app = createApp();
  app.get('/test-lab/no-banner-site', (_req, res) => {
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>No Banner</title></head><body><h1>Static Content Page</h1><p>No CMP banner exists on this page.</p></body></html>`);
  });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral evaluation port');
  }
  const port = address.port;
  console.log(`\n[ClarityTrace Evaluation] Ephemeral server started on 127.0.0.1:${port}`);

  try {
    // 1. SSRF Guard Verification Tests
    console.log('\n[1/4] Verifying SSRF Protection & URL Validation...');
    const ssrfTargets = [
      'http://127.0.0.1:8080/admin',
      'http://localhost:3000/api/health',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/internal',
      'http://192.168.1.1/router',
      'http://[::ffff:127.0.0.1]/admin',
      'http://[::ffff:169.254.169.254]/latest/meta-data/',
      'http://0x7f000001/admin',
      'http://2130706433/admin',
      'file:///etc/passwd',
    ];
    for (const badUrl of ssrfTargets) {
      const res = await validateScanTargetUrl(badUrl, { allowTestLab: false, serverPort: port });
      assert.strictEqual(res.valid, false, `Expected SSRF block for ${badUrl}`);
    }
    const traversalCheck = await validateScanTargetUrl(
      `http://127.0.0.1:${port}/test-lab/%2e%2e/api/health`,
      { allowTestLab: true, serverPort: port }
    );
    assert.strictEqual(traversalCheck.valid, false, 'Expected path traversal blocking on Test Lab allowlist');

    const stripeCk = classifyCookie({
      name: '__stripe_mid',
      domain: 'checkout.stripe.com',
      isThirdParty: true,
      expiresAt: null,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    });
    assert.strictEqual(stripeCk.category, 'payment', 'Expected allowlisted payment gateway cookie NOT to trigger advertising FP');
    console.log(`  PASS: All ${ssrfTargets.length} SSRF targets + traversal blocked; allowlisted payment cookie classified cleanly.`);

    // Setup test user in DB
    const testEmail = `eval_${Date.now()}@claritytrace.test`;
    const userInfo = db
      .prepare(`INSERT INTO users (email, name, password_hash) VALUES (?, 'Evaluator', ?)`)
      .run(testEmail, hashPassword('eval-pass-123'));
    const userId = Number(userInfo.lastInsertRowid);

    const createSiteAndScan = async (name: string, urlPath: string, releaseLabel?: string, existingSiteId?: number) => {
      const targetUrl = `http://127.0.0.1:${port}${urlPath}`;
      let siteId = existingSiteId;
      if (!siteId) {
        const wInfo = db
          .prepare(
            `INSERT INTO websites (user_id, name, url, domain, authorized_confirmed, is_test_lab)
             VALUES (?, ?, ?, '127.0.0.1', 1, 1)`
          )
          .run(userId, name, targetUrl);
        siteId = Number(wInfo.lastInsertRowid);
      }

      const sInfo = db
        .prepare(
          `INSERT INTO scans (website_id, user_id, status, trigger_type, target_url, release_label)
           VALUES (?, ?, 'queued', 'automated_eval', ?, ?)`
        )
        .run(siteId, userId, targetUrl, releaseLabel || null);
      const scanId = Number(sInfo.lastInsertRowid);

      await runPlaywrightScan({
        scanId,
        websiteId: siteId,
        targetUrl,
        siteDomain: '127.0.0.1',
        verifyReload: true,
        runPolicyAnalysis: false,
        serverPort: port,
      });

      const findings = db
        .prepare(`SELECT * FROM findings WHERE scan_id = ?`)
        .all(scanId) as Array<{ category: string; severity: string; title: string; consent_state_key: string }>;

      return { siteId, scanId, findings };
    };

    // 2. Run Scenarios A-F via real headless Playwright Chromium
    console.log('\n[2/4] Executing Real Playwright Scans on Scenarios A–F...');
    const resA = await createSiteAndScan('Eval A', '/test-lab/scenario-a');
    const resB = await createSiteAndScan('Eval B', '/test-lab/scenario-b');
    const resC = await createSiteAndScan('Eval C', '/test-lab/scenario-c');
    const resD1 = await createSiteAndScan('Eval D Run 1', '/test-lab/scenario-d');
    const resD2 = await createSiteAndScan('Eval D Run 2', '/test-lab/scenario-d', 'repeat', resD1.siteId);

    // Scenario E: Baseline v1 -> Release v2 (new tracker)
    const resE1 = await createSiteAndScan('Eval E', '/test-lab/scenario-e?release=v1', 'v1');
    const resE2 = await createSiteAndScan('Eval E', '/test-lab/scenario-e?release=v2', 'v2', resE1.siteId);

    // Scenario F: Baseline v1 -> Release v2 (legitimate payment gateway, NOT a tracker)
    const resF1 = await createSiteAndScan('Eval F', '/test-lab/scenario-f?release=v1', 'v1');
    const resF2 = await createSiteAndScan('Eval F', '/test-lab/scenario-f?release=v2', 'v2', resF1.siteId);

    // 3. Evaluate Detection Metrics (Precision, Recall, FP, FN, Reproducibility, Baseline Accuracy)
    console.log('\n[3/4] Evaluating Classification & Regression Accuracy...');
    const isPrivacyViolation = (f: { severity: string; category: string }) =>
      ['high', 'critical', 'medium'].includes(f.severity) && f.category !== 'legitimate_change';

    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    // Scenario A: Expected NO violations
    const aViolations = resA.findings.filter(isPrivacyViolation);
    if (aViolations.length === 0) tn++;
    else fp += aViolations.length;

    // Scenario B: Expected pre-consent violation (cookie or request)
    const bPreConsent = resB.findings.filter((f) => f.consent_state_key === 'no_consent' && isPrivacyViolation(f));
    if (bPreConsent.length > 0) tp++;
    else fn++;

    // Scenario C: Expected post-reject violation
    const cPostReject = resC.findings.filter((f) => f.consent_state_key === 'reject_all' && isPrivacyViolation(f));
    if (cPostReject.length > 0) tp++;
    else fn++;

    // Scenario D: Expected compliant opt-in (NO high/critical violations in no_consent or reject_all)
    const dViolations = resD1.findings.filter(isPrivacyViolation);
    if (dViolations.length === 0) tn++;
    else fp += dViolations.length;

    // Scenario E: Expected baseline comparison detects new tracker regression
    const diffE = compareScans(resE1.siteId, resE2.scanId, resE1.scanId);
    const eDetected = diffE.newTrackingDomains.length > 0 || diffE.consentRegressions.length > 0;
    if (eDetected) tp++;
    else fn++;

    // Scenario F: Expected baseline comparison does NOT report payment gateway as a tracker (0 false positives!)
    const diffF = compareScans(resF1.siteId, resF2.scanId, resF1.scanId);
    const fTrackerFalsePositive = diffF.newTrackingDomains.length > 0 || resF2.findings.some(isPrivacyViolation);
    if (!fTrackerFalsePositive && diffF.newRequestDomains.some((d) => d.category === 'payment')) tn++;
    else fp++;

    // Reproducibility check between D1 and D2
    const m1 = compareScans(resD1.siteId, resD1.scanId).crossConsentMatrix;
    const m2 = compareScans(resD2.siteId, resD2.scanId).crossConsentMatrix;
    const reproducible =
      m1.no_consent?.trackerRequests === m2.no_consent?.trackerRequests &&
      m1.accept_all?.trackerRequests === m2.accept_all?.trackerRequests &&
      m1.reject_all?.trackerRequests === m2.reject_all?.trackerRequests;

    // Fingerprint SHA-256 determinism across repeated scans of Scenario D
    const fpD1 = buildConsentFingerprint(resD1.scanId);
    const fpD2 = buildConsentFingerprint(resD2.scanId);
    const fingerprintDeterministic = fpD1.sha256Hash === fpD2.sha256Hash;

    // Missing CMP banner inconclusive consent verification
    const resNoBanner = await createSiteAndScan('Eval No Banner', '/test-lab/no-banner-site');
    const noBannerStates = db
      .prepare(`SELECT state_key, status FROM consent_states WHERE scan_id = ?`)
      .all(resNoBanner.scanId) as Array<{ state_key: string; status: string }>;
    const acceptInconclusive = noBannerStates.find((s) => s.state_key === 'accept_all')?.status === 'inconclusive';
    const rejectInconclusive = noBannerStates.find((s) => s.state_key === 'reject_all')?.status === 'inconclusive';
    const hasInconclusiveFinding = resNoBanner.findings.some((f) => f.category === 'inconclusive_consent');

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1;

    console.log('\n[4/4] Evaluation Scorecard:');
    console.log(`  True Positives (B, C, E):         ${tp}`);
    console.log(`  True Negatives (A, D, F):         ${tn}`);
    console.log(`  False Positives:                  ${fp}`);
    console.log(`  False Negatives:                  ${fn}`);
    console.log(`  Detection Precision:              ${(precision * 100).toFixed(1)}%`);
    console.log(`  Detection Recall:                 ${(recall * 100).toFixed(1)}%`);
    console.log(`  Consent-State Reproducibility:    ${reproducible ? '100% PASS' : 'FAIL'}`);
    console.log(`  Fingerprint SHA-256 Determinism:  ${fingerprintDeterministic ? '100% PASS' : 'FAIL'}`);
    console.log(`  Inconclusive No-Banner Handling:  ${acceptInconclusive && rejectInconclusive && hasInconclusiveFinding ? '100% PASS' : 'FAIL'}`);
    console.log(`  Baseline Comparison Accuracy:     ${eDetected && !fTrackerFalsePositive ? '100% PASS' : 'FAIL'}`);

    assert.strictEqual(fp, 0, 'Expected 0 false positives across clean & payment scenarios');
    assert.strictEqual(fn, 0, 'Expected 0 false negatives across violation & regression scenarios');
    assert.strictEqual(reproducible, true, 'Expected deterministic consent-state reproducibility');
    assert.strictEqual(fingerprintDeterministic, true, 'Expected identical SHA-256 fingerprints across repeated clean runs');
    assert.strictEqual(acceptInconclusive && rejectInconclusive && hasInconclusiveFinding, true, 'Expected inconclusive status & finding when no CMP banner exists');
    console.log('\nALL AUTOMATED EVALUATION CHECKS PASSED.');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

main().catch((err) => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
