-- The Worker uses the service role for server-side data access. Anonymous
-- clients must never be able to delete mailbox rows directly.
revoke delete on public.messages from public, anon;
grant delete on public.messages to authenticated;
