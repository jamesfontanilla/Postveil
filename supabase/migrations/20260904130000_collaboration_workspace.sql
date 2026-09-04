-- Team collaboration foundation for shared inbox workflows.
-- Records are written by the trusted Worker after mailbox/delegation checks.
-- RLS remains enabled and direct browser grants stay revoked.

alter table public.thread_comments add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.thread_comments add column if not exists kind text not null default 'comment';
alter table public.thread_comments add column if not exists visibility text not null default 'team';
alter table public.thread_comments add column if not exists mentioned_user_ids uuid[] not null default '{}';
alter table public.thread_comments add column if not exists deleted_at timestamptz;
alter table public.thread_comments drop constraint if exists thread_comments_kind_check;
alter table public.thread_comments add constraint thread_comments_kind_check check (kind in ('comment', 'note'));
alter table public.thread_comments drop constraint if exists thread_comments_visibility_check;
alter table public.thread_comments add constraint thread_comments_visibility_check check (visibility in ('team', 'private'));
update public.thread_comments c
set organization_id = o.id
from public.organizations o
where c.organization_id is null and o.owner_id = c.owner_id;

alter table public.thread_assignments add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.thread_assignments add column if not exists assigned_by uuid references auth.users(id) on delete set null;
update public.thread_assignments a
set organization_id = o.id
from public.organizations o
where a.organization_id is null and o.owner_id = a.owner_id;

create table if not exists public.collaboration_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete cascade,
  status text not null default 'open' check (status in ('new', 'open', 'pending', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  sla_due_at timestamptz,
  sla_breached_at timestamptz,
  first_response_at timestamptz,
  last_customer_at timestamptz,
  last_agent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, thread_id)
);

create table if not exists public.collaboration_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'viewing' check (state in ('viewing', 'composing', 'idle')),
  last_seen_at timestamptz not null default now(),
  primary key(thread_id, user_id)
);

create table if not exists public.collaboration_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.collaboration_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('approval', 'escalation')),
  priority integer not null default 100 check (priority >= 0),
  enabled boolean not null default true,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaboration_shared_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('template', 'contact', 'signature', 'calendar', 'label')),
  name text not null check (length(trim(name)) between 1 and 120),
  payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collaboration_threads_org_status_idx on public.collaboration_threads(organization_id, status, priority, sla_due_at);
create index if not exists collaboration_threads_assignee_idx on public.collaboration_threads(assignee_id, status, sla_due_at);
create index if not exists collaboration_presence_thread_seen_idx on public.collaboration_presence(thread_id, last_seen_at desc);
create index if not exists collaboration_activity_thread_created_idx on public.collaboration_activity(thread_id, created_at asc);
create index if not exists collaboration_activity_org_created_idx on public.collaboration_activity(organization_id, created_at desc);
create index if not exists collaboration_policies_org_priority_idx on public.collaboration_policies(organization_id, enabled, priority);
create index if not exists collaboration_shared_items_org_kind_idx on public.collaboration_shared_items(organization_id, kind, enabled, name);

alter table public.thread_comments enable row level security;
alter table public.thread_assignments enable row level security;
alter table public.collaboration_threads enable row level security;
alter table public.collaboration_presence enable row level security;
alter table public.collaboration_activity enable row level security;
alter table public.collaboration_policies enable row level security;
alter table public.collaboration_shared_items enable row level security;

revoke all on table public.thread_comments, public.thread_assignments,
  public.collaboration_threads, public.collaboration_presence,
  public.collaboration_activity, public.collaboration_policies,
  public.collaboration_shared_items from anon, authenticated;

comment on table public.collaboration_threads is 'Worker-authorized shared-inbox state. Direct client grants are intentionally revoked.';
comment on table public.collaboration_activity is 'Append-only collaboration trail for assignments, comments, SLA, and policy changes.';
comment on table public.collaboration_shared_items is 'Organization-owned templates, contacts, signatures, calendar items, and labels.';
