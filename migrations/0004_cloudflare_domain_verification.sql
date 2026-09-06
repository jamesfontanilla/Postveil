-- Cloudflare OAuth verification state and user-owned domain proofs.
-- OAuth access tokens are short-lived and are deliberately never persisted.

CREATE TABLE IF NOT EXISTS pv_cloudflare_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_cloudflare_oauth_states_expiry_idx
  ON pv_cloudflare_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS pv_domain_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified',
  zone_id TEXT,
  account_id TEXT,
  dns_ready INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  last_checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS pv_domain_verifications_user_domain_idx
  ON pv_domain_verifications(user_id, domain);
