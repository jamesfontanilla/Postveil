-- D1-only persistence for Postveil.
-- Application tables are stored as JSON records so the Worker can preserve
-- the existing API surface while the storage layer migrates away from
-- Supabase. Tenant filtering remains enforced in the Worker before any
-- record is returned or changed.

CREATE TABLE IF NOT EXISTS pv_records (
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (table_name, record_id)
);

CREATE INDEX IF NOT EXISTS pv_records_table_created_idx
  ON pv_records(table_name, created_at DESC);

CREATE TABLE IF NOT EXISTS pv_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_sign_in_at TEXT,
  banned_until TEXT
);

CREATE INDEX IF NOT EXISTS pv_users_email_idx ON pv_users(email);

CREATE TABLE IF NOT EXISTS pv_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  aal TEXT NOT NULL DEFAULT 'aal1',
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS pv_sessions_user_idx ON pv_sessions(user_id);
CREATE INDEX IF NOT EXISTS pv_sessions_expiry_idx ON pv_sessions(expires_at);
