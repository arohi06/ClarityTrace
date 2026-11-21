import { chromium, type Browser, type Page } from 'playwright';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { db, getEvidenceDir, registerEvidenceFile } from './db.ts';
import { validateScanTargetUrl, isLocalTestLabUrl } from './security.ts';
import { executeConsentInteraction, type ConsentStateKey } from './consent.ts';
import {
  classifyCookie,
  classifyNetworkRequest,
  classifyStorageEntry,
  isThirdPartyDomain,
} from './rules.ts';
import { generateFindingsAndCompare } from './comparison.ts';
import { analyzePrivacyPolicyWithGemini, fetchPrivacyPolicyText } from './gemini.ts';

export interface ScanProgressEvent {
  scanId: number;
  stepNumber: number;
  stepTitle: string;
  stage: string;
  stateKey?: ConsentStateKey;
  message: string;
  requestsCaptured: number;
  cookiesCaptured: number;
  thirdPartyDomainsDetected: number;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
}

export const scanEvents = new EventEmitter();
scanEvents.setMaxListeners(100);

const MAX_REQUESTS_PER_STATE = 250;
const DEFAULT_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 60000);
const MAX_CONCURRENT_SCANS = 2;
const MAX_QUEUED_SCANS = 10;

let activeScanCount = 0;
const scanQueue: Array<() => void> = [];

export function getScanCapacityState(): { active: number; queued: number; acceptMore: boolean } {
  return {
    active: activeScanCount,
    queued: scanQueue.length,
    acceptMore: scanQueue.length < MAX_QUEUED_SCANS,
  };
}

async function acquireScanSlot(): Promise<void> {
  if (activeScanCount < MAX_CONCURRENT_SCANS) {
    activeScanCount++;
    return;
  }
  await new Promise<void>((resolve) => {
    scanQueue.push(() => {
      activeScanCount++;
      resolve();
    });
  });
}

function releaseScanSlot(): void {
  activeScanCount = Math.max(0, activeScanCount - 1);
  const next = scanQueue.shift();
  if (next) next();
}

function emitProgress(params: {
  scanId: number;
  stepNumber: number;
  stepTitle: string;
  stage: string;
  message: string;
  requestsCaptured: number;
  cookiesCaptured: number;
  thirdPartyDomainsDetected: number;
  status?: 'running' | 'completed' | 'failed';
  stateKey?: ConsentStateKey;
}): void {
  const evt: ScanProgressEvent = {
    scanId: params.scanId,
    stepNumber: params.stepNumber,
    stepTitle: params.stepTitle,
    stage: params.stage,
    stateKey: params.stateKey,
    message: params.message,
    requestsCaptured: params.requestsCaptured,
    cookiesCaptured: params.cookiesCaptured,
    thirdPartyDomainsDetected: params.thirdPartyDomainsDetected,
    timestamp: new Date().toISOString(),
    status: params.status || 'running',
  };
  scanEvents.emit(`scan:${params.scanId}`, evt);
}

interface CapturedRequest {
  phase: 'initial' | 'post_action' | 'post_reload';
  url: string;
  domain: string;
  resourceType: string;
  method: string;
  statusCode: number | null;
  isThirdParty: boolean;
  headersJson: string;
  timestampMs: number;
}

async function captureStorageSnapshot(
  page: Page
): Promise<
  Array<{
    storageType: 'localStorage' | 'sessionStorage';
    origin: string;
    keyName: string;
    valuePreview: string;
    byteLength: number;
  }>
> {
  try {
    return await page.evaluate(() => {
      const out: Array<{
        storageType: 'localStorage' | 'sessionStorage';
        origin: string;
        keyName: string;
        valuePreview: string;
        byteLength: number;
      }> = [];
      const origin = window.location.origin;

      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k) continue;
          const v = window.localStorage.getItem(k) || '';
          out.push({
            storageType: 'localStorage',
            origin,
            keyName: k,
            valuePreview: v.slice(0, 120),
            byteLength: v.length,
          });
        }
      } catch {
        // storage access restricted
      }

      try {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (!k) continue;
          const v = window.sessionStorage.getItem(k) || '';
          out.push({
            storageType: 'sessionStorage',
            origin,
            keyName: k,
            valuePreview: v.slice(0, 120),
            byteLength: v.length,
          });
        }
      } catch {
        // storage access restricted
      }
      return out;
    });
  } catch {
    return [];
  }
}

