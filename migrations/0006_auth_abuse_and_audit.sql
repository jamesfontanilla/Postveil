-- Account-level abuse controls for the D1 adapter.
-- The edge rate limiter protects request sources; these fields protect an
-- account when an attacker rotates source addresses.

ALTER TABLE pv_users ADD COLUMN failed_sign_in_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pv_users ADD COLUMN locked_until TEXT;
ALTER TABLE pv_users ADD COLUMN last_failed_sign_in_at TEXT;

CREATE TABLE IF NOT EXISTS pv_auth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_auth_events_email_idx
  ON pv_auth_events(email_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS pv_auth_events_user_idx
  ON pv_auth_events(user_id, created_at DESC);
