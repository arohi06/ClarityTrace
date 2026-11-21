import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import { apiFetch, formatTimestamp } from '../lib/api.ts';
import type { NetworkRequestRow, Scan } from '../types.ts';
import {
  Card,
  EmptyState,
  SearchField,
  SecondaryButton,
  SelectField,
} from './ui.tsx';

interface NetworkInspectorViewProps {
  scans: Scan[];
  initialScanId?: number | null;
}

export const NetworkInspectorView: React.FC<NetworkInspectorViewProps> = ({
  scans,
  initialScanId,
}) => {
  const completedScans = scans.filter((s) => s.status === 'completed');
  const [scanId, setScanId] = useState<number>(
    initialScanId || (completedScans[0]?.id ?? 0)
  );
  const [requests, setRequests] = useState<NetworkRequestRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [partyFilter, setPartyFilter] = useState('all');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    apiFetch<{ requests: NetworkRequestRow[] }>(`/api/scans/${scanId}`)
      .then((res) => {
        setRequests(res.requests);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }, [scanId]);

  const filtered = useMemo(() => {
    const out = requests.filter((r) => {
      if (stateFilter !== 'all' && r.state_key !== stateFilter) return false;
      if (categoryFilter !== 'all' && (r.category || 'unknown') !== categoryFilter) return false;
      if (partyFilter === 'first' && r.is_third_party === 1) return false;
      if (partyFilter === 'third' && r.is_third_party === 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.url.toLowerCase().includes(q) ||
          r.domain.toLowerCase().includes(q) ||
          (r.tracker_vendor || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    out.sort((a, b) => {
      const cmp = (a.timestamp_ms || a.id) - (b.timestamp_ms || b.id);
      return sortAsc ? cmp : -cmp;
    });
    return out;
  }, [requests, stateFilter, categoryFilter, partyFilter, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (completedScans.length === 0) {
    return (
      <EmptyState
        icon={<Network className="w-7 h-7" />}
        title="No Network Captures Available"
        description="Complete a Playwright scan to inspect captured HTTP/HTTPS requests, response statuses, and third-party classifications."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Network Request Inspector
          </h1>
          <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
            Filter and inspect every observed browser network request across consent states.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <SelectField
            id="net-scan"
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

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search URL, domain, or vendor..."
          className="flex-1 min-w-[200px]"
        />

        <SelectField
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setPage(1);
          }}
          className="w-36 h-9 text-xs"
        >
          <option value="all">All States</option>
          <option value="no_consent">No Consent</option>
          <option value="accept_all">Accept All</option>
          <option value="reject_all">Reject All</option>
        </SelectField>

        <SelectField
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="w-36 h-9 text-xs"
        >
          <option value="all">All Categories</option>
          <option value="analytics">Analytics</option>
          <option value="advertising">Advertising</option>
          <option value="payment">Payment</option>
          <option value="functional">Functional</option>
          <option value="cdn">CDN</option>
          <option value="first_party">First-Party</option>
          <option value="unknown">Unknown</option>
        </SelectField>

        <SelectField
          value={partyFilter}
          onChange={(e) => {
            setPartyFilter(e.target.value);
            setPage(1);
          }}
          className="w-36 h-9 text-xs"
        >
          <option value="all">First &amp; Third Party</option>
          <option value="third">Third-Party Only</option>
          <option value="first">First-Party Only</option>
        </SelectField>

        <SecondaryButton size="sm" onClick={() => setSortAsc((p) => !p)}>
          Time {sortAsc ? '↑' : '↓'}
        </SecondaryButton>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            Loading captured requests...
          </div>
        ) : paged.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            No requests match the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#EBE4D5]/60 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                  <th className="py-2.5 px-3 w-8" />
                  <th className="py-2.5 px-3">Domain</th>
                  <th className="py-2.5 px-3">Request URL</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Party</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                {paged.map((r) => {
                  const expanded = expandedId === r.id;
                  const isTrk = r.category === 'analytics' || r.category === 'advertising' || r.category === 'fingerprinting';
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70 cursor-pointer"
                      >
                        <td className="py-2.5 px-3 text-[#6B7268]">
                          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium whitespace-nowrap">{r.domain}</td>
                        <td className="py-2.5 px-3 font-mono max-w-[260px] truncate" title={r.url}>
                          {r.url}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{r.method}</td>
                        <td className="py-2.5 px-3">{r.resource_type}</td>
                        <td className="py-2.5 px-3 font-mono tabular-nums">{r.status_code ?? '—'}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {r.is_third_party === 1 ? 'Third-party' : 'First-party'}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                            isTrk
                              ? 'text-[#C4562F] dark:text-[#D47A59]'
                              : r.category === 'payment'
                              ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
                              : ''
                          }`}
                        >
                          {r.category || 'unknown'}
                        </td>
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">{r.state_key}</td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#EBE4D5]/35 dark:bg-[#171F1B]/60">
                          <td colSpan={9} className="p-4 text-xs space-y-2">
                            <div className="font-mono break-all">
                              <span className="font-semibold">Full URL:</span> {r.url}
                            </div>
                            <div className="flex flex-wrap gap-4 text-[#6B7268] dark:text-[#B3BDB3]">
                              <span>Rule: <strong className="font-mono text-[#1C2620] dark:text-[#F3EEE4]">{r.rule_id}</strong></span>
                              <span>Vendor: <strong>{r.tracker_vendor || 'Unattributed'}</strong></span>
                              <span>Phase: <strong className="font-mono">{r.phase}</strong></span>
                              {r.timestamp_ms && (
                                <span>Observed: <strong className="font-mono">{formatTimestamp(new Date(r.timestamp_ms).toISOString())}</strong></span>
                              )}
                            </div>
                            <p className="text-[#1C2620] dark:text-[#F3EEE4]">{r.reasoning}</p>
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

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-center justify-between text-xs text-[#6B7268] dark:text-[#B3BDB3]">
          <span className="font-mono tabular-nums">
            Showing {paged.length} of {filtered.length} requests (Page {page} of {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <SecondaryButton size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </SecondaryButton>
            <SecondaryButton size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </SecondaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
};
