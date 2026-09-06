-- Authentication hardening for the D1 adapter.
-- Reset tokens are stored only as hashes and are single-use.

ALTER TABLE pv_users ADD COLUMN email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS pv_password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_password_reset_tokens_user_idx
  ON pv_password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pv_password_reset_tokens_expiry_idx
  ON pv_password_reset_tokens(expires_at, used_at);
