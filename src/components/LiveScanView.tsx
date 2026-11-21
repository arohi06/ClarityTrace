import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatBytes, formatTimestamp, getStoredToken } from '../lib/api.ts';
import { exportScanPdfReport } from '../lib/pdfExport.ts';
import { summarizeScanPlainLanguage } from '../lib/plainLanguage.ts';
import type {
  ConsentBehaviourFingerprint,
  ConsentStateRow,
  CookieRow,
  EvidenceFile,
  Finding,
  NetworkRequestRow,
  PageView,
  Scan,
  StorageRow,
} from '../types.ts';
import {
  Card,
  EmptyState,
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
  SegmentedTabs,
  SeverityText,
  StatusText,
} from './ui.tsx';

interface LiveScanViewProps {
  scanId: number | null;
  recentScans: Scan[];
  onSelectScan: (id: number) => void;
  onNavigate: (page: PageView) => void;
  onRefreshData: () => void;
}

interface ProgressLog {
  stepNumber: number;
  stepTitle: string;
  stage: string;
  stateKey?: string;
  message: string;
  requestsCaptured: number;
  cookiesCaptured: number;
  thirdPartyDomainsDetected: number;
  timestamp: string;
  status: string;
}

const SIMPLE_STAGES = [
  { id: 1, label: 'Opening private browser', minStep: 1 },
  { id: 2, label: 'Testing before consent', minStep: 3 },
  { id: 3, label: 'Testing Accept All', minStep: 5 },
  { id: 4, label: 'Testing Reject All', minStep: 6 },
  { id: 5, label: 'Preparing your report', minStep: 9 },
];

