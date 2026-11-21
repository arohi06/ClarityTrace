import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Globe, SearchCheck, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { Scan, Website } from '../types.ts';
import {
  Card,
  ErrorBanner,
  PrimaryButton,
  SegmentedTabs,
  SelectField,
  TextInput,
} from './ui.tsx';

interface StartScanViewProps {
  websites: Website[];
  initialWebsiteId?: number | null;
  pendingUrl?: string | null;
  onClearPendingUrl?: () => void;
  onScanStarted: (scan: Scan) => void;
}

export const StartScanView: React.FC<StartScanViewProps> = ({
  websites,
  initialWebsiteId,
  pendingUrl,
  onClearPendingUrl,
  onScanStarted,
}) => {
  const [mode, setMode] = useState<'url' | 'saved'>(
    pendingUrl || !initialWebsiteId ? 'url' : 'saved'
  );
  const [directUrl, setDirectUrl] = useState(pendingUrl || '');
  const [websiteId, setWebsiteId] = useState<number>(
    initialWebsiteId || (websites[0]?.id ?? 0)
  );
  const [authorizedConfirmed, setAuthorizedConfirmed] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced Settings (hidden by default for primary users)
  const [scanName, setScanName] = useState('');
  const [viewportPreset, setViewportPreset] = useState<'desktop' | 'mobile'>('desktop');
  const [observationMs, setObservationMs] = useState<number>(1200);
  const [states, setStates] = useState<Record<'no_consent' | 'accept_all' | 'reject_all', boolean>>({
    no_consent: true,
    accept_all: true,
    reject_all: true,
  });
  const [verifyReload, setVerifyReload] = useState(true);
  const [runPolicyAnalysis, setRunPolicyAnalysis] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pendingUrl) {
      setMode('url');
      setDirectUrl(pendingUrl);
    } else if (initialWebsiteId && websites.some((w) => w.id === initialWebsiteId)) {
      setMode('saved');
      setWebsiteId(initialWebsiteId);
    }
  }, [pendingUrl, initialWebsiteId, websites]);

  const selectedSite = websites.find((w) => w.id === websiteId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!authorizedConfirmed) {
      setError('Please confirm that you own or have permission to check this website.');
      return;
    }

    const statesToTest = (
      Object.keys(states) as Array<'no_consent' | 'accept_all' | 'reject_all'>
    ).filter((k) => states[k]);

    if (statesToTest.length === 0) {
      setError('Please keep at least one consent state enabled in Advanced Settings.');
      return;
    }

    const viewportWidth = viewportPreset === 'desktop' ? 1440 : 390;
    const viewportHeight = viewportPreset === 'desktop' ? 900 : 844;

    setSubmitting(true);
    try {
      if (mode === 'url') {
        if (!directUrl.trim()) {
          setError('Please enter the website URL you want to check.');
          setSubmitting(false);
          return;
        }
        const res = await apiFetch<{ scan: Scan }>('/api/quick-scan', {
          method: 'POST',
          body: JSON.stringify({
            url: directUrl.trim(),
            scanName: scanName.trim() || undefined,
            statesToTest,
            verifyReload,
            viewportWidth,
            viewportHeight,
            observationMs,
          }),
        });
        onClearPendingUrl?.();
        onScanStarted(res.scan);
      } else {
        const res = await apiFetch<{ scan: Scan }>('/api/scans', {
          method: 'POST',
          body: JSON.stringify({
            websiteId,
            releaseLabel: scanName.trim() || undefined,
            statesToTest,
            verifyReload,
            runPolicyAnalysis,
            viewportWidth,
            viewportHeight,
            observationMs,
          }),
        });
        onScanStarted(res.scan);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to start the website check.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C2620] dark:text-[#F3EEE4]">
          Check Your Website
        </h1>
        <p className="mt-1.5 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
          Enter your website below. ClarityTrace automatically visits the page in three fresh private sessions to test what happens before consent, after clicking Accept All, and after clicking Reject All.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit}>
        <Card className="p-6 sm:p-7 space-y-6">
          {websites.length > 0 && (
            <SegmentedTabs
              items={[
                { id: 'url', label: 'Enter a Website URL' },
                { id: 'saved', label: 'Choose a Saved Website' },
              ]}
              activeId={mode}
              onChange={(id) => {
                setMode(id as 'url' | 'saved');
                setError(null);
              }}
            />
          )}

          {mode === 'url' ? (
            <div>
              <label
                htmlFor="scan-direct-url"
                className="block text-sm font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-2"
              >
                Website address
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-[#6B7268] dark:text-[#B3BDB3] absolute left-4 top-4 pointer-events-none" />
                <input
                  id="scan-direct-url"
                  type="text"
                  required
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full h-12 pl-11 pr-4 text-base rounded-xl border border-[#1C2620]/20 dark:border-[#F3EEE4]/20 bg-[#F3EEE4]/55 dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] placeholder:text-[#6B7268] dark:placeholder:text-[#B3BDB3]/70 focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B]"
                />
              </div>
              <p className="mt-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
                Checks public pages only. Private networks and internal servers are blocked automatically.
              </p>
            </div>
          ) : (
            <SelectField
              id="scan-site"
              label="Select a monitored website"
              value={websiteId}
              onChange={(e) => setWebsiteId(Number(e.target.value))}
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.url})
                </option>
              ))}
            </SelectField>
          )}

          {/* What gets checked automatically — reassuring plain summary */}
          <div className="rounded-xl bg-[#EBE4D5]/55 dark:bg-[#202B25] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="font-semibold text-[#1C2620] dark:text-[#F3EEE4]">1. Before Consent</div>
              <p className="mt-0.5 text-[#6B7268] dark:text-[#B3BDB3]">
                Checks if anything tracks visitors before they click the cookie banner.
              </p>
            </div>
            <div>
              <div className="font-semibold text-[#1C2620] dark:text-[#F3EEE4]">2. After Accept All</div>
              <p className="mt-0.5 text-[#6B7268] dark:text-[#B3BDB3]">
                Checks which analytics and ad services activate after opting in.
              </p>
            </div>
            <div>
              <div className="font-semibold text-[#1C2620] dark:text-[#F3EEE4]">3. After Reject All</div>
              <p className="mt-0.5 text-[#6B7268] dark:text-[#B3BDB3]">
                Checks that tracking stays turned off when visitors decline cookies.
              </p>
            </div>
          </div>

          {/* Authorization confirmation */}
          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            <input
              type="checkbox"
              checked={authorizedConfirmed}
              onChange={(e) => setAuthorizedConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2F5D50] shrink-0"
            />
            <span className="leading-relaxed">
              I confirm I own this website or have authorization to inspect its public pages.
            </span>
          </label>

          {/* Primary Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="inline-flex items-center gap-2 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              <ShieldCheck className="w-4 h-4 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0" />
              <span>Takes ~15–25 seconds using clean private sessions</span>
            </div>

            <PrimaryButton type="submit" size="lg" disabled={submitting} className="h-11 px-6">
              <SearchCheck className="w-4 h-4" />
              <span>{submitting ? 'Starting Privacy Check...' : 'Check My Website'}</span>
            </PrimaryButton>
          </div>

          {/* Optional Collapsible Advanced Settings */}
          <div className="pt-4 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
              className="inline-flex items-center gap-2 text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
            >
              {showAdvanced ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Advanced Settings (optional)</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5 pt-4 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <TextInput
                    id="scan-name"
                    label="Release Tag / Note"
                    type="text"
                    value={scanName}
                    onChange={(e) => setScanName(e.target.value)}
                    placeholder="e.g., May update"
                  />

                  <SelectField
                    id="scan-viewport"
                    label="Browser Device View"
                    value={viewportPreset}
                    onChange={(e) => setViewportPreset(e.target.value as 'desktop' | 'mobile')}
                  >
                    <option value="desktop">Desktop (1440×900)</option>
                    <option value="mobile">Mobile (390×844)</option>
                  </SelectField>

                  <SelectField
                    id="scan-duration"
                    label="Page Wait Duration"
                    value={observationMs}
                    onChange={(e) => setObservationMs(Number(e.target.value))}
                  >
                    <option value={1200}>Standard (1.2s settle)</option>
                    <option value={2500}>Extended (2.5s settle)</option>
                  </SelectField>
                </div>

                <div>
                  <div className="text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-2">
                    Consent States to Run
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(
                      [
                        { key: 'no_consent', label: 'Before Consent' },
                        { key: 'accept_all', label: 'Accept All' },
                        { key: 'reject_all', label: 'Reject All' },
                      ] as const
                    ).map((st) => (
                      <label
                        key={st.key}
                        className="flex items-center gap-2.5 p-3 rounded-lg border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#F3EEE4]/50 dark:bg-[#171F1B]/50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={states[st.key]}
                          onChange={(e) =>
                            setStates((prev) => ({ ...prev, [st.key]: e.target.checked }))
                          }
                          className="h-4 w-4 accent-[#2F5D50]"
                        />
                        <span className="font-medium">{st.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={verifyReload}
                      onChange={(e) => setVerifyReload(e.target.checked)}
                      className="h-4 w-4 accent-[#2F5D50]"
                    />
                    <span>Re-check after reloading the page to verify choices stick</span>
                  </label>

                  {mode === 'saved' && selectedSite?.privacy_policy_url && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={runPolicyAnalysis}
                        onChange={(e) => setRunPolicyAnalysis(e.target.checked)}
                        className="h-4 w-4 accent-[#2F5D50]"
                      />
                      <span>Also compare results against saved privacy policy with Gemini</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
};
