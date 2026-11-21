import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  GitCompare,
  Globe,
  SearchCheck,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch, formatTimestamp, getStoredToken } from '../lib/api.ts';
import {
  formatConsentStateLabel,
  summarizeScanPlainLanguage,
  translateFindingToPlainLanguage,
} from '../lib/plainLanguage.ts';
import type {
  ComparisonDiff,
  ConsentBehaviourFingerprint,
  ConsentStateRow,
  CookieRow,
  Finding,
  NetworkRequestRow,
  PageView,
  Scan,
  StorageRow,
} from '../types.ts';
import {
  Card,
  ConsentBarChart,
  EmptyState,
  LoadingSkeleton,
  PrimaryButton,
  SecondaryButton,
  SeverityText,
  StatusText,
} from './ui.tsx';

interface DashboardViewProps {
  stats: {
    totalWebsites: number;
    totalScans: number;
    newFindings: number;
    highSeverityFindings: number;
  };
  recentScans: Scan[];
  recentFindings: Finding[];
  loading: boolean;
  onNavigate: (page: PageView) => void;
  onSelectScan: (scanId: number) => void;
  onProvisionTestLab: () => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  recentScans,
  recentFindings,
  loading,
  onNavigate,
  onSelectScan,
  onProvisionTestLab,
}) => {
  const [provisioning, setProvisioning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [latestDetail, setLatestDetail] = useState<{
    scan: Scan;
    consentStates: ConsentStateRow[];
    requests: NetworkRequestRow[];
    cookies: CookieRow[];
    storage: StorageRow[];
    findings: Finding[];
    consentFingerprint: ConsentBehaviourFingerprint;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonDiff | null>(null);

  const latestCompleted = recentScans.find((s) => s.status === 'completed');

  useEffect(() => {
    if (!latestCompleted) {
      setLatestDetail(null);
      setComparison(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    apiFetch<NonNullable<typeof latestDetail>>(`/api/scans/${latestCompleted.id}`)
      .then((res) => {
        if (!cancelled) setLatestDetail(res);
      })
      .catch(() => {
        if (!cancelled) setLatestDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    apiFetch<{ comparison: ComparisonDiff }>(`/api/comparisons?currentScanId=${latestCompleted.id}`)
      .then((res) => {
        if (!cancelled) setComparison(res.comparison);
      })
      .catch(() => {
        if (!cancelled) setComparison(null);
      });

    return () => {
      cancelled = true;
    };
  }, [latestCompleted?.id]);

  const handleLoadLab = async () => {
    setProvisioning(true);
    try {
      await onProvisionTestLab();
    } finally {
      setProvisioning(false);
    }
  };

  const handleExportJson = async (scanId: number) => {
    const token = getStoredToken();
    const resp = await fetch(`/api/scans/${scanId}/report`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claritytrace-scan-${scanId}-report.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading || (latestCompleted && detailLoading && !latestDetail)) {
    return <LoadingSkeleton rows={3} />;
  }

  const plainSummary = latestDetail
    ? summarizeScanPlainLanguage({
        scan: latestDetail.scan,
        consentStates: latestDetail.consentStates,
        requests: latestDetail.requests,
        cookies: latestDetail.cookies,
        findings: latestDetail.findings,
      })
    : null;

  const chartData = latestDetail
    ? ['no_consent', 'accept_all', 'reject_all']
        .map((key) => {
          const st = latestDetail.consentStates.find((c) => c.state_key === key);
          if (!st) return null;
          const stReqs = latestDetail.requests.filter((r) => r.state_key === key);
          const trackerReqs = stReqs.filter(
            (r) =>
              r.category === 'analytics' ||
              r.category === 'advertising' ||
              r.category === 'fingerprinting'
          );
          const stCookies = latestDetail.cookies.filter((c) => c.state_key === key);
          return {
            stateKey: key,
            label: formatConsentStateLabel(key),
            totalRequests: stReqs.length,
            trackerRequests: trackerReqs.length,
            cookies: stCookies.length,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    : [];

  const openFindingsForLatest = latestDetail
    ? latestDetail.findings.filter((f) => f.status === 'open' && f.category !== 'legitimate_change')
    : recentFindings.filter((f) => f.status === 'open' && f.category !== 'legitimate_change');

  // Plain-English change summary since previous / baseline scan
  const renderChangeSinceLastScan = () => {
    if (!latestDetail) return null;
    if (!comparison || !comparison.baselineScanId) {
      return {
        headline: 'Baseline check saved',
        description:
          'This is your starting check for this website. Future checks will automatically highlight any new tracking services or unexpected changes.',
        hasAlert: false,
      };
    }

    const regressionCount = comparison.consentRegressions.length;
    const newTrackerCount = comparison.newTrackingDomains.length;
    const paymentNewCount = comparison.newRequestDomains.filter((d) => d.category === 'payment').length;

    if (regressionCount > 0 || newTrackerCount > 0) {
      return {
        headline: `${regressionCount + newTrackerCount} new tracking change${regressionCount + newTrackerCount === 1 ? '' : 's'} detected`,
        description: `Compared to your previous check (#${comparison.baselineScanId}), ClarityTrace observed ${newTrackerCount} new tracking domain${newTrackerCount === 1 ? '' : 's'} and ${regressionCount} consent behavior change${regressionCount === 1 ? '' : 's'}.`,
        hasAlert: true,
      };
    }

    if (paymentNewCount > 0) {
      return {
        headline: 'Only expected payment updates detected',
        description: `Compared to check #${comparison.baselineScanId}, a payment checkout integration was added and no new marketing or analytics trackers appeared.`,
        hasAlert: false,
      };
    }

    return {
      headline: 'No tracking changes since your last check',
      description: `Behavior matches your baseline check (#${comparison.baselineScanId}) with no new tracking services observed.`,
      hasAlert: false,
    };
  };

  const changeSummary = renderChangeSinceLastScan();

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C2620] dark:text-[#F3EEE4]">
            Privacy Overview
          </h1>
          <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
            {latestDetail
              ? `Latest check for ${latestDetail.scan.website_name || latestDetail.scan.domain} · ${formatTimestamp(
                  latestDetail.scan.completed_at || latestDetail.scan.started_at
                )}`
              : 'Monitor how your website respects visitor cookie choices.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {latestDetail && (
            <SecondaryButton size="md" onClick={() => onSelectScan(latestDetail.scan.id)}>
              <span>Full Check Summary</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </SecondaryButton>
          )}
          <PrimaryButton size="md" onClick={() => onNavigate('start_scan')}>
            <SearchCheck className="w-4 h-4" />
            <span>Check My Website</span>
          </PrimaryButton>
        </div>
      </div>

      {stats.totalWebsites === 0 || !latestDetail ? (
        <EmptyState
          icon={<Globe className="w-8 h-8" />}
          title="Check your first website in 30 seconds"
          description="Enter your website URL and ClarityTrace will automatically test what happens before consent, after Accept All, and after Reject All."
          action={
            <>
              <PrimaryButton onClick={() => onNavigate('start_scan')}>
                Check My Website
              </PrimaryButton>
              <SecondaryButton onClick={handleLoadLab} disabled={provisioning}>
                <FlaskConical className="w-3.5 h-3.5" />
                <span>{provisioning ? 'Setting up examples...' : 'Try Built-In Practice Sites'}</span>
              </SecondaryButton>
            </>
          }
        />
      ) : (
        <>
          {/* Question 1: Is my website behaving as expected? */}
          {plainSummary && (
            <Card className="p-6 sm:p-7">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3]">
                    1. Is {latestDetail.scan.website_name || latestDetail.scan.domain} behaving as expected?
                  </div>
                  <div className="flex items-start gap-3">
                    {plainSummary.overallTone === 'positive' ? (
                      <CheckCircle2 className="w-6 h-6 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0 mt-0.5" />
                    ) : plainSummary.overallTone === 'critical' ? (
                      <ShieldAlert className="w-6 h-6 text-[#C4562F] dark:text-[#D47A59] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-[#B9822A] dark:text-[#D7A44E] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h2 className="text-xl sm:text-2xl font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                        {plainSummary.overallHeadline}
                      </h2>
                      <p className="mt-1.5 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                        {plainSummary.overallSummary}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                    <span>{plainSummary.confidenceLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {plainSummary.issuesCount} potential issue
                      {plainSummary.issuesCount === 1 ? '' : 's'} noted
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 shrink-0">
                  {plainSummary.issuesCount > 0 && (
                    <PrimaryButton onClick={() => onNavigate('findings')}>
                      <span>Review Results &amp; Fix Steps</span>
                      <ArrowRight className="w-4 h-4" />
                    </PrimaryButton>
                  )}
                  <SecondaryButton onClick={() => onNavigate('reports')}>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF Report</span>
                  </SecondaryButton>
                </div>
              </div>
              <p className="mt-4 pt-4 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                {plainSummary.limitationsNote}
              </p>
            </Card>
          )}

          {/* Question 2: What did ClarityTrace detect? */}
          {plainSummary && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  2. What did ClarityTrace detect?
                </h2>
                <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] mt-0.5">
                  Each cookie choice was tested in a clean, separate browser visit.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Before Consent</span>
                    {plainSummary.beforeConsentStatus === 'observed' ? (
                      <span className="text-xs font-medium text-[#C4562F] dark:text-[#D47A59]">
                        Tracking seen
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B]">
                        No tracking seen
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                    {plainSummary.beforeConsentText}
                  </p>
                </Card>

                <Card className="p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">After Accept All</span>
                    <span className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B]">
                      Checked
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                    {plainSummary.afterAcceptText}
                  </p>
                </Card>

                <Card className="p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">After Reject All</span>
                    {plainSummary.afterRejectStatus === 'observed' ? (
                      <span className="text-xs font-medium text-[#C4562F] dark:text-[#D47A59]">
                        Tracking continued
                      </span>
                    ) : plainSummary.afterRejectStatus === 'inconclusive' ? (
                      <span className="text-xs font-medium text-[#B9822A] dark:text-[#D7A44E]">
                        Needs review
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B]">
                        No tracking seen
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                    {plainSummary.afterRejectText}
                  </p>
                </Card>
              </div>

              {chartData.length > 0 && <ConsentBarChart data={chartData} />}
            </section>
          )}

          {/* Questions 3 & 4: What should I do next? + Has anything changed? */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Question 3: What should I do next? */}
            <Card className="lg:col-span-7 overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">3. What should I do next?</h2>
                  <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                    Plain-English priorities based on your latest findings
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('findings')}
                  className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B] hover:underline cursor-pointer shrink-0"
                >
                  View all results
                </button>
              </div>

              {openFindingsForLatest.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <CheckCircle2 className="w-6 h-6 text-[#2F5D50] dark:text-[#8DAE9B] mx-auto" />
                  <div className="text-sm font-medium">No action items right now</div>
                  <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] max-w-md mx-auto">
                    Your latest check did not find open privacy issues. Run another check whenever you publish website updates or add new tools.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                  {openFindingsForLatest.slice(0, 4).map((f) => {
                    const plain = translateFindingToPlainLanguage(f);
                    return (
                      <li
                        key={f.id}
                        onClick={() => onNavigate('findings')}
                        className="px-6 py-4 hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70 cursor-pointer transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold">{plain.plainTitle}</div>
                          <SeverityText severity={f.severity} />
                        </div>
                        <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                          {plain.ownerNextAction}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Question 4: Has anything changed since my last scan? */}
            <Card className="lg:col-span-5 p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">4. Has anything changed?</h2>
                  <GitCompare className="w-4 h-4 text-[#2F5D50] dark:text-[#8DAE9B]" />
                </div>

                {changeSummary && (
                  <div className="space-y-2">
                    <div
                      className={`text-sm font-semibold ${
                        changeSummary.hasAlert
                          ? 'text-[#C4562F] dark:text-[#D47A59]'
                          : 'text-[#2F5D50] dark:text-[#8DAE9B]'
                      }`}
                    >
                      {changeSummary.headline}
                    </div>
                    <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                      {changeSummary.description}
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10 space-y-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                  <div className="flex justify-between">
                    <span>Websites monitored</span>
                    <span className="font-mono tabular-nums font-medium text-[#1C2620] dark:text-[#F3EEE4]">
                      {stats.totalWebsites}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total checks completed</span>
                    <span className="font-mono tabular-nums font-medium text-[#1C2620] dark:text-[#F3EEE4]">
                      {stats.totalScans}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recent check status</span>
                    <StatusText status={latestDetail.scan.status} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SecondaryButton size="sm" onClick={() => onNavigate('comparison')}>
                  Compare Releases
                </SecondaryButton>
                <SecondaryButton size="sm" onClick={() => onNavigate('website_overview')}>
                  Monitoring History
                </SecondaryButton>
              </div>
            </Card>
          </div>

          {/* Collapsible Advanced Details (Hidden by default) */}
          <Card className="p-5">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
              className="w-full flex items-center justify-between text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                {showAdvanced ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Advanced Details (Technical Fingerprint, Raw Counts &amp; Evaluation Lab)</span>
              </span>
              <span className="font-mono">Scan #{latestDetail.scan.id}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 pt-4 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10 space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[#6B7268] dark:text-[#B3BDB3]">Total Requests</div>
                    <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                      {latestDetail.requests.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#6B7268] dark:text-[#B3BDB3]">3P Domains</div>
                    <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                      {
                        new Set(
                          latestDetail.requests
                            .filter((r) => r.is_third_party === 1)
                            .map((r) => r.domain)
                        ).size
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-[#6B7268] dark:text-[#B3BDB3]">Distinct Cookies</div>
                    <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                      {new Set(latestDetail.cookies.map((c) => `${c.name}::${c.domain}`)).size}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#6B7268] dark:text-[#B3BDB3]">Fingerprint SHA-256</div>
                    <div
                      className="mt-0.5 font-mono truncate"
                      title={latestDetail.consentFingerprint.sha256Hash}
                    >
                      {latestDetail.consentFingerprint.sha256Hash.slice(0, 16)}…
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <SecondaryButton size="sm" onClick={() => onNavigate('network_inspector')}>
                    Network Inspector
                  </SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => onNavigate('cookie_storage')}>
                    Cookies &amp; Storage
                  </SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => onNavigate('evidence_explorer')}>
                    Evidence Explorer
                  </SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => handleExportJson(latestDetail.scan.id)}>
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Technical JSON</span>
                  </SecondaryButton>
                  <SecondaryButton size="sm" onClick={handleLoadLab} disabled={provisioning}>
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span>{provisioning ? 'Provisioning...' : 'Evaluation Lab (A–F)'}</span>
                  </SecondaryButton>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
