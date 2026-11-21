export type TrackerCategory =
  | 'analytics'
  | 'advertising'
  | 'fingerprinting'
  | 'functional'
  | 'payment'
  | 'cdn'
  | 'first_party'
  | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ClassificationResult {
  category: TrackerCategory;
  trackerVendor: string | null;
  ruleId: string;
  confidence: ConfidenceLevel;
  reasoning: string;
  evidence: Record<string, unknown>;
}

interface TrackerSignature {
  pattern: RegExp;
  vendor: string;
  category: 'analytics' | 'advertising' | 'fingerprinting';
  ruleId: string;
}

const KNOWN_TRACKER_DOMAINS: TrackerSignature[] = [
  { pattern: /(^|\.)google-analytics\.com$/i, vendor: 'Google Analytics', category: 'analytics', ruleId: 'TRK-GA-001' },
  { pattern: /(^|\.)analytics\.google\.com$/i, vendor: 'Google Analytics 4', category: 'analytics', ruleId: 'TRK-GA-002' },
  { pattern: /(^|\.)googletagmanager\.com$/i, vendor: 'Google Tag Manager', category: 'analytics', ruleId: 'TRK-GTM-003' },
  { pattern: /(^|\.)doubleclick\.net$/i, vendor: 'Google DoubleClick', category: 'advertising', ruleId: 'TRK-ADS-004' },
  { pattern: /(^|\.)googlesyndication\.com$/i, vendor: 'Google AdSense / Ads', category: 'advertising', ruleId: 'TRK-ADS-005' },
  { pattern: /(^|\.)googleadservices\.com$/i, vendor: 'Google Ads Conversion', category: 'advertising', ruleId: 'TRK-ADS-006' },
  { pattern: /(^|\.)connect\.facebook\.net$/i, vendor: 'Meta Pixel', category: 'advertising', ruleId: 'TRK-META-007' },
  { pattern: /(^|\.)facebook\.com$/i, vendor: 'Meta Tracking / Pixel', category: 'advertising', ruleId: 'TRK-META-008' },
  { pattern: /(^|\.)analytics\.tiktok\.com$/i, vendor: 'TikTok Pixel', category: 'advertising', ruleId: 'TRK-TIKTOK-009' },
  { pattern: /(^|\.)px\.ads\.linkedin\.com$/i, vendor: 'LinkedIn Insight Tag', category: 'advertising', ruleId: 'TRK-LI-010' },
  { pattern: /(^|\.)snap\.licdn\.com$/i, vendor: 'LinkedIn Insight Script', category: 'advertising', ruleId: 'TRK-LI-011' },
  { pattern: /(^|\.)api\.mixpanel\.com$/i, vendor: 'Mixpanel', category: 'analytics', ruleId: 'TRK-MP-012' },
  { pattern: /(^|\.)cdn\.mxpnl\.com$/i, vendor: 'Mixpanel SDK', category: 'analytics', ruleId: 'TRK-MP-013' },
  { pattern: /(^|\.)api\.segment\.io$/i, vendor: 'Twilio Segment', category: 'analytics', ruleId: 'TRK-SEG-014' },
  { pattern: /(^|\.)cdn\.segment\.com$/i, vendor: 'Twilio Segment SDK', category: 'analytics', ruleId: 'TRK-SEG-015' },
  { pattern: /(^|\.)api\.amplitude\.com$/i, vendor: 'Amplitude', category: 'analytics', ruleId: 'TRK-AMP-016' },
  { pattern: /(^|\.)static\.hotjar\.com$/i, vendor: 'Hotjar Session Replay', category: 'analytics', ruleId: 'TRK-HJ-017' },
  { pattern: /(^|\.)clarity\.ms$/i, vendor: 'Microsoft Clarity', category: 'analytics', ruleId: 'TRK-CLR-018' },
  { pattern: /(^|\.)app\.posthog\.com$/i, vendor: 'PostHog Analytics', category: 'analytics', ruleId: 'TRK-PH-019' },
  { pattern: /(^|\.)js\.hs-analytics\.net$/i, vendor: 'HubSpot Analytics', category: 'analytics', ruleId: 'TRK-HS-020' },
  { pattern: /(^|\.)track\.hubspot\.com$/i, vendor: 'HubSpot Tracking', category: 'advertising', ruleId: 'TRK-HS-021' },
  { pattern: /(^|\.)static\.criteo\.net$/i, vendor: 'Criteo Retargeting', category: 'advertising', ruleId: 'TRK-CRI-022' },
  { pattern: /(^|\.)fpjscdn\.net$/i, vendor: 'FingerprintJS', category: 'fingerprinting', ruleId: 'TRK-FP-023' },
  { pattern: /(^|\.)bat\.bing\.com$/i, vendor: 'Microsoft Advertising UET', category: 'advertising', ruleId: 'TRK-BING-024' },
];

