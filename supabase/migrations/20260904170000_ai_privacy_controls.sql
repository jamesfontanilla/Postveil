-- Opt-in AI controls and a minimal, user-visible audit trail.
-- AI tables are Worker-owned so mailbox text and provider configuration are
-- never exposed through the browser database client.

create table if not exists public.ai_user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  provider text not null default 'groq',
  model text not null default 'openai/gpt-oss-120b',
  local_endpoint text,
  retention_mode text not null default 'none',
  feature_flags jsonb not null default '{
    "thread_summary": false, "inbox_digest": false, "priority_detection": false,
    "suggested_replies": false, "draft_generation": false, "tone_rewrite": false,
    "grammar_correction": false, "translation": false, "action_item_extraction": false,
    "deadline_extraction": false, "meeting_extraction": false, "contact_extraction": false,
    "automatic_categorization": false, "semantic_search": false, "natural_language_search": false,
    "long_thread_qa": false, "attachment_summary": false, "inbox_cleanup": false,
    "duplicate_detection": false, "scam_explanation": false, "phishing_explanation": false,
    "writing_style": false
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_user_settings_provider_check check (provider in ('groq', 'byom', 'local')),
  constraint ai_user_settings_retention_check check (retention_mode in ('none', 'audit_only', 'thirty_days'))
);

create table if not exists public.ai_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  feature text not null,
  provider text not null default 'groq',
  model text,
  status text not null default 'completed',
  input_bytes integer not null default 0,
  output_bytes integer not null default 0,
  prompt_injection_detected boolean not null default false,
  action_confirmed boolean not null default false,
  retained_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_user_settings enable row level security;
alter table public.ai_audit_events enable row level security;
revoke all on table public.ai_user_settings, public.ai_audit_events from anon, authenticated;

create index if not exists ai_audit_events_owner_created_idx
  on public.ai_audit_events(owner_id, created_at desc);
create index if not exists ai_audit_events_message_idx
  on public.ai_audit_events(message_id, created_at desc);

comment on table public.ai_user_settings is
  'Per-user AI consent, provider mode, retention, and feature switches. Disabled by default.';
comment on table public.ai_audit_events is
  'Minimal audit metadata for AI requests. Mailbox text is never stored here.';
