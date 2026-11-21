import React, { useState } from 'react';
import { CheckCircle2, FlaskConical, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiFetch, formatTimestamp } from '../lib/api.ts';
import type { User } from '../types.ts';
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  SegmentedTabs,
} from './ui.tsx';

interface SettingsViewProps {
  user: User;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onProvisionTestLab: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  theme,
  onToggleTheme,
  onProvisionTestLab,
}) => {
  const [ssrfTestUrl, setSsrfTestUrl] = useState('http://169.254.169.254/latest/meta-data/');
  const [ssrfResult, setSsrfResult] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [labMessage, setLabMessage] = useState<string | null>(null);

  const handleTestSsrf = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    try {
      const res = await apiFetch<{ valid: boolean; reason?: string }>('/api/websites/validate-url', {
        method: 'POST',
        body: JSON.stringify({ url: ssrfTestUrl, allowTestLab: false }),
      });
      setSsrfResult(res);
    } finally {
      setChecking(false);
    }
  };

  const handleProvision = async () => {
    setProvisioning(true);
    setLabMessage(null);
    try {
      await onProvisionTestLab();
      setLabMessage('Evaluation Lab targets (Scenarios A–F) are provisioned in Scan History & Sites.');
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Settings &amp; Security Controls
        </h1>
        <p className="mt-1 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
          Manage appearance preferences, inspect your engineering profile, test SSRF guardrails, and provision controlled evaluation targets.
        </p>
      </div>

      {/* Theme Appearance */}
      <Card className="p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Workspace Theme</h2>
          <p className="mt-0.5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
            Switch between warm editorial parchment Light mode and deep forest-slate Dark mode.
          </p>
        </div>
        <SegmentedTabs
          items={[
            { id: 'light', label: 'Light Theme' },
            { id: 'dark', label: 'Dark Theme' },
          ]}
          activeId={theme}
          onChange={(id) => {
            if (id !== theme) onToggleTheme();
          }}
        />
      </Card>

      {/* Account Details */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Account Profile</h2>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Engineer Name</dt>
            <dd className="mt-0.5 font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Work Email</dt>
            <dd className="mt-0.5 font-mono">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Organization</dt>
            <dd className="mt-0.5">{user.organization}</dd>
          </div>
          <div>
            <dt className="text-[#6B7268] dark:text-[#B3BDB3]">Account Created</dt>
            <dd className="mt-0.5 font-mono text-[#6B7268] dark:text-[#B3BDB3]">
              {formatTimestamp(user.created_at)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* SSRF Protection Verifier */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">SSRF &amp; Redirect Guard Verification</h2>
            <p className="mt-0.5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              All scan URLs and Playwright subresource requests are checked against RFC 1918 private networks, loopback interfaces, and cloud metadata IPs.
            </p>
          </div>
        </div>

        <form onSubmit={handleTestSsrf} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={ssrfTestUrl}
            onChange={(e) => setSsrfTestUrl(e.target.value)}
            className="flex-1 h-10 px-3.5 text-xs font-mono rounded-lg border border-[#1C2620]/18 dark:border-[#F3EEE4]/18 bg-[#FAF7F0] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4]"
            placeholder="http://127.0.0.1:8080/admin"
          />
          <SecondaryButton type="submit" disabled={checking} className="h-10">
            {checking ? 'Testing...' : 'Test Guard'}
          </SecondaryButton>
        </form>

        {ssrfResult && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
              !ssrfResult.valid
                ? 'bg-[#2F5D50]/10 dark:bg-[#8DAE9B]/12 border-[#2F5D50]/30 text-[#2F5D50] dark:text-[#8DAE9B]'
                : 'bg-[#EBE4D5]/50 dark:bg-[#202B25] border-[#1C2620]/15 text-[#1C2620] dark:text-[#F3EEE4]'
            }`}
          >
            {!ssrfResult.valid ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>
              {!ssrfResult.valid
                ? `Blocked as expected: ${ssrfResult.reason}`
                : 'Public target allowed for scanning.'}
            </span>
          </div>
        )}
      </Card>

      {/* Controlled Evaluation Test Lab */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-2.5">
          <FlaskConical className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Controlled Evaluation Lab (Scenarios A–F)</h2>
            <p className="mt-0.5 text-xs text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
              Provision the 6 controlled test websites (Zero Tracking, Pre-Consent Cookie, Post-Reject Tracker, Compliant Opt-In, Release Regression, and Legitimate Payment Gateway) to run live Playwright verification scans directly from the UI.
            </p>
          </div>
        </div>

        <PrimaryButton type="button" onClick={handleProvision} disabled={provisioning}>
          {provisioning ? 'Provisioning...' : 'Provision Scenarios A–F'}
        </PrimaryButton>

        {labMessage && (
          <div className="text-xs text-[#2F5D50] dark:text-[#8DAE9B] font-medium">{labMessage}</div>
        )}
      </Card>
    </div>
  );
};
