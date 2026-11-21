import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { db, initDatabase } from './server/db.ts';
import {
  getJwtSecret,
  hashPassword,
  requireAuth,
  resolveSafeEvidencePath,
  signAuthToken,
  validateScanTargetUrl,
  verifyPassword,
  type AuthRequest,
} from './server/security.ts';
import { getScanCapacityState, runPlaywrightScan, scanEvents, type ScanProgressEvent } from './server/scanner.ts';
import { buildConsentFingerprint, compareScans } from './server/comparison.ts';
import { analyzePrivacyPolicyWithGemini, explainFindingWithGemini, fetchPrivacyPolicyText } from './server/gemini.ts';
import { registerTestLabRoutes } from './server/testLab.ts';
import type { ConsentStateKey } from './server/consent.ts';

const PORT = Number(process.env.PORT || 3000);

export function createApp() {
  initDatabase();
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Controlled Evaluation Test Lab HTML/collector routes (Stage 7)
  registerTestLabRoutes(app);

  // Healthcheck
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ClarityTrace', timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Module A: Authentication
  // ---------------------------------------------------------------------------
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email, password, name, organization } = req.body || {};
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const pwHash = hashPassword(String(password));
    const info = db
      .prepare(`INSERT INTO users (email, name, organization, password_hash) VALUES (?, ?, ?, ?)`)
      .run(normalizedEmail, String(name).trim(), String(organization || 'Privacy Engineering').trim(), pwHash);
    const userId = Number(info.lastInsertRowid);

    const token = signAuthToken({
      userId,
      email: normalizedEmail,
      name: String(name).trim(),
      role: 'engineer',
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        name: String(name).trim(),
        organization: String(organization || 'Privacy Engineering').trim(),
        role: 'engineer',
      },
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db
      .prepare(`SELECT id, email, name, organization, password_hash, role FROM users WHERE email = ?`)
      .get(normalizedEmail) as
      | {
          id: number;
          email: string;
          name: string;
          organization: string;
          password_hash: string;
          role: string;
        }
      | undefined;

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        role: user.role,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
    const user = db
      .prepare(`SELECT id, email, name, organization, role, created_at FROM users WHERE id = ?`)
      .get(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user });
  });

  // ---------------------------------------------------------------------------
  // Dashboard Statistics
  // ---------------------------------------------------------------------------
  app.get('/api/dashboard', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.user!.userId;
    const totalWebsites = (
      db.prepare(`SELECT COUNT(*) as c FROM websites WHERE user_id = ?`).get(uid) as { c: number }
    ).c;

    const totalScans = (
      db.prepare(`SELECT COUNT(*) as c FROM scans WHERE user_id = ?`).get(uid) as { c: number }
    ).c;

    const newFindings = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM findings f
           JOIN websites w ON w.id = f.website_id
           WHERE w.user_id = ? AND f.status = 'open'`
        )
        .get(uid) as { c: number }
    ).c;

    const highSeverityFindings = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM findings f
           JOIN websites w ON w.id = f.website_id
           WHERE w.user_id = ? AND f.status = 'open' AND f.severity IN ('high', 'critical')`
        )
        .get(uid) as { c: number }
    ).c;

    const recentScans = db
      .prepare(
        `SELECT s.id, s.website_id, w.name as website_name, w.domain, s.target_url, s.status,
                s.release_label, s.is_baseline, s.started_at, s.completed_at, s.summary_json,
                (SELECT COUNT(*) FROM findings f WHERE f.scan_id = s.id) as findings_count
         FROM scans s
         JOIN websites w ON w.id = s.website_id
         WHERE s.user_id = ?
         ORDER BY s.id DESC
         LIMIT 12`
      )
      .all(uid);

    const recentFindings = db
      .prepare(
        `SELECT f.id, f.scan_id, f.website_id, w.name as website_name, f.title, f.severity,
                f.confidence, f.consent_state_key, f.category, f.status, f.created_at
         FROM findings f
         JOIN websites w ON w.id = f.website_id
         WHERE w.user_id = ?
         ORDER BY f.id DESC
         LIMIT 8`
      )
      .all(uid);

    res.json({
      stats: { totalWebsites, totalScans, newFindings, highSeverityFindings },
      recentScans,
      recentFindings,
    });
  });

  // ---------------------------------------------------------------------------
  // Module B: Websites & URL / SSRF Validation
  // ---------------------------------------------------------------------------
  app.post('/api/websites/validate-url', requireAuth, async (req: AuthRequest, res: Response) => {
    const { url, allowTestLab } = req.body || {};
    const check = await validateScanTargetUrl(String(url || ''), {
      allowTestLab: Boolean(allowTestLab),
      serverPort: PORT,
    });
    res.json(check);
  });

  app.get('/api/websites', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.user!.userId;
    const rows = db
      .prepare(
        `SELECT w.*,
                (SELECT COUNT(*) FROM scans s WHERE s.website_id = w.id) as scan_count,
                (SELECT s.id FROM scans s WHERE s.website_id = w.id ORDER BY s.id DESC LIMIT 1) as latest_scan_id,
                (SELECT s.status FROM scans s WHERE s.website_id = w.id ORDER BY s.id DESC LIMIT 1) as latest_scan_status,
                (SELECT b.scan_id FROM baselines b WHERE b.website_id = w.id) as baseline_scan_id,
                (SELECT COUNT(*) FROM findings f WHERE f.website_id = w.id AND f.status = 'open') as open_findings_count
         FROM websites w
         WHERE w.user_id = ?
         ORDER BY w.id DESC`
      )
      .all(uid);
    res.json({ websites: rows });
  });

  app.post('/api/websites', requireAuth, async (req: AuthRequest, res: Response) => {
    const { name, url, privacyPolicyUrl, authorizedConfirmed, scanFrequency, isTestLab } = req.body || {};
    if (!authorizedConfirmed) {
      res.status(400).json({ error: 'Authorization confirmation is required before adding a scan target.' });
      return;
    }

    const check = await validateScanTargetUrl(String(url || ''), {
      allowTestLab: Boolean(isTestLab),
      serverPort: PORT,
    });

    if (!check.valid || !check.normalizedUrl || !check.domain) {
      res.status(400).json({ error: check.reason || 'URL failed validation.' });
      return;
    }

    let normalizedPolicyUrl: string | null = null;
    if (privacyPolicyUrl && String(privacyPolicyUrl).trim()) {
      const pCheck = await validateScanTargetUrl(String(privacyPolicyUrl).trim(), {
        allowTestLab: Boolean(isTestLab),
        serverPort: PORT,
      });
      if (!pCheck.valid) {
        res.status(400).json({ error: `Privacy Policy URL invalid: ${pCheck.reason}` });
        return;
      }
      normalizedPolicyUrl = pCheck.normalizedUrl || null;
    }

    const info = db
      .prepare(
        `INSERT INTO websites (user_id, name, url, domain, privacy_policy_url, authorized_confirmed, scan_frequency, is_test_lab)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        req.user!.userId,
        String(name || check.domain).trim(),
        check.normalizedUrl,
        check.domain,
        normalizedPolicyUrl,
        String(scanFrequency || 'manual'),
        check.isTestLab ? 1 : 0
      );

    const created = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json({ website: created, resolvedIps: check.resolvedIps });
  });

  app.delete('/api/websites/:id', requireAuth, (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    const owned = db
      .prepare(`SELECT id FROM websites WHERE id = ? AND user_id = ?`)
      .get(id, req.user!.userId);
    if (!owned) {
      res.status(404).json({ error: 'Website not found.' });
      return;
    }
    db.prepare(`DELETE FROM websites WHERE id = ?`).run(id);
    res.json({ deleted: true });
  });

  // ---------------------------------------------------------------------------
  // Module B/C: Scans & Real-Time SSE Progress
  // ---------------------------------------------------------------------------
  app.get('/api/scans', requireAuth, (req: AuthRequest, res: Response) => {
    const websiteId = req.query.websiteId ? Number(req.query.websiteId) : null;
    const sql = websiteId
      ? `SELECT s.*, w.name as website_name, w.domain,
                (SELECT COUNT(*) FROM findings f WHERE f.scan_id = s.id) as findings_count
         FROM scans s JOIN websites w ON w.id = s.website_id
         WHERE s.user_id = ? AND s.website_id = ?
         ORDER BY s.id DESC`
      : `SELECT s.*, w.name as website_name, w.domain,
                (SELECT COUNT(*) FROM findings f WHERE f.scan_id = s.id) as findings_count
         FROM scans s JOIN websites w ON w.id = s.website_id
         WHERE s.user_id = ?
         ORDER BY s.id DESC`;

    const scans = websiteId
      ? db.prepare(sql).all(req.user!.userId, websiteId)
      : db.prepare(sql).all(req.user!.userId);
    res.json({ scans });
  });

  app.post('/api/scans', requireAuth, async (req: AuthRequest, res: Response) => {
    const {
      websiteId,
      targetUrlOverride,
      releaseLabel,
      statesToTest,
      verifyReload,
      runPolicyAnalysis,
      viewportWidth,
      viewportHeight,
      observationMs,
    } = req.body || {};

    const website = db
      .prepare(`SELECT * FROM websites WHERE id = ? AND user_id = ?`)
      .get(Number(websiteId), req.user!.userId) as
      | {
          id: number;
          url: string;
          domain: string;
          privacy_policy_url: string | null;
          is_test_lab: number;
        }
      | undefined;

    if (!website) {
      res.status(404).json({ error: 'Website not found.' });
      return;
    }

    const scanUrl = targetUrlOverride ? String(targetUrlOverride).trim() : website.url;
    const urlCheck = await validateScanTargetUrl(scanUrl, {
      allowTestLab: website.is_test_lab === 1,
      serverPort: PORT,
    });
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      res.status(400).json({ error: urlCheck.reason || 'Scan URL failed SSRF validation.' });
      return;
    }

    const validStates: ConsentStateKey[] = Array.isArray(statesToTest) && statesToTest.length > 0
      ? statesToTest.filter((s: string): s is ConsentStateKey =>
          ['no_consent', 'accept_all', 'reject_all'].includes(s)
        )
      : ['no_consent', 'accept_all', 'reject_all'];

    const capacity = getScanCapacityState();
    if (!capacity.acceptMore) {
      res.status(429).json({
        error: `Scanner queue is at capacity (${capacity.active} active, ${capacity.queued} queued). Please try again shortly.`,
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO scans (website_id, user_id, status, trigger_type, target_url, release_label)
         VALUES (?, ?, 'queued', 'manual', ?, ?)`
      )
      .run(website.id, req.user!.userId, urlCheck.normalizedUrl, releaseLabel ? String(releaseLabel).trim() : null);

    const scanId = Number(info.lastInsertRowid);

    // Execute real Playwright scan asynchronously and stream events over SSE
    setImmediate(() => {
      runPlaywrightScan({
        scanId,
        websiteId: website.id,
        targetUrl: urlCheck.normalizedUrl!,
        siteDomain: urlCheck.domain || website.domain,
        privacyPolicyUrl: website.privacy_policy_url,
        statesToTest: validStates,
        verifyReload: verifyReload !== false,
        runPolicyAnalysis: Boolean(runPolicyAnalysis),
        viewportWidth: viewportWidth ? Number(viewportWidth) : 1440,
        viewportHeight: viewportHeight ? Number(viewportHeight) : 900,
        observationMs: observationMs ? Number(observationMs) : 1200,
        serverPort: PORT,
      }).catch((err) => {
        console.error(`Scan #${scanId} background error:`, err);
      });
    });

    const scanRow = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(scanId);
    res.status(202).json({ scan: scanRow });
  });

  // Direct URL-to-Scan endpoint for Scan Configuration screen
  app.post('/api/quick-scan', requireAuth, async (req: AuthRequest, res: Response) => {
    const {
      url,
      scanName,
      statesToTest,
      verifyReload,
      viewportWidth,
      viewportHeight,
      observationMs,
    } = req.body || {};

    let raw = String(url || '').trim();
    if (raw && !/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    const urlCheck = await validateScanTargetUrl(raw, {
      allowTestLab: true,
      serverPort: PORT,
    });
    if (!urlCheck.valid || !urlCheck.normalizedUrl || !urlCheck.domain) {
      res.status(400).json({ error: urlCheck.reason || 'Invalid or blocked target URL.' });
      return;
    }

    let website = db
      .prepare(`SELECT * FROM websites WHERE user_id = ? AND url = ?`)
      .get(req.user!.userId, urlCheck.normalizedUrl) as
      | { id: number; url: string; domain: string; privacy_policy_url: string | null; is_test_lab: number }
      | undefined;

    if (!website) {
      const wInfo = db
        .prepare(
          `INSERT INTO websites (user_id, name, url, domain, authorized_confirmed, is_test_lab)
           VALUES (?, ?, ?, ?, 1, ?)`
        )
        .run(
          req.user!.userId,
          scanName ? String(scanName).trim() : urlCheck.domain,
          urlCheck.normalizedUrl,
          urlCheck.domain,
          urlCheck.isTestLab ? 1 : 0
        );
      website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(Number(wInfo.lastInsertRowid)) as typeof website;
    }

    const validStates: ConsentStateKey[] = Array.isArray(statesToTest) && statesToTest.length > 0
      ? statesToTest.filter((s: string): s is ConsentStateKey =>
          ['no_consent', 'accept_all', 'reject_all'].includes(s)
        )
      : ['no_consent', 'accept_all', 'reject_all'];

    const capacity = getScanCapacityState();
    if (!capacity.acceptMore) {
      res.status(429).json({
        error: `Scanner queue is at capacity (${capacity.active} active, ${capacity.queued} queued). Please try again shortly.`,
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO scans (website_id, user_id, status, trigger_type, target_url, release_label)
         VALUES (?, ?, 'queued', 'manual', ?, ?)`
      )
      .run(
        website!.id,
        req.user!.userId,
        urlCheck.normalizedUrl,
        scanName ? String(scanName).trim() : null
      );
    const scanId = Number(info.lastInsertRowid);

    setImmediate(() => {
      runPlaywrightScan({
        scanId,
        websiteId: website!.id,
        targetUrl: urlCheck.normalizedUrl!,
        siteDomain: urlCheck.domain!,
        privacyPolicyUrl: website!.privacy_policy_url,
        statesToTest: validStates,
        verifyReload: verifyReload !== false,
        viewportWidth: viewportWidth ? Number(viewportWidth) : 1440,
        viewportHeight: viewportHeight ? Number(viewportHeight) : 900,
        observationMs: observationMs ? Number(observationMs) : 1200,
        serverPort: PORT,
      }).catch((err) => {
        console.error(`Quick scan #${scanId} error:`, err);
      });
    });

    const scanRow = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(scanId);
    res.status(202).json({ scan: scanRow, website });
  });

  app.get('/api/scans/:id/stream', requireAuth, (req: AuthRequest, res: Response) => {
    const scanId = Number(req.params.id);
    const scan = db
      .prepare(`SELECT id, status, error_message, summary_json FROM scans WHERE id = ? AND user_id = ?`)
      .get(scanId, req.user!.userId) as
      | { id: number; status: string; error_message: string | null; summary_json: string | null }
      | undefined;

    if (!scan) {
      res.status(404).json({ error: 'Scan not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (evt: ScanProgressEvent) => {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    };

    if (scan.status === 'completed' || scan.status === 'failed') {
      sendEvent({
        scanId,
        stepNumber: 11,
        stepTitle: scan.status === 'completed' ? 'Saving scan results' : 'Scan incomplete',
        stage: scan.status,
        message: scan.status === 'completed' ? 'Scan completed.' : scan.error_message || 'Scan failed.',
        requestsCaptured: 0,
        cookiesCaptured: 0,
        thirdPartyDomainsDetected: 0,
        timestamp: new Date().toISOString(),
        status: scan.status === 'completed' ? 'completed' : 'failed',
      });
      res.end();
      return;
    }

    const listener = (evt: ScanProgressEvent) => {
      sendEvent(evt);
      if (evt.status === 'completed' || evt.status === 'failed') {
        cleanup();
        res.end();
      }
    };

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      scanEvents.off(`scan:${scanId}`, listener);
    };

    scanEvents.on(`scan:${scanId}`, listener);
    req.on('close', cleanup);
  });

  app.get('/api/scans/:id', requireAuth, (req: AuthRequest, res: Response) => {
    const scanId = Number(req.params.id);
    const scan = db
      .prepare(
        `SELECT s.*, w.name as website_name, w.domain, w.url as website_url, w.privacy_policy_url
         FROM scans s JOIN websites w ON w.id = s.website_id
         WHERE s.id = ? AND s.user_id = ?`
      )
      .get(scanId, req.user!.userId);

    if (!scan) {
      res.status(404).json({ error: 'Scan not found.' });
      return;
    }

    const consentStates = db
      .prepare(`SELECT * FROM consent_states WHERE scan_id = ? ORDER BY id ASC`)
      .all(scanId);

    const requests = db
      .prepare(
        `SELECT nr.*, cs.state_key, tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
         FROM network_requests nr
         JOIN consent_states cs ON cs.id = nr.consent_state_id
         LEFT JOIN tracker_classifications tc ON tc.target_type = 'request' AND tc.target_ref_id = nr.id
         WHERE nr.scan_id = ?
         ORDER BY nr.id ASC`
      )
      .all(scanId);

    const cookies = db
      .prepare(
        `SELECT ck.*, cs.state_key, tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
         FROM cookies ck
         JOIN consent_states cs ON cs.id = ck.consent_state_id
         LEFT JOIN tracker_classifications tc ON tc.target_type = 'cookie' AND tc.target_ref_id = ck.id
         WHERE ck.scan_id = ?
         ORDER BY ck.id ASC`
      )
      .all(scanId);

    const storage = db
      .prepare(
        `SELECT so.*, cs.state_key, tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
         FROM storage_observations so
         JOIN consent_states cs ON cs.id = so.consent_state_id
         LEFT JOIN tracker_classifications tc ON tc.target_type = 'storage' AND tc.target_ref_id = so.id
         WHERE so.scan_id = ?
         ORDER BY so.id ASC`
      )
      .all(scanId);

    const findings = db
      .prepare(`SELECT * FROM findings WHERE scan_id = ? ORDER BY id ASC`)
      .all(scanId);

    const evidenceFiles = db
      .prepare(`SELECT * FROM evidence_files WHERE scan_id = ? ORDER BY id ASC`)
      .all(scanId);

    const consentFingerprint = buildConsentFingerprint(scanId);

    res.json({
      scan,
      consentStates,
      requests,
      cookies,
      storage,
      findings,
      evidenceFiles,
      consentFingerprint,
    });
  });

  app.post('/api/scans/:id/baseline', requireAuth, (req: AuthRequest, res: Response) => {
    const scanId = Number(req.params.id);
    const scan = db
      .prepare(`SELECT id, website_id, status FROM scans WHERE id = ? AND user_id = ?`)
      .get(scanId, req.user!.userId) as { id: number; website_id: number; status: string } | undefined;

    if (!scan || scan.status !== 'completed') {
      res.status(400).json({ error: 'Only completed scans can be pinned as a baseline.' });
      return;
    }

    db.prepare(`UPDATE scans SET is_baseline = 0 WHERE website_id = ?`).run(scan.website_id);
    db.prepare(`UPDATE scans SET is_baseline = 1 WHERE id = ?`).run(scanId);
    db.prepare(
      `INSERT INTO baselines (website_id, scan_id, set_by_user_id, label)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(website_id) DO UPDATE SET scan_id = excluded.scan_id, set_by_user_id = excluded.set_by_user_id, created_at = datetime('now')`
    ).run(scan.website_id, scanId, req.user!.userId, String(req.body?.label || 'Pinned Baseline'));

    res.json({ ok: true, baselineScanId: scanId });
  });

  // Evidence file download (HAR / storage JSON) with strict path boundary check
  app.get('/api/evidence/:id/download', requireAuth, (req: AuthRequest, res: Response) => {
    const evId = Number(req.params.id);
    const row = db
      .prepare(
        `SELECT ef.* FROM evidence_files ef
         JOIN scans s ON s.id = ef.scan_id
         WHERE ef.id = ? AND s.user_id = ?`
      )
      .get(evId, req.user!.userId) as { file_path: string; file_type: string; consent_state_key: string; scan_id: number } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Evidence file not found.' });
      return;
    }

    const safePath = resolveSafeEvidencePath(row.file_path);
    if (!safePath || !fs.existsSync(safePath)) {
      res.status(404).json({ error: 'Evidence artifact missing on disk.' });
      return;
    }

    res.download(safePath, `scan-${row.scan_id}-${row.consent_state_key}.${row.file_type === 'har' ? 'har' : 'json'}`);
  });

  // ---------------------------------------------------------------------------
  // Module F: Baseline & Cross-Consent Comparison
  // ---------------------------------------------------------------------------
  app.get('/api/comparisons', requireAuth, (req: AuthRequest, res: Response) => {
    const currentScanId = Number(req.query.currentScanId);
    const baselineScanId = req.query.baselineScanId ? Number(req.query.baselineScanId) : undefined;

    if (!currentScanId) {
      res.status(400).json({ error: 'currentScanId query parameter is required.' });
      return;
    }

    const scan = db
      .prepare(`SELECT id, website_id FROM scans WHERE id = ? AND user_id = ?`)
      .get(currentScanId, req.user!.userId) as { id: number; website_id: number } | undefined;

    if (!scan) {
      res.status(404).json({ error: 'Scan not found.' });
      return;
    }

    const diff = compareScans(scan.website_id, currentScanId, baselineScanId);
    res.json({ comparison: diff });
  });

  // ---------------------------------------------------------------------------
  // Module G: Findings & Report Exports
  // ---------------------------------------------------------------------------
  app.get('/api/findings', requireAuth, (req: AuthRequest, res: Response) => {
    const websiteId = req.query.websiteId ? Number(req.query.websiteId) : null;
    const severity = req.query.severity ? String(req.query.severity) : null;

    let query = `
      SELECT f.*, w.name as website_name, w.domain, s.started_at as scan_started_at, s.release_label
      FROM findings f
      JOIN websites w ON w.id = f.website_id
      JOIN scans s ON s.id = f.scan_id
      WHERE w.user_id = ?
    `;
    const params: unknown[] = [req.user!.userId];

    if (websiteId) {
      query += ` AND f.website_id = ?`;
      params.push(websiteId);
    }
    if (severity && severity !== 'all') {
      query += ` AND f.severity = ?`;
      params.push(severity);
    }
    query += ` ORDER BY f.id DESC LIMIT 200`;

    const findings = db.prepare(query).all(...params);
    res.json({ findings });
  });

  app.patch('/api/findings/:id', requireAuth, (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!['open', 'acknowledged', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'Invalid finding status.' });
      return;
    }

    const owned = db
      .prepare(
        `SELECT f.id FROM findings f JOIN websites w ON w.id = f.website_id WHERE f.id = ? AND w.user_id = ?`
      )
      .get(id, req.user!.userId);
    if (!owned) {
      res.status(404).json({ error: 'Finding not found.' });
      return;
    }

    db.prepare(`UPDATE findings SET status = ? WHERE id = ?`).run(status, id);
    res.json({ ok: true, status });
  });

  app.post('/api/findings/:id/explain', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    const owned = db
      .prepare(
        `SELECT f.id FROM findings f JOIN websites w ON w.id = f.website_id WHERE f.id = ? AND w.user_id = ?`
      )
      .get(id, req.user!.userId);
    if (!owned) {
      res.status(404).json({ error: 'Finding not found.' });
      return;
    }

    try {
      const explanation = await explainFindingWithGemini(id);
      res.json({ explanation });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Finding explanation failed.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/scans/:id/report', requireAuth, (req: AuthRequest, res: Response) => {
    const scanId = Number(req.params.id);
    const scan = db
      .prepare(
        `SELECT s.*, w.name as website_name, w.domain, w.url as website_url
         FROM scans s JOIN websites w ON w.id = s.website_id
         WHERE s.id = ? AND s.user_id = ?`
      )
      .get(scanId, req.user!.userId) as Record<string, unknown> | undefined;

    if (!scan) {
      res.status(404).json({ error: 'Scan not found.' });
      return;
    }

    const consentStates = db.prepare(`SELECT * FROM consent_states WHERE scan_id = ?`).all(scanId);
    const findings = db.prepare(`SELECT * FROM findings WHERE scan_id = ?`).all(scanId);
    const classifications = db
      .prepare(`SELECT * FROM tracker_classifications WHERE scan_id = ?`)
      .all(scanId);
    const evidenceFiles = db.prepare(`SELECT * FROM evidence_files WHERE scan_id = ?`).all(scanId);
    const policies = db
      .prepare(`SELECT * FROM privacy_policies WHERE scan_id = ? ORDER BY id DESC LIMIT 1`)
      .get(scanId);

    const report = {
      generatedAt: new Date().toISOString(),
      platform: 'ClarityTrace',
      scan,
      consentStates,
      findings,
      classifications,
      evidenceFiles,
      privacyPolicyAnalysis: policies || null,
    };

    res.setHeader('Content-Disposition', `attachment; filename="claritytrace-scan-${scanId}-report.json"`);
    res.json(report);
  });

  // ---------------------------------------------------------------------------
  // Module E: Privacy Policy Analysis (Gemini)
  // ---------------------------------------------------------------------------
  app.get('/api/policies', requireAuth, (req: AuthRequest, res: Response) => {
    const policies = db
      .prepare(
        `SELECT pp.*, w.name as website_name, w.domain
         FROM privacy_policies pp
         JOIN websites w ON w.id = pp.website_id
         WHERE w.user_id = ?
         ORDER BY pp.id DESC`
      )
      .all(req.user!.userId) as Array<{ id: number; [key: string]: unknown }>;

    const enriched = policies.map((p) => {
      const statements = db
        .prepare(`SELECT * FROM policy_statements WHERE privacy_policy_id = ? ORDER BY id ASC`)
        .all(p.id);
      return { ...p, statements };
    });

    res.json({ policies: enriched });
  });

  app.post('/api/policies/analyze', requireAuth, async (req: AuthRequest, res: Response) => {
    const { websiteId, scanId, policyUrl, rawPolicyText } = req.body || {};

    const website = db
      .prepare(`SELECT * FROM websites WHERE id = ? AND user_id = ?`)
      .get(Number(websiteId), req.user!.userId) as
      | { id: number; privacy_policy_url: string | null }
      | undefined;

    if (!website) {
      res.status(404).json({ error: 'Website not found.' });
      return;
    }

    try {
      let textToAnalyze = typeof rawPolicyText === 'string' ? rawPolicyText.trim() : '';
      const targetPolicyUrl = policyUrl ? String(policyUrl).trim() : website.privacy_policy_url;

      if (!textToAnalyze && targetPolicyUrl) {
        textToAnalyze = await fetchPrivacyPolicyText(targetPolicyUrl, PORT);
      }

      if (!textToAnalyze) {
        res.status(400).json({ error: 'Provide either a privacy policy URL or paste policy text.' });
        return;
      }

      const result = await analyzePrivacyPolicyWithGemini({
        websiteId: website.id,
        scanId: scanId ? Number(scanId) : null,
        policyUrl: targetPolicyUrl,
        rawPolicyText: textToAnalyze,
      });

      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Privacy policy analysis failed.';
      res.status(502).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // Stage 7: Controlled Evaluation Lab Helper (Runs real Playwright scans on A-F)
  // ---------------------------------------------------------------------------
  app.post('/api/test-lab/provision', requireAuth, (req: AuthRequest, res: Response) => {
    const scenarios = [
      { key: 'A', name: 'Lab Scenario A (Zero Tracking)', path: '/test-lab/scenario-a' },
      { key: 'B', name: 'Lab Scenario B (Pre-Consent Cookie)', path: '/test-lab/scenario-b' },
      { key: 'C', name: 'Lab Scenario C (Post-Reject Tracker)', path: '/test-lab/scenario-c' },
      { key: 'D', name: 'Lab Scenario D (Compliant Opt-In)', path: '/test-lab/scenario-d' },
      { key: 'E', name: 'Lab Scenario E (Release Regression)', path: '/test-lab/scenario-e' },
      { key: 'F', name: 'Lab Scenario F (Payment Gateway)', path: '/test-lab/scenario-f' },
    ];

    const created: Array<unknown> = [];
    for (const sc of scenarios) {
      const targetUrl = `http://127.0.0.1:${PORT}${sc.path}`;
      const policyUrl = `http://127.0.0.1:${PORT}/test-lab/privacy-policy`;
      const existing = db
        .prepare(`SELECT * FROM websites WHERE user_id = ? AND url = ?`)
        .get(req.user!.userId, targetUrl);
      if (existing) {
        created.push(existing);
      } else {
        const info = db
          .prepare(
            `INSERT INTO websites (user_id, name, url, domain, privacy_policy_url, authorized_confirmed, is_test_lab)
             VALUES (?, ?, ?, '127.0.0.1', ?, 1, 1)`
          )
          .run(req.user!.userId, sc.name, targetUrl, policyUrl);
        created.push(db.prepare(`SELECT * FROM websites WHERE id = ?`).get(Number(info.lastInsertRowid)));
      }
    }

    res.status(201).json({ websites: created });
  });

  return app;
}

async function startServer() {
  getJwtSecret();
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found.' });
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClarityTrace server listening on http://0.0.0.0:${PORT}`);
  });
}

// Start server when executed directly (avoid starting Vite when imported by tests)
const isDirectExec =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.mjs'));
if (isDirectExec) {
  startServer().catch((err) => {
    console.error('Failed to start ClarityTrace server:', err);
    process.exit(1);
  });
}
