-- Permanently remove a user's Trash contents in one RLS-scoped database
-- operation. Storage keys are returned so the Worker can clean B2 in batches
-- after the database transaction succeeds.
create or replace function public.empty_trash()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_message_ids uuid[] := '{}';
  v_object_keys jsonb := '[]'::jsonb;
  v_deleted_count integer := 0;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(array_agg(m.id), '{}'::uuid[])
    into v_message_ids
    from public.messages m
   where m.owner_id = v_owner
     and m.folder = 'trash';

  select coalesce(jsonb_agg(storage.object_key order by storage.object_key), '[]'::jsonb)
    into v_object_keys
    from (
      select distinct objects.object_key
        from (
          select m.raw_object_key as object_key
            from public.messages m
           where m.owner_id = v_owner
             and m.id = any(v_message_ids)
          union all
          select a.object_key
            from public.attachments a
           where a.owner_id = v_owner
             and a.message_id = any(v_message_ids)
        ) objects
       where nullif(btrim(objects.object_key), '') is not null
    ) storage;

  delete from public.messages m
   where m.owner_id = v_owner
     and m.folder = 'trash';
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_count', v_deleted_count,
    'object_keys', v_object_keys
  );
end;
$$;

revoke all on function public.empty_trash() from public, anon;
grant execute on function public.empty_trash() to authenticated;
revoke delete on public.messages from public, anon;
grant delete on public.messages to authenticated;
