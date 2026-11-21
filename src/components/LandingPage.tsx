import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import {
  Card,
  ClarityTraceLogo,
  PrimaryButton,
  SecondaryButton,
  ThemeToggle,
} from './ui.tsx';

interface LandingPageProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onStartWithUrl: (url: string) => void;
  onSignIn: () => void;
  onExplorePlatform: () => void;
  isAuthenticated: boolean;
}

const EXAMPLE_TARGETS = ['wikipedia.org', 'theguardian.com', 'duckduckgo.com'];

export const LandingPage: React.FC<LandingPageProps> = ({
  theme,
  onToggleTheme,
  onStartWithUrl,
  onSignIn,
  onExplorePlatform,
  isAuthenticated,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setInputError('Enter your website address or choose one of the example sites below.');
      return;
    }
    setInputError(null);
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    onStartWithUrl(normalized);
  };

  return (
    <div className="min-h-screen bg-[#F3EEE4] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] transition-colors">
      {/* Top Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-40 h-16 bg-[#F3EEE4]/92 dark:bg-[#171F1B]/92 backdrop-blur-md border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-[#1C2620] dark:text-[#F3EEE4] whitespace-nowrap shrink-0 font-editorial"
          >
            <ClarityTraceLogo className="w-6 h-6 text-[#2F5D50] dark:text-[#8DAE9B]" />
            <span>ClarityTrace</span>
          </a>

          <nav
            className="hidden md:flex items-center gap-7 text-sm text-[#6B7268] dark:text-[#B3BDB3]"
            aria-label="Landing navigation"
          >
            <a
              href="#how-it-works"
              className="hover:text-[#1C2620] dark:hover:text-[#F3EEE4] transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </a>
            <a
              href="#what-we-check"
              className="hover:text-[#1C2620] dark:hover:text-[#F3EEE4] transition-colors whitespace-nowrap shrink-0"
            >
              What we check
            </a>
            <a
              href="#for-teams"
              className="hover:text-[#1C2620] dark:hover:text-[#F3EEE4] transition-colors whitespace-nowrap shrink-0"
            >
              For teams
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onSignIn}
              className="hidden sm:inline-flex text-xs font-medium text-[#1C2620] dark:text-[#F3EEE4] hover:text-[#2F5D50] dark:hover:text-[#8DAE9B] px-2.5 py-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </button>
            <PrimaryButton size="md" onClick={onExplorePlatform}>
              <span>{isAuthenticated ? 'Open Overview' : 'Check My Website'}</span>
            </PrimaryButton>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero — 5-Second Clarity + 30-Second First Check */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-20 lg:pb-24">
          <div className="max-w-3xl">
            <p className="text-xs font-medium tracking-wide text-[#2F5D50] dark:text-[#8DAE9B]">
              Website Cookie &amp; Tracking Monitor
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight leading-[1.08] text-balance text-[#1C2620] dark:text-[#F3EEE4]">
              Check what your website tracks before—and after—visitors click.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed max-w-2xl">
              ClarityTrace opens your website in real private browser sessions, clicks Accept All and Reject All automatically, and explains in plain English whether tracking respects your visitors&apos; choices.
            </p>

            {/* Primary URL Form */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setInputError(null);
                  }}
                  placeholder="Enter your website (e.g. yourcompany.com)"
                  aria-label="Website URL to check"
                  className="flex-1 h-12 px-4 text-sm rounded-xl border border-[#1C2620]/20 dark:border-[#F3EEE4]/20 bg-[#FAF7F0] dark:bg-[#26332C] text-[#1C2620] dark:text-[#F3EEE4] placeholder:text-[#6B7268] dark:placeholder:text-[#B3BDB3]/70 focus:outline-none focus:ring-2 focus:ring-[#2F5D50] dark:focus:ring-[#8DAE9B]"
                />
                <PrimaryButton type="submit" size="lg" className="h-12 px-6">
                  <span>Check My Website</span>
                  <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
                <SecondaryButton type="button" size="lg" className="h-12" onClick={onExplorePlatform}>
                  {isAuthenticated ? 'Go to Overview' : 'Sign in'}
                </SecondaryButton>
              </div>
              {inputError && (
                <div className="text-xs text-[#C4562F] dark:text-[#D47A59] font-medium">
                  {inputError}
                </div>
              )}
            </form>

            {/* Example Website Shortcuts */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#6B7268] dark:text-[#B3BDB3]">Try an example site:</span>
              {EXAMPLE_TARGETS.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => {
                    setUrlInput(`https://${domain}`);
                    setInputError(null);
                  }}
                  className="px-2.5 py-1 rounded-md text-xs border border-[#1C2620]/15 dark:border-[#F3EEE4]/15 bg-[#FAF7F0] dark:bg-[#26332C] hover:border-[#2F5D50] dark:hover:border-[#8DAE9B] transition-colors cursor-pointer"
                >
                  {domain}
                </button>
              ))}
            </div>

            <p className="mt-5 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
              No code installation needed · Uses real browser evidence · Technical observations only, not legal advice
            </p>
          </div>
        </section>

        {/* Step-by-Step How It Works */}
        <section
          id="how-it-works"
          className="bg-[#EBE4D5]/65 dark:bg-[#202B25] border-y border-[#1C2620]/12 dark:border-[#F3EEE4]/12 py-16 lg:py-20"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B]">
                Three simple steps
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#1C2620] dark:text-[#F3EEE4]">
                Privacy clarity in under a minute.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6">
                <div className="text-xs font-mono text-[#C4562F] dark:text-[#D47A59] font-semibold">
                  01. Enter your website
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  Paste your public URL
                </h3>
                <p className="mt-2 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  No browser extensions or script snippets required. Just enter the page you want to check.
                </p>
              </Card>

              <Card className="p-6">
                <div className="text-xs font-mono text-[#C4562F] dark:text-[#D47A59] font-semibold">
                  02. Automatic privacy check
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  Three real visitor journeys
                </h3>
                <p className="mt-2 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  We automatically test your page before consent, after clicking Accept All, and after clicking Reject All.
                </p>
              </Card>

              <Card className="p-6">
                <div className="text-xs font-mono text-[#C4562F] dark:text-[#D47A59] font-semibold">
                  03. Clear answers &amp; next steps
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#1C2620] dark:text-[#F3EEE4]">
                  Plain-English results
                </h3>
                <p className="mt-2 text-sm text-[#6B7268] dark:text-[#B3BDB3] leading-relaxed">
                  See exactly what ran, whether anything changed since your last check, and what to share with your developer.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* What We Check */}
        <section id="what-we-check" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-[#2F5D50] dark:text-[#8DAE9B]">
              What ClarityTrace checks
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#1C2620] dark:text-[#F3EEE4]">
              Built for website owners. Ready for developers.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B]" />
                <h3 className="text-lg font-semibold">For Founders &amp; Product Owners</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
                <li>Know immediately if analytics or ads fire before a visitor accepts cookies.</li>
                <li>Confirm clicking Reject All actually keeps tracking paused—even after reloading.</li>
                <li>Get plain-English explanations of what happened and what to ask your developer.</li>
                <li>Download clean PDF summary reports to share with your team or stakeholders.</li>
              </ul>
            </Card>

            <Card id="for-teams" className="p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B]" />
                <h3 className="text-lg font-semibold">For Engineers, QA &amp; Privacy Teams</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-[#6B7268] dark:text-[#B3BDB3]">
                <li>Inspect raw network requests, cookies, and browser storage inside Advanced Inspection.</li>
                <li>Pin a baseline scan and catch accidental tracking regressions on new releases.</li>
                <li>Compare stated privacy policies against observed behavior with grounded AI summaries.</li>
                <li>Export full HAR archives and JSON evidence bundles backed by deterministic rules.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-[#EBE4D5]/65 dark:bg-[#202B25] border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 py-16 lg:py-20 text-center px-4">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance text-[#1C2620] dark:text-[#F3EEE4]">
            Don&apos;t guess what your cookie banner does. Check it.
          </h2>
          <p className="mt-3 text-sm text-[#6B7268] dark:text-[#B3BDB3] max-w-xl mx-auto">
            Run an automated privacy check in seconds and see real browser behavior in plain English.
          </p>
          <div className="mt-7 flex justify-center">
            <PrimaryButton size="lg" onClick={onExplorePlatform}>
              <FileText className="w-4 h-4" />
              <span>Check My Website</span>
            </PrimaryButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B7268] dark:text-[#B3BDB3]">
          <div className="flex items-center gap-2">
            <ClarityTraceLogo className="w-4 h-4 text-[#2F5D50] dark:text-[#8DAE9B]" />
            <span>ClarityTrace · Real Browser Privacy Monitoring</span>
          </div>
          <div>Evidence-backed technical observations · Not legal certification</div>
        </div>
      </footer>
    </div>
  );
};
