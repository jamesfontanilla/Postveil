-- Durable per-source throttling for the public password-recovery endpoint.
-- Store only a SHA-256 digest of Cloudflare's connecting IP.
create table if not exists public.account_recovery_ip_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  last_request_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_recovery_ip_rate_limits enable row level security;

revoke all on table public.account_recovery_ip_rate_limits from anon, authenticated;
revoke all on table public.account_recovery_rate_limits from anon, authenticated;
