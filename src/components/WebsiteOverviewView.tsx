import React, { useState } from 'react';
import { Globe, Play, Plus, Trash2 } from 'lucide-react';
import { apiFetch, formatTimestamp } from '../lib/api.ts';
import type { PageView, Scan, Website } from '../types.ts';
import {
  Card,
  EmptyState,
  PrimaryButton,
  SearchField,
  SecondaryButton,
  StatusText,
} from './ui.tsx';

interface WebsiteOverviewViewProps {
  websites: Website[];
  scans: Scan[];
  onRefresh: () => Promise<void>;
  onStartScanForSite: (websiteId: number) => void;
  onSelectScan: (scanId: number) => void;
  onNavigate: (page: PageView) => void;
}

export const WebsiteOverviewView: React.FC<WebsiteOverviewViewProps> = ({
  websites,
  scans,
  onRefresh,
  onStartScanForSite,
  onSelectScan,
  onNavigate,
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState<number>(websites[0]?.id ?? 0);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const filteredSites = websites.filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) || w.url.toLowerCase().includes(q);
  });

  const activeSite =
    filteredSites.find((w) => w.id === selectedSiteId) || filteredSites[0] || websites[0];
  const siteScans = activeSite ? scans.filter((s) => s.website_id === activeSite.id) : [];

  const handleDelete = async (id: number) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/websites/${id}`, { method: 'DELETE' });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handlePinBaseline = async (scanId: number) => {
    setBusyId(scanId);
    try {
      await apiFetch(`/api/scans/${scanId}/baseline`, {
        method: 'POST',
        body: JSON.stringify({ label: `Baseline #${scanId}` }),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  if (websites.length === 0) {
    return (
      <EmptyState
        icon={<Globe className="w-7 h-7" />}
        title="No Monitoring History Yet"
        description="Run your first website check or register a website to view past checks and saved baselines."
        action={
          <>
            <PrimaryButton onClick={() => onNavigate('start_scan')}>Check My Website</PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('add_website')}>Add Website</SecondaryButton>
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Monitoring History
          </h1>
          <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
            Review monitored websites, saved baselines, and every privacy check run over time.
          </p>
        </div>
        <PrimaryButton onClick={() => onNavigate('add_website')}>
          <Plus className="w-3.5 h-3.5" />
          <span>Add Website</span>
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Monitored Website List */}
        <Card className="lg:col-span-5 overflow-hidden">
          <div className="p-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 space-y-3">
            <div className="text-xs font-semibold">Your Websites ({filteredSites.length})</div>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search by website name or address..."
            />
          </div>
          <ul className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10 max-h-[560px] overflow-y-auto">
            {filteredSites.map((w) => {
              const selected = activeSite?.id === w.id;
              return (
                <li
                  key={w.id}
                  onClick={() => setSelectedSiteId(w.id)}
                  className={`px-5 py-3.5 cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[#EBE4D5]/75 dark:bg-[#202B25]'
                      : 'hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{w.name}</div>
                      <div className="text-xs font-mono text-[#6B7268] dark:text-[#B3BDB3] truncate mt-0.5">
                        {w.url}
                      </div>
                    </div>
                    <SecondaryButton
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartScanForSite(w.id);
                      }}
                    >
                      <Play className="w-3 h-3" />
                      <span>Check</span>
                    </SecondaryButton>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[#6B7268] dark:text-[#B3BDB3] tabular-nums">
                    <span>{w.scan_count ?? 0} checks</span>
                    <span aria-hidden="true">·</span>
                    <span>{w.open_findings_count ?? 0} open items</span>
                    {w.is_test_lab === 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#2F5D50] dark:text-[#8DAE9B] font-medium">
                          Practice Lab
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Right: Active Website Detail & Scan History */}
        {activeSite && (
          <Card className="lg:col-span-7 overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{activeSite.name}</h2>
                <div className="mt-1 text-xs font-mono text-[#6B7268] dark:text-[#B3BDB3] truncate">
                  {activeSite.url}
                </div>
              </div>
              <SecondaryButton
                size="sm"
                disabled={busyId === activeSite.id}
                onClick={() => handleDelete(activeSite.id)}
                className="text-[#C4562F] dark:text-[#D47A59]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </SecondaryButton>
            </div>

            <div className="px-6 py-3 bg-[#EBE4D5]/55 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              <span>
                Saved Baseline:{' '}
                <strong className="font-mono text-[#1C2620] dark:text-[#F3EEE4]">
                  {activeSite.baseline_scan_id
                    ? `Check #${activeSite.baseline_scan_id}`
                    : 'Set automatically on first check'}
                </strong>
              </span>
              <span className="capitalize">Schedule: {activeSite.scan_frequency}</span>
            </div>

            {siteScans.length === 0 ? (
              <div className="p-8 text-center space-y-4">
                <p className="text-sm text-[#6B7268] dark:text-[#B3BDB3]">
                  No privacy checks run for this website yet.
                </p>
                <PrimaryButton onClick={() => onStartScanForSite(activeSite.id)}>
                  Run First Check
                </PrimaryButton>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#EBE4D5]/40 dark:bg-[#202B25]/70 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                      <th className="py-2.5 px-4">Check</th>
                      <th className="py-2.5 px-4">Release Note</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Issues</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                    {siteScans.map((s) => (
                      <tr key={s.id} className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/60">
                        <td
                          onClick={() => onSelectScan(s.id)}
                          className="py-2.5 px-4 font-mono tabular-nums text-[#2F5D50] dark:text-[#8DAE9B] font-semibold cursor-pointer"
                        >
                          #{s.id}
                          {s.is_baseline === 1 && (
                            <span className="ml-2 text-[#1C2620] dark:text-[#F3EEE4] font-sans">
                              · Baseline
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[#6B7268] dark:text-[#B3BDB3]">
                          {s.release_label || '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={s.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {s.findings_count ?? 0}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-3">
                          <button
                            type="button"
                            onClick={() => onSelectScan(s.id)}
                            className="text-[#2F5D50] dark:text-[#8DAE9B] hover:underline font-medium cursor-pointer"
                          >
                            View Results
                          </button>
                          {s.status === 'completed' && s.is_baseline !== 1 && (
                            <button
                              type="button"
                              disabled={busyId === s.id}
                              onClick={() => handlePinBaseline(s.id)}
                              className="text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
                            >
                              Set as Baseline
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-3 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              Added: {formatTimestamp(activeSite.created_at)}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
