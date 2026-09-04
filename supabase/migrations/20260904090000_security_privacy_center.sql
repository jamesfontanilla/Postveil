-- Security and privacy center.
-- Preferences are intentionally separate from user_settings so privacy choices
-- can be audited and extended without mixing them with visual preferences.

create table if not exists public.user_privacy_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ai_processing_enabled boolean not null default false,
  login_alerts_enabled boolean not null default true,
  remote_images_enabled boolean not null default false,
  privacy_analytics_enabled boolean not null default false,
  metadata_minimization_enabled boolean not null default true,
  external_portal_enabled boolean not null default true,
  storage_region text not null default 'default',
  no_training_ai_policy_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_privacy_settings enable row level security;

revoke all on table public.user_privacy_settings from anon;
grant select, insert, update, delete on table public.user_privacy_settings to authenticated;

drop policy if exists "privacy settings own rows" on public.user_privacy_settings;
create policy "privacy settings own rows"
  on public.user_privacy_settings for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create index if not exists user_privacy_settings_region_idx
  on public.user_privacy_settings(storage_region);

comment on table public.user_privacy_settings is
  'User privacy controls. AI is opt-in and remote images are blocked by default.';

-- Keep the security event stream extensible while retaining an explicit allowlist.
alter table public.account_security_events
  drop constraint if exists account_security_events_event_type_check;
alter table public.account_security_events
  add constraint account_security_events_event_type_check check (event_type in (
    'login', 'logout', 'password_reset', 'account_suspended',
    'account_reactivated', 'session_revoked', 'passkey_added',
    'passkey_removed', 'mfa_enabled', 'mfa_disabled', 'group_created',
    'group_updated', 'group_deleted', 'privacy_settings_updated',
    'account_exported', 'account_deletion_requested'
  ));

