import type {
  ConsentStateRow,
  CookieRow,
  Finding,
  NetworkRequestRow,
  Scan,
} from '../types.ts';

export function formatConsentStateLabel(stateKey: string): string {
  switch (stateKey) {
    case 'no_consent':
      return 'Before consent';
    case 'accept_all':
      return 'After Accept All';
    case 'reject_all':
      return 'After Reject All';
    default:
      return stateKey.replace(/_/g, ' ');
  }
}

export function isTrackerCategory(cat: string | null | undefined): boolean {
  return cat === 'analytics' || cat === 'advertising' || cat === 'fingerprinting';
}

export interface PlainScanSummary {
  overallTone: 'positive' | 'warning' | 'critical' | 'neutral';
  overallHeadline: string;
  overallSummary: string;
  beforeConsentStatus: 'clean' | 'observed' | 'not_run';
  beforeConsentText: string;
  afterRejectStatus: 'clean' | 'observed' | 'inconclusive' | 'not_run';
  afterRejectText: string;
  afterAcceptText: string;
  issuesCount: number;
  confidenceLabel: string;
  limitationsNote: string;
}

export function summarizeScanPlainLanguage(params: {
  scan: Scan;
  consentStates: ConsentStateRow[];
  requests: NetworkRequestRow[];
  cookies: CookieRow[];
  findings: Finding[];
}): PlainScanSummary {
  const { scan, consentStates, requests, cookies, findings } = params;

  const noConsentState = consentStates.find((s) => s.state_key === 'no_consent');
  const acceptState = consentStates.find((s) => s.state_key === 'accept_all');
  const rejectState = consentStates.find((s) => s.state_key === 'reject_all');

  const preTrackerReqs = requests.filter(
    (r) => r.state_key === 'no_consent' && isTrackerCategory(r.category)
  );
  const preTrackerCookies = cookies.filter(
    (c) => c.state_key === 'no_consent' && isTrackerCategory(c.category)
  );
  const preVendors = Array.from(
    new Set([
      ...preTrackerReqs.map((r) => r.tracker_vendor || r.domain),
      ...preTrackerCookies.map((c) => c.name),
    ])
  );

  const rejectTrackerReqs = requests.filter(
    (r) => r.state_key === 'reject_all' && r.phase !== 'initial' && isTrackerCategory(r.category)
  );
  const rejectTrackerCookies = cookies.filter(
    (c) => c.state_key === 'reject_all' && c.phase !== 'initial' && isTrackerCategory(c.category)
  );
  const rejectVendors = Array.from(
    new Set([
      ...rejectTrackerReqs.map((r) => r.tracker_vendor || r.domain),
      ...rejectTrackerCookies.map((c) => c.name),
    ])
  );

  const acceptTrackerDomains = Array.from(
    new Set(
      requests
        .filter((r) => r.state_key === 'accept_all' && isTrackerCategory(r.category))
        .map((r) => r.tracker_vendor || r.domain)
    )
  );
  const noConsentDomainSet = new Set(
    preTrackerReqs.map((r) => r.tracker_vendor || r.domain)
  );
  const activatedOnAccept = acceptTrackerDomains.filter((d) => !noConsentDomainSet.has(d));

  const acceptCookiesCount = new Set(
    cookies.filter((c) => c.state_key === 'accept_all').map((c) => c.name)
  ).size;
  const noConsentCookiesCount = new Set(
    cookies.filter((c) => c.state_key === 'no_consent').map((c) => c.name)
  ).size;

  const beforeConsentStatus: PlainScanSummary['beforeConsentStatus'] = !noConsentState
    ? 'not_run'
    : preVendors.length > 0
    ? 'observed'
    : 'clean';

  const beforeConsentText =
    beforeConsentStatus === 'not_run'
      ? 'This check was skipped in custom settings.'
      : preVendors.length > 0
      ? `Observed ${preVendors.length} tracking ${preVendors.length === 1 ? 'signal' : 'signals'} before any cookie choice (${preVendors.slice(0, 3).join(', ')}${preVendors.length > 3 ? ` +${preVendors.length - 3} more` : ''}).`
      : 'No analytics or advertising tracking was observed before a visitor made a choice.';

  const afterRejectStatus: PlainScanSummary['afterRejectStatus'] = !rejectState
    ? 'not_run'
    : rejectState.status === 'inconclusive'
    ? 'inconclusive'
    : rejectVendors.length > 0
    ? 'observed'
    : 'clean';

  const afterRejectText =
    afterRejectStatus === 'not_run'
      ? 'This check was skipped in custom settings.'
      : afterRejectStatus === 'inconclusive'
      ? rejectState?.inconclusive_reason ||
        'We could not find a clear "Reject All" button to test automatically on this page.'
      : rejectVendors.length > 0
      ? `Tracking activity continued after clicking Reject All (${rejectVendors.slice(0, 3).join(', ')}${rejectVendors.length > 3 ? ` +${rejectVendors.length - 3} more` : ''}).`
      : 'No tracking activity was observed after clicking Reject All.';

  let afterAcceptText = 'This check was skipped in custom settings.';
  if (acceptState) {
    if (acceptState.status === 'inconclusive') {
      afterAcceptText =
        acceptState.inconclusive_reason ||
        'We could not find a clear "Accept All" button to trigger automatically.';
    } else if (activatedOnAccept.length > 0) {
      afterAcceptText = `${activatedOnAccept.length} additional tracking ${activatedOnAccept.length === 1 ? 'service' : 'services'} activated after clicking Accept All (${activatedOnAccept.slice(0, 3).join(', ')}).`;
    } else if (acceptCookiesCount > noConsentCookiesCount) {
      afterAcceptText = `${acceptCookiesCount - noConsentCookiesCount} additional ${acceptCookiesCount - noConsentCookiesCount === 1 ? 'cookie was' : 'cookies were'} stored after clicking Accept All.`;
    } else {
      afterAcceptText = 'Website behavior did not introduce new tracking services after clicking Accept All.';
    }
  }

  const actionableIssues = findings.filter((f) => f.category !== 'legitimate_change');
  const hasInconclusive = consentStates.some((s) => s.status === 'inconclusive');

  let overallTone: PlainScanSummary['overallTone'] = 'positive';
  let overallHeadline = 'Behaving as expected';
  let overallSummary =
    'ClarityTrace did not observe analytics or advertising tracking before consent or after rejection.';

  if (scan.status === 'failed') {
    overallTone = 'critical';
    overallHeadline = 'Website check could not finish';
    overallSummary =
      scan.error_message ||
      'The browser could not finish loading this page cleanly. Check the URL and try again.';
  } else if (scan.status !== 'completed') {
    overallTone = 'neutral';
    overallHeadline = 'Check in progress';
    overallSummary = 'Testing your website across separate private browser sessions.';
  } else if (preVendors.length > 0 || rejectVendors.length > 0) {
    overallTone = 'critical';
    overallHeadline = 'Potential privacy tracking detected without consent';
    overallSummary =
      rejectVendors.length > 0
        ? 'Some tracking services still fired after Reject All was clicked. Review the evidence below with your developer.'
        : 'Some tracking activity started on initial load before the visitor accepted cookies.';
  } else if (hasInconclusive) {
    overallTone = 'warning';
    overallHeadline = 'Needs a quick manual review';
    overallSummary =
      'No tracking fired before consent, but our automated browser could not confirm a standard Accept All or Reject All banner button.';
  } else if (actionableIssues.length > 0) {
    overallTone = 'warning';
    overallHeadline = `${actionableIssues.length} item${actionableIssues.length === 1 ? '' : 's'} to review`;
    overallSummary =
      'A change or minor privacy observation was recorded during this check.';
  }

  const completedCount = consentStates.filter((s) => s.status === 'completed').length;
  const confidenceLabel =
    scan.status === 'completed'
      ? hasInconclusive
        ? `Partial automated coverage (${completedCount} of ${consentStates.length} consent states verified)`
        : `Verified across ${completedCount} isolated browser sessions with saved evidence`
      : 'Check pending completion';

  const limitationsNote = hasInconclusive
    ? 'Note: Some sites use custom preference dialogs or region-based banners that require manual testing. ClarityTrace reports technical observations only and does not provide legal certification.'
    : 'Note: ClarityTrace inspects public initial page loads and reload persistence. It reports observed technical behavior rather than legal compliance verdicts.';

  return {
    overallTone,
    overallHeadline,
    overallSummary,
    beforeConsentStatus,
    beforeConsentText,
    afterRejectStatus,
    afterRejectText,
    afterAcceptText,
    issuesCount: actionableIssues.length,
    confidenceLabel,
    limitationsNote,
  };
}

