import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.resolve(process.env.CLARITYTRACE_DB_PATH || './data/claritytrace.db');
const dataDir = path.dirname(dbPath);
const evidenceDir = path.join(dataDir, 'evidence');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      organization TEXT DEFAULT 'Security Engineering',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'engineer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      privacy_policy_url TEXT,
      authorized_confirmed INTEGER NOT NULL DEFAULT 1,
      scan_frequency TEXT NOT NULL DEFAULT 'manual',
      is_test_lab INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_websites_user ON websites(user_id);
    CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites(domain);

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      target_url TEXT NOT NULL,
      release_label TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error_message TEXT,
      summary_json TEXT,
      is_baseline INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_scans_website ON scans(website_id);
    CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);

    CREATE TABLE IF NOT EXISTS consent_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      state_key TEXT NOT NULL CHECK(state_key IN ('no_consent', 'accept_all', 'reject_all')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'inconclusive', 'failed', 'skipped')),
      banner_detected INTEGER NOT NULL DEFAULT 0,
      banner_strategy TEXT,
      banner_text_excerpt TEXT,
      reload_verified INTEGER NOT NULL DEFAULT 0,
      inconclusive_reason TEXT,
      requests_count INTEGER NOT NULL DEFAULT 0,
      cookies_count INTEGER NOT NULL DEFAULT 0,
      storage_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_consent_states_scan ON consent_states(scan_id);

    CREATE TABLE IF NOT EXISTS network_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      consent_state_id INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('initial', 'post_action', 'post_reload')),
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER,
      is_third_party INTEGER NOT NULL DEFAULT 0,
      initiator TEXT,
      headers_json TEXT,
      timestamp_ms INTEGER NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (consent_state_id) REFERENCES consent_states(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_network_requests_scan ON network_requests(scan_id);
    CREATE INDEX IF NOT EXISTS idx_network_requests_state ON network_requests(consent_state_id);
    CREATE INDEX IF NOT EXISTS idx_network_requests_domain ON network_requests(domain);

    CREATE TABLE IF NOT EXISTS cookies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      consent_state_id INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('initial', 'post_action', 'post_reload')),
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '/',
      value_preview TEXT,
      expires_at TEXT,
      http_only INTEGER NOT NULL DEFAULT 0,
      secure INTEGER NOT NULL DEFAULT 0,
      same_site TEXT,
      is_third_party INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (consent_state_id) REFERENCES consent_states(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cookies_scan ON cookies(scan_id);
    CREATE INDEX IF NOT EXISTS idx_cookies_state ON cookies(consent_state_id);

    CREATE TABLE IF NOT EXISTS storage_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      consent_state_id INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('initial', 'post_action', 'post_reload')),
      storage_type TEXT NOT NULL CHECK(storage_type IN ('localStorage', 'sessionStorage')),
      origin TEXT NOT NULL,
      key_name TEXT NOT NULL,
      value_preview TEXT,
      byte_length INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (consent_state_id) REFERENCES consent_states(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_storage_scan ON storage_observations(scan_id);

    CREATE TABLE IF NOT EXISTS tracker_classifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      consent_state_id INTEGER NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('request', 'cookie', 'storage')),
      target_ref_id INTEGER,
      target_identifier TEXT NOT NULL,
      domain TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('analytics', 'advertising', 'fingerprinting', 'functional', 'payment', 'cdn', 'first_party', 'unknown')),
      tracker_vendor TEXT,
      rule_id TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
      reasoning TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (consent_state_id) REFERENCES consent_states(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_classifications_scan ON tracker_classifications(scan_id);
    CREATE INDEX IF NOT EXISTS idx_classifications_cat ON tracker_classifications(category);

    CREATE TABLE IF NOT EXISTS privacy_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      scan_id INTEGER,
      source_url TEXT,
      raw_text_hash TEXT NOT NULL,
      raw_text_excerpt TEXT NOT NULL,
      extracted_json TEXT NOT NULL,
      consistency_summary TEXT NOT NULL,
      model_name TEXT NOT NULL,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_policies_website ON privacy_policies(website_id);

    CREATE TABLE IF NOT EXISTS policy_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      privacy_policy_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('analytics', 'advertising', 'third_party_sharing', 'cookies', 'consent', 'retention')),
      statement_text TEXT NOT NULL,
      claimed_behavior TEXT NOT NULL,
      mentions_third_parties INTEGER NOT NULL DEFAULT 0,
      alignment_status TEXT NOT NULL DEFAULT 'not_evaluated' CHECK(alignment_status IN ('consistent', 'potential_inconsistency', 'unverified', 'not_evaluated')),
      alignment_explanation TEXT,
      confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (privacy_policy_id) REFERENCES privacy_policies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_policy_statements_policy ON policy_statements(privacy_policy_id);

    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      website_id INTEGER NOT NULL,
      consent_state_key TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
      confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
      affected_page TEXT NOT NULL,
      technical_explanation TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      comparison_summary TEXT,
      suggested_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
    CREATE INDEX IF NOT EXISTS idx_findings_website ON findings(website_id);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);

    CREATE TABLE IF NOT EXISTS baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL UNIQUE,
      scan_id INTEGER NOT NULL,
      set_by_user_id INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT 'Primary Baseline',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (set_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      baseline_scan_id INTEGER NOT NULL,
      current_scan_id INTEGER NOT NULL,
      comparison_type TEXT NOT NULL CHECK(comparison_type IN ('baseline_vs_current', 'cross_consent')),
      new_requests_count INTEGER NOT NULL DEFAULT 0,
      new_cookies_count INTEGER NOT NULL DEFAULT 0,
      new_trackers_count INTEGER NOT NULL DEFAULT 0,
      regressions_count INTEGER NOT NULL DEFAULT 0,
      diff_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
      FOREIGN KEY (baseline_scan_id) REFERENCES scans(id) ON DELETE CASCADE,
      FOREIGN KEY (current_scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comparisons_website ON scan_comparisons(website_id);

    CREATE TABLE IF NOT EXISTS evidence_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      consent_state_key TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK(file_type IN ('har', 'storage_snapshot', 'report_json')),
      file_path TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      sha256_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_scan ON evidence_files(scan_id);
  `);
}

export function registerEvidenceFile(
  scanId: number,
  consentStateKey: string,
  fileType: 'har' | 'storage_snapshot' | 'report_json',
  absolutePath: string
): number | null {
  if (!fs.existsSync(absolutePath)) return null;
  const buf = fs.readFileSync(absolutePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const relPath = path.relative(process.cwd(), absolutePath);

  const info = db
    .prepare(
      `INSERT INTO evidence_files (scan_id, consent_state_key, file_type, file_path, byte_size, sha256_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(scanId, consentStateKey, fileType, relPath, buf.byteLength, hash);

  return Number(info.lastInsertRowid);
}

export function getEvidenceDir(): string {
  return evidenceDir;
}
