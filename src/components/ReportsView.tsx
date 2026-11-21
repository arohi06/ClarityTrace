import React, { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { apiFetch, formatTimestamp, getStoredToken } from '../lib/api.ts';
import { exportScanPdfReport } from '../lib/pdfExport.ts';
import type { ConsentStateRow, Finding, Scan } from '../types.ts';
import {
  Card,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  StatusText,
} from './ui.tsx';

interface ReportsViewProps {
  scans: Scan[];
  onSelectScan: (scanId: number) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ scans, onSelectScan }) => {
  const [exportingId, setExportingId] = useState<number | null>(null);

  const handleExportPdf = async (scanId: number) => {
    setExportingId(scanId);
    try {
      const data = await apiFetch<{
        scan: Scan;
        consentStates: ConsentStateRow[];
        findings: Finding[];
      }>(`/api/scans/${scanId}`);
      exportScanPdfReport(data);
    } finally {
      setExportingId(null);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Privacy Reports</h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Download clear PDF summaries to share with your team, or export full technical JSON evidence bundles.
        </p>
      </div>

      <Card className="p-4 text-xs text-[#6B7268] dark:text-[#B3BDB3] flex flex-wrap items-center justify-between gap-2">
        <span>
          Every report documents actual browser observations across Before Consent, Accept All, and Reject All.
        </span>
        <span className="text-[#1C2620] dark:text-[#F3EEE4] font-medium">
          Observed evidence only · Not legal certification
        </span>
      </Card>

      {scans.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-7 h-7" />}
          title="No Reports Available Yet"
          description="Once you complete a website check, downloadable PDF and JSON reports will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#EBE4D5]/60 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 text-[#6B7268] dark:text-[#B3BDB3]">
                  <th className="py-3 px-4">Check</th>
                  <th className="py-3 px-4">Website</th>
                  <th className="py-3 px-4">Note</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Observations</th>
                  <th className="py-3 px-4">Completed</th>
                  <th className="py-3 px-4 text-right">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-[#EBE4D5]/40 dark:hover:bg-[#202B25]/70">
                    <td
                      onClick={() => onSelectScan(s.id)}
                      className="py-3 px-4 font-mono font-semibold text-[#2F5D50] dark:text-[#8DAE9B] cursor-pointer tabular-nums"
                    >
                      #{s.id}
                      {s.is_baseline === 1 && (
                        <span className="ml-2 text-[#1C2620] dark:text-[#F3EEE4] font-sans">
                          · Baseline
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium">{s.website_name || s.domain}</td>
                    <td className="py-3 px-4 text-[#6B7268] dark:text-[#B3BDB3]">
                      {s.release_label || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {s.findings_count ?? 0}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#6B7268] dark:text-[#B3BDB3] whitespace-nowrap">
                      {formatTimestamp(s.completed_at || s.started_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      {s.status === 'completed' ? (
                        <>
                          <SecondaryButton size="sm" onClick={() => handleExportJson(s.id)}>
                            <Download className="w-3 h-3" />
                            <span>JSON</span>
                          </SecondaryButton>
                          <PrimaryButton
                            size="sm"
                            disabled={exportingId === s.id}
                            onClick={() => handleExportPdf(s.id)}
                          >
                            <Download className="w-3 h-3" />
                            <span>{exportingId === s.id ? 'Building...' : 'PDF Report'}</span>
                          </PrimaryButton>
                        </>
                      ) : (
                        <span className="text-[#6B7268] dark:text-[#B3BDB3]">Pending completion</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