export interface RunScanOptions {
  scanId: number;
  websiteId: number;
  targetUrl: string;
  siteDomain: string;
  privacyPolicyUrl?: string | null;
  statesToTest?: ConsentStateKey[];
  verifyReload?: boolean;
  runPolicyAnalysis?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  observationMs?: number;
  serverPort?: number;
}

export async function runPlaywrightScan(options: RunScanOptions): Promise<void> {
  const {
    scanId,
    websiteId,
    targetUrl,
    siteDomain,
    privacyPolicyUrl,
    statesToTest = ['no_consent', 'accept_all', 'reject_all'],
    verifyReload = true,
    runPolicyAnalysis = false,
    viewportWidth = 1440,
    viewportHeight = 900,
    observationMs = 1200,
    serverPort = Number(process.env.PORT || 3000),
  } = options;

  const isTestLabTarget = isLocalTestLabUrl(targetUrl, serverPort);
  const scanEvidenceDir = path.join(getEvidenceDir(), `scan_${scanId}`);
  if (!fs.existsSync(scanEvidenceDir)) {
    fs.mkdirSync(scanEvidenceDir, { recursive: true });
  }

  let browser: Browser | null = null;
  let cumulativeRequests = 0;
  let cumulativeCookies = 0;
  const thirdPartyDomainSet = new Set<string>();
  const validatedHostCache = new Map<string, boolean>();
  let slotAcquired = false;

  try {
    await acquireScanSlot();
    slotAcquired = true;
    db.prepare(`UPDATE scans SET status = 'running', started_at = datetime('now') WHERE id = ?`).run(scanId);
    emitProgress({
      scanId,
      stepNumber: 1,
      stepTitle: 'Initializing browser',
      stage: 'init',
      message: `Validating ${targetUrl} and launching headless Chromium`,
      requestsCaptured: 0,
      cookiesCaptured: 0,
      thirdPartyDomainsDetected: 0,
    });

    const urlCheck = await validateScanTargetUrl(targetUrl, {
      allowTestLab: isTestLabTarget,
      serverPort,
    });
    if (!urlCheck.valid) {
      throw new Error(urlCheck.reason || 'Target URL failed SSRF validation.');
    }

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    for (const stateKey of statesToTest) {
      const csInfo = db
        .prepare(
          `INSERT INTO consent_states (scan_id, state_key, status, started_at)
           VALUES (?, ?, 'running', datetime('now'))`
        )
        .run(scanId, stateKey);
      const consentStateId = Number(csInfo.lastInsertRowid);

      const stateStep =
        stateKey === 'no_consent' ? 4 : stateKey === 'accept_all' ? 5 : 6;
      const stateTitle =
        stateKey === 'no_consent'
          ? 'Running No Consent scenario'
          : stateKey === 'accept_all'
          ? 'Running Accept All scenario'
          : 'Running Reject All scenario';

      emitProgress({
        scanId,
        stepNumber: 2,
        stepTitle: 'Navigating to website',
        stage: 'navigate',
        stateKey,
        message: `Opening fresh isolated BrowserContext for ${stateKey}`,
        requestsCaptured: cumulativeRequests,
        cookiesCaptured: cumulativeCookies,
        thirdPartyDomainsDetected: thirdPartyDomainSet.size,
      });

      const harPath = path.join(scanEvidenceDir, `${stateKey}.har`);
      const context = await browser.newContext({
        recordHar: { path: harPath, mode: 'minimal' },
        viewport: { width: viewportWidth, height: viewportHeight },
        userAgent: 'ClarityTrace-PrivacyScanner/1.0 (Playwright Chromium)',
      });

      const capturedRequests: CapturedRequest[] = [];
      let currentPhase: 'initial' | 'post_action' | 'post_reload' = 'initial';

      await context.route('**/*', async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || reqUrl.startsWith('about:')) {
          await route.continue();
          return;
        }
        let cacheKey: string | null = null;
        try {
          const u = new URL(reqUrl);
          if (!isTestLabTarget && !/^(\[.*\]|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname)) {
            cacheKey = `${u.protocol}//${u.host.toLowerCase()}`;
          }
        } catch {
          // validate directly
        }
        if (cacheKey && validatedHostCache.has(cacheKey)) {
          if (validatedHostCache.get(cacheKey)) {
            await route.continue();
          } else {
            await route.abort('accessdenied');
          }
          return;
        }
        const subCheck = await validateScanTargetUrl(reqUrl, {
          allowTestLab: isTestLabTarget,
          serverPort,
        });
        if (cacheKey && !subCheck.isTestLab) {
          validatedHostCache.set(cacheKey, subCheck.valid);
        }
        if (!subCheck.valid) {
          await route.abort('accessdenied');
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

      const statusMap = new Map<string, number>();
      page.on('response', (resp) => {
        statusMap.set(resp.url(), resp.status());
      });

      page.on('request', (req) => {
        if (capturedRequests.length >= MAX_REQUESTS_PER_STATE) return;
        const reqUrl = req.url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || reqUrl.startsWith('about:')) return;
        let domain = siteDomain;
        try {
          domain = new URL(reqUrl).hostname;
        } catch {
          // fallback
        }
        const thirdParty = isThirdPartyDomain(domain, siteDomain);
        if (thirdParty) thirdPartyDomainSet.add(domain);
        cumulativeRequests++;
        capturedRequests.push({
          phase: currentPhase,
          url: reqUrl.slice(0, 1500),
          domain,
          resourceType: req.resourceType(),
          method: req.method(),
          statusCode: null,
          isThirdParty: thirdParty,
          headersJson: JSON.stringify(req.headers()),
          timestampMs: Date.now(),
        });
      });

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(Math.min(observationMs, 3000));

        emitProgress({
          scanId,
          stepNumber: 3,
          stepTitle: 'Detecting consent interface',
          stage: 'consent_detect',
          stateKey,
          message: `Scanning DOM & frames for consent interface (${stateKey})`,
          requestsCaptured: cumulativeRequests,
          cookiesCaptured: cumulativeCookies,
          thirdPartyDomainsDetected: thirdPartyDomainSet.size,
        });

        const initialCookies = await context.cookies();
        const initialStorage = await captureStorageSnapshot(page);

        currentPhase = 'post_action';
        emitProgress({
          scanId,
          stepNumber: stateStep,
          stepTitle: stateTitle,
          stage: stateKey,
          stateKey,
          message: `Executing ${stateKey.replace('_', ' ')} interaction`,
          requestsCaptured: cumulativeRequests,
          cookiesCaptured: cumulativeCookies + initialCookies.length,
          thirdPartyDomainsDetected: thirdPartyDomainSet.size,
        });

        const interaction = await executeConsentInteraction(page, stateKey);
        if (interaction.actionPerformed) {
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(Math.min(observationMs, 3000));
        }

        const postActionCookies = await context.cookies();
        const postActionStorage = await captureStorageSnapshot(page);

        let reloadVerified = false;
        let postReloadCookies: typeof initialCookies = [];
        let postReloadStorage: typeof initialStorage = [];

        if (verifyReload && !interaction.inconclusive && stateKey !== 'no_consent') {
          currentPhase = 'post_reload';
          await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          reloadVerified = true;
          postReloadCookies = await context.cookies();
          postReloadStorage = await captureStorageSnapshot(page);
        }

        emitProgress({
          scanId,
          stepNumber: 7,
          stepTitle: 'Capturing cookies and storage',
          stage: 'capture_storage',
          stateKey,
          message: `Captured ${postActionCookies.length} cookies and ${postActionStorage.length} storage entries (${stateKey})`,
          requestsCaptured: cumulativeRequests,
          cookiesCaptured: cumulativeCookies + postActionCookies.length,
          thirdPartyDomainsDetected: thirdPartyDomainSet.size,
        });

        for (const r of capturedRequests) {
          if (statusMap.has(r.url)) {
            r.statusCode = statusMap.get(r.url) ?? null;
          }
        }

        emitProgress({
          scanId,
          stepNumber: 8,
          stepTitle: 'Collecting network requests',
          stage: 'collect_requests',
          stateKey,
          message: `Persisting ${capturedRequests.length} observed network requests (${stateKey})`,
          requestsCaptured: cumulativeRequests,
          cookiesCaptured: cumulativeCookies,
          thirdPartyDomainsDetected: thirdPartyDomainSet.size,
        });

        const insertReq = db.prepare(
          `INSERT INTO network_requests (
            scan_id, consent_state_id, phase, url, domain, resource_type, method,
            status_code, is_third_party, headers_json, timestamp_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertClass = db.prepare(
          `INSERT INTO tracker_classifications (
            scan_id, consent_state_id, target_type, target_ref_id, target_identifier,
            domain, category, tracker_vendor, rule_id, confidence, reasoning, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        emitProgress({
          scanId,
          stepNumber: 9,
          stepTitle: 'Classifying third-party services',
          stage: 'classify',
          stateKey,
          message: `Evaluating deterministic rules on ${stateKey} observations`,
          requestsCaptured: cumulativeRequests,
          cookiesCaptured: cumulativeCookies,
          thirdPartyDomainsDetected: thirdPartyDomainSet.size,
        });

        for (const req of capturedRequests) {
          const info = insertReq.run(
            scanId,
            consentStateId,
            req.phase,
            req.url,
            req.domain,
            req.resourceType,
            req.method,
            req.statusCode,
            req.isThirdParty ? 1 : 0,
            req.headersJson,
            req.timestampMs
          );
          const reqId = Number(info.lastInsertRowid);
          const cls = classifyNetworkRequest({
            url: req.url,
            domain: req.domain,
            resourceType: req.resourceType,
            isThirdParty: req.isThirdParty,
            siteDomain,
          });
          insertClass.run(
            scanId,
            consentStateId,
            'request',
            reqId,
            req.url.slice(0, 300),
            req.domain,
            cls.category,
            cls.trackerVendor,
            cls.ruleId,
            cls.confidence,
            cls.reasoning,
            JSON.stringify(cls.evidence)
          );
        }

        const cookiePhaseBatches: Array<{ phase: 'initial' | 'post_action' | 'post_reload'; list: typeof initialCookies }> = [
          { phase: 'initial', list: initialCookies },
          { phase: 'post_action', list: postActionCookies },
          ...(reloadVerified ? [{ phase: 'post_reload' as const, list: postReloadCookies }] : []),
        ];

        const insertCookie = db.prepare(
          `INSERT INTO cookies (
            scan_id, consent_state_id, phase, name, domain, path, value_preview,
            expires_at, http_only, secure, same_site, is_third_party
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        let totalCookiesInserted = 0;
        for (const batch of cookiePhaseBatches) {
          for (const ck of batch.list) {
            const cleanDomain = ck.domain.replace(/^\./, '');
            const thirdParty = isThirdPartyDomain(cleanDomain, siteDomain);
            const expiresIso = ck.expires && ck.expires > 0 ? new Date(ck.expires * 1000).toISOString() : null;
            const info = insertCookie.run(
              scanId,
              consentStateId,
              batch.phase,
              ck.name,
              cleanDomain,
              ck.path || '/',
              (ck.value || '').slice(0, 80),
              expiresIso,
              ck.httpOnly ? 1 : 0,
              ck.secure ? 1 : 0,
              ck.sameSite || null,
              thirdParty ? 1 : 0
            );
            totalCookiesInserted++;
            cumulativeCookies++;
            const ckId = Number(info.lastInsertRowid);
            const cls = classifyCookie({
              name: ck.name,
              domain: cleanDomain,
              isThirdParty: thirdParty,
              expiresAt: expiresIso,
              httpOnly: ck.httpOnly,
              secure: ck.secure,
              sameSite: ck.sameSite || null,
            });
            insertClass.run(
              scanId,
              consentStateId,
              'cookie',
              ckId,
              ck.name,
              cleanDomain,
              cls.category,
              cls.trackerVendor,
              cls.ruleId,
              cls.confidence,
              cls.reasoning,
              JSON.stringify(cls.evidence)
            );
          }
        }

        const storageBatches: Array<{ phase: 'initial' | 'post_action' | 'post_reload'; list: typeof initialStorage }> = [
          { phase: 'initial', list: initialStorage },
          { phase: 'post_action', list: postActionStorage },
          ...(reloadVerified ? [{ phase: 'post_reload' as const, list: postReloadStorage }] : []),
        ];

        const insertStorage = db.prepare(
          `INSERT INTO storage_observations (
            scan_id, consent_state_id, phase, storage_type, origin, key_name, value_preview, byte_length
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        let totalStorageInserted = 0;
        for (const batch of storageBatches) {
          for (const st of batch.list) {
            const info = insertStorage.run(
              scanId,
              consentStateId,
              batch.phase,
              st.storageType,
              st.origin,
              st.keyName,
              st.valuePreview,
              st.byteLength
            );
            totalStorageInserted++;
            const stId = Number(info.lastInsertRowid);
            const cls = classifyStorageEntry({
              storageType: st.storageType,
              keyName: st.keyName,
              valuePreview: st.valuePreview,
              origin: st.origin,
            });
            insertClass.run(
              scanId,
              consentStateId,
              'storage',
              stId,
              `${st.storageType}:${st.keyName}`,
              siteDomain,
              cls.category,
              cls.trackerVendor,
              cls.ruleId,
              cls.confidence,
              cls.reasoning,
              JSON.stringify(cls.evidence)
            );
          }
        }

        const storageSnapPath = path.join(scanEvidenceDir, `${stateKey}_storage.json`);
        fs.writeFileSync(
          storageSnapPath,
          JSON.stringify(
            { stateKey, initial: initialStorage, postAction: postActionStorage, postReload: postReloadStorage },
            null,
            2
          )
        );
        registerEvidenceFile(scanId, stateKey, 'storage_snapshot', storageSnapPath);

        const finalStateStatus = interaction.inconclusive ? 'inconclusive' : 'completed';
        db.prepare(
          `UPDATE consent_states
           SET status = ?, banner_detected = ?, banner_strategy = ?, banner_text_excerpt = ?,
               reload_verified = ?, inconclusive_reason = ?, requests_count = ?, cookies_count = ?,
               storage_count = ?, completed_at = datetime('now')
           WHERE id = ?`
        ).run(
          finalStateStatus,
          interaction.bannerDetected ? 1 : 0,
          interaction.strategy,
          interaction.bannerTextExcerpt,
          reloadVerified ? 1 : 0,
          interaction.inconclusiveReason,
          capturedRequests.length,
          totalCookiesInserted,
          totalStorageInserted,
          consentStateId
        );
      } finally {
        await context.close();
        registerEvidenceFile(scanId, stateKey, 'har', harPath);
      }
    }

    emitProgress({
      scanId,
      stepNumber: 10,
      stepTitle: 'Generating findings',
      stage: 'findings',
      message: 'Running deterministic detection rules, Consent Behaviour Fingerprint & baseline diffing',
      requestsCaptured: cumulativeRequests,
      cookiesCaptured: cumulativeCookies,
      thirdPartyDomainsDetected: thirdPartyDomainSet.size,
    });

    const diff = generateFindingsAndCompare(websiteId, scanId, targetUrl);

    const existingBaseline = db.prepare(`SELECT id FROM baselines WHERE website_id = ?`).get(websiteId);
    if (!existingBaseline) {
      const scanUser = db.prepare(`SELECT user_id FROM scans WHERE id = ?`).get(scanId) as { user_id: number };
      db.prepare(
        `INSERT INTO baselines (website_id, scan_id, set_by_user_id, label) VALUES (?, ?, ?, 'Initial Baseline')`
      ).run(websiteId, scanId, scanUser.user_id);
      db.prepare(`UPDATE scans SET is_baseline = 1 WHERE id = ?`).run(scanId);
    }

    if (runPolicyAnalysis && privacyPolicyUrl) {
      try {
        const policyText = await fetchPrivacyPolicyText(privacyPolicyUrl, serverPort);
        await analyzePrivacyPolicyWithGemini({
          websiteId,
          scanId,
          policyUrl: privacyPolicyUrl,
          rawPolicyText: policyText,
        });
      } catch {
        // Non-blocking per spec
      }
    }

    const findingsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM findings WHERE scan_id = ?`).get(scanId) as { c: number }
    ).c;

    const summary = {
      findingsCount,
      baselineScanId: diff.baselineScanId,
      newTrackersCount: diff.newTrackingDomains.length,
      regressionsCount: diff.consentRegressions.length,
      crossConsentMatrix: diff.crossConsentMatrix,
      fingerprint: diff.consentFingerprint,
    };

    db.prepare(
      `UPDATE scans
       SET status = 'completed', completed_at = datetime('now'), summary_json = ?
       WHERE id = ?`
    ).run(JSON.stringify(summary), scanId);

    emitProgress({
      scanId,
      stepNumber: 11,
      stepTitle: 'Saving scan results',
      stage: 'completed',
      message: `Scan #${scanId} saved with ${findingsCount} findings and SHA-256 fingerprint`,
      requestsCaptured: cumulativeRequests,
      cookiesCaptured: cumulativeCookies,
      thirdPartyDomainsDetected: thirdPartyDomainSet.size,
      status: 'completed',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected Playwright scan error';
    db.prepare(
      `UPDATE scans SET status = 'failed', completed_at = datetime('now'), error_message = ? WHERE id = ?`
    ).run(message, scanId);
    emitProgress({
      scanId,
      stepNumber: 11,
      stepTitle: 'Scan incomplete',
      stage: 'failed',
      message: `Scan failed: ${message}`,
      requestsCaptured: cumulativeRequests,
      cookiesCaptured: cumulativeCookies,
      thirdPartyDomainsDetected: thirdPartyDomainSet.size,
      status: 'failed',
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (slotAcquired) {
      releaseScanSlot();
    }
  }
}