const ALLOWLIST_NON_TRACKER_DOMAINS: Array<{
  pattern: RegExp;
  vendor: string;
  category: 'payment' | 'cdn' | 'functional';
  ruleId: string;
}> = [
  { pattern: /(^|\.)js\.stripe\.com$/i, vendor: 'Stripe Checkout JS', category: 'payment', ruleId: 'ALLOW-PAY-001' },
  { pattern: /(^|\.)api\.stripe\.com$/i, vendor: 'Stripe Payments API', category: 'payment', ruleId: 'ALLOW-PAY-002' },
  { pattern: /(^|\.)checkout\.stripe\.com$/i, vendor: 'Stripe Checkout', category: 'payment', ruleId: 'ALLOW-PAY-003' },
  { pattern: /(^|\.)paypal\.com$/i, vendor: 'PayPal Checkout', category: 'payment', ruleId: 'ALLOW-PAY-004' },
  { pattern: /(^|\.)braintreegateway\.com$/i, vendor: 'Braintree Payment Gateway', category: 'payment', ruleId: 'ALLOW-PAY-005' },
  { pattern: /(^|\.)checkout\.razorpay\.com$/i, vendor: 'Razorpay Checkout', category: 'payment', ruleId: 'ALLOW-PAY-006' },
  { pattern: /(^|\.)fonts\.googleapis\.com$/i, vendor: 'Google Fonts CSS', category: 'cdn', ruleId: 'ALLOW-CDN-001' },
  { pattern: /(^|\.)fonts\.gstatic\.com$/i, vendor: 'Google Fonts Assets', category: 'cdn', ruleId: 'ALLOW-CDN-002' },
  { pattern: /(^|\.)cdn\.jsdelivr\.net$/i, vendor: 'jsDelivr CDN', category: 'cdn', ruleId: 'ALLOW-CDN-003' },
  { pattern: /(^|\.)unpkg\.com$/i, vendor: 'unpkg CDN', category: 'cdn', ruleId: 'ALLOW-CDN-004' },
  { pattern: /(^|\.)cdnjs\.cloudflare\.com$/i, vendor: 'Cloudflare CDNJS', category: 'cdn', ruleId: 'ALLOW-CDN-005' },
  { pattern: /(^|\.)cdn\.cookielaw\.org$/i, vendor: 'OneTrust CMP', category: 'functional', ruleId: 'ALLOW-CMP-001' },
  { pattern: /(^|\.)consent\.cookiebot\.com$/i, vendor: 'Cookiebot CMP', category: 'functional', ruleId: 'ALLOW-CMP-002' },
];

