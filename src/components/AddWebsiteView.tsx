import React, { useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { Website } from '../types.ts';
import {
  Card,
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextInput,
} from './ui.tsx';

interface AddWebsiteViewProps {
  onAdded: (website: Website) => void;
  onCancel: () => void;
}

export const AddWebsiteView: React.FC<AddWebsiteViewProps> = ({ onAdded, onCancel }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [scanFrequency, setScanFrequency] = useState('manual');
  const [authorizedConfirmed, setAuthorizedConfirmed] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    reason?: string;
    resolvedIps?: string[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidateUrl = async () => {
    if (!url.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch<{ valid: boolean; reason?: string; resolvedIps?: string[] }>(
        '/api/websites/validate-url',
        {
          method: 'POST',
          body: JSON.stringify({ url: url.trim(), allowTestLab: false }),
        }
      );
      setValidationResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation check failed.');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!authorizedConfirmed) {
      setError('You must confirm authorization to scan the target website.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ website: Website }>('/api/websites', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          privacyPolicyUrl: privacyPolicyUrl.trim() || null,
          scanFrequency,
          authorizedConfirmed,
        }),
      });
      onAdded(res.website);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add website.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Add Monitored Website
        </h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Register an authorized public HTTPS/HTTP web application. Private, loopback, and cloud metadata addresses are blocked automatically by SSRF protection.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit}>
        <Card className="p-6 space-y-5">
          <TextInput
            id="site-name"
            label="Application Name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Marketing Storefront Production"
          />

          <div>
            <label
              htmlFor="site-url"
              className="block text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] mb-1.5"
            >
              Target Website URL
            </label>
            <div className="flex gap-2">
              <input
                id="site-url"
                type="url"
                required
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setValidationResult(null);
                }}
                placeholder="https://example.com"
                className="flex-1 h-10 px-3.5 text-sm font-mono rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B]"
              />
              <SecondaryButton
                type="button"
                onClick={handleValidateUrl}
                disabled={checking || !url.trim()}
                className="h-10"
              >
                {checking ? 'Checking DNS...' : 'Verify SSRF'}
              </SecondaryButton>
            </div>
            {validationResult && (
              <div
                className={`mt-2 text-xs flex items-center gap-1.5 ${
                  validationResult.valid
                    ? 'text-[#2F5D50] dark:text-[#8DAE9B]'
                    : 'text-[#C4562F] dark:text-[#D47A59]'
                }`}
              >
                {validationResult.valid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Public destination verified ({validationResult.resolvedIps?.join(', ')})
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationResult.reason}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <TextInput
            id="policy-url"
            label="Privacy Policy URL (Optional)"
            type="url"
            value={privacyPolicyUrl}
            onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
            placeholder="https://example.com/privacy"
            className="font-mono"
            hint="Used by Gemini to extract stated cookie/analytics disclosures and compare against observed telemetry."
          />

          <SelectField
            id="scan-freq"
            label="Monitoring Cadence"
            value={scanFrequency}
            onChange={(e) => setScanFrequency(e.target.value)}
          >
            <option value="manual">Manual / CI Release Trigger</option>
            <option value="daily">Daily Regression Schedule</option>
            <option value="weekly">Weekly Audit Schedule</option>
          </SelectField>

          <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={authorizedConfirmed}
              onChange={(e) => setAuthorizedConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2F5D50]"
            />
            <span className="text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
              I confirm that I own or have explicit authorization to run automated Playwright privacy scans against this target website, and I will not bypass authentication walls or access controls.
            </span>
          </label>

          <div className="pt-4 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 flex items-center justify-end gap-3">
            <SecondaryButton type="button" onClick={onCancel}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Adding Website...' : 'Save Website'}
            </PrimaryButton>
          </div>
        </Card>
      </form>
    </div>
  );
};
