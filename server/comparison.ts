import crypto from 'crypto';
import { db } from './db.ts';

interface ObservationRow {
  state_key: string;
  phase: string;
  domain: string;
  url?: string;
  method?: string;
  name?: string;
  key_name?: string;
  category: string;
  tracker_vendor: string | null;
  rule_id: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface ConsentStateFingerprint {
  stateKey: string;
  status: string;
  interactionOutcome: string;
  totalRequests: number;
  thirdPartyDomains: string[];
  trackerCategories: Record<string, number>;
  cookieNames: string[];
  storageKeys: string[];
  addedVsNoConsent: string[];
  removedVsNoConsent: string[];
}

export interface ConsentBehaviourFingerprint {
  version: string;
  scanId: number;
  sha256Hash: string;
  states: Record<string, ConsentStateFingerprint>;
}

export interface ComparisonDiff {
  baselineScanId: number | null;
  currentScanId: number;
  newRequestDomains: Array<{ domain: string; category: string; trackerVendor: string | null; sampleUrl: string }>;
  removedDomains: Array<{ domain: string; category: string; trackerVendor: string | null }>;
  newCookies: Array<{ name: string; domain: string; category: string; trackerVendor: string | null }>;
  removedCookies: Array<{ name: string; domain: string; category: string }>;
  newStorageKeys: Array<{ keyName: string; storageType: string; category: string }>;
  newTrackingDomains: string[];
  consentRegressions: Array<{
    title: string;
    domain: string;
    previousBehavior: string;
    currentBehavior: string;
    severity: 'critical' | 'high' | 'medium';
  }>;
  changedMetrics: Array<{
    observation: string;
    baselineValue: number;
    currentValue: number;
    difference: number;
  }>;
  crossConsentMatrix: Record<
    string,
    {
      status: string;
      totalRequests: number;
      trackerRequests: number;
      trackerCookies: number;
      trackerStorage: number;
      trackerDomains: string[];
    }
  >;
  consentFingerprint: ConsentBehaviourFingerprint;
}

function getScanTelemetry(scanId: number) {
  const states = db
    .prepare(
      `SELECT id, state_key, status, banner_detected, banner_strategy, banner_text_excerpt, inconclusive_reason
       FROM consent_states WHERE scan_id = ?`
    )
    .all(scanId) as Array<{
    id: number;
    state_key: string;
    status: string;
    banner_detected: number;
    banner_strategy: string | null;
    banner_text_excerpt: string | null;
    inconclusive_reason: string | null;
  }>;

  const requests = db
    .prepare(
      `SELECT cs.state_key, nr.phase, nr.url, nr.domain, nr.resource_type, nr.method, nr.is_third_party,
              tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
       FROM network_requests nr
       JOIN consent_states cs ON cs.id = nr.consent_state_id
       LEFT JOIN tracker_classifications tc ON tc.target_type = 'request' AND tc.target_ref_id = nr.id
       WHERE nr.scan_id = ?`
    )
    .all(scanId) as Array<ObservationRow & { resource_type: string; method: string; is_third_party: number }>;

  const cookies = db
    .prepare(
      `SELECT cs.state_key, ck.phase, ck.name, ck.domain, ck.is_third_party, ck.http_only, ck.secure, ck.same_site,
              tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
       FROM cookies ck
       JOIN consent_states cs ON cs.id = ck.consent_state_id
       LEFT JOIN tracker_classifications tc ON tc.target_type = 'cookie' AND tc.target_ref_id = ck.id
       WHERE ck.scan_id = ?`
    )
    .all(scanId) as Array<
    ObservationRow & { is_third_party: number; http_only: number; secure: number; same_site: string | null }
  >;

  const storage = db
    .prepare(
      `SELECT cs.state_key, so.phase, so.storage_type, so.origin, so.key_name, so.byte_length,
              tc.category, tc.tracker_vendor, tc.rule_id, tc.confidence, tc.reasoning
       FROM storage_observations so
       JOIN consent_states cs ON cs.id = so.consent_state_id
       LEFT JOIN tracker_classifications tc ON tc.target_type = 'storage' AND tc.target_ref_id = so.id
       WHERE so.scan_id = ?`
    )
    .all(scanId) as Array<ObservationRow & { storage_type: string; origin: string; byte_length: number }>;

  return { states, requests, cookies, storage };
}

function isTrackerCategory(category: string | null | undefined): boolean {
  return category === 'analytics' || category === 'advertising' || category === 'fingerprinting';
}

export function buildConsentFingerprint(scanId: number): ConsentBehaviourFingerprint {
  const { states, requests, cookies, storage } = getScanTelemetry(scanId);
  const stateMap: Record<string, ConsentStateFingerprint> = {};

  const noConsentSignals = new Set<string>([
    ...requests.filter((r) => r.state_key === 'no_consent' && r.is_third_party === 1).map((r) => r.domain),
    ...cookies.filter((c) => c.state_key === 'no_consent').map((c) => `cookie:${c.name}`),
  ]);

  for (const st of states) {
    const stReqs = requests.filter((r) => r.state_key === st.state_key);
    const stCookies = cookies.filter((c) => c.state_key === st.state_key);
    const stStorage = storage.filter((s) => s.state_key === st.state_key);

    const thirdPartyDomains = Array.from(
      new Set(stReqs.filter((r) => r.is_third_party === 1).map((r) => r.domain))
    ).sort();

    const trackerCategories: Record<string, number> = {};
    for (const r of stReqs) {
      const cat = r.category || 'unknown';
      trackerCategories[cat] = (trackerCategories[cat] || 0) + 1;
    }

    const cookieNames = Array.from(new Set(stCookies.map((c) => c.name || ''))).filter(Boolean).sort();
    const storageKeys = Array.from(
      new Set(stStorage.map((s) => `${s.storage_type}:${s.key_name}`))
    ).sort();

    const curSignals = new Set<string>([
      ...thirdPartyDomains,
      ...cookieNames.map((n) => `cookie:${n}`),
    ]);

    const addedVsNoConsent =
      st.state_key === 'no_consent'
        ? []
        : Array.from(curSignals).filter((x) => !noConsentSignals.has(x)).sort();
    const removedVsNoConsent =
      st.state_key === 'no_consent'
        ? []
        : Array.from(noConsentSignals).filter((x) => !curSignals.has(x)).sort();

    const outcome =
      st.status === 'inconclusive'
        ? 'Inconclusive'
        : st.banner_detected
        ? st.banner_strategy || 'Verified'
        : 'No banner detected';

    stateMap[st.state_key] = {
      stateKey: st.state_key,
      status: st.status,
      interactionOutcome: outcome,
      totalRequests: stReqs.length,
      thirdPartyDomains,
      trackerCategories,
      cookieNames,
      storageKeys,
      addedVsNoConsent,
      removedVsNoConsent,
    };
  }

  const canonical = JSON.stringify({ version: '1.0', states: stateMap });
  const sha256Hash = crypto.createHash('sha256').update(canonical).digest('hex');

  return {
    version: '1.0',
    scanId,
    sha256Hash,
    states: stateMap,
  };
}

export function compareScans(
  websiteId: number,
  currentScanId: number,
  explicitBaselineScanId?: number
): ComparisonDiff {
  const scanRow = db
    .prepare(`SELECT id, target_url FROM scans WHERE id = ?`)
    .get(currentScanId) as { id: number; target_url: string } | undefined;

  if (!scanRow) {
    throw new Error(`Scan ${currentScanId} not found.`);
  }

  let baselineScanId = explicitBaselineScanId ?? null;
  if (!baselineScanId) {
    const pinned = db
      .prepare(`SELECT scan_id FROM baselines WHERE website_id = ?`)
      .get(websiteId) as { scan_id: number } | undefined;
    if (pinned && pinned.scan_id !== currentScanId) {
      baselineScanId = pinned.scan_id;
    } else {
      const prev = db
        .prepare(
          `SELECT id FROM scans
           WHERE website_id = ? AND id < ? AND status = 'completed'
           ORDER BY id DESC LIMIT 1`
        )
        .get(websiteId, currentScanId) as { id: number } | undefined;
      if (prev) baselineScanId = prev.id;
    }
  }

  const current = getScanTelemetry(currentScanId);
  const baseline = baselineScanId ? getScanTelemetry(baselineScanId) : null;
  const consentFingerprint = buildConsentFingerprint(currentScanId);

  const crossConsentMatrix: ComparisonDiff['crossConsentMatrix'] = {};
  for (const st of current.states) {
    const stReqs = current.requests.filter((r) => r.state_key === st.state_key);
    const stCookies = current.cookies.filter((c) => c.state_key === st.state_key);
    const stStorage = current.storage.filter((s) => s.state_key === st.state_key);

    const trackerReqs = stReqs.filter((r) => isTrackerCategory(r.category));
    const trackerCookies = stCookies.filter((c) => isTrackerCategory(c.category));
    const trackerStorage = stStorage.filter((s) => isTrackerCategory(s.category));
    const trackerDomains = Array.from(
      new Set([...trackerReqs.map((r) => r.domain), ...trackerCookies.map((c) => c.domain)])
    );

    crossConsentMatrix[st.state_key] = {
      status: st.status,
      totalRequests: stReqs.length,
      trackerRequests: trackerReqs.length,
      trackerCookies: trackerCookies.length,
      trackerStorage: trackerStorage.length,
      trackerDomains,
    };
  }

  const newRequestDomains: ComparisonDiff['newRequestDomains'] = [];
  const removedDomains: ComparisonDiff['removedDomains'] = [];
  const newCookies: ComparisonDiff['newCookies'] = [];
  const removedCookies: ComparisonDiff['removedCookies'] = [];
  const newStorageKeys: ComparisonDiff['newStorageKeys'] = [];
  const newTrackingDomains: string[] = [];
  const consentRegressions: ComparisonDiff['consentRegressions'] = [];
  const changedMetrics: ComparisonDiff['changedMetrics'] = [];

  if (baseline) {
    const baseReqDomains = new Set(baseline.requests.map((r) => `${r.domain}::${r.url?.split('?')[0] || ''}`));
    const baseDomainOnly = new Set(baseline.requests.map((r) => r.domain));
    const curDomainOnly = new Set(current.requests.map((r) => r.domain));
    const seenNewDomain = new Set<string>();

    for (const r of current.requests) {
      const urlKey = `${r.domain}::${r.url?.split('?')[0] || ''}`;
      if (!baseReqDomains.has(urlKey) && !baseDomainOnly.has(r.domain) && !seenNewDomain.has(r.domain)) {
        seenNewDomain.add(r.domain);
        newRequestDomains.push({
          domain: r.domain,
          category: r.category || 'unknown',
          trackerVendor: r.tracker_vendor,
          sampleUrl: r.url || '',
        });
        if (isTrackerCategory(r.category)) {
          newTrackingDomains.push(r.domain);
        }
      }
      if (r.domain === '127.0.0.1' || r.domain === 'localhost') {
        const curPath = r.url?.split('?')[0] || '';
        const baseHadPath = baseline.requests.some((b) => (b.url?.split('?')[0] || '') === curPath);
        if (!baseHadPath && !seenNewDomain.has(curPath)) {
          seenNewDomain.add(curPath);
          newRequestDomains.push({
            domain: curPath,
            category: r.category || 'unknown',
            trackerVendor: r.tracker_vendor,
            sampleUrl: r.url || '',
          });
          if (isTrackerCategory(r.category)) {
            newTrackingDomains.push(curPath);
          }
        }
      }
    }

    // Removed domains
    const seenRemoved = new Set<string>();
    for (const b of baseline.requests) {
      if (!curDomainOnly.has(b.domain) && !seenRemoved.has(b.domain)) {
        seenRemoved.add(b.domain);
        removedDomains.push({
          domain: b.domain,
          category: b.category || 'unknown',
          trackerVendor: b.tracker_vendor,
        });
      }
    }

    const baseCookieKeys = new Set(baseline.cookies.map((c) => `${c.name}::${c.domain}`));
    const curCookieKeys = new Set(current.cookies.map((c) => `${c.name}::${c.domain}`));
    const seenCookie = new Set<string>();
    for (const c of current.cookies) {
      const k = `${c.name}::${c.domain}`;
      if (!baseCookieKeys.has(k) && !seenCookie.has(k)) {
        seenCookie.add(k);
        newCookies.push({
          name: c.name || '',
          domain: c.domain,
          category: c.category || 'unknown',
          trackerVendor: c.tracker_vendor,
        });
      }
    }

    const seenRemCk = new Set<string>();
    for (const c of baseline.cookies) {
      const k = `${c.name}::${c.domain}`;
      if (!curCookieKeys.has(k) && !seenRemCk.has(k)) {
        seenRemCk.add(k);
        removedCookies.push({
          name: c.name || '',
          domain: c.domain,
          category: c.category || 'unknown',
        });
      }
    }

    const baseStorageKeys = new Set(baseline.storage.map((s) => `${s.storage_type}::${s.key_name}`));
    const seenStorage = new Set<string>();
    for (const s of current.storage) {
      const k = `${s.storage_type}::${s.key_name}`;
      if (!baseStorageKeys.has(k) && !seenStorage.has(k)) {
        seenStorage.add(k);
        newStorageKeys.push({
          keyName: s.key_name || '',
          storageType: s.storage_type,
          category: s.category || 'unknown',
        });
      }
    }

    for (const restrictedState of ['no_consent', 'reject_all']) {
      const curStateRow = current.states.find((s) => s.state_key === restrictedState);
      if (curStateRow?.status !== 'completed') continue;

      const baseTrackers = new Set([
        ...baseline.requests
          .filter((r) => r.state_key === restrictedState && isTrackerCategory(r.category))
          .map((r) => r.tracker_vendor || r.domain),
        ...baseline.cookies
          .filter((c) => c.state_key === restrictedState && isTrackerCategory(c.category))
          .map((c) => c.name || c.domain),
      ]);

      const curTrackerReqs = current.requests.filter(
        (r) => r.state_key === restrictedState && isTrackerCategory(r.category)
      );
      for (const req of curTrackerReqs) {
        const label = req.tracker_vendor || req.domain;
        if (!baseTrackers.has(label)) {
          consentRegressions.push({
            title: `Consent regression (${restrictedState}): ${label}`,
            domain: req.domain,
            previousBehavior: `Not observed during ${restrictedState} in scan #${baselineScanId}`,
            currentBehavior: `Fired ${req.category} request (${req.url}) in ${restrictedState}`,
            severity: restrictedState === 'reject_all' ? 'critical' : 'high',
          });
        }
      }
    }

    const baseTpCount = new Set(baseline.requests.filter((r) => r.is_third_party === 1).map((r) => r.domain)).size;
    const curTpCount = new Set(current.requests.filter((r) => r.is_third_party === 1).map((r) => r.domain)).size;
    const baseTrackerCount = baseline.requests.filter((r) => isTrackerCategory(r.category)).length;
    const curTrackerCount = current.requests.filter((r) => isTrackerCategory(r.category)).length;
    const baseCookieCount = new Set(baseline.cookies.map((c) => c.name)).size;
    const curCookieCount = new Set(current.cookies.map((c) => c.name)).size;

    changedMetrics.push(
      {
        observation: 'Total network requests',
        baselineValue: baseline.requests.length,
        currentValue: current.requests.length,
        difference: current.requests.length - baseline.requests.length,
      },
      {
        observation: 'Unique third-party domains',
        baselineValue: baseTpCount,
        currentValue: curTpCount,
        difference: curTpCount - baseTpCount,
      },
      {
        observation: 'Tracker requests observed',
        baselineValue: baseTrackerCount,
        currentValue: curTrackerCount,
        difference: curTrackerCount - baseTrackerCount,
      },
      {
        observation: 'Distinct cookies observed',
        baselineValue: baseCookieCount,
        currentValue: curCookieCount,
        difference: curCookieCount - baseCookieCount,
      }
    );
  }

  return {
    baselineScanId,
    currentScanId,
    newRequestDomains,
    removedDomains,
    newCookies,
    removedCookies,
    newStorageKeys,
    newTrackingDomains: Array.from(new Set(newTrackingDomains)),
    consentRegressions,
    changedMetrics,
    crossConsentMatrix,
    consentFingerprint,
  };
}

export function generateFindingsAndCompare(websiteId: number, scanId: number, targetUrl: string): ComparisonDiff {
  const { states, requests, cookies, storage } = getScanTelemetry(scanId);
  const diff = compareScans(websiteId, scanId);

  const insertFinding = db.prepare(
    `INSERT INTO findings (
      scan_id, website_id, consent_state_key, title, category, severity, confidence,
      affected_page, technical_explanation, evidence_type, evidence_ref, comparison_summary, suggested_action
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const dedupKeys = new Set<string>();
  const addFindingOnce = (
    dedupKey: string,
    params: [
      string,
      string,
      string,
      'critical' | 'high' | 'medium' | 'low' | 'info',
      'high' | 'medium' | 'low',
      string,
      string,
      string,
      string,
      string | null,
      string
    ]
  ) => {
    if (dedupKeys.has(dedupKey)) return;
    dedupKeys.add(dedupKey);
    insertFinding.run(scanId, websiteId, ...params);
  };

  for (const req of requests.filter((r) => r.state_key === 'no_consent' && isTrackerCategory(r.category))) {
    addFindingOnce(`pre_req_${req.tracker_vendor || req.domain}_${req.category}`, [
      'no_consent',
      `Potential consent issue: pre-consent ${req.category} request to ${req.tracker_vendor || req.domain}`,
      'pre_consent_tracking',
      'high',
      req.confidence || 'high',
      targetUrl,
      `${req.reasoning} Unexpected tracking activity observed prior to any user consent interaction.`,
      'network_request',
      `${req.method || 'GET'} ${req.url}`,
      diff.baselineScanId ? `Compared against baseline scan #${diff.baselineScanId}.` : 'Initial scan observation.',
      `Gate script initialization for ${req.tracker_vendor || req.domain} behind explicit consent approval from your CMP before dispatching network requests.`,
    ]);
  }

  for (const ck of cookies.filter((c) => c.state_key === 'no_consent' && isTrackerCategory(c.category))) {
    addFindingOnce(`pre_ck_${ck.name}_${ck.domain}`, [
      'no_consent',
      `Potential consent issue: ${ck.category} cookie "${ck.name}" set before consent`,
      'pre_consent_cookie',
      'high',
      ck.confidence || 'high',
      targetUrl,
      `${ck.reasoning} Cookie was present prior to any consent interaction.`,
      'cookie',
      `${ck.name} (domain=${ck.domain}, phase=${ck.phase}, sameSite=${ck.same_site || 'unspecified'})`,
      diff.baselineScanId ? `Compared against baseline scan #${diff.baselineScanId}.` : 'Initial scan observation.',
      `Prevent setting non-essential cookie "${ck.name}" until the user explicitly selects Accept All.`,
    ]);
  }

  for (const st of storage.filter((s) => s.state_key === 'no_consent' && isTrackerCategory(s.category))) {
    addFindingOnce(`pre_stg_${st.storage_type}_${st.key_name}`, [
      'no_consent',
      `Pre-consent tracking key "${st.key_name}" in ${st.storage_type}`,
      'pre_consent_storage',
      'medium',
      st.confidence || 'medium',
      targetUrl,
      `${st.reasoning} Client-side storage identifier persisted before consent.`,
      'storage',
      `${st.storage_type}["${st.key_name}"] (${st.byte_length} bytes)`,
      null,
      `Defer writing "${st.key_name}" to ${st.storage_type} until consent state is granted.`,
    ]);
  }

  const rejectState = states.find((s) => s.state_key === 'reject_all');
  if (rejectState?.status === 'completed') {
    for (const req of requests.filter(
      (r) => r.state_key === 'reject_all' && r.phase !== 'initial' && isTrackerCategory(r.category)
    )) {
      addFindingOnce(`rej_req_${req.tracker_vendor || req.domain}`, [
        'reject_all',
        `Unexpected tracking request after Reject All: ${req.tracker_vendor || req.domain}`,
        'post_reject_tracking',
        'critical',
        req.confidence || 'high',
        targetUrl,
        `${req.reasoning} Observed during phase "${req.phase}" after Reject All interaction. Further verification recommended.`,
        'network_request',
        `${req.url} (phase=${req.phase})`,
        diff.baselineScanId ? `Compared against baseline scan #${diff.baselineScanId}.` : 'Reject All verification.',
        `Ensure CMP reject handler halts all ${req.category} tags and prevents re-initialization on page reload.`,
      ]);
    }

    for (const ck of cookies.filter(
      (c) => c.state_key === 'reject_all' && c.phase !== 'initial' && isTrackerCategory(c.category)
    )) {
      addFindingOnce(`rej_ck_${ck.name}`, [
        'reject_all',
        `Tracking cookie "${ck.name}" active after Reject All`,
        'post_reject_cookie',
        'critical',
        ck.confidence || 'high',
        targetUrl,
        `${ck.reasoning} Cookie persisted in phase "${ck.phase}" after the user rejected non-essential tracking.`,
        'cookie',
        `${ck.name} (domain=${ck.domain}, phase=${ck.phase})`,
        null,
        `Clear or suppress "${ck.name}" immediately when the user rejects tracking, and confirm persistence remains cleared after reload.`,
      ]);
    }
  } else if (rejectState?.status === 'inconclusive') {
    addFindingOnce(`inconclusive_reject`, [
      'reject_all',
      'Reject All consent state could not be verified automatically',
      'inconclusive_consent',
      'medium',
      'high',
      targetUrl,
      rejectState.inconclusive_reason || 'Consent banner did not expose a verifiable Reject All control.',
      'consent_banner',
      rejectState.banner_text_excerpt || 'No standard Reject All button detected',
      null,
      'Provide a clear, accessible first-layer "Reject All" button with explicit role/text or standard CMP attributes.',
    ]);
  }

  if (diff.baselineScanId) {
    for (const reg of diff.consentRegressions) {
      addFindingOnce(`reg_${reg.title}`, [
        'no_consent',
        reg.title,
        'consent_regression',
        reg.severity,
        'high',
        targetUrl,
        `Regression compared to scan #${diff.baselineScanId}: ${reg.currentBehavior}.`,
        'baseline_diff',
        `${reg.previousBehavior} -> ${reg.currentBehavior}`,
        `Baseline #${diff.baselineScanId} vs Current #${scanId}`,
        'Audit recent tag manager or release changes that bypassed consent gating.',
      ]);
    }

    for (const nr of diff.newRequestDomains) {
      if (isTrackerCategory(nr.category)) {
        addFindingOnce(`new_trk_${nr.domain}`, [
          'accept_all',
          `New tracking endpoint introduced since baseline: ${nr.trackerVendor || nr.domain}`,
          'new_tracker_introduced',
          'medium',
          'high',
          targetUrl,
          `A new ${nr.category} destination (${nr.domain}) was observed in scan #${scanId} that was absent in baseline scan #${diff.baselineScanId}.`,
          'network_request',
          nr.sampleUrl,
          `Baseline #${diff.baselineScanId} -> Current #${scanId}`,
          `Verify ${nr.trackerVendor || nr.domain} is documented in your privacy policy and properly gated by consent rules.`,
        ]);
      } else if (nr.category === 'payment') {
        addFindingOnce(`new_pay_${nr.domain}`, [
          'accept_all',
          `New legitimate payment gateway integration observed: ${nr.trackerVendor || nr.domain}`,
          'legitimate_change',
          'info',
          'high',
          targetUrl,
          `New third-party payment infrastructure (${nr.domain}) detected compared to baseline #${diff.baselineScanId}. Classified as legitimate payment gateway, not an advertising or analytics tracker.`,
          'network_request',
          nr.sampleUrl,
          `Baseline #${diff.baselineScanId} -> Current #${scanId}`,
          'No tracking remediation required; confirm payment processor is listed in subprocessor/privacy disclosures if applicable.',
        ]);
      }
    }

    db.prepare(
      `INSERT INTO scan_comparisons (
        website_id, baseline_scan_id, current_scan_id, comparison_type,
        new_requests_count, new_cookies_count, new_trackers_count, regressions_count, diff_json
      ) VALUES (?, ?, ?, 'baseline_vs_current', ?, ?, ?, ?, ?)`
    ).run(
      websiteId,
      diff.baselineScanId,
      scanId,
      diff.newRequestDomains.length,
      diff.newCookies.length,
      diff.newTrackingDomains.length,
      diff.consentRegressions.length,
      JSON.stringify(diff)
    );
  }

  return diff;
}