const KNOWN_TRACKER_COOKIES: Array<{
  pattern: RegExp;
  vendor: string;
  category: 'analytics' | 'advertising';
  ruleId: string;
}> = [
  { pattern: /^_ga($|_)/i, vendor: 'Google Analytics', category: 'analytics', ruleId: 'CK-GA-001' },
  { pattern: /^_gid$/i, vendor: 'Google Analytics', category: 'analytics', ruleId: 'CK-GA-002' },
  { pattern: /^_gat/i, vendor: 'Google Analytics', category: 'analytics', ruleId: 'CK-GA-003' },
  { pattern: /^_gcl_au$/i, vendor: 'Google Ads Conversion Linker', category: 'advertising', ruleId: 'CK-GADS-004' },
  { pattern: /^_fbp$/i, vendor: 'Meta Pixel', category: 'advertising', ruleId: 'CK-META-005' },
  { pattern: /^_fbc$/i, vendor: 'Meta Click ID', category: 'advertising', ruleId: 'CK-META-006' },
  { pattern: /^_ttp$/i, vendor: 'TikTok Pixel', category: 'advertising', ruleId: 'CK-TT-007' },
  { pattern: /^_hjSession/i, vendor: 'Hotjar', category: 'analytics', ruleId: 'CK-HJ-008' },
  { pattern: /^_clck$|^_clsk$/i, vendor: 'Microsoft Clarity', category: 'analytics', ruleId: 'CK-CLR-009' },
  { pattern: /^mp_.*_mixpanel$/i, vendor: 'Mixpanel', category: 'analytics', ruleId: 'CK-MP-010' },
  { pattern: /^ajs_anonymous_id$|^ajs_user_id$/i, vendor: 'Twilio Segment', category: 'analytics', ruleId: 'CK-SEG-011' },
  { pattern: /^__hstc$|^hubspotutk$/i, vendor: 'HubSpot', category: 'analytics', ruleId: 'CK-HS-012' },
  { pattern: /^ct_analytics_id$/i, vendor: 'Test Lab Analytics Tracker', category: 'analytics', ruleId: 'CK-LAB-013' },
  { pattern: /^ct_ad_uid$/i, vendor: 'Test Lab Ad Tracker', category: 'advertising', ruleId: 'CK-LAB-014' },
];

const FUNCTIONAL_COOKIE_PATTERNS: Array<{ pattern: RegExp; reason: string; ruleId: string }> = [
  { pattern: /^(__Host-|__Secure-)?(csrf|xsrf)/i, reason: 'CSRF security token cookie', ruleId: 'CK-FUNC-001' },
  { pattern: /^(session_id|connect\.sid|JSESSIONID|PHPSESSID)$/i, reason: 'Essential server session identifier', ruleId: 'CK-FUNC-002' },
  { pattern: /^(consent_status|ct_consent|OptanonConsent|CookieConsent|cookieyes-consent)$/i, reason: 'User consent preference storage cookie', ruleId: 'CK-FUNC-003' },
  { pattern: /^(stripe_mid|__stripe_sid|payment_intent_session)$/i, reason: 'Payment gateway fraud/checkout session cookie', ruleId: 'CK-PAY-004' },
];

