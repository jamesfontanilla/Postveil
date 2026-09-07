-- Customer-domain provisioning state.
-- OAuth access tokens are short-lived and are never persisted. This table only
-- records the result of the provider handoff and the public DNS state.

CREATE TABLE IF NOT EXISTS pv_domain_integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  zone_id TEXT,
  account_id TEXT,
  ownership_status TEXT NOT NULL DEFAULT 'pending',
  dns_status TEXT NOT NULL DEFAULT 'pending',
  inbound_route_status TEXT NOT NULL DEFAULT 'pending',
  route_id TEXT,
  route_target TEXT,
  ownership_token TEXT,
  ownership_record_name TEXT,
  records_json TEXT NOT NULL DEFAULT '[]',
  last_error TEXT,
  last_checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS pv_domain_integrations_user_domain_idx
  ON pv_domain_integrations(user_id, domain);

CREATE INDEX IF NOT EXISTS pv_domain_integrations_domain_idx
  ON pv_domain_integrations(domain);
