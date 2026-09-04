-- Calendar, contacts, and work management.
-- Mutations are performed by the trusted Worker. These tables remain RLS-protected
-- and are not directly writable through the browser client.

create table if not exists public.workspace_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  color text not null default '#2d5bff',
  timezone text not null default 'UTC',
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  is_default boolean not null default false,
  external_provider text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, slug)
);

create index if not exists workspace_calendars_org_idx
  on public.workspace_calendars(organization_id, visibility, name);

create table if not exists public.workspace_calendar_members (
  calendar_id uuid not null references public.workspace_calendars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('free_busy', 'viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key(calendar_id, user_id)
);

create index if not exists workspace_calendar_members_user_idx
  on public.workspace_calendar_members(user_id, role);

alter table public.calendar_events add column if not exists calendar_id uuid references public.workspace_calendars(id) on delete set null;
alter table public.calendar_events add column if not exists organizer_id uuid references auth.users(id) on delete set null;
alter table public.calendar_events add column if not exists timezone text not null default 'UTC';
alter table public.calendar_events add column if not exists recurrence_rule text;
alter table public.calendar_events add column if not exists recurrence_until timestamptz;
alter table public.calendar_events add column if not exists reminders jsonb not null default '[]'::jsonb;
alter table public.calendar_events add column if not exists status text not null default 'confirmed';
alter table public.calendar_events add column if not exists visibility text not null default 'private';
alter table public.calendar_events add column if not exists conference_url text;
alter table public.calendar_events add column if not exists external_uid text;
alter table public.calendar_events drop constraint if exists calendar_events_status_check;
alter table public.calendar_events add constraint calendar_events_status_check
  check (status in ('tentative', 'confirmed', 'cancelled'));
alter table public.calendar_events drop constraint if exists calendar_events_visibility_check;
alter table public.calendar_events add constraint calendar_events_visibility_check
  check (visibility in ('private', 'shared'));

create index if not exists calendar_events_calendar_start_idx
  on public.calendar_events(calendar_id, starts_at, ends_at);
create index if not exists calendar_events_owner_status_idx
  on public.calendar_events(owner_id, status, starts_at);

-- Give existing events a stable personal calendar without changing their times.
do $$
declare
  event_owner record;
  personal_calendar uuid;
begin
  for event_owner in select distinct owner_id from public.calendar_events loop
    insert into public.workspace_calendars(owner_id, name, slug, timezone, visibility, is_default)
      values (event_owner.owner_id, 'Personal', 'personal', 'UTC', 'private', true)
      on conflict (owner_id, slug) do nothing;
    select id into personal_calendar
      from public.workspace_calendars
      where owner_id = event_owner.owner_id and slug = 'personal'
      limit 1;
    update public.calendar_events
      set calendar_id = coalesce(calendar_id, personal_calendar), organizer_id = coalesce(organizer_id, event_owner.owner_id)
      where owner_id = event_owner.owner_id and calendar_id is null;
  end loop;
end $$;

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  display_name text not null default '',
  response text not null default 'pending' check (response in ('pending', 'accepted', 'tentative', 'declined')),
  invite_token text not null default gen_random_uuid()::text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, email)
);

create index if not exists calendar_event_attendees_email_idx
  on public.calendar_event_attendees(lower(email), response);

create table if not exists public.scheduling_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  calendar_id uuid references public.workspace_calendars(id) on delete set null,
  slug text not null,
  title text not null default 'Meet with me',
  description text not null default '',
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  timezone text not null default 'UTC',
  availability jsonb not null default '{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}'::jsonb,
  active boolean not null default true,
  require_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, slug)
);

create index if not exists scheduling_links_org_active_idx
  on public.scheduling_links(organization_id, active, slug);

create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  color text not null default '#2d5bff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.contact_group_members (
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(group_id, contact_id)
);

create index if not exists contact_group_members_contact_idx
  on public.contact_group_members(contact_id);
alter table public.contacts add column if not exists source text not null default 'manual';
alter table public.contacts add column if not exists vcard_data text;

create table if not exists public.workspace_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  color text not null default '#2d5bff',
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_projects_org_status_idx
  on public.workspace_projects(organization_id, status, updated_at desc);

create table if not exists public.workspace_project_members (
  project_id uuid not null references public.workspace_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('viewer', 'member', 'manager')),
  created_at timestamptz not null default now(),
  primary key(project_id, user_id)
);

create index if not exists workspace_project_members_user_idx
  on public.workspace_project_members(user_id, role);

alter table public.tasks add column if not exists project_id uuid references public.workspace_projects(id) on delete set null;
alter table public.tasks add column if not exists assignee_id uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists status text not null default 'todo';
alter table public.tasks add column if not exists position integer not null default 0;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists calendar_event_id uuid references public.calendar_events(id) on delete set null;
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'done'));

alter table public.messages add column if not exists project_id uuid references public.workspace_projects(id) on delete set null;
create index if not exists tasks_project_status_position_idx
  on public.tasks(project_id, status, position, due_at);
create index if not exists messages_owner_project_idx
  on public.messages(owner_id, project_id, created_at desc);

create table if not exists public.workspace_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('caldav', 'carddav')),
  resource_id uuid,
  sync_token bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique(owner_id, resource_type, resource_id)
);

alter table public.workspace_calendars enable row level security;
alter table public.workspace_calendar_members enable row level security;
alter table public.calendar_event_attendees enable row level security;
alter table public.scheduling_links enable row level security;
alter table public.contact_groups enable row level security;
alter table public.contact_group_members enable row level security;
alter table public.workspace_projects enable row level security;
alter table public.workspace_project_members enable row level security;
alter table public.workspace_sync_cursors enable row level security;

revoke all on table public.workspace_calendars from anon, authenticated;
revoke all on table public.workspace_calendar_members from anon, authenticated;
revoke all on table public.calendar_event_attendees from anon, authenticated;
revoke all on table public.scheduling_links from anon, authenticated;
revoke all on table public.contact_groups from anon, authenticated;
revoke all on table public.contact_group_members from anon, authenticated;
revoke all on table public.workspace_projects from anon, authenticated;
revoke all on table public.workspace_project_members from anon, authenticated;
revoke all on table public.workspace_sync_cursors from anon, authenticated;
