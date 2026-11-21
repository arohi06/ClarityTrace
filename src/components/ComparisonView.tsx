import React, { useEffect, useState } from 'react';
import { GitCompare, ShieldAlert } from 'lucide-react';
import { apiFetch, formatTimestamp } from '../lib/api.ts';
import type { ComparisonDiff, Scan } from '../types.ts';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  SelectField,
  StatusText,
} from './ui.tsx';

interface ComparisonViewProps {
  scans: Scan[];
  initialScanId?: number | null;
  onSelectScan?: (scanId: number) => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  scans,
  initialScanId,
  onSelectScan,
}) => {
  const completedScans = scans.filter((s) => s.status === 'completed');
  const [currentScanId, setCurrentScanId] = useState<number>(
    initialScanId || (completedScans[0]?.id ?? 0)
  );
  const [baselineScanId, setBaselineScanId] = useState<string>('');
  const [diff, setDiff] = useState<ComparisonDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialScanId && completedScans.some((s) => s.id === initialScanId)) {
      setCurrentScanId(initialScanId);
      setBaselineScanId('');
    }
  }, [initialScanId]);

  const selectedScan = completedScans.find((s) => s.id === currentScanId);
  const sameSiteScans = selectedScan
    ? completedScans.filter((s) => s.website_id === selectedScan.website_id)
    : [];
  const otherSameSiteScans = sameSiteScans.filter((s) => s.id !== currentScanId);

  const runComparison = async (curId: number, baseIdStr: string) => {
    if (!curId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = baseIdStr
        ? `?currentScanId=${curId}&baselineScanId=${baseIdStr}`
        : `?currentScanId=${curId}`;
      const res = await apiFetch<{ comparison: ComparisonDiff }>(`/api/comparisons${qs}`);
      setDiff(res.comparison);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentScanId) {
      runComparison(currentScanId, baselineScanId);
    }
  }, [currentScanId, baselineScanId]);

  if (completedScans.length === 0) {
    return (
      <EmptyState
        icon={<GitCompare className="w-7 h-7" />}
        title="No Completed Scans to Compare"
        description="Complete at least one Playwright scan to compare consent states, or two scans on a website to inspect its Privacy Regression Timeline."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Baselines &amp; Privacy Regression Timeline
        </h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Compare Consent Behaviour Fingerprints across releases to highlight newly detected, removed, and changed tracking behaviour.
        </p>
      </div>

      {/* Scan & Baseline Selector */}
      <Card className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectField
          id="cmp-current"
          label="Current / Target Scan"
          value={currentScanId}
          onChange={(e) => {
            setCurrentScanId(Number(e.target.value));
            setBaselineScanId('');
          }}
        >
          {completedScans.map((s) => (
            <option key={s.id} value={s.id}>
              Scan #{s.id} · {s.website_name || s.domain}{' '}
              {s.release_label ? `(${s.release_label})` : ''}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="cmp-baseline"
          label="Baseline Scan (Comparison Reference)"
          value={baselineScanId}
          onChange={(e) => setBaselineScanId(e.target.value)}
        >
          <option value="">Auto-select pinned or previous scan</option>
          {otherSameSiteScans.map((s) => (
            <option key={s.id} value={String(s.id)}>
              Scan #{s.id} {s.is_baseline === 1 ? '(Pinned Baseline)' : ''}{' '}
              {s.release_label ? `· ${s.release_label}` : ''}
            </option>
          ))}
        </SelectField>
      </Card>

      {/* Multi-Scan Chronological Timeline for this website */}
      {sameSiteScans.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Release Timeline · {selectedScan?.website_name || selectedScan?.domain}
            </h2>
            <span className="text-xs font-mono text-[#6B7268] dark:text-[#B3BDB3]">
              {sameSiteScans.length} completed scan{sameSiteScans.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
            {[...sameSiteScans].reverse().map((s) => {
              const isCurrent = s.id === currentScanId;
              const isBase = diff?.baselineScanId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id !== currentScanId) {
                      setBaselineScanId(String(s.id));
                    } else if (onSelectScan) {
                      onSelectScan(s.id);
                    }
                  }}
                  className={`min-w-[190px] text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'border-[#2F5D50] dark:border-[#8DAE9B] bg-[#2F5D50]/8 dark:bg-[#8DAE9B]/10'
                      : isBase
                      ? 'border-[#B9822A] dark:border-[#D7A44E] bg-[#B9822A]/8 dark:bg-[#D7A44E]/10'
                      : 'border-[#1C2620]/12 dark:border-[#F3EEE4]/12 bg-[#EBE4D5]/40 dark:bg-[#202B25]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-semibold">Scan #{s.id}</span>
                    {isCurrent ? (
                      <span className="text-[#2F5D50] dark:text-[#8DAE9B] font-semibold">Current</span>
                    ) : isBase ? (
                      <span className="text-[#B9822A] dark:text-[#D7A44E] font-semibold">Baseline</span>
                    ) : s.is_baseline === 1 ? (
                      <span className="text-[#6B7268] dark:text-[#B3BDB3]">Pinned</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs font-medium truncate">
                    {s.release_label || 'Standard capture'}
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                    {s.findings_count ?? 0} findings · {formatTimestamp(s.started_at).slice(0, 10)}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading && <LoadingSkeleton rows={2} />}

      {diff && !loading && (
        <div className="space-y-6">
          {/* Consent Behaviour Fingerprint Hash */}
          {diff.consentFingerprint && (
            <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-[#2F5D50] dark:text-[#8DAE9B] font-semibold">
                  Consent Behaviour Fingerprint (v{diff.consentFingerprint.version})
                </div>
                <p className="mt-1 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                  Deterministic SHA-256 summary of third-party domains, tracker categories, cookies, and storage transitions.
                </p>
              </div>
              <div className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#EBE4D5] dark:bg-[#202B25] border border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
                {diff.consentFingerprint.sha256Hash.slice(0, 24)}...
              </div>
            </Card>
          )}

          {/* Newly Detected / Removed / Changed */}
          {diff.baselineScanId ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* NEWLY DETECTED */}
                <Card className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#C4562F] dark:text-[#D47A59]">
                      Newly Detected
                    </h2>
                    <span className="font-mono text-xs tabular-nums text-[#6B7268] dark:text-[#B3BDB3]">
                      {diff.newRequestDomains.length} domains · {diff.newCookies.length} cookies
                    </span>
                  </div>

                  {diff.consentRegressions.length > 0 && (
                    <div className="space-y-2">
                      {diff.consentRegressions.map((reg, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg bg-[#C4562F]/10 dark:bg-[#D47A59]/12 border border-[#C4562F]/25 text-xs space-y-1"
                        >
                          <div className="font-semibold text-[#C4562F] dark:text-[#D47A59] flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>{reg.title}</span>
                          </div>
                          <div className="text-[#6B7268] dark:text-[#B3BDB3]">{reg.previousBehavior}</div>
                          <div className="font-mono">{reg.currentBehavior}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {diff.newRequestDomains.length === 0 &&
                  diff.newCookies.length === 0 &&
                  diff.newStorageKeys.length === 0 ? (
                    <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                      No new endpoints, cookies, or storage keys appeared since Baseline Scan #{diff.baselineScanId}.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10 text-xs">
                      {diff.newRequestDomains.map((nr, i) => (
                        <li key={`nd-${i}`} className="py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium truncate">{nr.domain}</span>
                            <span
                              className={
                                nr.category === 'analytics' || nr.category === 'advertising'
                                  ? 'text-[#C4562F] dark:text-[#D47A59] font-medium'
                                  : nr.category === 'payment'
                                  ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
                                  : 'text-[#6B7268] dark:text-[#B3BDB3]'
                              }
                            >
                              {nr.category}
                            </span>
                          </div>
                        </li>
                      ))}
                      {diff.newCookies.map((c, i) => (
                        <li key={`nc-${i}`} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono truncate">Cookie: {c.name}</span>
                          <span className="text-[#6B7268] dark:text-[#B3BDB3]">{c.category}</span>
                        </li>
                      ))}
                      {diff.newStorageKeys.map((s, i) => (
                        <li key={`ns-${i}`} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono truncate">
                            {s.storageType}: {s.keyName}
                          </span>
                          <span className="text-[#6B7268] dark:text-[#B3BDB3]">{s.category}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {/* REMOVED */}
                <Card className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#2F5D50] dark:text-[#8DAE9B]">
                      Removed Since Baseline
                    </h2>
                    <span className="font-mono text-xs tabular-nums text-[#6B7268] dark:text-[#B3BDB3]">
                      {diff.removedDomains.length} domains · {diff.removedCookies.length} cookies
                    </span>
                  </div>

                  {diff.removedDomains.length === 0 && diff.removedCookies.length === 0 ? (
                    <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                      No previously observed endpoints or cookies were removed.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10 text-xs">
                      {diff.removedDomains.map((rd, i) => (
                        <li key={`rd-${i}`} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{rd.domain}</span>
                          <span className="text-[#2F5D50] dark:text-[#8DAE9B]">{rd.category}</span>
                        </li>
                      ))}
                      {diff.removedCookies.map((rc, i) => (
                        <li key={`rc-${i}`} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono truncate">Cookie: {rc.name}</span>
                          <span className="text-[#2F5D50] dark:text-[#8DAE9B]">{rc.category}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {/* CHANGED SUMMARY */}
                <Card className="p-5 space-y-3">
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#B9822A] dark:text-[#D7A44E]">
                    Changed Observations
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                          <th className="py-2 pr-2">Observation</th>
                          <th className="py-2 px-2 text-right">Base</th>
                          <th className="py-2 px-2 text-right">Curr</th>
                          <th className="py-2 pl-2 text-right">Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                        {diff.changedMetrics.map((m) => {
                          const diffColor =
                            m.difference > 0
                              ? 'text-[#C4562F] dark:text-[#D47A59]'
                              : m.difference < 0
                              ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
                              : 'text-[#6B7268] dark:text-[#B3BDB3]';
                          return (
                            <tr key={m.observation}>
                              <td className="py-2 pr-2">{m.observation}</td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {m.baselineValue}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums">
                                {m.currentValue}
                              </td>
                              <td className={`py-2 pl-2 text-right font-mono tabular-nums font-semibold ${diffColor}`}>
                                {m.difference > 0 ? `+${m.difference}` : m.difference}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              Scan #{diff.currentScanId} is the first recorded scan for this website. Run a second scan after a release or consent update to unlock Newly Detected, Removed, and Changed baseline diffs.
            </Card>
          )}

          {/* Cross-Consent Matrix */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
              <h2 className="text-sm font-semibold">
                Cross-Consent Behavioral Matrix (Scan #{diff.currentScanId})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EBE4D5]/60 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                    <th className="py-2.5 px-4">Consent State</th>
                    <th className="py-2.5 px-4">Verification Status</th>
                    <th className="py-2.5 px-4 text-right">Total Requests</th>
                    <th className="py-2.5 px-4 text-right">Tracker Requests</th>
                    <th className="py-2.5 px-4 text-right">Tracker Cookies</th>
                    <th className="py-2.5 px-4 text-right">Tracker Storage</th>
                    <th className="py-2.5 px-4">Observed Tracker Domains</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                  {Object.entries(diff.crossConsentMatrix).map(([key, row]) => {
                    const warnReq = (key === 'no_consent' || key === 'reject_all') && row.trackerRequests > 0;
                    const warnCk = (key === 'no_consent' || key === 'reject_all') && row.trackerCookies > 0;
                    return (
                      <tr key={key} className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70">
                        <td className="py-3 px-4 font-mono font-semibold">{key}</td>
                        <td className="py-3 px-4">
                          <StatusText status={row.status} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{row.totalRequests}</td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            warnReq ? 'text-[#C4562F] dark:text-[#D47A59]' : ''
                          }`}
                        >
                          {row.trackerRequests}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            warnCk ? 'text-[#C4562F] dark:text-[#D47A59]' : ''
                          }`}
                        >
                          {row.trackerCookies}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{row.trackerStorage}</td>
                        <td className="py-3 px-4 font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                          {row.trackerDomains.length > 0 ? row.trackerDomains.join(', ') : 'None'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
