import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, GitCompare, ShieldCheck } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api.ts';
import type { User } from '../types.ts';
import {
  Card,
  ClarityTraceLogo,
  ErrorBanner,
  PrimaryButton,
  SegmentedTabs,
  TextInput,
  ThemeToggle,
} from './ui.tsx';

interface AuthViewProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onAuthenticated: (user: User) => void;
  onBackToLanding: () => void;
  pendingUrl?: string | null;
}

export const AuthView: React.FC<AuthViewProps> = ({
  theme,
  onToggleTheme,
  onAuthenticated,
  onBackToLanding,
  pendingUrl,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { name, organization: organization || 'Personal Workspace', email, password };

      const res = await apiFetch<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3EEE4] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] flex flex-col">
      <header className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ClarityTrace</span>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="flex-1 flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 rounded-xl bg-[#202B25] dark:bg-[#26332C] text-[#F3EEE4] p-8 lg:p-10 border border-[#F3EEE4]/12 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <ClarityTraceLogo className="w-6 h-6 text-[#8DAE9B]" />
                <span className="text-lg font-semibold font-editorial">ClarityTrace</span>
              </div>

              <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance leading-tight">
                See whether your website honors visitor cookie choices.
              </h1>
              <p className="mt-4 text-sm text-[#B3BDB3] leading-relaxed">
                Create a free workspace to check your website, save scan history, and receive plain-English reports backed by real browser evidence.
              </p>

              {pendingUrl && (
                <div className="mt-5 p-3.5 rounded-lg bg-[#171F1B] border border-[#8DAE9B]/30 text-xs">
                  <div className="text-[#8DAE9B] font-medium">Website ready to check:</div>
                  <div className="mt-1 font-mono text-[#F3EEE4] truncate">{pendingUrl}</div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-[#F3EEE4]/12 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#8DAE9B] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Tests all three consent states automatically</div>
                  <div className="text-xs text-[#B3BDB3] mt-0.5">
                    Before consent, after Accept All, and after Reject All in clean browser sessions.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <GitCompare className="w-4 h-4 text-[#8DAE9B] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Spots changes after site updates</div>
                  <div className="text-xs text-[#B3BDB3] mt-0.5">
                    Compare today&apos;s behavior with previous checks so surprises never slip through.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[#8DAE9B] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Built with safe scanning guardrails</div>
                  <div className="text-xs text-[#B3BDB3] mt-0.5">
                    Only scans public web addresses with clear evidence for every observation.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="lg:col-span-6 p-8 lg:p-10 flex flex-col justify-center">
            <SegmentedTabs
              items={[
                { id: 'register', label: 'Create Account' },
                { id: 'login', label: 'Sign In' },
              ]}
              activeId={mode}
              onChange={(id) => {
                setMode(id as 'login' | 'register');
                setError(null);
              }}
            />

            <h2 className="mt-6 text-xl font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
              {mode === 'login' ? 'Welcome back' : 'Start checking your website'}
            </h2>
            <p className="mt-1 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              {mode === 'login'
                ? 'Sign in to view your privacy checks, history, and downloadable reports.'
                : 'Your scans and saved reports stay private to your workspace.'}
            </p>

            {error && (
              <div className="mt-4">
                <ErrorBanner message={error} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <>
                  <TextInput
                    id="auth-name"
                    label="Your Name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                  />
                  <TextInput
                    id="auth-org"
                    label="Company or Website Name (Optional)"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Acme Studio"
                  />
                </>
              )}

              <TextInput
                id="auth-email"
                label="Email Address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />

              <TextInput
                id="auth-password"
                label="Password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
              />

              <PrimaryButton type="submit" size="lg" disabled={submitting} className="w-full mt-2">
                {submitting
                  ? 'Signing in...'
                  : mode === 'login'
                  ? 'Sign In'
                  : pendingUrl
                  ? 'Continue to Check Website'
                  : 'Create Workspace'}
              </PrimaryButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};
