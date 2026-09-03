-- Execute mailbox bulk actions as one database transaction instead of one
-- Worker subrequest per message. The function is deliberately exposed only to
-- authenticated callers and requires auth.uid() to scope every operation.

-- Keep the public RPC functions invoker-secured so their reads and writes are
-- evaluated through the caller's RLS policies. Audit rows are written through
-- a narrowly scoped helper in a non-exposed schema because clients only have
-- SELECT access to message_audit_log.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

grant select, insert, update on table public.messages to authenticated;
grant select, insert on table public.message_labels to authenticated;
grant select, insert on table public.tasks to authenticated;
grant select on table public.message_audit_log to authenticated;

create or replace function private.write_bulk_audit(
  p_owner_id uuid,
  p_actor_id uuid,
  p_action_type text,
  p_target_type text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_request_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null or p_owner_id is distinct from (select auth.uid()) then
    raise exception 'Audit owner mismatch' using errcode = '42501';
  end if;

  insert into public.message_audit_log(
    owner_id, actor_id, action_type, target_type, before_state, after_state, request_id
  ) values (
    p_owner_id, p_actor_id, p_action_type, p_target_type,
    coalesce(p_before_state, '{}'::jsonb), coalesce(p_after_state, '{}'::jsonb), p_request_id
  );
end;
$$;

revoke all on function private.write_bulk_audit(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function private.write_bulk_audit(uuid, uuid, text, text, jsonb, jsonb, text) to authenticated;

create unique index if not exists message_audit_bulk_request_uidx
  on public.message_audit_log(owner_id, request_id)
  where action_type = 'bulk_operation' and request_id is not null;

create or replace function public.execute_bulk_message_action(
  p_request_id text,
  p_message_ids uuid[],
  p_action jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_action text := lower(coalesce(p_action->>'type', ''));
  v_ids uuid[] := coalesce(p_message_ids, '{}'::uuid[]);
  v_owned_ids uuid[] := '{}';
  v_missing_ids uuid[] := '{}';
  v_invalid_state_ids uuid[] := '{}';
  v_changed_ids uuid[] := '{}';
  v_before jsonb := '[]'::jsonb;
  v_exported jsonb := '[]'::jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_label_id uuid;
  v_custom_folder_id uuid;
  v_folder text;
  v_priority smallint;
  v_snoozed_until timestamptz;
  v_reminder_at timestamptz;
  v_follow_up_at timestamptz;
  v_undoable boolean := false;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_request_id), '') is null or length(p_request_id) > 100 then
    raise exception 'Bulk request id is invalid' using errcode = '22023';
  end if;
  if cardinality(v_ids) = 0 then
    raise exception 'Select at least one message' using errcode = '22023';
  end if;
  if v_action not in (
    'archive', 'move', 'label', 'mark_read', 'mark_unread', 'star', 'unstar',
    'pin', 'unpin', 'flag', 'unflag', 'important', 'not_important', 'mute',
    'unmute', 'ignore', 'unignore', 'reminder', 'priority', 'snooze',
    'reply_later', 'waiting_on', 'i_owe', 'spam', 'trash', 'restore', 'export',
    'create_task'
  ) then
    raise exception 'Unsupported bulk action' using errcode = '22023';
  end if;

  -- De-duplicate ids inside the database as a second line of defence.
  v_ids := coalesce(array(
    select distinct item.id
    from unnest(v_ids) as item(id)
    where item.id is not null
  ), '{}'::uuid[]);
  if cardinality(v_ids) = 0 then
    raise exception 'Select at least one message' using errcode = '22023';
  end if;

  -- Idempotency is checked inside the same database boundary as the write.
  select a.after_state
    into v_replay
    from public.message_audit_log a
   where a.owner_id = v_owner
     and a.request_id = p_request_id
     and a.action_type = 'bulk_operation'
   order by a.created_at desc
   limit 1;
  if v_replay is not null then
    return jsonb_set(v_replay, '{replayed}', 'true'::jsonb, true);
  end if;

  select coalesce(array_agg(m.id), '{}'::uuid[])
    into v_owned_ids
    from public.messages m
   where m.owner_id = v_owner
     and m.id = any(v_ids);

  select coalesce(array_agg(requested.id), '{}'::uuid[])
    into v_missing_ids
    from unnest(v_ids) as requested(id)
   where not exists (
     select 1
       from public.messages m
      where m.owner_id = v_owner
        and m.id = requested.id
   );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'state', jsonb_build_object(
      'folder', m.folder,
      'custom_folder_id', m.custom_folder_id,
      'previous_folder', m.previous_folder,
      'is_read', m.is_read,
      'is_starred', m.is_starred,
      'is_pinned', m.is_pinned,
      'is_flagged', m.is_flagged,
      'is_important', m.is_important,
      'is_muted', m.is_muted,
      'is_ignored', m.is_ignored,
      'priority', m.priority,
      'work_state', m.work_state,
      'follow_up_at', m.follow_up_at,
      'reminder_at', m.reminder_at,
      'reminder_note', m.reminder_note,
      'snoozed_until', m.snoozed_until
    )
  ) order by m.created_at desc, m.id desc), '[]'::jsonb)
    into v_before
    from public.messages m
   where m.owner_id = v_owner
     and m.id = any(v_owned_ids);

  if v_action = 'label' then
    if coalesce(p_action->>'labelId', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'Label is invalid' using errcode = '22023';
    end if;
    v_label_id := (p_action->>'labelId')::uuid;
    if not exists (
      select 1 from public.labels l
       where l.id = v_label_id and l.owner_id = v_owner
    ) then
      raise exception 'Label not found' using errcode = 'P0002';
    end if;
  elsif v_action = 'move' then
    v_folder := lower(coalesce(p_action->>'folder', ''));
    if v_folder = 'custom' then
      if coalesce(p_action->>'customFolderId', '') !~ '^[0-9a-f-]{36}$' then
        raise exception 'Choose a valid destination folder' using errcode = '22023';
      end if;
      v_custom_folder_id := (p_action->>'customFolderId')::uuid;
      if not exists (
        select 1 from public.mail_folders f
         where f.id = v_custom_folder_id and f.owner_id = v_owner
      ) then
        raise exception 'Choose a valid destination folder' using errcode = 'P0002';
      end if;
    elsif v_folder not in ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'quarantine') then
      raise exception 'Choose a valid destination folder' using errcode = '22023';
    end if;
  elsif v_action = 'priority' then
    begin
      v_priority := greatest(0, least(2, coalesce((p_action->>'priority')::smallint, 0)));
    exception when others then
      raise exception 'Priority is invalid' using errcode = '22023';
    end;
  elsif v_action = 'snooze' then
    begin
      v_snoozed_until := coalesce(nullif(p_action->>'snoozedUntil', '')::timestamptz, now() + interval '1 hour');
    exception when others then
      raise exception 'Snooze time is invalid' using errcode = '22023';
    end;
  elsif v_action = 'reminder' then
    begin
      v_reminder_at := coalesce(nullif(p_action->>'reminderAt', '')::timestamptz, now() + interval '1 day');
    exception when others then
      raise exception 'Reminder time is invalid' using errcode = '22023';
    end;
  elsif v_action in ('reply_later', 'waiting_on', 'i_owe') then
    begin
      v_follow_up_at := coalesce(nullif(p_action->>'followUpAt', '')::timestamptz, now() + interval '1 day');
    exception when others then
      raise exception 'Follow-up time is invalid' using errcode = '22023';
    end;
  end if;

  if v_action = 'export' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'subject', coalesce(m.subject, ''),
      'from_address', coalesce(m.from_address, ''),
      'to_addresses', coalesce(m.to_addresses, '[]'::jsonb),
      'text_body', coalesce(nullif(m.text_body, ''), m.snippet, '')
    ) order by m.created_at desc, m.id desc), '[]'::jsonb)
      into v_exported
      from public.messages m
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids);
  elsif v_action = 'label' then
    insert into public.message_labels(message_id, label_id)
    select m.id, v_label_id
      from public.messages m
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids)
    on conflict (message_id, label_id) do nothing;
    v_changed_ids := v_owned_ids;
  elsif v_action = 'create_task' then
    insert into public.tasks(owner_id, title, notes, source_message_id)
    select v_owner, coalesce(nullif(m.subject, ''), '(no subject)'), coalesce(m.snippet, ''), m.id
      from public.messages m
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids);
    v_changed_ids := v_owned_ids;
  else
    v_undoable := true;

    select coalesce(array_agg(m.id), '{}'::uuid[])
      into v_invalid_state_ids
      from public.messages m
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids)
       and v_action = 'restore'
       and m.folder <> 'trash';

    select coalesce(array_agg(m.id order by m.created_at desc, m.id desc), '{}'::uuid[])
      into v_changed_ids
      from public.messages m
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids)
       and not (v_action = 'restore' and m.folder <> 'trash');

    update public.messages m
           set folder = case
             when v_action in ('archive', 'spam') then v_action
             when v_action = 'trash' then 'trash'
             when v_action = 'move' then v_folder
             when v_action = 'restore' then case
               when m.previous_folder ~ '^custom:[0-9a-f-]{36}$'
                and exists (
                  select 1 from public.mail_folders f
                   where f.id = substring(m.previous_folder from 8)::uuid
                     and f.owner_id = v_owner
                ) then 'custom'
               when m.previous_folder in ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'quarantine') then m.previous_folder
               else 'inbox'
             end
             when v_action = 'snooze' then 'archive'
             else m.folder
           end,
           custom_folder_id = case
             when v_action in ('archive', 'spam', 'trash', 'snooze') then null
             when v_action = 'move' and v_folder <> 'custom' then null
             when v_action = 'move' and v_folder = 'custom' then v_custom_folder_id
             when v_action = 'restore' and m.previous_folder ~ '^custom:[0-9a-f-]{36}$'
              and exists (
                select 1 from public.mail_folders f
                 where f.id = substring(m.previous_folder from 8)::uuid
                   and f.owner_id = v_owner
              ) then substring(m.previous_folder from 8)::uuid
             when v_action = 'restore' then null
             else m.custom_folder_id
           end,
           previous_folder = case
             when v_action = 'trash' then case
               when m.folder = 'trash' then coalesce(m.previous_folder, 'inbox')
               when m.folder = 'custom' and m.custom_folder_id is not null then 'custom:' || m.custom_folder_id::text
               else m.folder
             end
             when v_action in ('move', 'restore', 'snooze') then case when v_action = 'snooze' then m.folder else null end
             else m.previous_folder
           end,
           is_read = case when v_action = 'mark_read' then true when v_action = 'mark_unread' then false else m.is_read end,
           is_starred = case when v_action = 'star' then true when v_action = 'unstar' then false else m.is_starred end,
           is_pinned = case when v_action = 'pin' then true when v_action = 'unpin' then false else m.is_pinned end,
           is_flagged = case when v_action = 'flag' then true when v_action = 'unflag' then false else m.is_flagged end,
           is_important = case when v_action = 'important' then true when v_action = 'not_important' then false else m.is_important end,
           is_muted = case when v_action = 'mute' then true when v_action = 'unmute' then false else m.is_muted end,
           is_ignored = case when v_action = 'ignore' then true when v_action = 'unignore' then false else m.is_ignored end,
           priority = case when v_action = 'priority' then v_priority else m.priority end,
           snoozed_until = case when v_action = 'snooze' then v_snoozed_until else m.snoozed_until end,
           reminder_at = case when v_action = 'reminder' then v_reminder_at else m.reminder_at end,
           reminder_note = case when v_action = 'reminder' then left(coalesce(p_action->>'reminderNote', 'Follow up on this message'), 240) else m.reminder_note end,
           work_state = case when v_action in ('reply_later', 'waiting_on', 'i_owe') then v_action else m.work_state end,
           follow_up_at = case when v_action in ('reply_later', 'waiting_on', 'i_owe') then v_follow_up_at else m.follow_up_at end,
           updated_at = now()
     where m.owner_id = v_owner
       and m.id = any(v_owned_ids)
       and not (v_action = 'restore' and m.folder <> 'trash');
  end if;

  v_result := jsonb_build_object(
    'ok', cardinality(v_missing_ids) = 0 and cardinality(v_invalid_state_ids) = 0,
    'request_id', p_request_id,
    'changed_ids', to_jsonb(v_changed_ids),
    'exported', v_exported,
    'failures', coalesce((
      select jsonb_agg(jsonb_build_object('id', failure.id, 'error', failure.error))
        from (
          select missing.id::text as id, 'Message not found or not owned' as error
            from unnest(v_missing_ids) as missing(id)
          union all
          select invalid.id::text as id, 'Only messages in Trash can be restored' as error
            from unnest(v_invalid_state_ids) as invalid(id)
        ) failure
    ), '[]'::jsonb),
    'undoable', v_undoable,
    'truncated', false,
    'requested_count', cardinality(v_ids)
  );

  perform private.write_bulk_audit(
    v_owner, v_owner, 'bulk_operation', 'bulk_operation', v_before, v_result, p_request_id
  );

  return v_result;
