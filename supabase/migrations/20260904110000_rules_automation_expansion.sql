-- Expand the rule engine without exposing rule writes to the browser.
-- The Worker remains the only writer; authenticated users only read their own
-- rule history through the existing API.

alter table public.mail_rules add column if not exists scope text not null default 'personal';
alter table public.mail_rules add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.mail_rules add column if not exists trigger_type text not null default 'inbound';
alter table public.mail_rules add column if not exists schedule jsonb not null default '{}'::jsonb;
alter table public.mail_rules add column if not exists next_run_at timestamptz;
alter table public.mail_rules add column if not exists sieve_source text;

alter table public.mail_rules drop constraint if exists mail_rules_scope_check;
alter table public.mail_rules add constraint mail_rules_scope_check
  check (scope in ('personal', 'organization'));
alter table public.mail_rules drop constraint if exists mail_rules_trigger_type_check;
alter table public.mail_rules add constraint mail_rules_trigger_type_check
  check (trigger_type in ('inbound', 'event', 'scheduled'));
alter table public.mail_rules drop constraint if exists mail_rules_organization_scope_check;
alter table public.mail_rules add constraint mail_rules_organization_scope_check
  check ((scope = 'organization' and organization_id is not null) or (scope = 'personal'));

create index if not exists mail_rules_org_priority_idx
  on public.mail_rules(organization_id, priority, created_at)
  where scope = 'organization' and enabled = true;
create index if not exists mail_rules_schedule_idx
  on public.mail_rules(next_run_at)
  where trigger_type = 'scheduled' and enabled = true;

comment on column public.mail_rules.schedule is 'Worker-owned schedule metadata; values are validated before execution.';
comment on column public.mail_rules.sieve_source is 'Optional source Sieve representation retained for compatibility and export.';
