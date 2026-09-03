-- Workspace-wide sender blocklist for anti-spam and anti-phishing screening.
-- The trusted Worker is the only application path; direct browser access is
-- intentionally revoked and RLS remains enabled as defense in depth.

create table if not exists public.organization_sender_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  match_type text not null check (match_type in ('address', 'domain')),
  match_value text not null check (length(trim(match_value)) between 3 and 320),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, match_type, match_value)
);

create index if not exists organization_sender_blocks_lookup_idx
  on public.organization_sender_blocks(organization_id, match_type, match_value)
  where enabled = true;

alter table public.organization_sender_blocks enable row level security;

revoke all on table public.organization_sender_blocks from anon, authenticated;

drop policy if exists "organization sender blocks are Worker-only" on public.organization_sender_blocks;
create policy "organization sender blocks are Worker-only"
  on public.organization_sender_blocks for all to authenticated
  using (false)
  with check (false);

comment on table public.organization_sender_blocks is
  'Worker-managed organization-wide sender blocklist. Not exposed to browser clients.';
