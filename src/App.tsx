import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from './lib/api.ts';
import type { Finding, PageView, Scan, User, Website } from './types.ts';
import { LandingPage } from './components/LandingPage.tsx';
import { AuthView } from './components/AuthView.tsx';
import { Layout } from './components/Layout.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { AddWebsiteView } from './components/AddWebsiteView.tsx';
import { StartScanView } from './components/StartScanView.tsx';
import { LiveScanView } from './components/LiveScanView.tsx';
import { WebsiteOverviewView } from './components/WebsiteOverviewView.tsx';
import { NetworkInspectorView } from './components/NetworkInspectorView.tsx';
import { CookieStorageInspectorView } from './components/CookieStorageInspectorView.tsx';
import { ComparisonView } from './components/ComparisonView.tsx';
import { FindingsView } from './components/FindingsView.tsx';
import { EvidenceExplorerView } from './components/EvidenceExplorerView.tsx';
import { PolicyAnalysisView } from './components/PolicyAnalysisView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';

const THEME_STORAGE_KEY = 'claritytrace_theme';

const PAGE_TITLES: Record<PageView, string[]> = {
  dashboard: ['Overview'],
  add_website: ['Monitoring History', 'Add Website'],
  start_scan: ['Check Website'],
  live_scan: ['Check Website', 'Privacy Check Results'],
  website_overview: ['Monitoring History'],
  network_inspector: ['Advanced Inspection', 'Network Inspector'],
  cookie_storage: ['Advanced Inspection', 'Cookies & Storage'],
  comparison: ['Advanced Inspection', 'Baseline Comparison'],
  findings: ['Results'],
  evidence_explorer: ['Advanced Inspection', 'Evidence Explorer'],
  policy_analysis: ['Advanced Inspection', 'Policy Analysis'],
  reports: ['Reports'],
  settings: ['Settings & Security'],
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageView>('dashboard');

  const [stats, setStats] = useState({
    totalWebsites: 0,
    totalScans: 0,
    newFindings: 0,
    highSeverityFindings: 0,
  });
  const [websites, setWebsites] = useState<Website[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [selectedWebsiteId, setSelectedWebsiteId] = useState<number | null>(null);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage quota errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const refreshWorkspace = useCallback(async () => {
    setLoadingData(true);
    try {
      const [dashRes, sitesRes, scansRes, findingsRes] = await Promise.all([
        apiFetch<{
          stats: typeof stats;
          recentScans: Scan[];
          recentFindings: Finding[];
        }>('/api/dashboard'),
        apiFetch<{ websites: Website[] }>('/api/websites'),
        apiFetch<{ scans: Scan[] }>('/api/scans'),
        apiFetch<{ findings: Finding[] }>('/api/findings'),
      ]);
      setStats(dashRes.stats);
      setWebsites(sitesRes.websites);
      setScans(scansRes.scans);
      setFindings(findingsRes.findings);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        setShowLanding(false);
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    if (user) {
      refreshWorkspace().catch(() => {});
    }
  }, [user, refreshWorkspace]);

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setActivePage('dashboard');
    setShowLanding(true);
  };

  const handleProvisionTestLab = async () => {
    await apiFetch('/api/test-lab/provision', { method: 'POST' });
    await refreshWorkspace();
    setActivePage('website_overview');
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3EEE4] dark:bg-[#171F1B] text-sm text-[#6B7268] dark:text-[#B3BDB3]">
        Loading ClarityTrace...
      </div>
    );
  }

  if (showLanding) {
    return (
      <LandingPage
        theme={theme}
        onToggleTheme={toggleTheme}
        isAuthenticated={Boolean(user)}
        onStartWithUrl={(url) => {
          setPendingUrl(url);
          setActivePage('start_scan');
          setShowLanding(false);
        }}
        onSignIn={() => {
          setPendingUrl(null);
          setShowLanding(false);
        }}
        onExplorePlatform={() => {
          setShowLanding(false);
          if (user) {
            setActivePage('dashboard');
          }
        }}
      />
    );
  }

  if (!user) {
    return (
      <AuthView
        theme={theme}
        onToggleTheme={toggleTheme}
        pendingUrl={pendingUrl}
        onBackToLanding={() => setShowLanding(true)}
        onAuthenticated={(u) => {
          setUser(u);
          if (pendingUrl) {
            setActivePage('start_scan');
          } else {
            setActivePage('dashboard');
          }
        }}
      />
    );
  }

  return (
    <Layout
      user={user}
      theme={theme}
      onToggleTheme={toggleTheme}
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
      onOpenLanding={() => setShowLanding(true)}
      breadcrumb={PAGE_TITLES[activePage]}
    >
      {activePage === 'dashboard' && (
        <DashboardView
          stats={stats}
          recentScans={scans.slice(0, 10)}
          recentFindings={findings.slice(0, 6)}
          loading={loadingData}
          onNavigate={setActivePage}
          onSelectScan={(id) => {
            setActiveScanId(id);
            setActivePage('live_scan');
          }}
          onProvisionTestLab={handleProvisionTestLab}
        />
      )}

      {activePage === 'add_website' && (
        <AddWebsiteView
          onAdded={async (website) => {
            await refreshWorkspace();
            setSelectedWebsiteId(website.id);
            setActivePage('start_scan');
          }}
          onCancel={() => setActivePage('dashboard')}
        />
      )}

      {activePage === 'start_scan' && (
        <StartScanView
          websites={websites}
          initialWebsiteId={selectedWebsiteId}
          pendingUrl={pendingUrl}
          onClearPendingUrl={() => setPendingUrl(null)}
          onScanStarted={(scan) => {
            setActiveScanId(scan.id);
            refreshWorkspace().catch(() => {});
            setActivePage('live_scan');
          }}
        />
      )}

      {activePage === 'live_scan' && (
        <LiveScanView
          scanId={activeScanId}
          recentScans={scans}
          onSelectScan={(id) => setActiveScanId(id)}
          onNavigate={setActivePage}
          onRefreshData={() => {
            refreshWorkspace().catch(() => {});
          }}
        />
      )}

      {activePage === 'website_overview' && (
        <WebsiteOverviewView
          websites={websites}
          scans={scans}
          onRefresh={refreshWorkspace}
          onStartScanForSite={(siteId) => {
            setSelectedWebsiteId(siteId);
            setActivePage('start_scan');
          }}
          onSelectScan={(scanId) => {
            setActiveScanId(scanId);
            setActivePage('live_scan');
          }}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'network_inspector' && (
        <NetworkInspectorView scans={scans} initialScanId={activeScanId} />
      )}

      {activePage === 'cookie_storage' && (
        <CookieStorageInspectorView scans={scans} initialScanId={activeScanId} />
      )}

      {activePage === 'comparison' && (
        <ComparisonView
          scans={scans}
          initialScanId={activeScanId}
          onSelectScan={(scanId) => {
            setActiveScanId(scanId);
            setActivePage('live_scan');
          }}
        />
      )}

      {activePage === 'findings' && (
        <FindingsView
          findings={findings}
          websites={websites}
          onRefresh={refreshWorkspace}
          onInspectScan={(scanId) => {
            setActiveScanId(scanId);
            setActivePage('evidence_explorer');
          }}
          onRecheckSite={(siteId) => {
            setSelectedWebsiteId(siteId);
            setActivePage('start_scan');
          }}
        />
      )}

      {activePage === 'evidence_explorer' && (
        <EvidenceExplorerView
          scans={scans}
          initialScanId={activeScanId}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'policy_analysis' && (
        <PolicyAnalysisView websites={websites} scans={scans} />
      )}

      {activePage === 'reports' && (
        <ReportsView
          scans={scans}
          onSelectScan={(scanId) => {
            setActiveScanId(scanId);
            setActivePage('live_scan');
          }}
        />
      )}

      {activePage === 'settings' && (
        <SettingsView
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onProvisionTestLab={handleProvisionTestLab}
        />
      )}
    </Layout>
  );
}
