-- Require email verification for new password-based accounts.
-- Accounts created before this enforcement are treated as verified so an
-- existing deployment owner is not locked out during the migration.

UPDATE pv_users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS pv_email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_email_verification_tokens_user_idx
  ON pv_email_verification_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pv_email_verification_tokens_expiry_idx
  ON pv_email_verification_tokens(expires_at, used_at);
