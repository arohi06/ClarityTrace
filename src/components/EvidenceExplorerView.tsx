import React, { useEffect, useMemo, useState } from 'react';
import { Download, FolderSearch } from 'lucide-react';
import { apiFetch, formatBytes, formatTimestamp, getStoredToken } from '../lib/api.ts';
import type {
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
  SearchField,
  SecondaryButton,
  SelectField,
  StatusText,
} from './ui.tsx';

interface EvidenceExplorerViewProps {
  scans: Scan[];
  initialScanId?: number | null;
  onNavigate?: (page: PageView) => void;
}

interface TrailItem {
  id: string;
  orderIndex: number;
  kind: 'consent' | 'request' | 'cookie' | 'storage' | 'finding';
  stateKey: string;
  title: string;
  detail: string;
  ruleOrCategory: string;
  phase: string;
  timestamp?: string;
}

export const EvidenceExplorerView: React.FC<EvidenceExplorerViewProps> = ({
  scans,
  initialScanId,
  onNavigate,
}) => {
  const completedScans = scans.filter((s) => s.status === 'completed');
  const [scanId, setScanId] = useState<number>(
    initialScanId || (completedScans[0]?.id ?? 0)
  );
  const [data, setData] = useState<{
    scan: Scan;
    consentStates: ConsentStateRow[];
    requests: NetworkRequestRow[];
    cookies: CookieRow[];
    storage: StorageRow[];
    findings: Finding[];
    evidenceFiles: EvidenceFile[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    if (initialScanId && completedScans.some((s) => s.id === initialScanId)) {
      setScanId(initialScanId);
    }
  }, [initialScanId]);

  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    apiFetch<NonNullable<typeof data>>(`/api/scans/${scanId}`)
      .then((res) => setData(res))
      .finally(() => setLoading(false));
  }, [scanId]);

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

  const trail = useMemo(() => {
    if (!data) return [];
    const items: TrailItem[] = [];
    let seq = 0;

    for (const cs of data.consentStates) {
      items.push({
        id: `cs-${cs.id}`,
        orderIndex: ++seq,
        kind: 'consent',
        stateKey: cs.state_key,
        title: `Consent Scenario: ${cs.state_key} (${cs.status})`,
        detail:
          cs.inconclusive_reason ||
          cs.banner_strategy ||
          `Banner detected: ${cs.banner_detected ? 'Yes' : 'No'} · Reload verified: ${cs.reload_verified ? 'Yes' : 'No'}`,
        ruleOrCategory: cs.banner_detected ? 'cmp_verified' : 'no_banner',
        phase: cs.reload_verified ? 'post_reload' : 'initial_load',
      });
    }

    for (const r of data.requests) {
      items.push({
        id: `req-${r.id}`,
        orderIndex: r.timestamp_ms || ++seq,
        kind: 'request',
        stateKey: r.state_key,
        title: `${r.method} ${r.domain} (${r.resource_type})`,
        detail: r.url,
        ruleOrCategory: `${r.category || 'unknown'}${r.rule_id ? ` · ${r.rule_id}` : ''}`,
        phase: r.phase,
        timestamp: r.timestamp_ms ? new Date(r.timestamp_ms).toISOString() : undefined,
      });
    }

    for (const c of data.cookies) {
      items.push({
        id: `ck-${c.id}`,
        orderIndex: ++seq,
        kind: 'cookie',
        stateKey: c.state_key,
        title: `Cookie set: ${c.name} (${c.domain})`,
        detail: c.reasoning || `HttpOnly=${c.http_only} Secure=${c.secure} SameSite=${c.same_site || 'Lax'}`,
        ruleOrCategory: `${c.category || 'unknown'}${c.rule_id ? ` · ${c.rule_id}` : ''}`,
        phase: c.phase,
      });
    }

    for (const s of data.storage) {
      items.push({
        id: `st-${s.id}`,
        orderIndex: ++seq,
        kind: 'storage',
        stateKey: s.state_key,
        title: `${s.storage_type} key: ${s.key_name}`,
        detail: s.value_preview || s.origin,
        ruleOrCategory: `${s.category || 'unknown'}${s.rule_id ? ` · ${s.rule_id}` : ''}`,
        phase: s.phase,
        timestamp: s.created_at,
      });
    }

    for (const f of data.findings) {
      items.push({
        id: `fd-${f.id}`,
        orderIndex: ++seq,
        kind: 'finding',
        stateKey: f.consent_state_key,
        title: `[${f.severity.toUpperCase()}] ${f.title}`,
        detail: f.evidence_ref,
        ruleOrCategory: `${f.category} · ${f.evidence_type}`,
        phase: 'analysis',
        timestamp: f.created_at,
      });
    }

    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (stateFilter !== 'all' && item.stateKey !== stateFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q) ||
          item.ruleOrCategory.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, kindFilter, stateFilter, search]);

  if (completedScans.length === 0) {
    return (
      <EmptyState
        icon={<FolderSearch className="w-7 h-7" />}
        title="No Evidence Archives Yet"
        description="Run a Playwright scan to capture chronological network requests, cookies, storage snapshots, and SHA-256-indexed HAR bundles."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Evidence Explorer</h1>
          <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
            Chronological browser telemetry trail connecting raw HAR/storage artifacts, classification rules, and generated findings.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <SelectField
            id="ev-scan"
            value={scanId}
            onChange={(e) => setScanId(Number(e.target.value))}
          >
            {completedScans.map((s) => (
              <option key={s.id} value={s.id}>
                Scan #{s.id} · {s.website_name || s.domain}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {/* Captured HAR & Snapshot Bundles */}
      {data && data.evidenceFiles.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold">Captured Evidence Bundles (SHA-256 Verified)</h2>
              <p className="text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                Download raw HAR network logs or Web Storage JSON dumps per isolated Chromium context.
              </p>
            </div>
            {onNavigate && (
              <SecondaryButton size="sm" onClick={() => onNavigate('findings')}>
                Inspect Findings &amp; Fix It
              </SecondaryButton>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.evidenceFiles.map((ef) => (
              <div
                key={ef.id}
                className="p-3.5 rounded-lg border border-[#1C2620]/12 dark:border-[#F3EEE4]/12 bg-[#EBE4D5]/40 dark:bg-[#202B25] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold truncate">
                    {ef.consent_state_key} · {ef.file_type.toUpperCase()}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono text-[#6B7268] dark:text-[#B3BDB3] truncate">
                    {formatBytes(ef.byte_size)} · {ef.sha256_hash.slice(0, 14)}...
                  </div>
                </div>
                <SecondaryButton
                  size="sm"
                  disabled={downloadingId === ef.id}
                  onClick={() => handleDownloadEvidence(ef)}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingId === ef.id ? '...' : 'Save'}</span>
                </SecondaryButton>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trail Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search URL, cookie, rule ID, or finding..."
          className="flex-1 min-w-[200px]"
        />

        <SelectField
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="w-40 h-9 text-xs"
        >
          <option value="all">All Evidence Types</option>
          <option value="consent">Consent Checks</option>
          <option value="request">Network Requests</option>
          <option value="cookie">Cookies</option>
          <option value="storage">Web Storage</option>
          <option value="finding">Findings</option>
        </SelectField>

        <SelectField
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="w-36 h-9 text-xs"
        >
          <option value="all">All Consent States</option>
          <option value="no_consent">No Consent</option>
          <option value="accept_all">Accept All</option>
          <option value="reject_all">Reject All</option>
        </SelectField>
      </Card>

      {/* Chronological Trail */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-center justify-between text-xs">
          <span className="font-semibold">Chronological Evidence Trail</span>
          <span className="font-mono tabular-nums text-[#6B7268] dark:text-[#B3BDB3]">
            {trail.length} evidence items
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            Reconstructing chronological evidence trail...
          </div>
        ) : trail.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            No evidence events match the active filters.
          </div>
        ) : (
          <div className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10 max-h-[620px] overflow-y-auto">
            {trail.slice(0, 200).map((item) => (
              <div key={item.id} className="px-5 py-3.5 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono uppercase text-[11px] font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                      {item.kind}
                    </span>
                    <span className="font-mono text-[11px] text-[#6B7268] dark:text-[#B3BDB3]">
                      {item.stateKey} · {item.phase}
                    </span>
                    {item.kind === 'consent' && (
                      <StatusText status={item.title.includes('inconclusive') ? 'inconclusive' : 'completed'} />
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-[#6B7268] dark:text-[#B3BDB3]">
                    {item.ruleOrCategory}
                    {item.timestamp ? ` · ${formatTimestamp(item.timestamp)}` : ''}
                  </span>
                </div>
                <div className="font-medium text-[#1C2620] dark:text-[#F3EEE4]">{item.title}</div>
                <div className="font-mono text-[11px] text-[#6B7268] dark:text-[#B3BDB3] break-all">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
