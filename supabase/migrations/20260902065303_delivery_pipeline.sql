-- Provider-agnostic delivery, inbound event safety, inspection metadata, and reputation controls.
-- Provider credentials remain in Worker secrets; this database stores routing metadata only.

alter table public.messages
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_event_id text,
  add column if not exists delivery_status text not null default 'received',
  add column if not exists delivery_error_code text,
  add column if not exists delivery_error text,
  add column if not exists next_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delayed_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists delayed_count integer not null default 0,
  add column if not exists message_size_bytes bigint not null default 0,
  add column if not exists max_size_bytes bigint not null default 10485760,
  add column if not exists open_tracking_enabled boolean not null default false,
  add column if not exists click_tracking_enabled boolean not null default false,
  add column if not exists raw_headers jsonb not null default '[]'::jsonb,
  add column if not exists mime_parts jsonb not null default '[]'::jsonb,
  add column if not exists duplicate_of_message_id uuid references public.messages(id) on delete set null,
  add column if not exists thread_fingerprint text,
  add column if not exists inbound_event_id text;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('draft', 'queued', 'scheduled', 'sent', 'delivered', 'failed', 'received', 'bounced', 'delayed', 'complained', 'suppressed'));
alter table public.messages drop constraint if exists messages_delivery_status_check;
alter table public.messages add constraint messages_delivery_status_check check (delivery_status in ('received', 'queued', 'sending', 'accepted', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed'));

create index if not exists messages_delivery_queue_idx on public.messages(status, next_delivery_at, send_lease_until);
create index if not exists messages_provider_message_idx on public.messages(provider, provider_message_id);
create index if not exists messages_thread_fingerprint_idx on public.messages(owner_id, thread_fingerprint);
create unique index if not exists messages_inbound_event_idx on public.messages(inbound_event_id) where inbound_event_id is not null;

alter table public.mail_events
  add column if not exists event_id text,
  add column if not exists event_hash text,
  add column if not exists occurred_at timestamptz,
  add column if not exists raw_event_type text,
  add column if not exists replayed boolean not null default false;
create unique index if not exists mail_events_provider_event_hash_idx on public.mail_events(provider, event_hash) where event_hash is not null;
create index if not exists mail_events_provider_occurred_idx on public.mail_events(provider, occurred_at desc);

create table if not exists public.email_provider_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('brevo', 'ses', 'mailgun', 'postmark', 'sendgrid', 'smtp')),
  enabled boolean not null default true,
  priority integer not null default 100 check (priority >= 0 and priority <= 10000),
  config jsonb not null default '{}'::jsonb,
  daily_limit integer not null default 0 check (daily_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, provider)
);

create table if not exists public.delivery_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'retrying', 'dead', 'suppressed')),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_provider text,
  last_error_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_queue_claim_idx on public.delivery_queue(status, available_at, locked_until);

create table if not exists public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('started', 'accepted', 'delivered', 'deferred', 'failed', 'bounced', 'complained', 'suppressed')),
  request_id text,
  provider_message_id text,
  response_status integer,
  error_code text,
  error_message text,
  retryable boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  next_attempt_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(message_id, attempt_number)
);
create index if not exists delivery_attempts_message_idx on public.delivery_attempts(message_id, attempt_number desc);
create index if not exists delivery_attempts_owner_idx on public.delivery_attempts(owner_id, started_at desc);

create table if not exists public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  kind text not null check (kind in ('bounce', 'complaint', 'unsubscribe', 'manual', 'invalid')),
  reason text not null default '',
  provider text,
  source_event_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, email, kind)
);
create index if not exists suppression_entries_lookup_idx on public.suppression_entries(organization_id, email, active);

create table if not exists public.inbound_webhook_nonces (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  nonce text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(provider, nonce)
);
create index if not exists inbound_webhook_nonces_expiry_idx on public.inbound_webhook_nonces(expires_at);

create table if not exists public.provider_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('brevo', 'ses', 'mailgun', 'postmark', 'sendgrid', 'smtp')),
  status text not null default 'unknown' check (status in ('unknown', 'healthy', 'degraded', 'failed', 'circuit_open')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_latency_ms integer,
  consecutive_failures integer not null default 0,
  circuit_open_until timestamptz,
  sent_24h integer not null default 0,
  delivered_24h integer not null default 0,
  bounced_24h integer not null default 0,
  complained_24h integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(organization_id, provider)
);

create table if not exists public.domain_reputation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  sent_count bigint not null default 0,
  delivered_count bigint not null default 0,
  bounced_count bigint not null default 0,
  complaint_count bigint not null default 0,
  score numeric(5,4) not null default 1 check (score >= 0 and score <= 1),
  status text not null default 'healthy' check (status in ('healthy', 'watch', 'restricted', 'suspended')),
  suspended_until timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id, domain)
);

alter table public.domain_reputation
  add column if not exists daily_limit bigint not null default 0,
  add column if not exists sent_window_started_at date not null default current_date,
  add column if not exists sent_used_today bigint not null default 0;

create table if not exists public.abuse_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('warning', 'rate_limited', 'suspended', 'restored')),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.email_provider_configs enable row level security;
alter table public.delivery_queue enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.inbound_webhook_nonces enable row level security;
alter table public.provider_health enable row level security;
alter table public.domain_reputation enable row level security;
alter table public.abuse_actions enable row level security;

revoke all on table public.email_provider_configs, public.delivery_queue, public.delivery_attempts, public.suppression_entries, public.inbound_webhook_nonces, public.provider_health, public.domain_reputation, public.abuse_actions from anon, authenticated;
grant select on table public.email_provider_configs, public.delivery_attempts, public.suppression_entries, public.provider_health, public.domain_reputation, public.abuse_actions to authenticated;

drop policy if exists "provider configs organization members" on public.email_provider_configs;
create policy "provider configs organization members" on public.email_provider_configs for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = email_provider_configs.organization_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "delivery attempts organization members" on public.delivery_attempts;
create policy "delivery attempts organization members" on public.delivery_attempts for select to authenticated
  using (exists (select 1 from public.organization_members m where m.user_id = delivery_attempts.owner_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "suppression organization members" on public.suppression_entries;
create policy "suppression organization members" on public.suppression_entries for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = suppression_entries.organization_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "provider health organization members" on public.provider_health;
create policy "provider health organization members" on public.provider_health for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = provider_health.organization_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "domain reputation organization members" on public.domain_reputation;
create policy "domain reputation organization members" on public.domain_reputation for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = domain_reputation.organization_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "abuse actions organization members" on public.abuse_actions;
create policy "abuse actions organization members" on public.abuse_actions for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = abuse_actions.organization_id and m.user_id = (select auth.uid()) and m.status = 'active'));

comment on table public.delivery_queue is 'Server-managed durable outbox; clients never write this table.';
comment on table public.inbound_webhook_nonces is 'Short-lived provider event replay protection; payloads are never stored here.';
comment on table public.email_provider_configs is 'Routing preferences only; provider credentials remain in Worker secrets.';
