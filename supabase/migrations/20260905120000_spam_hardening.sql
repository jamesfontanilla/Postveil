-- Spam screening hardening, feedback integrity, and auditable decisions.
-- Provider credentials and message content remain server-side; this migration
-- stores only decision metadata and privacy-safe signal summaries.

alter table public.messages drop constraint if exists messages_folder_check;
alter table public.messages add constraint messages_folder_check
  check (folder in ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'quarantine', 'custom'));

alter table public.messages
  add column if not exists screening_model_version text not null default 'legacy',
  add column if not exists screening_confidence numeric(5,4) not null default 0,
  add column if not exists screening_signal_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists screening_decision_source text not null default 'legacy';

alter table public.messages drop constraint if exists messages_screening_confidence_check;
alter table public.messages add constraint messages_screening_confidence_check
  check (screening_confidence >= 0 and screening_confidence <= 1);

alter table public.screening_events
  add column if not exists reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists spam_score numeric(5,4),
  add column if not exists confidence numeric(5,4),
  add column if not exists model_version text not null default 'legacy',
  add column if not exists source text not null default 'system',
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

alter table public.screening_events drop constraint if exists screening_events_confidence_check;
alter table public.screening_events add constraint screening_events_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.spam_feedback
  add column if not exists feedback_source text not null default 'user',
  add column if not exists score_at_feedback numeric(5,4),
  add column if not exists model_version text not null default 'legacy';

-- Make the ownership relationship enforceable for all future writes. NOT VALID
-- preserves existing rows for a later data-cleanup review while preventing new
-- cross-owner feedback rows.
create unique index if not exists messages_id_owner_uidx
  on public.messages(id, owner_id);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'spam_feedback_message_owner_fk'
      and conrelid = 'public.spam_feedback'::regclass
  ) then
    alter table public.spam_feedback
      add constraint spam_feedback_message_owner_fk
      foreign key (message_id, owner_id)
      references public.messages(id, owner_id)
      on delete cascade
      not valid;
  end if;
end $$;

-- Keep one current correction per user/message so feedback cannot be inflated
-- by repeated submissions or replayed requests.
with ranked as (
  select id,
         row_number() over (partition by owner_id, message_id order by created_at desc, id desc) as row_number
  from public.spam_feedback
)
delete from public.spam_feedback feedback
using ranked
where feedback.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists spam_feedback_owner_message_uidx
  on public.spam_feedback(owner_id, message_id);
create index if not exists spam_feedback_owner_created_idx
  on public.spam_feedback(owner_id, created_at desc);
create index if not exists screening_events_owner_message_created_idx
  on public.screening_events(owner_id, message_id, created_at desc);
create index if not exists messages_owner_spam_score_idx
  on public.messages(owner_id, spam_score desc, created_at desc);

-- The Worker is the only writer. Browser clients can read their own feedback
-- if needed, but cannot manufacture a correction for another user's message.
alter table public.spam_feedback enable row level security;
revoke all on table public.spam_feedback from anon, authenticated;
grant select on table public.spam_feedback to authenticated;
drop policy if exists "spam feedback own rows" on public.spam_feedback;
drop policy if exists "spam feedback owner reads" on public.spam_feedback;
drop policy if exists "spam feedback client writes denied" on public.spam_feedback;
drop policy if exists "spam feedback client inserts denied" on public.spam_feedback;
drop policy if exists "spam feedback client updates denied" on public.spam_feedback;
drop policy if exists "spam feedback client deletes denied" on public.spam_feedback;
create policy "spam feedback owner reads" on public.spam_feedback
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "spam feedback client inserts denied" on public.spam_feedback
  for insert to anon, authenticated
  with check (false);
create policy "spam feedback client updates denied" on public.spam_feedback
  for update to anon, authenticated
  using (false)
  with check (false);
create policy "spam feedback client deletes denied" on public.spam_feedback
  for delete to anon, authenticated
  using (false);

comment on column public.messages.screening_signal_snapshot is
  'Privacy-safe screening signals; never store message content here.';
comment on column public.messages.screening_confidence is
  'Heuristic confidence indicator, not a calibrated probability.';
