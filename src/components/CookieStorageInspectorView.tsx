import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Cookie, Database, Minus } from 'lucide-react';
import { apiFetch, formatBytes } from '../lib/api.ts';
import type { CookieRow, Scan, StorageRow } from '../types.ts';
import {
  Card,
  EmptyState,
  SearchField,
  SegmentedTabs,
  SelectField,
} from './ui.tsx';

interface CookieStorageInspectorViewProps {
  scans: Scan[];
  initialScanId?: number | null;
}

export const CookieStorageInspectorView: React.FC<CookieStorageInspectorViewProps> = ({
  scans,
  initialScanId,
}) => {
  const completedScans = scans.filter((s) => s.status === 'completed');
  const [scanId, setScanId] = useState<number>(
    initialScanId || (completedScans[0]?.id ?? 0)
  );
  const [activeTab, setActiveTab] = useState<'cookies' | 'storage'>('cookies');
  const [cookies, setCookies] = useState<CookieRow[]>([]);
  const [storage, setStorage] = useState<StorageRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [storageTypeFilter, setStorageTypeFilter] = useState('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialScanId && completedScans.some((s) => s.id === initialScanId)) {
      setScanId(initialScanId);
    }
  }, [initialScanId]);

  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    apiFetch<{ cookies: CookieRow[]; storage: StorageRow[] }>(`/api/scans/${scanId}`)
      .then((res) => {
        setCookies(res.cookies);
        setStorage(res.storage);
      })
      .finally(() => setLoading(false));
  }, [scanId]);

  // Build deduplicated 3-state presence matrix for cookies
  const cookieMatrix = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        domain: string;
        path: string;
        category: string;
        trackerVendor: string | null;
        httpOnly: boolean;
        secure: boolean;
        sameSite: string | null;
        isThirdParty: boolean;
        valuePreview: string | null;
        expiresAt: string | null;
        ruleId: string | null;
        reasoning: string | null;
        states: Record<'no_consent' | 'accept_all' | 'reject_all', boolean>;
      }
    >();

    for (const c of cookies) {
      const k = `${c.name}::${c.domain}`;
      const existing = map.get(k);
      if (!existing) {
        map.set(k, {
          key: k,
          name: c.name,
          domain: c.domain,
          path: c.path,
          category: c.category || 'unknown',
          trackerVendor: c.tracker_vendor,
          httpOnly: c.http_only === 1,
          secure: c.secure === 1,
          sameSite: c.same_site,
          isThirdParty: c.is_third_party === 1,
          valuePreview: c.value_preview,
          expiresAt: c.expires_at ?? null,
          ruleId: c.rule_id,
          reasoning: c.reasoning,
          states: {
            no_consent: c.state_key === 'no_consent',
            accept_all: c.state_key === 'accept_all',
            reject_all: c.state_key === 'reject_all',
          },
        });
      } else {
        if (c.state_key === 'no_consent') existing.states.no_consent = true;
        if (c.state_key === 'accept_all') existing.states.accept_all = true;
        if (c.state_key === 'reject_all') existing.states.reject_all = true;
      }
    }

    return Array.from(map.values()).filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (stateFilter !== 'all') {
        if (stateFilter === 'no_consent' && !row.states.no_consent) return false;
        if (stateFilter === 'accept_all' && !row.states.accept_all) return false;
        if (stateFilter === 'reject_all' && !row.states.reject_all) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          row.name.toLowerCase().includes(q) ||
          row.domain.toLowerCase().includes(q) ||
          (row.trackerVendor || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cookies, categoryFilter, stateFilter, search]);

  const filteredStorage = useMemo(() => {
    return storage.filter((s) => {
      if (stateFilter !== 'all' && s.state_key !== stateFilter) return false;
      if (categoryFilter !== 'all' && (s.category || 'unknown') !== categoryFilter) return false;
      if (storageTypeFilter !== 'all' && s.storage_type !== storageTypeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.key_name.toLowerCase().includes(q) ||
          s.origin.toLowerCase().includes(q) ||
          (s.value_preview || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [storage, stateFilter, categoryFilter, storageTypeFilter, search]);

  if (completedScans.length === 0) {
    return (
      <EmptyState
        icon={<Cookie className="w-7 h-7" />}
        title="No Cookie or Storage Snapshots Yet"
        description="Complete a Playwright scan to inspect browser cookies, security flags, and localStorage/sessionStorage across consent states."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Cookie &amp; Storage Inspector
          </h1>
          <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
            Inspect cookie presence across No Consent, Accept All, and Reject All contexts alongside Web Storage snapshots.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <SelectField
            id="ck-scan"
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

      {/* Tabs + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <SegmentedTabs
          items={[
            { id: 'cookies', label: `COOKIES (${cookieMatrix.length})` },
            { id: 'storage', label: `LOCAL AND SESSION STORAGE (${filteredStorage.length})` },
          ]}
          activeId={activeTab}
          onChange={(id) => {
            setActiveTab(id as 'cookies' | 'storage');
            setExpandedKey(null);
          }}
        />
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={
            activeTab === 'cookies'
              ? 'Search cookie name, domain, or vendor...'
              : 'Search storage key, origin, or value...'
          }
          className="flex-1 min-w-[200px]"
        />

        <SelectField
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="w-40 h-9 text-xs"
        >
          <option value="all">All Consent States</option>
          <option value="no_consent">No Consent</option>
          <option value="accept_all">Accept All</option>
          <option value="reject_all">Reject All</option>
        </SelectField>

        <SelectField
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-36 h-9 text-xs"
        >
          <option value="all">All Categories</option>
          <option value="analytics">Analytics</option>
          <option value="advertising">Advertising</option>
          <option value="functional">Functional</option>
          <option value="essential">Essential</option>
          <option value="unknown">Unknown</option>
        </SelectField>

        {activeTab === 'storage' && (
          <SelectField
            value={storageTypeFilter}
            onChange={(e) => setStorageTypeFilter(e.target.value)}
            className="w-40 h-9 text-xs"
          >
            <option value="all">All Storage Types</option>
            <option value="localStorage">localStorage</option>
            <option value="sessionStorage">sessionStorage</option>
          </SelectField>
        )}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            Loading cookie and storage telemetry...
          </div>
        ) : activeTab === 'cookies' ? (
          cookieMatrix.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              No cookies observed matching the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EBE4D5]/60 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                    <th className="py-2.5 px-3 w-8" />
                    <th className="py-2.5 px-3">Cookie Name</th>
                    <th className="py-2.5 px-3">Domain</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Security Flags</th>
                    <th className="py-2.5 px-3 text-center">No Consent</th>
                    <th className="py-2.5 px-3 text-center">Accept All</th>
                    <th className="py-2.5 px-3 text-center">Reject All</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                  {cookieMatrix.map((c) => {
                    const expanded = expandedKey === c.key;
                    const isTrk = c.category === 'analytics' || c.category === 'advertising';
                    return (
                      <React.Fragment key={c.key}>
                        <tr
                          onClick={() => setExpandedKey(expanded ? null : c.key)}
                          className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70 cursor-pointer"
                        >
                          <td className="py-2.5 px-3 text-[#6B7268]">
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                            {c.name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#6B7268] dark:text-[#B3BDB3] whitespace-nowrap">
                            {c.domain}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                              isTrk
                                ? 'text-[#C4562F] dark:text-[#D47A59]'
                                : c.category === 'functional' || c.category === 'essential'
                                ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
                                : ''
                            }`}
                          >
                            {c.category}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap text-[#6B7268] dark:text-[#B3BDB3]">
                            {c.httpOnly ? 'HttpOnly ' : ''}
                            {c.secure ? 'Secure ' : ''}
                            {c.sameSite || 'Lax'}
                          </td>
                          {(['no_consent', 'accept_all', 'reject_all'] as const).map((stKey) => {
                            const present = c.states[stKey];
                            const warn = present && isTrk && (stKey === 'no_consent' || stKey === 'reject_all');
                            return (
                              <td key={stKey} className="py-2.5 px-3 text-center">
                                {present ? (
                                  <span
                                    className={`inline-flex items-center justify-center font-mono text-[11px] font-semibold ${
                                      warn
                                        ? 'text-[#C4562F] dark:text-[#D47A59]'
                                        : 'text-[#2F5D50] dark:text-[#8DAE9B]'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5 mr-0.5" />
                                    Set
                                  </span>
                                ) : (
                                  <Minus className="w-3.5 h-3.5 mx-auto text-[#6B7268]/40 dark:text-[#B3BDB3]/40" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        {expanded && (
                          <tr className="bg-[#EBE4D5]/35 dark:bg-[#171F1B]/60">
                            <td colSpan={8} className="p-4 text-xs space-y-2">
                              <div className="flex flex-wrap gap-5 text-[#6B7268] dark:text-[#B3BDB3]">
                                <span>
                                  Path: <strong className="font-mono text-[#1C2620] dark:text-[#F3EEE4]">{c.path}</strong>
                                </span>
                                <span>
                                  Vendor: <strong>{c.trackerVendor || 'Unattributed'}</strong>
                                </span>
                                <span>
                                  Rule: <strong className="font-mono text-[#1C2620] dark:text-[#F3EEE4]">{c.ruleId || 'N/A'}</strong>
                                </span>
                                <span>
                                  Party: <strong>{c.isThirdParty ? 'Third-party' : 'First-party'}</strong>
                                </span>
                                {c.expiresAt && (
                                  <span>
                                    Expires: <strong className="font-mono">{c.expiresAt}</strong>
                                  </span>
                                )}
                              </div>
                              {c.valuePreview && (
                                <div className="font-mono text-[11px] bg-[#FAF7F0] dark:bg-[#26332C] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10 rounded p-2 break-all">
                                  Value preview: {c.valuePreview}
                                </div>
                              )}
                              {c.reasoning && <p>{c.reasoning}</p>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredStorage.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            <Database className="w-6 h-6 mx-auto mb-2 opacity-50" />
            No localStorage or sessionStorage keys matched the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#EBE4D5]/60 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                  <th className="py-2.5 px-3 w-8" />
                  <th className="py-2.5 px-3">Storage Key</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Origin</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Consent State</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                {filteredStorage.map((s) => {
                  const rowKey = `st-${s.id}`;
                  const expanded = expandedKey === rowKey;
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedKey(expanded ? null : rowKey)}
                        className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70 cursor-pointer"
                      >
                        <td className="py-2.5 px-3 text-[#6B7268]">
                          {expanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold">{s.key_name}</td>
                        <td className="py-2.5 px-3 font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                          {s.storage_type}
                        </td>
                        <td className="py-2.5 px-3 font-mono max-w-[200px] truncate">{s.origin}</td>
                        <td className="py-2.5 px-3 font-medium">{s.category || 'unknown'}</td>
                        <td className="py-2.5 px-3 font-mono">{s.state_key}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatBytes(s.byte_length)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#EBE4D5]/35 dark:bg-[#171F1B]/60">
                          <td colSpan={7} className="p-4 text-xs space-y-2">
                            <div className="flex flex-wrap gap-4 text-[#6B7268] dark:text-[#B3BDB3]">
                              <span>
                                Rule: <strong className="font-mono text-[#1C2620] dark:text-[#F3EEE4]">{s.rule_id || 'N/A'}</strong>
                              </span>
                              <span>
                                Vendor: <strong>{s.tracker_vendor || 'Unattributed'}</strong>
                              </span>
                              <span>
                                Phase: <strong className="font-mono">{s.phase}</strong>
                              </span>
                            </div>
                            {s.value_preview && (
                              <div className="font-mono text-[11px] bg-[#FAF7F0] dark:bg-[#26332C] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10 rounded p-2 break-all">
                                {s.value_preview}
                              </div>
                            )}
                            {s.reasoning && <p>{s.reasoning}</p>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