export interface PlainFindingDetails {
  plainTitle: string;
  whatHappened: string;
  whenDidItHappen: string;
  whyShouldICare: string;
  ownerNextAction: string;
  developerAction: string;
  howToVerify: string;
  observedTarget: string;
}

export function translateFindingToPlainLanguage(f: Finding): PlainFindingDetails {
  const stateLabel = formatConsentStateLabel(f.consent_state_key);
  let observedTarget = f.evidence_ref;
  try {
    if (f.evidence_type === 'network_request') {
      const cleaned = f.evidence_ref.replace(/^(GET|POST|PUT|HEAD|OPTIONS)\s+/i, '').split(' (phase=')[0];
      const u = new URL(cleaned);
      observedTarget = u.hostname + (u.pathname !== '/' ? u.pathname : '');
    } else if (f.evidence_type === 'cookie') {
      observedTarget = f.evidence_ref.split(' (')[0];
    }
  } catch {
    observedTarget = f.evidence_ref;
  }

  switch (f.category) {
    case 'pre_consent_tracking':
      return {
        plainTitle: 'Possible tracking before consent',
        whatHappened: `We observed a network connection to an external tracking or analytics service (${observedTarget}) before a visitor made any cookie choice.`,
        whenDidItHappen: `Recorded immediately on page load (${stateLabel}).`,
        whyShouldICare:
          'Visitors generally expect analytics and marketing tools to wait until they grant permission through your cookie banner.',
        ownerNextAction:
          'Ask your developer to check whether this script can wait until the visitor clicks Accept All.',
        developerAction: f.suggested_action,
        howToVerify: `Update your tag manager or consent script so it waits for consent, then run a fresh ClarityTrace check on ${f.affected_page}.`,
        observedTarget,
      };
    case 'pre_consent_cookie':
      return {
        plainTitle: `Analytics or ad cookie ("${observedTarget}") set before consent`,
        whatHappened: `The browser stored a tracking-related cookie named "${observedTarget}" before any consent button was clicked.`,
        whenDidItHappen: `Recorded on initial visit (${stateLabel}).`,
        whyShouldICare:
          'Cookies used for analytics or advertising usually should only be saved after a visitor opts in.',
        ownerNextAction:
          'Ask your developer or website builder to delay setting this cookie until consent is accepted.',
        developerAction: f.suggested_action,
        howToVerify: `Clear cookies, deploy the update, and re-check ${f.affected_page} to confirm "${observedTarget}" is absent before consent.`,
        observedTarget,
      };
    case 'pre_consent_storage':
      return {
        plainTitle: `Tracking identifier saved in browser storage before consent`,
        whatHappened: `A tracking identifier (${observedTarget}) was saved in browser storage before the visitor accepted cookies.`,
        whenDidItHappen: `Recorded on initial visit (${stateLabel}).`,
        whyShouldICare:
          'Saving visitor IDs in browser storage behaves similarly to setting a cookie before permission is granted.',
        ownerNextAction:
          'Ask your developer to only save this storage key after the visitor accepts tracking.',
        developerAction: f.suggested_action,
        howToVerify: `Deploy the change and re-check ${f.affected_page} to confirm no tracking keys are written before consent.`,
        observedTarget,
      };
    case 'post_reject_tracking':
      return {
        plainTitle: 'Tracking activity continued after clicking Reject All',
        whatHappened: `Even after clicking Reject All on the cookie banner, your website still sent a request to ${observedTarget}.`,
        whenDidItHappen: `Observed after clicking Reject All (including page reload checks).`,
        whyShouldICare:
          'When visitors click Reject All, they expect non-essential tracking to stop and stay off as they browse.',
        ownerNextAction:
          'Share this evidence with your developer or consent-banner provider right away so Reject All actually pauses this tag.',
        developerAction: f.suggested_action,
        howToVerify: `Adjust your Reject All trigger, deploy, and re-check ${f.affected_page} to verify zero tracking requests appear after rejecting.`,
        observedTarget,
      };
    case 'post_reject_cookie':
      return {
        plainTitle: `Tracking cookie ("${observedTarget}") stayed active after Reject All`,
        whatHappened: `The cookie "${observedTarget}" remained present or was written after the visitor clicked Reject All.`,
        whenDidItHappen: `Observed after Reject All interaction.`,
        whyShouldICare:
          'Visitors who decline tracking expect analytics and advertising cookies not to remain active.',
        ownerNextAction:
          'Ask your developer to ensure your cookie banner removes or prevents this cookie when Reject All is chosen.',
        developerAction: f.suggested_action,
        howToVerify: `Deploy the fix and re-check ${f.affected_page} to confirm "${observedTarget}" is gone after rejecting.`,
        observedTarget,
      };
    case 'inconclusive_consent':
      return {
        plainTitle: 'Consent banner could not be tested automatically',
        whatHappened:
          'ClarityTrace could not locate a clear, standard "Reject All" button on the initial banner.',
        whenDidItHappen: `Checked while testing ${stateLabel}.`,
        whyShouldICare:
          'If a reject option is missing, hidden inside sub-menus, or hard for automated tools to recognize, visitors may also find it difficult to opt out.',
        ownerNextAction:
          'Visit your site in a private window to check whether visitors can easily find a Reject All option, or ask your developer to add clear button labels.',
        developerAction: f.suggested_action,
        howToVerify: `If you update your banner layout, run a fresh check on ${f.affected_page} to confirm ClarityTrace can click both Accept All and Reject All.`,
        observedTarget,
      };
    case 'consent_regression':
      return {
        plainTitle: 'New tracking appeared compared to your earlier baseline',
        whatHappened: `A recent change caused tracking behavior (${observedTarget}) to appear in a restricted state where it was not present in your baseline scan.`,
        whenDidItHappen: `Detected during ${stateLabel} compared against your saved baseline.`,
        whyShouldICare:
          'Website updates or new marketing tags can accidentally bypass consent settings that used to work properly.',
        ownerNextAction:
          'Review any scripts, plugins, or tag manager updates published recently and ask your developer to restore consent gating.',
        developerAction: f.suggested_action,
        howToVerify: `Revert or gate the newly added tag, then run a fresh check and inspect Baseline Comparison.`,
        observedTarget,
      };
    case 'new_tracker_introduced':
      return {
        plainTitle: `New third-party tracking service detected (${observedTarget})`,
        whatHappened: `This check saw a new analytics or advertising service (${observedTarget}) that was not in your previous baseline scan.`,
        whenDidItHappen: `Observed when testing ${stateLabel}.`,
        whyShouldICare:
          'Keeping track of new third-party tools helps ensure your cookie banner and privacy policy stay accurate.',
        ownerNextAction:
          'Confirm this tool was intentionally added and verify it is mentioned in your privacy notice.',
        developerAction: f.suggested_action,
        howToVerify: `Confirm consent gating and update your baseline scan if this tool is approved.`,
        observedTarget,
      };
    case 'legitimate_change':
      return {
        plainTitle: `Expected payment service change detected (${observedTarget})`,
        whatHappened: `ClarityTrace noticed a new connection to a recognized payment checkout service (${observedTarget}) and correctly excluded it from tracking alerts.`,
        whenDidItHappen: `Observed during ${stateLabel}.`,
        whyShouldICare:
          'Payment gateways are essential for checkout and are kept separate from marketing trackers so you do not get false alarms.',
        ownerNextAction: 'No tracking fix needed—just confirm this payment provider is expected.',
        developerAction: f.suggested_action,
        howToVerify: 'No action needed unless this payment integration was unexpected.',
        observedTarget,
      };
    default:
      return {
        plainTitle: f.title,
        whatHappened: f.technical_explanation,
        whenDidItHappen: `Recorded during ${stateLabel}.`,
        whyShouldICare:
          'Reviewing unexpected browser behavior helps keep visitor consent choices respected across releases.',
        ownerNextAction:
          'Share this observation with your website developer to confirm whether it matches your privacy settings.',
        developerAction: f.suggested_action,
        howToVerify: `Re-check ${f.affected_page} after making updates.`,
        observedTarget,
      };
  }
}