exception when unique_violation then
  select a.after_state
    into v_replay
    from public.message_audit_log a
   where a.owner_id = v_owner
     and a.request_id = p_request_id
     and a.action_type = 'bulk_operation'
   order by a.created_at desc
   limit 1;
  if v_replay is not null then
    return jsonb_set(v_replay, '{replayed}', 'true'::jsonb, true);
  end if;
  raise;
end;
$$;

create or replace function public.undo_bulk_message_action(
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_before jsonb;
  v_operation jsonb;
  v_undone_ids uuid[] := '{}';
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select a.before_state, a.after_state
    into v_before, v_operation
    from public.message_audit_log a
   where a.owner_id = v_owner
     and a.request_id = p_request_id
     and a.action_type = 'bulk_operation'
     and a.created_at >= now() - interval '30 seconds'
   order by a.created_at desc
   limit 1;
  if v_before is null then
    raise exception 'This action can no longer be undone' using errcode = 'P0002';
  end if;
  if coalesce((v_operation->>'undoable')::boolean, false) = false then
    raise exception 'This action cannot be undone' using errcode = '55000';
  end if;

  select coalesce(array_agg(m.id order by m.created_at desc, m.id desc), '{}'::uuid[])
    into v_undone_ids
    from public.messages m
    join jsonb_array_elements(v_before) as entry(item)
      on m.id = (entry.item->>'id')::uuid
   where m.owner_id = v_owner;

  update public.messages m
     set folder = coalesce(nullif(entry.item->'state'->>'folder', ''), m.folder),
         custom_folder_id = nullif(entry.item->'state'->>'custom_folder_id', '')::uuid,
         previous_folder = nullif(entry.item->'state'->>'previous_folder', ''),
         is_read = coalesce((entry.item->'state'->>'is_read')::boolean, m.is_read),
         is_starred = coalesce((entry.item->'state'->>'is_starred')::boolean, m.is_starred),
         is_pinned = coalesce((entry.item->'state'->>'is_pinned')::boolean, m.is_pinned),
         is_flagged = coalesce((entry.item->'state'->>'is_flagged')::boolean, m.is_flagged),
         is_important = coalesce((entry.item->'state'->>'is_important')::boolean, m.is_important),
         is_muted = coalesce((entry.item->'state'->>'is_muted')::boolean, m.is_muted),
         is_ignored = coalesce((entry.item->'state'->>'is_ignored')::boolean, m.is_ignored),
         priority = coalesce((entry.item->'state'->>'priority')::smallint, m.priority),
         work_state = coalesce(nullif(entry.item->'state'->>'work_state', ''), m.work_state),
         follow_up_at = nullif(entry.item->'state'->>'follow_up_at', '')::timestamptz,
         reminder_at = nullif(entry.item->'state'->>'reminder_at', '')::timestamptz,
         reminder_note = nullif(entry.item->'state'->>'reminder_note', ''),
         snoozed_until = nullif(entry.item->'state'->>'snoozed_until', '')::timestamptz,
         updated_at = now()
    from jsonb_array_elements(v_before) as entry(item)
   where m.owner_id = v_owner
     and m.id = (entry.item->>'id')::uuid;

  perform private.write_bulk_audit(
    v_owner, v_owner, 'bulk_undo', 'bulk_operation', '{}'::jsonb,
    jsonb_build_object('undone_ids', to_jsonb(v_undone_ids)), p_request_id
  );

  return jsonb_build_object('ok', true, 'undone_ids', to_jsonb(v_undone_ids), 'failures', '[]'::jsonb);
end;
$$;

revoke all on function public.execute_bulk_message_action(text, uuid[], jsonb) from public, anon;
grant execute on function public.execute_bulk_message_action(text, uuid[], jsonb) to authenticated;
revoke all on function public.undo_bulk_message_action(text) from public, anon;
grant execute on function public.undo_bulk_message_action(text) to authenticated;
