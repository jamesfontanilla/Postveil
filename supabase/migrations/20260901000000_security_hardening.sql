-- Security hardening for direct PostgREST access and provider callbacks.

-- A message label is a relationship between two owner-scoped records. Both
-- sides must belong to the same authenticated user.
drop policy if exists "message labels own rows" on public.message_labels;
create policy "message labels own rows" on public.message_labels for all to authenticated
  using (
    exists(
      select 1 from public.messages m
      where m.id = message_id and m.owner_id = (select auth.uid())
    )
    and exists(
      select 1 from public.labels l
      where l.id = label_id and l.owner_id = (select auth.uid())
    )
  )
  with check (
    exists(
      select 1 from public.messages m
      where m.id = message_id and m.owner_id = (select auth.uid())
    )
    and exists(
      select 1 from public.labels l
      where l.id = label_id and l.owner_id = (select auth.uid())
    )
  );

-- Prevent duplicate Brevo events even when two deliveries race each other.
create unique index if not exists mail_events_brevo_event_uidx
  on public.mail_events(provider, provider_message_id, event_type)
  where provider = 'brevo' and provider_message_id is not null;

-- Explicit deny policies document that these service-only tables are not
-- client resources. They remain inaccessible to anon/authenticated because
-- the migrations also revoke their table privileges.
drop policy if exists "recovery ip limits deny client access" on public.account_recovery_ip_rate_limits;
create policy "recovery ip limits deny client access"
  on public.account_recovery_ip_rate_limits for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "recovery email limits deny client access" on public.account_recovery_rate_limits;
create policy "recovery email limits deny client access"
  on public.account_recovery_rate_limits for all to anon, authenticated
  using (false) with check (false);

-- Atomic throttling functions avoid lost increments under concurrent recovery
-- requests. They are executable only by the Worker service role.
create or replace function public.consume_recovery_email_rate_limit(
  p_email_hash text,
  p_window_seconds integer default 3600,
  p_min_interval_seconds integer default 60,
  p_max_requests integer default 5
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.account_recovery_rate_limits%rowtype;
  now_ts timestamptz := clock_timestamp();
  window_seconds integer := greatest(coalesce(p_window_seconds, 3600), 1);
  min_interval_seconds integer := greatest(coalesce(p_min_interval_seconds, 60), 0);
  max_requests integer := greatest(coalesce(p_max_requests, 5), 1);
begin
  if coalesce(btrim(p_email_hash), '') = '' then return false; end if;

  loop
    select * into current_row
    from public.account_recovery_rate_limits
    where email_hash = p_email_hash
    for update;

    if not found then
      begin
        insert into public.account_recovery_rate_limits
          (email_hash, window_started_at, sent_count, last_sent_at, updated_at)
        values (p_email_hash, now_ts, 1, now_ts, now_ts);
        return true;
      exception when unique_violation then
        -- Another request created the row. Re-read it under a row lock.
      end;
    elsif current_row.window_started_at <= now_ts - make_interval(secs => window_seconds) then
      update public.account_recovery_rate_limits
      set window_started_at = now_ts, sent_count = 1, last_sent_at = now_ts, updated_at = now_ts
      where email_hash = p_email_hash;
      return true;
    elsif current_row.sent_count >= max_requests
      or (current_row.last_sent_at is not null and current_row.last_sent_at > now_ts - make_interval(secs => min_interval_seconds)) then
      return false;
    else
      update public.account_recovery_rate_limits
      set sent_count = current_row.sent_count + 1, last_sent_at = now_ts, updated_at = now_ts
      where email_hash = p_email_hash;
      return true;
    end if;
  end loop;
end;
$$;

create or replace function public.consume_recovery_ip_rate_limit(
  p_ip_hash text,
  p_window_seconds integer default 3600,
  p_min_interval_seconds integer default 1,
  p_max_requests integer default 30
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.account_recovery_ip_rate_limits%rowtype;
  now_ts timestamptz := clock_timestamp();
  window_seconds integer := greatest(coalesce(p_window_seconds, 3600), 1);
  min_interval_seconds integer := greatest(coalesce(p_min_interval_seconds, 1), 0);
  max_requests integer := greatest(coalesce(p_max_requests, 30), 1);
begin
  if coalesce(btrim(p_ip_hash), '') = '' then return true; end if;

  loop
    select * into current_row
    from public.account_recovery_ip_rate_limits
    where ip_hash = p_ip_hash
    for update;

    if not found then
      begin
        insert into public.account_recovery_ip_rate_limits
          (ip_hash, window_started_at, request_count, last_request_at, updated_at)
        values (p_ip_hash, now_ts, 1, now_ts, now_ts);
        return true;
      exception when unique_violation then
        -- Another request created the row. Re-read it under a row lock.
      end;
    elsif current_row.window_started_at <= now_ts - make_interval(secs => window_seconds) then
      update public.account_recovery_ip_rate_limits
      set window_started_at = now_ts, request_count = 1, last_request_at = now_ts, updated_at = now_ts
      where ip_hash = p_ip_hash;
      return true;
    elsif current_row.request_count >= max_requests
      or (current_row.last_request_at is not null and current_row.last_request_at > now_ts - make_interval(secs => min_interval_seconds)) then
      return false;
    else
      update public.account_recovery_ip_rate_limits
      set request_count = current_row.request_count + 1, last_request_at = now_ts, updated_at = now_ts
      where ip_hash = p_ip_hash;
      return true;
    end if;
  end loop;
end;
$$;

revoke all on function public.consume_recovery_email_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.consume_recovery_ip_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_recovery_email_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.consume_recovery_ip_rate_limit(text, integer, integer, integer) to service_role;

-- The Worker talks to PostgREST with the server-only service_role key. Keep
-- these grants server-side: authenticated clients remain governed by RLS.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Supabase may expose this helper in the public schema. Keep it unavailable
-- to API roles while preserving the owner/service-role ability to use it.
do $$
declare
  function_oid oid;
begin
  select p.oid into function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0
  limit 1;
  if function_oid is not null then
    execute format('revoke execute on function %s from public, anon, authenticated', function_oid::regprocedure);
  end if;
end;
$$;
