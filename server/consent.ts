import type { Page, Frame, Locator } from 'playwright';

export type ConsentStateKey = 'no_consent' | 'accept_all' | 'reject_all';

export interface ConsentInteractionResult {
  bannerDetected: boolean;
  actionPerformed: boolean;
  inconclusive: boolean;
  strategy: string | null;
  bannerTextExcerpt: string | null;
  inconclusiveReason: string | null;
}

const KNOWN_ACCEPT_SELECTORS = [
  '[data-ct-consent="accept"]',
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#didomi-notice-agree-button',
  '.cky-btn-accept',
  '.cm-btn-accept-all',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  'button[data-testid="uc-accept-all-button"]',
  '#accept-cookies',
  'button[id*="accept" i][id*="cookie" i]',
];

const KNOWN_REJECT_SELECTORS = [
  '[data-ct-consent="reject"]',
  '#onetrust-reject-all-handler',
  '#CybotCookiebotDialogBodyButtonDecline',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
  '#didomi-notice-disagree-button',
  '.cky-btn-reject',
  '.cm-btn-decline',
  'button[data-testid="uc-deny-all-button"]',
  '#reject-cookies',
  'button[id*="reject" i][id*="cookie" i]',
  'button[id*="decline" i][id*="cookie" i]',
];

const BANNER_CONTAINER_SELECTORS = [
  '[data-ct-banner]',
  '#onetrust-banner-sdk',
  '#CybotCookiebotDialog',
  '#didomi-host',
  '.cky-consent-container',
  '.qc-cmp2-container',
  '[role="dialog"][aria-label*="cookie" i]',
  '[role="dialog"][aria-label*="consent" i]',
  '[role="dialog"][aria-label*="privacy" i]',
  '[id*="cookie-banner" i]',
  '[id*="consent" i]',
  '[class*="cookie-banner" i]',
  '[class*="consent-banner" i]',
];

const ACCEPT_TEXT_REGEX = /^\s*(accept all cookies|accept all|accept cookies|allow all cookies|allow all|agree and close|i agree|accept & continue|got it, accept|accept)\s*$/i;
const REJECT_TEXT_REGEX = /^\s*(reject all cookies|reject all|decline all|refuse all|deny all|reject non-essential|only necessary|only essential cookies|essential only|use necessary cookies only|continue without accepting|reject cookies|reject|decline|refuse)\s*$/i;

async function detectBannerInFrame(frame: Frame): Promise<{
  detected: boolean;
  excerpt: string | null;
}> {
  for (const sel of BANNER_CONTAINER_SELECTORS) {
    try {
      const loc = frame.locator(sel).first();
      if (await loc.isVisible({ timeout: 350 })) {
        const text = (await loc.innerText()).replace(/\s+/g, ' ').trim();
        return { detected: true, excerpt: text.slice(0, 320) };
      }
    } catch {
      // continue scanning other banner selectors
    }
  }

  // Fallback: inspect visible dialogs or fixed overlays mentioning cookies/consent
  try {
    const candidate = await frame.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('div, section, aside, dialog'));
      for (const el of nodes) {
        const style = window.getComputedStyle(el);
        const isOverlay = style.position === 'fixed' || style.position === 'sticky' || el.getAttribute('role') === 'dialog';
        if (!isOverlay) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 150 || rect.height < 40) continue;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt.length > 20 && txt.length < 1800 && /(cookie|consent|privacy preferences|tracking)/i.test(txt)) {
          return txt.slice(0, 320);
        }
      }
      return null;
    });
    if (candidate) {
      return { detected: true, excerpt: candidate };
    }
  } catch {
    // ignore DOM evaluation issues on restricted frames
  }

  return { detected: false, excerpt: null };
}

async function detectBannerContext(page: Page): Promise<{
  detected: boolean;
  excerpt: string | null;
}> {
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  for (const frame of frames) {
    const res = await detectBannerInFrame(frame);
    if (res.detected) return res;
  }
  return { detected: false, excerpt: null };
}

async function tryClickLocator(locator: Locator): Promise<boolean> {
  try {
    if (await locator.isVisible({ timeout: 500 })) {
      await locator.click({ timeout: 3000 });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function findAndClickInFrame(
  frame: Frame,
  action: 'accept_all' | 'reject_all'
): Promise<{ clicked: boolean; strategy: string | null }> {
  const selectors = action === 'accept_all' ? KNOWN_ACCEPT_SELECTORS : KNOWN_REJECT_SELECTORS;
  for (const sel of selectors) {
    const ok = await tryClickLocator(frame.locator(sel).first());
    if (ok) {
      return { clicked: true, strategy: `cmp_selector:${sel}` };
    }
  }

  const textRegex = action === 'accept_all' ? ACCEPT_TEXT_REGEX : REJECT_TEXT_REGEX;
  const roleCandidates: Array<'button' | 'link'> = ['button', 'link'];
  for (const role of roleCandidates) {
    try {
      const matches = frame.getByRole(role, { name: textRegex });
      const count = await matches.count();
      for (let i = 0; i < Math.min(count, 4); i++) {
        if (await tryClickLocator(matches.nth(i))) {
          return { clicked: true, strategy: `aria_role_${role}:${textRegex.source.slice(0, 36)}` };
        }
      }
    } catch {
      // continue
    }
  }

  return { clicked: false, strategy: null };
}

export async function executeConsentInteraction(
  page: Page,
  stateKey: ConsentStateKey
): Promise<ConsentInteractionResult> {
  const banner = await detectBannerContext(page);

  if (stateKey === 'no_consent') {
    return {
      bannerDetected: banner.detected,
      actionPerformed: false,
      inconclusive: false,
      strategy: banner.detected ? 'baseline_no_interaction' : 'no_banner_observed',
      bannerTextExcerpt: banner.excerpt,
      inconclusiveReason: null,
    };
  }

  // Search main frame first, then any child iframes (e.g. Sourcepoint / TrustArc CMP iframes)
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  for (const frame of frames) {
    const result = await findAndClickInFrame(frame, stateKey);
    if (result.clicked) {
      return {
        bannerDetected: true,
        actionPerformed: true,
        inconclusive: false,
        strategy: result.strategy,
        bannerTextExcerpt: banner.excerpt,
        inconclusiveReason: null,
      };
    }
  }

  // Never invent a consent outcome when banner or matching button cannot be reliably acted upon
  const reason = banner.detected
    ? `Consent banner detected, but no unambiguous "${stateKey === 'accept_all' ? 'Accept All' : 'Reject All'}" control could be verified or clicked.`
    : `No visible consent banner or CMP dialog was detected on initial render; "${stateKey}" state marked inconclusive rather than fabricated.`;

  return {
    bannerDetected: banner.detected,
    actionPerformed: false,
    inconclusive: true,
    strategy: null,
    bannerTextExcerpt: banner.excerpt,
    inconclusiveReason: reason,
  };
}
