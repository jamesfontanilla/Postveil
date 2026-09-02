-- Inbox management: richer organization, thread controls, retention, and safety.
-- All rows are owner-scoped. The Worker uses the service role only after it has
-- authenticated the caller and checked mailbox delegation.

alter table public.messages drop constraint if exists messages_folder_check;
alter table public.messages add constraint messages_folder_check
  check (folder in ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'quarantine', 'custom'));

alter table public.messages add column if not exists is_important boolean not null default false;
alter table public.messages add column if not exists is_muted boolean not null default false;
alter table public.messages add column if not exists is_ignored boolean not null default false;
alter table public.messages add column if not exists reminder_at timestamptz;
alter table public.messages add column if not exists reminder_note text;
alter table public.messages add column if not exists unsubscribe_url text;
alter table public.messages add column if not exists retention_expires_at timestamptz;
alter table public.messages add column if not exists legal_hold boolean not null default false;
alter table public.messages add column if not exists updated_at timestamptz not null default now();

alter table public.threads add column if not exists is_muted boolean not null default false;
alter table public.threads add column if not exists is_ignored boolean not null default false;
alter table public.threads add column if not exists merged_into_thread_id uuid references public.threads(id) on delete set null;

alter table public.mail_folders add column if not exists parent_id uuid references public.mail_folders(id) on delete set null;
alter table public.labels add column if not exists parent_id uuid references public.labels(id) on delete set null;
alter table public.labels add column if not exists sort_order integer not null default 0;

create index if not exists messages_owner_important_idx
  on public.messages(owner_id, is_important, created_at desc) where is_important = true;
create index if not exists messages_owner_reminder_idx
  on public.messages(owner_id, reminder_at) where reminder_at is not null;
create index if not exists messages_owner_quarantine_idx
  on public.messages(owner_id, folder, created_at desc) where folder = 'quarantine';
create index if not exists messages_owner_retention_idx
  on public.messages(owner_id, retention_expires_at) where retention_expires_at is not null;
create index if not exists threads_owner_muted_idx
  on public.threads(owner_id, is_muted, is_ignored);
create index if not exists mail_folders_parent_idx on public.mail_folders(owner_id, parent_id, sort_order, name);
create index if not exists labels_parent_idx on public.labels(owner_id, parent_id, sort_order, name);

-- A message label is only valid when both sides belong to the same caller.
-- Checking the message alone would allow cross-tenant label attachment.
drop policy if exists "message labels own rows" on public.message_labels;
create policy "message labels own rows" on public.message_labels for all to authenticated
  using (
    exists(select 1 from public.messages m where m.id = message_id and m.owner_id = (select auth.uid()))
    and exists(select 1 from public.labels l where l.id = label_id and l.owner_id = (select auth.uid()))
  )
  with check (
    exists(select 1 from public.messages m where m.id = message_id and m.owner_id = (select auth.uid()))
    and exists(select 1 from public.labels l where l.id = label_id and l.owner_id = (select auth.uid()))
  );

create table if not exists public.sender_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  match_type text not null check (match_type in ('address', 'domain')),
  match_value text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, match_type, match_value)
);

create table if not exists public.message_retention_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scope text not null default 'all' check (scope in ('all', 'inbox', 'sent', 'trash', 'spam', 'quarantine')),
  retention_days integer not null check (retention_days between 1 and 36500),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.message_legal_holds (
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key(owner_id, message_id)
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  report_type text not null check (report_type in ('spam', 'phishing')),
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists message_reports_owner_created_idx
  on public.message_reports(owner_id, created_at desc);

alter table public.sender_blocks enable row level security;
alter table public.message_retention_policies enable row level security;
alter table public.message_legal_holds enable row level security;
alter table public.message_reports enable row level security;

drop policy if exists "sender blocks own rows" on public.sender_blocks;
create policy "sender blocks own rows" on public.sender_blocks for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "retention policies own rows" on public.message_retention_policies;
create policy "retention policies own rows" on public.message_retention_policies for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "legal holds own rows" on public.message_legal_holds;
create policy "legal holds own rows" on public.message_legal_holds for all to authenticated
  using ((select auth.uid()) = owner_id) with check (
    (select auth.uid()) = owner_id and
    exists(select 1 from public.messages m where m.id = message_id and m.owner_id = (select auth.uid()))
  );
drop policy if exists "message reports own rows" on public.message_reports;
create policy "message reports own rows" on public.message_reports for all to authenticated
  using ((select auth.uid()) = owner_id) with check (
    (select auth.uid()) = owner_id and
    exists(select 1 from public.messages m where m.id = message_id and m.owner_id = (select auth.uid()))
  );
