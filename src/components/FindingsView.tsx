import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FolderSearch,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { apiFetch, formatBytes, formatTimestamp, getStoredToken } from '../lib/api.ts';
import { formatConsentStateLabel, translateFindingToPlainLanguage } from '../lib/plainLanguage.ts';
import type { EvidenceFile, Finding, Website } from '../types.ts';
import {
  Card,
  EmptyState,
  ErrorBanner,
  SearchField,
  SecondaryButton,
  SegmentedTabs,
  SelectField,
  SeverityText,
  StatusText,
} from './ui.tsx';

interface FindingsViewProps {
  findings: Finding[];
  websites: Website[];
  onRefresh: () => Promise<void>;
  onInspectScan?: (scanId: number) => void;
  onRecheckSite?: (websiteId: number) => void;
}

export const FindingsView: React.FC<FindingsViewProps> = ({
  findings,
  websites,
  onRefresh,
  onInspectScan,
  onRecheckSite,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(findings[0]?.id ?? null);
  const [updating, setUpdating] = useState(false);
  const [showTechnicalMeta, setShowTechnicalMeta] = useState(false);
  const [scanEvidence, setScanEvidence] = useState<Record<number, EvidenceFile[]>>({});
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [explainingId, setExplainingId] = useState<number | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<
    Record<
      number,
      {
        findingId: number;
        plainLanguageSummary: string;
        technicalContext: string;
        remediationSteps: string[];
        verificationChecklist: string[];
        modelName: string;
      }
    >
  >({});

  const filtered = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (siteFilter !== 'all' && String(f.website_id) !== siteFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const plain = translateFindingToPlainLanguage(f);
      return (
        plain.plainTitle.toLowerCase().includes(q) ||
        plain.whatHappened.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.evidence_ref.toLowerCase().includes(q) ||
        f.affected_page.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeFinding = filtered.find((f) => f.id === selectedId) || filtered[0] || null;
  const plain = activeFinding ? translateFindingToPlainLanguage(activeFinding) : null;

  // Fetch evidence files linked to the active finding's scan so direct evidence downloads work
  useEffect(() => {
    if (!activeFinding) return;
    if (scanEvidence[activeFinding.scan_id]) return;
    apiFetch<{ evidenceFiles: EvidenceFile[] }>(`/api/scans/${activeFinding.scan_id}`)
      .then((res) => {
        setScanEvidence((prev) => ({ ...prev, [activeFinding.scan_id]: res.evidenceFiles || [] }));
      })
      .catch(() => {});
  }, [activeFinding?.scan_id]);

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

  const handleStatusChange = async (id: number, status: 'open' | 'acknowledged' | 'resolved') => {
    setUpdating(true);
    try {
      await apiFetch(`/api/findings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } finally {
      setUpdating(false);
    }
  };

  const handleExplainFinding = async (id: number) => {
    setExplainingId(id);
    setExplainError(null);
    try {
      const res = await apiFetch<{
        explanation: {
          findingId: number;
          plainLanguageSummary: string;
          technicalContext: string;
          remediationSteps: string[];
          verificationChecklist: string[];
          modelName: string;
        };
      }>(`/api/findings/${id}/explain`, { method: 'POST' });
      setAiExplanations((prev) => ({ ...prev, [id]: res.explanation }));
    } catch (err: unknown) {
      setExplainError(err instanceof Error ? err.message : 'Unable to generate Gemini explanation.');
    } finally {
      setExplainingId(null);
    }
  };

  const matchingEvidenceFiles = activeFinding
    ? (scanEvidence[activeFinding.scan_id] || []).filter(
        (ef) => ef.consent_state_key === activeFinding.consent_state_key || ef.file_type === 'har'
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Privacy Check Results
        </h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Every observation is written in plain English and linked directly to real browser evidence and verification steps.
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search website, service, or issue..."
          className="flex-1 min-w-[220px]"
        />

        <SelectField
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="w-48 h-9 text-xs"
        >
          <option value="all">All Websites</option>
          {websites.map((w) => (
            <option key={w.id} value={String(w.id)}>
              {w.name}
            </option>
          ))}
        </SelectField>

        <SegmentedTabs
          items={[
            { id: 'all', label: 'All' },
            { id: 'critical', label: 'Critical' },
            { id: 'high', label: 'High' },
            { id: 'medium', label: 'Medium' },
            { id: 'info', label: 'Info' },
          ]}
          activeId={severityFilter}
          onChange={setSeverityFilter}
        />
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-7 h-7 text-[#2F5D50] dark:text-[#8DAE9B]" />}
          title="No Matching Observations"
          description="Try clearing your search filters or run a fresh website check to gather updated observations."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Readable Findings List */}
          <Card className="lg:col-span-5 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-xs font-semibold">
              Observations ({filtered.length})
            </div>
            <ul className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10 max-h-[720px] overflow-y-auto">
              {filtered.map((f) => {
                const selected = activeFinding?.id === f.id;
                const summary = translateFindingToPlainLanguage(f);
                return (
                  <li
                    key={f.id}
                    onClick={() => {
                      setSelectedId(f.id);
                      setExplainError(null);
                    }}
                    className={`px-4 py-3.5 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-[#EBE4D5]/75 dark:bg-[#202B25]'
                        : 'hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold leading-snug">{summary.plainTitle}</div>
                      <SeverityText severity={f.severity} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                      <span className="truncate">{f.website_name || f.domain}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatConsentStateLabel(f.consent_state_key)}</span>
                      <span aria-hidden="true">·</span>
                      <StatusText status={f.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Right: 6-Question Plain-English Breakdown */}
          {activeFinding && plain && (
            <Card className="lg:col-span-7 p-6 space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 pb-4">
                <div>
                  <div className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                    {activeFinding.website_name || activeFinding.domain} ·{' '}
                    {formatConsentStateLabel(activeFinding.consent_state_key)}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">{plain.plainTitle}</h2>
                </div>
                <SeverityText severity={activeFinding.severity} />
              </div>

              {/* 1. What happened? / 2. When? / 3. Why should I care? */}
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <h3 className="text-xs font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                    What happened?
                  </h3>
                  <p className="mt-1 text-[#1C2620] dark:text-[#F3EEE4]">{plain.whatHappened}</p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                    When did it happen?
                  </h3>
                  <p className="mt-1 text-[#6B7268] dark:text-[#B3BDB3]">
                    {plain.whenDidItHappen} ({formatTimestamp(activeFinding.created_at)})
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                    Why should I care?
                  </h3>
                  <p className="mt-1 text-[#6B7268] dark:text-[#B3BDB3]">{plain.whyShouldICare}</p>
                </div>
              </div>

              {/* 4. What evidence supports this observation? */}
              <div className="rounded-xl bg-[#EBE4D5]/55 dark:bg-[#202B25] p-5 space-y-3">
                <div className="text-xs font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  What evidence supports this observation?
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Website URL</dt>
                    <dd className="mt-0.5 font-mono break-all">{activeFinding.affected_page}</dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Consent state</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatConsentStateLabel(activeFinding.consent_state_key)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Observed domain / item</dt>
                    <dd className="mt-0.5 font-mono break-all">{plain.observedTarget}</dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Timestamp</dt>
                    <dd className="mt-0.5 font-mono">{formatTimestamp(activeFinding.created_at)}</dd>
                  </div>
                </dl>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  {matchingEvidenceFiles.slice(0, 3).map((ef) => (
                    <SecondaryButton
                      key={ef.id}
                      size="sm"
                      disabled={downloadingId === ef.id}
                      onClick={() => handleDownloadEvidence(ef)}
                    >
                      <Download className="w-3 h-3" />
                      <span>
                        {downloadingId === ef.id
                          ? 'Downloading...'
                          : `${ef.consent_state_key}.${ef.file_type === 'har' ? 'har' : 'json'} (${formatBytes(ef.byte_size)})`}
                      </span>
                    </SecondaryButton>
                  ))}
                  {onInspectScan && (
                    <SecondaryButton size="sm" onClick={() => onInspectScan(activeFinding.scan_id)}>
                      <FolderSearch className="w-3.5 h-3.5" />
                      <span>Open Evidence Explorer</span>
                    </SecondaryButton>
                  )}
                </div>
              </div>

              {/* 5. How can I fix it? & 6. How can I verify the fix? */}
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <h3 className="text-xs font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                    How can I fix it?
                  </h3>
                  <p className="mt-1 font-medium text-[#1C2620] dark:text-[#F3EEE4]">
                    {plain.ownerNextAction}
                  </p>
                  <p className="mt-1 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                    For your developer: {plain.developerAction}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                    How can I verify the fix?
                  </h3>
                  <p className="mt-1 text-xs text-[#6B7268] dark:text-[#B3BDB3]">{plain.howToVerify}</p>
                  {onRecheckSite && (
                    <div className="mt-2.5">
                      <SecondaryButton
                        size="sm"
                        onClick={() => onRecheckSite(activeFinding.website_id)}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-check This Website</span>
                      </SecondaryButton>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Gemini Plain-Language Assistant */}
              <div className="space-y-3 pt-2 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                    Want tailored guidance to share with your developer?
                  </span>
                  <SecondaryButton
                    size="sm"
                    disabled={explainingId === activeFinding.id}
                    onClick={() => handleExplainFinding(activeFinding.id)}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {explainingId === activeFinding.id
                        ? 'Generating explanation...'
                        : 'Explain with Gemini'}
                    </span>
                  </SecondaryButton>
                </div>

                {explainError && <ErrorBanner message={explainError} />}

                {aiExplanations[activeFinding.id] && (
                  <div className="rounded-xl border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#F3EEE4]/55 dark:bg-[#171F1B] p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#C4562F] dark:text-[#D47A59]">
                        AI-Generated Interpretation (Grounded on Observed Evidence)
                      </span>
                      <span className="font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                        {aiExplanations[activeFinding.id].modelName}
                      </span>
                    </div>
                    <p className="text-[#1C2620] dark:text-[#F3EEE4]">
                      {aiExplanations[activeFinding.id].plainLanguageSummary}
                    </p>
                    <div>
                      <div className="font-semibold">Suggested Engineering Steps</div>
                      <ul className="mt-1 list-disc pl-4 space-y-1 text-[#6B7268] dark:text-[#B3BDB3]">
                        {aiExplanations[activeFinding.id].remediationSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Technical Reference */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTechnicalMeta((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
                >
                  {showTechnicalMeta ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>Technical Reference</span>
                </button>
                {showTechnicalMeta && (
                  <div className="mt-2 p-3 rounded-lg bg-[#EBE4D5]/50 dark:bg-[#171F1B] font-mono text-xs space-y-1 break-all">
                    <div>
                      Finding #{activeFinding.id} · Scan #{activeFinding.scan_id} · Confidence:{' '}
                      {activeFinding.confidence}
                    </div>
                    <div>Evidence Type: {activeFinding.evidence_type}</div>
                    <div>Raw Reference: {activeFinding.evidence_ref}</div>
                    <div>Rule Detail: {activeFinding.technical_explanation}</div>
                  </div>
                )}
              </div>

              {/* Triage Status Bar */}
              <div className="pt-4 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                  Track progress:
                </span>
                <div className="flex items-center gap-2">
                  {(
                    [
                      { id: 'open', label: 'Open' },
                      { id: 'acknowledged', label: 'In Progress' },
                      { id: 'resolved', label: 'Resolved' },
                    ] as const
                  ).map((st) =>
                    activeFinding.status === st.id ? (
                      <button
                        key={st.id}
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-lg bg-[#2F5D50] text-[#FAF7F0] dark:bg-[#8DAE9B] dark:text-[#171F1B] shrink-0"
                      >
                        {st.label}
                      </button>
                    ) : (
                      <SecondaryButton
                        key={st.id}
                        size="sm"
                        disabled={updating}
                        onClick={() => handleStatusChange(activeFinding.id, st.id)}
                      >
                        {st.label}
                      </SecondaryButton>
                    )
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
