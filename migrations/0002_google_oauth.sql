-- Short-lived OAuth state and one-time browser handoffs for Google sign-in.
-- The raw values are never stored; only SHA-256 hashes are persisted.

CREATE TABLE IF NOT EXISTS pv_google_identities (
  google_sub TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_google_identities_user_idx ON pv_google_identities(user_id);

CREATE TABLE IF NOT EXISTS pv_oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_oauth_states_expiry_idx ON pv_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS pv_oauth_handoffs (
  code_hash TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_oauth_handoffs_expiry_idx ON pv_oauth_handoffs(expires_at);
