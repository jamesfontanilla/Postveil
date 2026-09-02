-- Powerful search: query history, filter indexes, and related-record lookups.
-- Search history is owner-scoped and stores only the user's query text.

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  normalized_query text not null,
  usage_count integer not null default 1 check (usage_count between 1 and 1000000),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(owner_id, normalized_query)
);

create index if not exists search_history_owner_recent_idx
  on public.search_history(owner_id, last_used_at desc);

create index if not exists messages_owner_search_date_idx
  on public.messages(owner_id, created_at desc, id desc);
create index if not exists messages_owner_size_idx
  on public.messages(owner_id, message_size_bytes);
create index if not exists messages_owner_spam_score_idx
  on public.messages(owner_id, spam_score);
create index if not exists messages_owner_link_count_idx
  on public.messages(owner_id, link_count);
create index if not exists messages_owner_auth_idx
  on public.messages(owner_id, auth_spf, auth_dkim, auth_dmarc);
create index if not exists attachments_owner_type_message_idx
  on public.attachments(owner_id, content_type, message_id);
create index if not exists calendar_events_owner_source_idx
  on public.calendar_events(owner_id, source_message_id)
  where source_message_id is not null;
create index if not exists tasks_owner_source_idx
  on public.tasks(owner_id, source_message_id)
  where source_message_id is not null;

alter table public.search_history enable row level security;
revoke all on table public.search_history from anon, authenticated;
grant select, insert, update, delete on table public.search_history to authenticated;

drop policy if exists "search history own rows" on public.search_history;
create policy "search history own rows" on public.search_history for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
