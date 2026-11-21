-- ClarityTrace PostgreSQL Production Schema (Cloud SQL / Alembic Reference)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  organization TEXT DEFAULT 'Security Engineering',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'engineer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS websites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  privacy_policy_url TEXT,
  authorized_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  scan_frequency TEXT NOT NULL DEFAULT 'manual',
  is_test_lab BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_websites_user ON websites(user_id);
CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites(domain);

CREATE TABLE IF NOT EXISTS scans (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  target_url TEXT NOT NULL,
  release_label TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  summary_json JSONB,
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scans_website ON scans(website_id);

CREATE TABLE IF NOT EXISTS consent_states (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  state_key TEXT NOT NULL CHECK(state_key IN ('no_consent', 'accept_all', 'reject_all')),
  status TEXT NOT NULL DEFAULT 'pending',
  banner_detected BOOLEAN NOT NULL DEFAULT FALSE,
  banner_strategy TEXT,
  banner_text_excerpt TEXT,
  reload_verified BOOLEAN NOT NULL DEFAULT FALSE,
  inconclusive_reason TEXT,
  requests_count INTEGER NOT NULL DEFAULT 0,
  cookies_count INTEGER NOT NULL DEFAULT 0,
  storage_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS network_requests (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  consent_state_id INTEGER NOT NULL REFERENCES consent_states(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  is_third_party BOOLEAN NOT NULL DEFAULT FALSE,
  initiator TEXT,
  headers_json JSONB,
  timestamp_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cookies (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  consent_state_id INTEGER NOT NULL REFERENCES consent_states(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  value_preview TEXT,
  expires_at TIMESTAMPTZ,
  http_only BOOLEAN NOT NULL DEFAULT FALSE,
  secure BOOLEAN NOT NULL DEFAULT FALSE,
  same_site TEXT,
  is_third_party BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_observations (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  consent_state_id INTEGER NOT NULL REFERENCES consent_states(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  storage_type TEXT NOT NULL,
  origin TEXT NOT NULL,
  key_name TEXT NOT NULL,
  value_preview TEXT,
  byte_length INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracker_classifications (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  consent_state_id INTEGER NOT NULL REFERENCES consent_states(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_ref_id INTEGER,
  target_identifier TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL,
  tracker_vendor TEXT,
  rule_id TEXT NOT NULL,
  confidence TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_policies (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
  source_url TEXT,
  raw_text_hash TEXT NOT NULL,
  raw_text_excerpt TEXT NOT NULL,
  extracted_json JSONB NOT NULL,
  consistency_summary TEXT NOT NULL,
  model_name TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_statements (
  id SERIAL PRIMARY KEY,
  privacy_policy_id INTEGER NOT NULL REFERENCES privacy_policies(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  statement_text TEXT NOT NULL,
  claimed_behavior TEXT NOT NULL,
  mentions_third_parties BOOLEAN NOT NULL DEFAULT FALSE,
  alignment_status TEXT NOT NULL DEFAULT 'not_evaluated',
  alignment_explanation TEXT,
  confidence TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS findings (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  consent_state_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence TEXT NOT NULL,
  affected_page TEXT NOT NULL,
  technical_explanation TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  comparison_summary TEXT,
  suggested_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS baselines (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL UNIQUE REFERENCES websites(id) ON DELETE CASCADE,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  set_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Primary Baseline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_comparisons (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  baseline_scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  current_scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  comparison_type TEXT NOT NULL,
  new_requests_count INTEGER NOT NULL DEFAULT 0,
  new_cookies_count INTEGER NOT NULL DEFAULT 0,
  new_trackers_count INTEGER NOT NULL DEFAULT 0,
  regressions_count INTEGER NOT NULL DEFAULT 0,
  diff_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  consent_state_key TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sha256_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