export function extractRegistrableDomain(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^\./, '');
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;
  // Simple heuristic handling common 2-level ccTLDs (co.uk, com.au, co.in)
  const lastTwo = parts.slice(-2).join('.');
  if (/^(co|com|org|net|gov|ac)\.[a-z]{2}$/i.test(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function isThirdPartyDomain(targetDomain: string, siteDomain: string): boolean {
  if (!targetDomain || !siteDomain) return false;
  return extractRegistrableDomain(targetDomain) !== extractRegistrableDomain(siteDomain);
}

export function classifyNetworkRequest(input: {
  url: string;
  domain: string;
  resourceType: string;
  isThirdParty: boolean;
  siteDomain: string;
}): ClassificationResult {
  const { url, domain, resourceType, isThirdParty } = input;
  let parsedPath = '';
  try {
    parsedPath = new URL(url).pathname + new URL(url).search;
  } catch {
    parsedPath = url;
  }

  // 1. Check legitimate payment / CDN / CMP allowlist BEFORE generic third-party flags
  for (const allow of ALLOWLIST_NON_TRACKER_DOMAINS) {
    if (allow.pattern.test(domain)) {
      return {
        category: allow.category,
        trackerVendor: allow.vendor,
        ruleId: allow.ruleId,
        confidence: 'high',
        reasoning: `Domain ${domain} matched verified non-tracking ${allow.category} service (${allow.vendor}). Third-party status alone does not indicate tracking.`,
        evidence: { url, domain, resourceType, matchedAllowlist: allow.vendor },
      };
    }
  }

  // Controlled Test Lab legitimate payment gateway endpoint
  if (/\/test-lab\/payment\/(stripe|gateway|checkout)/i.test(parsedPath)) {
    return {
      category: 'payment',
      trackerVendor: 'Stripe-Compatible Payment Gateway',
      ruleId: 'ALLOW-PAY-LAB',
      confidence: 'high',
      reasoning: `Request path ${parsedPath} is an explicit payment checkout integration; classified as legitimate payment infrastructure rather than a tracker.`,
      evidence: { url, domain, resourceType, matchedPath: parsedPath },
    };
  }

  // 2. Check known tracker domain registry
  for (const sig of KNOWN_TRACKER_DOMAINS) {
    if (sig.pattern.test(domain)) {
      return {
        category: sig.category,
        trackerVendor: sig.vendor,
        ruleId: sig.ruleId,
        confidence: 'high',
        reasoning: `Destination host ${domain} matched known ${sig.category} vendor "${sig.vendor}".`,
        evidence: { url, domain, resourceType, signature: sig.ruleId },
      };
    }
  }

  // 3. Controlled Test Lab tracking endpoints (explicitly behave like analytics/ad beacons)
  if (/\/test-lab\/collect\/analytics/i.test(parsedPath)) {
    return {
      category: 'analytics',
      trackerVendor: 'Test Lab Analytics Collector',
      ruleId: 'TRK-LAB-ANALYTICS',
      confidence: 'high',
      reasoning: `Request dispatched telemetry payload to analytics endpoint ${parsedPath}.`,
      evidence: { url, domain, resourceType, matchedPath: parsedPath },
    };
  }
  if (/\/test-lab\/collect\/ads/i.test(parsedPath)) {
    return {
      category: 'advertising',
      trackerVendor: 'Test Lab Ad Retargeting Pixel',
      ruleId: 'TRK-LAB-ADS',
      confidence: 'high',
      reasoning: `Request dispatched advertising identifier payload to ${parsedPath}.`,
      evidence: { url, domain, resourceType, matchedPath: parsedPath },
    };
  }
  if (/\/test-lab\/collect\/v2-tracker/i.test(parsedPath)) {
    return {
      category: 'analytics',
      trackerVendor: 'Release v2 Telemetry Beacon',
      ruleId: 'TRK-LAB-V2',
      confidence: 'high',
      reasoning: `Request dispatched behavioral telemetry to newly introduced collector endpoint ${parsedPath}.`,
      evidence: { url, domain, resourceType, matchedPath: parsedPath },
    };
  }

  // 4. Deterministic URL parameter / path heuristics for tracking pixels & beacons
  const trackingPathRegex = /\/(tr|pixel|collect|beacon|analytics|metrics|telemetry|events)\b|[?&](tid|fbp|gclid|fbclid|uid|cid|pixel_id)=/i;
  if (isThirdParty && trackingPathRegex.test(parsedPath) && ['fetch', 'xhr', 'ping', 'image', 'script'].includes(resourceType)) {
    return {
      category: 'analytics',
      trackerVendor: `Unverified Telemetry (${domain})`,
      ruleId: 'HEUR-BEACON-001',
      confidence: 'medium',
      reasoning: `Third-party ${resourceType} request to ${domain} includes deterministic tracking path or identifier query parameters (${parsedPath.slice(0, 80)}).`,
      evidence: { url, domain, resourceType, heuristic: 'trackingPathRegex' },
    };
  }

  // 5. Non-tracker first-party vs benign third-party resource
  if (!isThirdParty) {
    return {
      category: 'first_party',
      trackerVendor: null,
      ruleId: 'FP-ORIGIN-001',
      confidence: 'high',
      reasoning: `First-party ${resourceType} resource served from ${domain}.`,
      evidence: { url, domain, resourceType },
    };
  }

  // Do NOT classify every third-party request as a tracker!
  return {
    category: resourceType === 'font' || resourceType === 'stylesheet' || resourceType === 'image' ? 'cdn' : 'unknown',
    trackerVendor: null,
    ruleId: 'TP-UNCLASSIFIED-001',
    confidence: 'low',
    reasoning: `Third-party ${resourceType} request to ${domain} does not match known tracker signatures or telemetry patterns; kept non-tracker to avoid false positives.`,
    evidence: { url, domain, resourceType },
  };
}

export function classifyCookie(cookie: {
  name: string;
  domain: string;
  isThirdParty: boolean;
  expiresAt: string | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string | null;
}): ClassificationResult {
  for (const sig of KNOWN_TRACKER_COOKIES) {
    if (sig.pattern.test(cookie.name)) {
      return {
        category: sig.category,
        trackerVendor: sig.vendor,
        ruleId: sig.ruleId,
        confidence: 'high',
        reasoning: `Cookie "${cookie.name}" on domain ${cookie.domain} matches known ${sig.category} identifier for ${sig.vendor}.`,
        evidence: { ...cookie },
      };
    }
  }

  for (const func of FUNCTIONAL_COOKIE_PATTERNS) {
    if (func.pattern.test(cookie.name)) {
      return {
        category: func.ruleId === 'CK-PAY-004' ? 'payment' : 'functional',
        trackerVendor: null,
        ruleId: func.ruleId,
        confidence: 'high',
        reasoning: `Cookie "${cookie.name}" is classified as non-tracking: ${func.reason}.`,
        evidence: { ...cookie },
      };
    }
  }

  for (const allow of ALLOWLIST_NON_TRACKER_DOMAINS) {
    if (allow.pattern.test(cookie.domain)) {
      return {
        category: allow.category,
        trackerVendor: allow.vendor,
        ruleId: `CK-${allow.ruleId}`,
        confidence: 'high',
        reasoning: `Cookie "${cookie.name}" is scoped to verified non-tracking ${allow.category} domain ${cookie.domain} (${allow.vendor}).`,
        evidence: { ...cookie, matchedAllowlist: allow.vendor },
      };
    }
  }

  if (cookie.isThirdParty) {
    return {
      category: 'advertising',
      trackerVendor: `Third-party cookie (${cookie.domain})`,
      ruleId: 'CK-TP-001',
      confidence: 'medium',
      reasoning: `Cookie "${cookie.name}" is scoped to third-party domain ${cookie.domain}, indicating cross-site state persistence.`,
      evidence: { ...cookie },
    };
  }

  return {
    category: 'first_party',
    trackerVendor: null,
    ruleId: 'CK-FP-001',
    confidence: 'low',
    reasoning: `First-party cookie "${cookie.name}" does not match known analytics or advertising cookie patterns.`,
    evidence: { ...cookie },
  };
}

export function classifyStorageEntry(entry: {
  storageType: 'localStorage' | 'sessionStorage';
  keyName: string;
  valuePreview: string;
  origin: string;
}): ClassificationResult {
  const key = entry.keyName;
  if (/^(_ga|ajs_|mp_|amp_|_hj|ph_|ct_tracker|analytics_uid|fbp)/i.test(key)) {
    return {
      category: 'analytics',
      trackerVendor: 'Client-Side Tracking Storage',
      ruleId: 'STG-TRK-001',
      confidence: 'high',
      reasoning: `${entry.storageType} key "${key}" matches persistent client-side analytics or user-ID storage pattern.`,
      evidence: { ...entry },
    };
  }
  if (/^(ad_uid|retargeting_|doubleclick_|criteo_)/i.test(key)) {
    return {
      category: 'advertising',
      trackerVendor: 'Advertising Identifier Storage',
      ruleId: 'STG-ADS-002',
      confidence: 'high',
      reasoning: `${entry.storageType} key "${key}" stores advertising targeting metadata.`,
      evidence: { ...entry },
    };
  }
  if (/^(consent|cookie_consent|ct_consent|theme|locale|cart)/i.test(key)) {
    return {
      category: 'functional',
      trackerVendor: null,
      ruleId: 'STG-FUNC-001',
      confidence: 'high',
      reasoning: `${entry.storageType} key "${key}" holds essential UI, cart, or consent preference state.`,
      evidence: { ...entry },
    };
  }
  return {
    category: 'first_party',
    trackerVendor: null,
    ruleId: 'STG-FP-001',
    confidence: 'low',
    reasoning: `${entry.storageType} key "${key}" is first-party application state with no known tracking signature.`,
    evidence: { ...entry },
  };
}
