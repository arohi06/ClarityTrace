export type PageView =
  | 'dashboard'
  | 'add_website'
  | 'start_scan'
  | 'live_scan'
  | 'website_overview'
  | 'network_inspector'
  | 'cookie_storage'
  | 'comparison'
  | 'findings'
  | 'evidence_explorer'
  | 'policy_analysis'
  | 'reports'
  | 'settings';

export interface User {
  id: number;
  email: string;
  name: string;
  organization: string;
  role: string;
  created_at?: string;
}

export interface Website {
  id: number;
  user_id: number;
  name: string;
  url: string;
  domain: string;
  privacy_policy_url: string | null;
  authorized_confirmed: number;
  scan_frequency: string;
  is_test_lab: number;
  created_at: string;
  scan_count?: number;
  latest_scan_id?: number | null;
  latest_scan_status?: string | null;
  baseline_scan_id?: number | null;
  open_findings_count?: number;
}

export interface Scan {
  id: number;
  website_id: number;
  website_name?: string;
  domain?: string;
  website_url?: string;
  privacy_policy_url?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  trigger_type: string;
  target_url: string;
  release_label: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  summary_json: string | null;
  is_baseline: number;
  findings_count?: number;
}

export interface ConsentStateRow {
  id: number;
  scan_id: number;
  state_key: 'no_consent' | 'accept_all' | 'reject_all';
  status: string;
  banner_detected: number;
  banner_strategy: string | null;
  banner_text_excerpt: string | null;
  reload_verified: number;
  inconclusive_reason: string | null;
  requests_count: number;
  cookies_count: number;
  storage_count: number;
}

export interface NetworkRequestRow {
  id: number;
  state_key: string;
  phase: string;
  url: string;
  domain: string;
  resource_type: string;
  method: string;
  status_code: number | null;
  is_third_party: number;
  headers_json?: string;
  timestamp_ms?: number;
  category: string | null;
  tracker_vendor: string | null;
  rule_id: string | null;
  confidence: string | null;
  reasoning: string | null;
}

export interface CookieRow {
  id: number;
  state_key: string;
  phase: string;
  name: string;
  domain: string;
  path: string;
  value_preview: string | null;
  expires_at?: string | null;
  http_only: number;
  secure: number;
  same_site: string | null;
  is_third_party: number;
  category: string | null;
  tracker_vendor: string | null;
  rule_id: string | null;
  confidence: string | null;
  reasoning: string | null;
}

export interface StorageRow {
  id: number;
  state_key: string;
  phase: string;
  storage_type: string;
  origin: string;
  key_name: string;
  value_preview: string | null;
  byte_length: number;
  created_at?: string;
  category: string | null;
  tracker_vendor: string | null;
  rule_id: string | null;
  reasoning: string | null;
}

export interface Finding {
  id: number;
  scan_id: number;
  website_id: number;
  website_name?: string;
  domain?: string;
  scan_started_at?: string;
  release_label?: string | null;
  consent_state_key: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'high' | 'medium' | 'low';
  affected_page: string;
  technical_explanation: string;
  evidence_type: string;
  evidence_ref: string;
  comparison_summary: string | null;
  suggested_action: string;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: string;
}

export interface EvidenceFile {
  id: number;
  scan_id: number;
  consent_state_key: string;
  file_type: string;
  file_path: string;
  byte_size: number;
  sha256_hash: string;
  created_at: string;
}

export interface PolicyStatement {
  id: number;
  category: string;
  statement_text: string;
  claimed_behavior: string;
  mentions_third_parties: number;
  alignment_status: string;
  alignment_explanation: string | null;
  confidence: string;
}

export interface PrivacyPolicyRecord {
  id: number;
  website_id: number;
  scan_id: number | null;
  website_name?: string;
  domain?: string;
  source_url: string | null;
  consistency_summary: string;
  model_name: string;
  analyzed_at: string;
  statements: PolicyStatement[];
}

export interface ConsentStateFingerprint {
  stateKey: string;
  status: string;
  interactionOutcome: string;
  totalRequests: number;
  thirdPartyDomains: string[];
  trackerCategories: Record<string, number>;
  cookieNames: string[];
  storageKeys: string[];
  addedVsNoConsent: string[];
  removedVsNoConsent: string[];
}

export interface ConsentBehaviourFingerprint {
  version: string;
  scanId: number;
  sha256Hash: string;
  states: Record<string, ConsentStateFingerprint>;
}

export interface ComparisonDiff {
  baselineScanId: number | null;
  currentScanId: number;
  newRequestDomains: Array<{ domain: string; category: string; trackerVendor: string | null; sampleUrl: string }>;
  removedDomains: Array<{ domain: string; category: string; trackerVendor: string | null }>;
  newCookies: Array<{ name: string; domain: string; category: string; trackerVendor: string | null }>;
  removedCookies: Array<{ name: string; domain: string; category: string }>;
  newStorageKeys: Array<{ keyName: string; storageType: string; category: string }>;
  newTrackingDomains: string[];
  consentRegressions: Array<{
    title: string;
    domain: string;
    previousBehavior: string;
    currentBehavior: string;
    severity: 'critical' | 'high' | 'medium';
  }>;
  changedMetrics: Array<{
    observation: string;
    baselineValue: number;
    currentValue: number;
    difference: number;
  }>;
  crossConsentMatrix: Record<
    string,
    {
      status: string;
      totalRequests: number;
      trackerRequests: number;
      trackerCookies: number;
      trackerStorage: number;
      trackerDomains: string[];
    }
  >;
  consentFingerprint: ConsentBehaviourFingerprint;
}
