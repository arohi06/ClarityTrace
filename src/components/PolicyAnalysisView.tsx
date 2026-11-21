import React, { useEffect, useState } from 'react';
import { FileSearch, Sparkles } from 'lucide-react';
import { apiFetch, formatTimestamp } from '../lib/api.ts';
import type { PrivacyPolicyRecord, Scan, Website } from '../types.ts';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  PrimaryButton,
  SelectField,
  StatusText,
  TextInput,
} from './ui.tsx';

interface PolicyAnalysisViewProps {
  websites: Website[];
  scans: Scan[];
}

function deriveInvestigationHint(alignmentStatus: string, category: string): string {
  if (alignmentStatus === 'potential_inconsistency') {
    return `Review ${category.replace(/_/g, ' ')} scripts and tag triggers in the Network Inspector to confirm whether consent gating matches the stated policy disclosure.`;
  }
  if (alignmentStatus === 'consistent') {
    return `Observed telemetry aligns with this ${category.replace(/_/g, ' ')} statement. Pin the current scan as a baseline to detect future regressions.`;
  }
  return `Policy language is broad or inconclusive for ${category.replace(/_/g, ' ')}. Cross-check cookies and third-party domains directly in the Evidence Explorer.`;
}

export const PolicyAnalysisView: React.FC<PolicyAnalysisViewProps> = ({ websites, scans }) => {
  const [websiteId, setWebsiteId] = useState<number>(websites[0]?.id ?? 0);
  const [scanId, setScanId] = useState<string>('');
  const [policyUrl, setPolicyUrl] = useState('');
  const [rawPolicyText, setRawPolicyText] = useState('');
  const [policies, setPolicies] = useState<PrivacyPolicyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ policies: PrivacyPolicyRecord[] }>('/api/policies');
      setPolicies(res.policies);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    if (!websiteId && websites.length > 0) {
      setWebsiteId(websites[0].id);
      return;
    }
    const site = websites.find((w) => w.id === websiteId);
    if (site?.privacy_policy_url && !policyUrl) {
      setPolicyUrl(site.privacy_policy_url);
    }
    const latestSiteScan = scans.find((s) => s.website_id === websiteId && s.status === 'completed');
    if (latestSiteScan) {
      setScanId(String(latestSiteScan.id));
    }
  }, [websiteId, websites, scans]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnalyzing(true);
    try {
      await apiFetch('/api/policies/analyze', {
        method: 'POST',
        body: JSON.stringify({
          websiteId,
          scanId: scanId ? Number(scanId) : null,
          policyUrl: policyUrl.trim() || null,
          rawPolicyText: rawPolicyText.trim() || null,
        }),
      });
      setRawPolicyText('');
      await loadPolicies();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gemini policy analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const siteScans = scans.filter((s) => s.website_id === websiteId && s.status === 'completed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Policy vs Reality</h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Gemini extracts structured privacy disclosures and compares them strictly against captured browser telemetry—never as a substitute for real scanning.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleAnalyze}>
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField
              id="pol-site"
              label="Website"
              value={websiteId}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setWebsiteId(nextId);
                const s = websites.find((w) => w.id === nextId);
                setPolicyUrl(s?.privacy_policy_url || '');
              }}
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="pol-scan"
              label="Observed Browser Telemetry Scan (Ground Truth)"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
            >
              <option value="">Extract policy statements only (no scan attached)</option>
              {siteScans.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  Scan #{s.id} · {s.release_label || s.started_at}
                </option>
              ))}
            </SelectField>
          </div>

          <TextInput
            id="pol-url"
            label="Privacy Policy URL (Fetches page safely via SSRF guard)"
            type="url"
            value={policyUrl}
            onChange={(e) => setPolicyUrl(e.target.value)}
            placeholder="https://example.com/privacy-policy"
            className="font-mono"
          />

          <div>
            <label
              htmlFor="pol-text"
              className="block text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-1.5"
            >
              Or Paste Privacy Policy Text Directly
            </label>
            <textarea
              id="pol-text"
              rows={4}
              value={rawPolicyText}
              onChange={(e) => setRawPolicyText(e.target.value)}
              placeholder="Paste relevant sections of the website's privacy or cookie policy..."
              className="w-full p-3 text-xs rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] placeholder:text-[#6B7268] dark:placeholder:text-[#B3BDB3]/70 focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B]"
            />
          </div>

          <div className="flex justify-end">
            <PrimaryButton type="submit" disabled={analyzing || websites.length === 0}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>{analyzing ? 'Analyzing with Gemini...' : 'Compare Policy vs Reality'}</span>
            </PrimaryButton>
          </div>
        </Card>
      </form>

      {loading ? (
        <LoadingSkeleton rows={2} />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={<FileSearch className="w-7 h-7" />}
          title="No Policy vs Reality Analyses Yet"
          description="Submit a privacy policy URL or paste policy text above to extract structured disclosures and cross-check them against observed browser telemetry."
        />
      ) : (
        <div className="space-y-6">
          {policies.map((pol) => (
            <Card key={pol.id} className="overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{pol.website_name || pol.domain}</h2>
                  <div className="text-xs text-[#6B7268] dark:text-[#B3BDB3] font-mono mt-0.5">
                    {pol.source_url || 'Pasted Policy Text'} · Model: {pol.model_name} ·{' '}
                    {formatTimestamp(pol.analyzed_at)}
                    {pol.scan_id ? ` · Grounded on Scan #${pol.scan_id}` : ''}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-[#EBE4D5]/55 dark:bg-[#202B25] border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
                <div className="text-xs font-mono uppercase tracking-wider font-semibold text-[#2F5D50] dark:text-[#8DAE9B]">
                  Consistency Summary
                </div>
                <p className="mt-1 text-sm leading-relaxed">{pol.consistency_summary}</p>
              </div>

              <div className="divide-y divide-[#1C2620]/10 dark:divide-[#F3EEE4]/10">
                {pol.statements.map((st) => (
                  <div key={st.id} className="p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider">
                        {st.category.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <StatusText status={st.alignment_status} />
                        <span className="font-mono text-[#6B7268] dark:text-[#B3BDB3]">
                          · {st.confidence} confidence
                        </span>
                      </div>
                    </div>

                    {/* 3-Section Comparison Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="p-3.5 rounded-lg bg-[#EBE4D5]/40 dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
                        <div className="font-mono uppercase text-[11px] font-semibold text-[#6B7268] dark:text-[#B3BDB3]">
                          1. What the policy says
                        </div>
                        <blockquote className="mt-1.5 italic text-[#6B7268] dark:text-[#B3BDB3]">
                          &ldquo;{st.statement_text}&rdquo;
                        </blockquote>
                        <p className="mt-2 font-medium">{st.claimed_behavior}</p>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#EBE4D5]/40 dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
                        <div className="font-mono uppercase text-[11px] font-semibold text-[#6B7268] dark:text-[#B3BDB3]">
                          2. What the browser observed
                        </div>
                        <p className="mt-1.5 leading-relaxed">
                          {st.alignment_explanation ||
                            (pol.scan_id
                              ? `Checked against Scan #${pol.scan_id} telemetry.`
                              : 'Attach a completed scan to ground this claim in live browser telemetry.')}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#EBE4D5]/40 dark:bg-[#202B25] border border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
                        <div className="font-mono uppercase text-[11px] font-semibold text-[#6B7268] dark:text-[#B3BDB3]">
                          3. What developers should investigate
                        </div>
                        <p className="mt-1.5 leading-relaxed">
                          {deriveInvestigationHint(st.alignment_status, st.category)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
