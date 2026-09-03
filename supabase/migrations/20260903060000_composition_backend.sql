-- Durable composition and provider-delivery behavior.
-- These records are managed by the trusted Worker only. The browser never
-- receives provider credentials or the contents of a confidential message.

alter table public.messages
  add column if not exists compose_mode text not null default 'plain',
  add column if not exists schedule_timezone text not null default 'UTC',
  add column if not exists recurrence_rule text not null default 'none',
  add column if not exists recurrence_until timestamptz,
  add column if not exists recurrence_count integer,
  add column if not exists recurrence_sequence integer not null default 0,
  add column if not exists recurrence_parent_id uuid references public.messages(id) on delete set null,
  add column if not exists read_receipt_requested boolean not null default false,
  add column if not exists delivery_receipt_requested boolean not null default false,
  add column if not exists request_confirmation boolean not null default false,
  add column if not exists reply_tracking_enabled boolean not null default false,
  add column if not exists follow_up_tracking_enabled boolean not null default false,
  add column if not exists reply_received_at timestamptz,
  add column if not exists confidential_mode boolean not null default false;

alter table public.messages drop constraint if exists messages_compose_mode_check;
alter table public.messages add constraint messages_compose_mode_check
  check (compose_mode in ('plain', 'html', 'markdown'));
alter table public.messages drop constraint if exists messages_recurrence_rule_check;
alter table public.messages add constraint messages_recurrence_rule_check
  check (recurrence_rule in ('none', 'daily', 'weekly', 'monthly'));

create index if not exists messages_recurrence_idx
  on public.messages(owner_id, recurrence_parent_id, recurrence_sequence);
create index if not exists messages_reply_tracking_idx
  on public.messages(owner_id, thread_id, reply_tracking_enabled)
  where reply_tracking_enabled = true;

create table if not exists public.confidential_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  token_hash text not null unique,
  encryption_iv text not null,
  encrypted_payload text not null,
  password_hash text,
  password_salt text,
  password_hint text not null default '',
  expires_at timestamptz not null,
  max_views integer not null default 0 check (max_views >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists confidential_messages_expiry_idx
  on public.confidential_messages(expires_at, revoked_at);
create index if not exists confidential_messages_owner_idx
  on public.confidential_messages(owner_id, created_at desc);

alter table public.confidential_messages enable row level security;
revoke all on table public.confidential_messages from anon, authenticated;

create table if not exists public.message_receipt_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  kind text not null check (kind in ('delivery', 'read', 'confirmation', 'reply')),
  recipient text,
  provider text,
  provider_event_id text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(provider, provider_event_id, kind)
);
create index if not exists message_receipt_events_message_idx
  on public.message_receipt_events(message_id, occurred_at desc);
alter table public.message_receipt_events enable row level security;
revoke all on table public.message_receipt_events from anon, authenticated;

comment on table public.confidential_messages is
  'Worker-managed expiring message portals. Payloads are encrypted at rest with a Worker secret; this is not end-to-end encryption.';
comment on table public.message_receipt_events is
  'Normalized delivery, read, confirmation, and reply events from providers or inbound mail.';
