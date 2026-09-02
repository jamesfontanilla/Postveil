-- Parcel mailbox administration foundation.
-- All privileged mutations are performed by the trusted Worker with the
-- service role. The tables remain RLS-protected for defense in depth.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Parcel workspace',
  slug text not null unique,
  settings jsonb not null default '{"inactivity_days":90,"inactivity_action":"notify","require_mfa":false,"default_quota_bytes":5368709120,"default_sending_limit_daily":100}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  require_mfa boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members(user_id, status);

create table if not exists public.mailbox_admin_settings (
  mailbox_id uuid primary key references public.mailboxes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  quota_bytes bigint not null default 5368709120 check (quota_bytes >= 0),
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  sending_limit_daily integer not null default 100 check (sending_limit_daily >= 0),
  sending_used_today integer not null default 0 check (sending_used_today >= 0),
  sending_window_started_at date not null default current_date,
  inactivity_days integer not null default 90 check (inactivity_days >= 0),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailbox_admin_settings_org_status_idx
  on public.mailbox_admin_settings(organization_id, status);

create table if not exists public.mailbox_delegations (
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  can_read boolean not null default true,
  can_send_as boolean not null default false,
  can_send_on_behalf boolean not null default false,
  can_manage boolean not null default false,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mailbox_id, member_id)
);

create index if not exists mailbox_delegations_member_idx
  on public.mailbox_delegations(member_id, status);

create table if not exists public.organization_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text not null check (position('@' in address) > 1),
  description text not null default '',
  delivery_mode text not null default 'distribution' check (delivery_mode in ('distribution', 'group')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, address)
);

create index if not exists organization_groups_org_idx
  on public.organization_groups(organization_id, enabled, address);

create table if not exists public.organization_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.organization_groups(id) on delete cascade,
  member_email text not null check (position('@' in member_email) > 1),
  member_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_group_members_group_email_idx
  on public.organization_group_members(group_id, lower(member_email));
create index if not exists organization_group_members_user_idx
  on public.organization_group_members(member_user_id);

alter table public.messages add column if not exists sent_by uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists send_mode text not null default 'own' check (send_mode in ('own', 'send_as', 'send_on_behalf'));
create index if not exists messages_sent_by_idx on public.messages(sent_by, created_at desc);

create table if not exists public.account_security_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login', 'logout', 'password_reset', 'account_suspended', 'account_reactivated', 'session_revoked', 'passkey_added', 'passkey_removed', 'mfa_enabled', 'mfa_disabled', 'group_created', 'group_updated', 'group_deleted')),
  event_key text not null unique,
  session_id text,
  ip_hash text,
  user_agent text,
  is_suspicious boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_security_events_org_created_idx
  on public.account_security_events(organization_id, created_at desc);
create index if not exists account_security_events_subject_created_idx
  on public.account_security_events(subject_user_id, created_at desc);
create index if not exists account_security_events_suspicious_idx
  on public.account_security_events(organization_id, is_suspicious, created_at desc);

create table if not exists public.account_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_mfa_recovery_codes_owner_idx
  on public.account_mfa_recovery_codes(owner_id, used_at);

-- Backfill one private workspace for every existing account. The slug uses
-- the immutable user id so this remains rerunnable and collision-resistant.
insert into public.organizations (owner_id, name, slug)
select
  u.id,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'Parcel') || ' workspace',
  'workspace-' || replace(substr(u.id::text, 1, 18), '-', '')
from auth.users u
on conflict (owner_id) do nothing;

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, o.owner_id, 'owner', 'active'
from public.organizations o
on conflict (organization_id, user_id) do update
  set role = 'owner', status = 'active', updated_at = now();

insert into public.mailbox_admin_settings (mailbox_id, organization_id, inactivity_days, last_activity_at)
select m.id, o.id, coalesce((o.settings->>'inactivity_days')::integer, 90), m.created_at
from public.mailboxes m
join public.organizations o on o.owner_id = m.owner_id
on conflict (mailbox_id) do nothing;

-- New tables are not directly writable from the browser. The Worker uses the
-- service role and performs the organization/member checks before each action.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.mailbox_admin_settings enable row level security;
alter table public.mailbox_delegations enable row level security;
alter table public.organization_groups enable row level security;
alter table public.organization_group_members enable row level security;
alter table public.account_security_events enable row level security;
alter table public.account_mfa_recovery_codes enable row level security;

revoke all on table public.organizations, public.organization_members,
  public.mailbox_admin_settings, public.mailbox_delegations,
  public.organization_groups, public.organization_group_members,
  public.account_security_events, public.account_mfa_recovery_codes
  from anon, authenticated;

grant select on table public.organizations, public.organization_members,
  public.mailbox_delegations, public.account_security_events to authenticated;

drop policy if exists "organization members can view their organization" on public.organizations;
create policy "organization members can view their organization"
  on public.organizations for select to authenticated
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = id and om.user_id = (select auth.uid())
  ));

drop policy if exists "members can view their membership" on public.organization_members;
create policy "members can view their membership"
  on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "delegates can view their grants" on public.mailbox_delegations;
create policy "delegates can view their grants"
  on public.mailbox_delegations for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists "members can view their security events" on public.account_security_events;
create policy "members can view their security events"
  on public.account_security_events for select to authenticated
  using (subject_user_id = (select auth.uid()));

-- Prevent direct client reads of quota and recovery-code material.
comment on table public.mailbox_admin_settings is 'Worker-managed mailbox quotas and lifecycle state; never expose directly to clients.';
comment on table public.account_mfa_recovery_codes is 'Only salted hashes are stored; plaintext recovery codes are returned once by the trusted Worker.';
comment on table public.organization_groups is 'Organization-managed group addresses; membership is only exposed through the trusted Worker.';
comment on table public.organization_group_members is 'Distribution recipients for organization group addresses.';
