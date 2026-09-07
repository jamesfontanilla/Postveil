-- D1-backed TOTP factors and short-lived, session-bound MFA challenges.
-- TOTP secrets are encrypted by the Worker before they are stored. The
-- encryption key must be supplied as the MFA_ENCRYPTION_KEY Worker secret.

CREATE TABLE IF NOT EXISTS pv_mfa_factors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  factor_type TEXT NOT NULL DEFAULT 'totp',
  friendly_name TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL,
  verified_at TEXT,
  last_used_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_mfa_factors_user_idx
  ON pv_mfa_factors(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS pv_mfa_challenges (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_mfa_challenges_session_idx
  ON pv_mfa_challenges(session_token_hash, expires_at, used_at);

CREATE INDEX IF NOT EXISTS pv_mfa_challenges_user_idx
  ON pv_mfa_challenges(user_id, created_at DESC);