export const LiveScanView: React.FC<LiveScanViewProps> = ({
  scanId,
  recentScans,
  onSelectScan,
  onNavigate,
  onRefreshData,
}) => {
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [detail, setDetail] = useState<{
    scan: Scan;
    consentStates: ConsentStateRow[];
    requests: NetworkRequestRow[];
    cookies: CookieRow[];
    storage: StorageRow[];
    findings: Finding[];
    evidenceFiles: EvidenceFile[];
    consentFingerprint: ConsentBehaviourFingerprint;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLiveLog, setShowLiveLog] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('fingerprint');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadEvidence = async (ef: EvidenceFile) => {
    setDownloadingId(ef.id);
    try {
      const token = getStoredToken();
      const resp = await fetch(`/api/evidence/${ef.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan-${ef.scan_id}-${ef.consent_state_key}.${ef.file_type === 'har' ? 'har' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  const loadDetail = async (id: number) => {
    try {
      const data = await apiFetch<NonNullable<typeof detail>>(`/api/scans/${id}`);
      setDetail(data);
      if (data.scan.status === 'completed') {
        setCurrentStep(11);
      }
    } catch {
      // keep polling / SSE fallback
    }
  };

  useEffect(() => {
    if (!scanId) return;
    setLogs([]);
    setCurrentStep(1);
    loadDetail(scanId);

    const token = getStoredToken();
    const es = new EventSource(`/api/scans/${scanId}/stream?token=${encodeURIComponent(token || '')}`);

    es.onmessage = (event) => {
      try {
        const evt = JSON.parse(event.data) as ProgressLog;
        setLogs((prev) => [...prev, evt]);
        if (evt.stepNumber) setCurrentStep((prev) => Math.max(prev, evt.stepNumber));
        if (evt.status === 'completed' || evt.status === 'failed') {
          es.close();
          loadDetail(scanId);
          onRefreshData();
        }
      } catch {
        // ignore keepalive
      }
    };

    es.onerror = () => {
      es.close();
      loadDetail(scanId);
    };

    return () => {
      es.close();
    };
  }, [scanId]);

  const handlePinBaseline = async () => {
    if (!detail) return;
    await apiFetch(`/api/scans/${detail.scan.id}/baseline`, {
      method: 'POST',
      body: JSON.stringify({ label: detail.scan.release_label || `Scan #${detail.scan.id}` }),
    });
    await loadDetail(detail.scan.id);
    onRefreshData();
  };

  if (!scanId) {
    return (
      <EmptyState
        icon={<Loader2 className="w-7 h-7" />}
        title="No Website Check Selected"
        description="Start a new website privacy check or choose one of your recent checks below."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <PrimaryButton onClick={() => onNavigate('start_scan')}>Check My Website</PrimaryButton>
            {recentScans.slice(0, 4).map((s) => (
              <SecondaryButton key={s.id} size="sm" onClick={() => onSelectScan(s.id)}>
                {s.website_name || s.domain} (#{s.id})
              </SecondaryButton>
            ))}
          </div>
        }
      />
    );
  }

  const isRunning = !detail || (detail.scan.status !== 'completed' && detail.scan.status !== 'failed');
  const plainSummary =
    detail && detail.scan.status === 'completed'
      ? summarizeScanPlainLanguage({
          scan: detail.scan,
          consentStates: detail.consentStates,
          requests: detail.requests,
          cookies: detail.cookies,
          findings: detail.findings,
        })
      : null;

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              Website Privacy Check · Started {formatTimestamp(detail?.scan.started_at)}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#1C2620] dark:text-[#F3EEE4] truncate">
              {detail?.scan.website_name || detail?.scan.domain || detail?.scan.target_url || 'Checking website...'}
            </h1>
            {detail?.scan.target_url && (
              <div className="mt-0.5 text-xs font-mono text-[#6B7268] dark:text-[#B3BDB3] truncate">
                {detail.scan.target_url}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <StatusText status={detail?.scan.status || 'running'} />
            {detail?.scan.status === 'completed' && (
              <SecondaryButton
                size="sm"
                onClick={() =>
                  exportScanPdfReport({
                    scan: detail.scan,
                    consentStates: detail.consentStates,
                    findings: detail.findings,
                  })
                }
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </SecondaryButton>
            )}
            {detail?.scan.status === 'completed' && detail.findings.length > 0 && (
              <PrimaryButton size="sm" onClick={() => onNavigate('findings')}>
                <span>Review Findings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </PrimaryButton>
            )}
          </div>
        </div>

        {detail?.scan.error_message && (
          <div className="mt-4">
            <ErrorBanner message={`Check could not finish: ${detail.scan.error_message}`} />
          </div>
        )}
      </Card>

      {/* Running Progress Card */}
      {isRunning && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B] animate-spin shrink-0" />
            <div>
              <h2 className="text-base font-semibold">Running automatic privacy checks...</h2>
              <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                {logs[logs.length - 1]?.message ||
                  'Opening fresh private browser sessions to test your cookie choices.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {SIMPLE_STAGES.map((st, idx) => {
              const nextMin = SIMPLE_STAGES[idx + 1]?.minStep ?? 99;
              const isDone = currentStep >= nextMin;
              const isCurrent = !isDone && currentStep >= st.minStep;
              return (
                <div
                  key={st.id}
                  className={`p-3.5 rounded-lg border text-xs ${
                    isDone
                      ? 'border-[#2F5D50]/30 bg-[#2F5D50]/8 dark:border-[#8DAE9B]/30 dark:bg-[#8DAE9B]/10'
                      : isCurrent
                      ? 'border-[#2F5D50] dark:border-[#8DAE9B] bg-[#EBE4D5]/50 dark:bg-[#202B25]'
                      : 'border-[#1C2620]/10 dark:border-[#F3EEE4]/10 text-[#6B7268] dark:text-[#B3BDB3]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#2F5D50] dark:text-[#8DAE9B] animate-spin shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-current opacity-40 shrink-0" />
                    )}
                    <span>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowLiveLog((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
            >
              {showLiveLog ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>View live browser log ({logs.length} events)</span>
            </button>

            {showLiveLog && (
              <div className="mt-3 rounded-lg bg-[#171F1B] text-[#F3EEE4] p-4 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5">
                {logs.map((l, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span className="text-[#B3BDB3] shrink-0 tabular-nums">{l.timestamp.slice(11, 19)}</span>
                    <span className="text-[#8DAE9B] shrink-0">[{l.stateKey || l.stage}]</span>
                    <span>{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 3: Easy-to-Understand Results */}
      {plainSummary && detail && (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              {plainSummary.overallTone === 'positive' ? (
                <CheckCircle2 className="w-6 h-6 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0 mt-0.5" />
              ) : plainSummary.overallTone === 'critical' ? (
                <ShieldAlert className="w-6 h-6 text-[#C4562F] dark:text-[#D47A59] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-[#B9822A] dark:text-[#D7A44E] shrink-0 mt-0.5" />
              )}
              <div>
                <h2 className="text-xl font-semibold">{plainSummary.overallHeadline}</h2>
                <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  {plainSummary.overallSummary}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#EBE4D5]/50 dark:bg-[#202B25] space-y-1.5">
                <div className="text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3]">
                  Tracking before consent?
                </div>
                <div
                  className={`text-sm font-semibold ${
                    plainSummary.beforeConsentStatus === 'observed'
                      ? 'text-[#C4562F] dark:text-[#D47A59]'
                      : 'text-[#2F5D50] dark:text-[#8DAE9B]'
                  }`}
                >
                  {plainSummary.beforeConsentStatus === 'observed'
                    ? 'Yes — tracking observed'
                    : plainSummary.beforeConsentStatus === 'not_run'
                    ? 'Skipped'
                    : 'No tracking observed'}
                </div>
                <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  {plainSummary.beforeConsentText}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#EBE4D5]/50 dark:bg-[#202B25] space-y-1.5">
                <div className="text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3]">
                  Tracking after Reject All?
                </div>
                <div
                  className={`text-sm font-semibold ${
                    plainSummary.afterRejectStatus === 'observed'
                      ? 'text-[#C4562F] dark:text-[#D47A59]'
                      : plainSummary.afterRejectStatus === 'inconclusive'
                      ? 'text-[#B9822A] dark:text-[#D7A44E]'
                      : 'text-[#2F5D50] dark:text-[#8DAE9B]'
                  }`}
                >
                  {plainSummary.afterRejectStatus === 'observed'
                    ? 'Yes — tracking continued'
                    : plainSummary.afterRejectStatus === 'inconclusive'
                    ? 'Inconclusive (manual check)'
                    : plainSummary.afterRejectStatus === 'not_run'
                    ? 'Skipped'
                    : 'No tracking observed'}
                </div>
                <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  {plainSummary.afterRejectText}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#EBE4D5]/50 dark:bg-[#202B25] space-y-1.5">
                <div className="text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3]">
                  What changed on Accept All?
                </div>
                <div className="text-sm font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  {plainSummary.issuesCount} potential issue{plainSummary.issuesCount === 1 ? '' : 's'}
                </div>
                <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  {plainSummary.afterAcceptText}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              <span>
                {plainSummary.confidenceLabel} · {detail.evidenceFiles.length} evidence archive
                {detail.evidenceFiles.length === 1 ? '' : 's'} saved
              </span>
              <span>{plainSummary.limitationsNote}</span>
            </div>
          </Card>

          {/* Collapsible Advanced Technical Details */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                aria-expanded={showAdvanced}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
              >
                {showAdvanced ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Advanced Technical Details (HAR Files, Raw Requests &amp; Cookies)</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {detail.scan.is_baseline !== 1 && (
                  <SecondaryButton size="sm" onClick={handlePinBaseline}>
                    Save as Baseline
                  </SecondaryButton>
                )}
                <SecondaryButton size="sm" onClick={() => onNavigate('comparison')}>
                  Compare Against Baseline
                </SecondaryButton>
              </div>
            </div>

            {showAdvanced && (
              <div className="border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
                <div className="px-5 py-3.5 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex flex-wrap items-center justify-between gap-3">
                  <SegmentedTabs
                    items={[
                      { id: 'fingerprint', label: 'Consent Fingerprint' },
                      { id: 'requests', label: `Requests (${detail.requests.length})` },
                      { id: 'cookies', label: `Cookies (${detail.cookies.length})` },
                      { id: 'findings', label: `Findings (${detail.findings.length})` },
                    ]}
                    activeId={activeTab}
                    onChange={setActiveTab}
                  />

                  <div className="flex flex-wrap gap-2">
                    {detail.evidenceFiles
                      .filter((ef) => ef.file_type === 'har')
                      .map((ef) => (
                        <button
                          key={ef.id}
                          type="button"
                          disabled={downloadingId === ef.id}
                          onClick={() => handleDownloadEvidence(ef)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 rounded-md hover:bg-[#EBE4D5] dark:hover:bg-[#202B25] cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" />
                          <span>
                            {downloadingId === ef.id
                              ? 'Downloading...'
                              : `${ef.consent_state_key}.har (${formatBytes(ef.byte_size)})`}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                <div className="p-5">
                  {activeTab === 'fingerprint' && (
                    <div className="space-y-4">
                      <div className="text-xs font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                        Fingerprint SHA-256: {detail.consentFingerprint.sha256Hash}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(['no_consent', 'accept_all', 'reject_all'] as const).map((k) => {
                          const st = detail.consentFingerprint.states[k];
                          const cs = detail.consentStates.find((c) => c.state_key === k);
                          return (
                            <div
                              key={k}
                              className="p-4 rounded-lg border border-[#1C2620]/12 dark:border-[#F3EEE4]/12 bg-[#F3EEE4]/50 dark:bg-[#171F1B]/50 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between font-mono font-semibold">
                                <span>{k}</span>
                                <StatusText status={cs?.status || 'pending'} />
                              </div>
                              <div>
                                Requests: <span className="font-mono font-semibold">{st?.totalRequests ?? 0}</span>
                              </div>
                              <div>
                                Outcome: <span className="font-mono">{st?.interactionOutcome || '—'}</span>
                              </div>
                              <div>
                                3P Domains:{' '}
                                <span className="font-mono">
                                  {st?.thirdPartyDomains.length ? st.thirdPartyDomains.join(', ') : 'None'}
                                </span>
                              </div>
                              <div>
                                Cookies:{' '}
                                <span className="font-mono">
                                  {st?.cookieNames.length ? st.cookieNames.join(', ') : 'None'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'requests' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                            <th className="py-2 px-3">State</th>
                            <th className="py-2 px-3">Phase</th>
                            <th className="py-2 px-3">URL</th>
                            <th className="py-2 px-3">Category</th>
                            <th className="py-2 px-3">Rule</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                          {detail.requests.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 px-3 font-mono">{r.state_key}</td>
                              <td className="py-2 px-3 font-mono text-[#6B7268] dark:text-[#B3BDB3]">{r.phase}</td>
                              <td className="py-2 px-3 font-mono max-w-sm truncate" title={r.url}>
                                {r.url}
                              </td>
                              <td className="py-2 px-3 font-medium">{r.category}</td>
                              <td className="py-2 px-3 font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                                {r.rule_id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activeTab === 'cookies' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                            <th className="py-2 px-3">State</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Domain</th>
                            <th className="py-2 px-3">Attributes</th>
                            <th className="py-2 px-3">Category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                          {detail.cookies.map((c) => (
                            <tr key={c.id}>
                              <td className="py-2 px-3 font-mono">{c.state_key}</td>
                              <td className="py-2 px-3 font-mono font-semibold">{c.name}</td>
                              <td className="py-2 px-3 font-mono">{c.domain}</td>
                              <td className="py-2 px-3 font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                                {c.secure ? 'Secure ' : ''}
                                {c.http_only ? 'HttpOnly ' : ''}
                                {c.same_site || ''}
                              </td>
                              <td className="py-2 px-3">{c.category}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activeTab === 'findings' && (
                    <div className="space-y-3">
                      {detail.findings.length === 0 ? (
                        <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                          No findings triggered during this scan.
                        </p>
                      ) : (
                        detail.findings.map((f) => (
                          <div
                            key={f.id}
                            className="p-4 rounded-lg border border-[#1C2620]/12 dark:border-[#F3EEE4]/12 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{f.title}</span>
                              <SeverityText severity={f.severity} />
                            </div>
                            <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                              {f.technical_explanation}
                            </p>
                            <div className="text-xs font-mono text-[#1C2620] dark:text-[#F3EEE4]">
                              {f.evidence_ref}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {detail?.scan.status === 'failed' && (
        <Card className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <XCircle className="w-5 h-5 text-[#C4562F] dark:text-[#D47A59] shrink-0" />
            <span>Try checking the URL again or inspect if the site blocks automated browsers.</span>
          </div>
          <PrimaryButton onClick={() => onNavigate('start_scan')}>Check Another Website</PrimaryButton>
        </Card>
      )}
    </div>
  );
};
