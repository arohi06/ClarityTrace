import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cookie,
  FileSearch,
  FileText,
  FolderSearch,
  GitCompare,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  SearchCheck,
  Settings,
  X,
} from 'lucide-react';
import type { PageView, User } from '../types.ts';
import { ClarityTraceLogo, PrimaryButton, SecondaryButton, ThemeToggle } from './ui.tsx';

interface LayoutProps {
  user: User;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  activePage: PageView;
  onNavigate: (page: PageView) => void;
  onLogout: () => void;
  onOpenLanding: () => void;
  breadcrumb: string[];
  children: React.ReactNode;
}

const PRIMARY_NAV: Array<{
  id: PageView;
  label: string;
  matchPages?: PageView[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  {
    id: 'start_scan',
    label: 'Check Website',
    matchPages: ['start_scan', 'live_scan'],
    icon: SearchCheck,
  },
  { id: 'findings', label: 'Results', icon: CheckCircle2 },
  {
    id: 'website_overview',
    label: 'Monitoring History',
    matchPages: ['website_overview', 'add_website'],
    icon: History,
  },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const ADVANCED_NAV: Array<{
  id: PageView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'network_inspector', label: 'Network Inspector', icon: Network },
  { id: 'cookie_storage', label: 'Cookies & Storage', icon: Cookie },
  { id: 'evidence_explorer', label: 'Evidence Explorer', icon: FolderSearch },
  { id: 'comparison', label: 'Baseline Comparison', icon: GitCompare },
  { id: 'policy_analysis', label: 'Policy Analysis', icon: FileSearch },
];

export const Layout: React.FC<LayoutProps> = ({
  user,
  theme,
  onToggleTheme,
  activePage,
  onNavigate,
  onLogout,
  onOpenLanding,
  breadcrumb,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdvancedActive = ADVANCED_NAV.some((item) => item.id === activePage);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(isAdvancedActive);

  const handleNav = (page: PageView) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const isNavItemActive = (item: (typeof PRIMARY_NAV)[number]) =>
    item.id === activePage || Boolean(item.matchPages?.includes(activePage));

  const renderNavContent = () => (
    <div className="space-y-5">
      <div className="space-y-1">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#2F5D50] text-[#FAF7F0] dark:bg-[#8DAE9B] dark:text-[#171F1B]'
                  : 'text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] hover:bg-[#EBE4D5]/70 dark:hover:bg-[#202B25]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Collapsible Advanced Inspection Section */}
      <div className="pt-3 border-t border-[#1C2620]/10 dark:border-[#F3EEE4]/10">
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={advancedOpen || isAdvancedActive}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] rounded-lg transition-colors cursor-pointer"
        >
          <span>Advanced Inspection</span>
          {advancedOpen || isAdvancedActive ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>

        {(advancedOpen || isAdvancedActive) && (
          <div className="mt-1 space-y-1">
            {ADVANCED_NAV.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#2F5D50] text-[#FAF7F0] dark:bg-[#8DAE9B] dark:text-[#171F1B]'
                      : 'text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] hover:bg-[#EBE4D5]/70 dark:hover:bg-[#202B25]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F3EEE4] dark:bg-[#171F1B] text-[#1C2620] dark:text-[#F3EEE4] transition-colors">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#FAF7F0] dark:bg-[#202B25] border-r border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
          <button
            type="button"
            onClick={onOpenLanding}
            className="inline-flex items-center gap-2.5 font-semibold text-base tracking-tight font-editorial cursor-pointer whitespace-nowrap"
          >
            <ClarityTraceLogo className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B]" />
            <span>ClarityTrace</span>
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Workspace navigation">
          {renderNavContent()}
        </nav>

        <div className="p-4 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 space-y-3">
          <button
            type="button"
            onClick={() => handleNav('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activePage === 'settings'
                ? 'bg-[#2F5D50] text-[#FAF7F0] dark:bg-[#8DAE9B] dark:text-[#171F1B]'
                : 'text-[#6B7268] dark:text-[#B3BDB3] hover:text-[#1C2620] dark:hover:text-[#F3EEE4] hover:bg-[#EBE4D5]/70 dark:hover:bg-[#26332C]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Settings &amp; Security</span>
          </button>

          <div className="px-1">
            <div className="text-xs font-medium truncate">{user.name}</div>
            <div className="text-xs text-[#6B7268] dark:text-[#B3BDB3] truncate mt-0.5">
              {user.email}
            </div>
          </div>

          <SecondaryButton size="sm" onClick={onLogout} className="w-full">
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </SecondaryButton>
        </div>
      </aside>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#171F1B]/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#FAF7F0] dark:bg-[#202B25] h-full flex flex-col border-r border-[#1C2620]/12 dark:border-[#F3EEE4]/12 z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12">
              <div className="flex items-center gap-2 font-editorial font-semibold">
                <ClarityTraceLogo className="w-5 h-5 text-[#2F5D50] dark:text-[#8DAE9B]" />
                <span>ClarityTrace</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 text-[#6B7268] dark:text-[#B3BDB3]"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 overflow-y-auto">
              {renderNavContent()}
            </nav>
            <div className="p-4 border-t border-[#1C2620]/12 dark:border-[#F3EEE4]/12 space-y-2.5">
              <button
                type="button"
                onClick={() => handleNav('settings')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-[#6B7268] dark:text-[#B3BDB3] hover:bg-[#EBE4D5]/70 dark:hover:bg-[#26332C] cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Settings &amp; Security</span>
              </button>
              <div className="flex items-center gap-2">
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <SecondaryButton size="sm" onClick={onLogout} className="flex-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </SecondaryButton>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-[#FAF7F0]/95 dark:bg-[#202B25]/95 backdrop-blur-md border-b border-[#1C2620]/12 dark:border-[#F3EEE4]/12 px-4 lg:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 text-[#6B7268] dark:text-[#B3BDB3]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav
              className="flex items-center gap-2 text-xs sm:text-sm text-[#6B7268] dark:text-[#B3BDB3] min-w-0"
              aria-label="Breadcrumb"
            >
              <Globe className="w-4 h-4 text-[#2F5D50] dark:text-[#8DAE9B] shrink-0 hidden sm:block" />
              <span className="font-medium text-[#1C2620] dark:text-[#F3EEE4] whitespace-nowrap">
                ClarityTrace
              </span>
              {breadcrumb.map((part, i) => (
                <React.Fragment key={i}>
                  <span aria-hidden="true">/</span>
                  <span
                    className={
                      i === breadcrumb.length - 1
                        ? 'text-[#1C2620] dark:text-[#F3EEE4] font-medium truncate'
                        : 'truncate hidden sm:inline'
                    }
                  >
                    {part}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="lg:hidden">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <PrimaryButton size="md" onClick={() => handleNav('start_scan')}>
              <SearchCheck className="w-3.5 h-3.5" />
              <span>Check My Website</span>
            </PrimaryButton>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
