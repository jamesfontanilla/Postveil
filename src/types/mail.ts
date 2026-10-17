import type { ReactNode } from "react";

export type SystemFolder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "spam" | "quarantine";
export type ViewKey = SystemFolder | "focused" | "other" | "important" | "snoozed" | "muted" | `custom:${string}`;

export const TURNSTILE_SITE_KEY = "0x4AAAAAAEqXXuhzdUlMoSuz";

export type MessageAttachment = {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  content_id?: string | null;
  detected_content_type?: string | null;
  preview_state?: "ready" | "not_available" | "pending" | "failed";
  safety_status?: "unknown" | "clean_static" | "suspicious" | "blocked" | "infected";
  safety_reasons?: string[];
};

export type Message = {
  id: string;
  thread_id: string;
  mailbox_id: string | null;
  direction: "inbound" | "outbound";
  folder: string;
  status: string;
  custom_folder_id?: string | null;
  previous_folder?: string | null;
  from_name?: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject: string;
  snippet: string;
  message_id_header?: string | null;
  in_reply_to?: string | null;
  references_header?: string | null;
  reply_to?: string | null;
  text_body?: string;
  html_body?: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_pinned?: boolean;
  is_flagged?: boolean;
  is_important?: boolean;
  is_muted?: boolean;
  is_ignored?: boolean;
  priority?: number;
  has_attachment?: boolean;
  spam_score?: number;
  spam_reasons?: string[];
  trust_score?: number | null;
  trust_reasons?: string[];
  trust_evidence?: Record<string, unknown>;
  auth_results?: Record<string, unknown>;
  auth_spf?: string | null;
  auth_dkim?: string | null;
  auth_dmarc?: string | null;
  auth_arc?: string | null;
  auth_tls?: string | null;
  received_auth_at?: string | null;
  sender_first_seen?: boolean | null;
  known_contact?: boolean | null;
  reply_to_mismatch?: boolean;
  link_count?: number;
  tracking_pixel_count?: number;
  screening_status?: "none" | "review" | "approved" | "blocked" | "rerouted" | string;
  screening_policy_id?: string | null;
  focused_category?: string;
  scheduled_at?: string | null;
  send_after?: string | null;
  cancelled_at?: string | null;
  snoozed_until?: string | null;
  work_state?: "none" | "reply_later" | "waiting_on" | "i_owe" | string | null;
  follow_up_at?: string | null;
  work_note?: string | null;
  reminder_at?: string | null;
  reminder_note?: string | null;
  unsubscribe_url?: string | null;
  retention_expires_at?: string | null;
  legal_hold?: boolean;
  received_at?: string;
  sent_at?: string;
  provider?: string | null;
  provider_message_id?: string | null;
  provider_event_id?: string | null;
  delivery_status?: string | null;
  delivery_error_code?: string | null;
  delivery_error?: string | null;
  next_delivery_at?: string | null;
  delivered_at?: string | null;
  delayed_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  delayed_count?: number;
  message_size_bytes?: number;
  max_size_bytes?: number;
  open_tracking_enabled?: boolean;
  click_tracking_enabled?: boolean;
  raw_object_key?: string | null;
  raw_headers?: Array<{ key?: string; value?: string }>;
  mime_parts?: Array<Record<string, unknown>>;
  created_at: string;
  attachments?: MessageAttachment[];
};

export type Contact = {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string | null;
  company?: string | null;
};

export type Mailbox = {
  id: string;
  owner_id?: string;
  address: string;
  display_name: string;
  is_default: boolean;
  can_send: boolean;
  can_receive?: boolean;
  is_shared?: boolean;
  can_send_as?: boolean;
  can_send_on_behalf?: boolean;
};

export type CustomFolder = { id: string; name: string; color: string; slug: string; parent_id?: string | null };
export type Label = { id: string; name: string; color: string; parent_id?: string | null; sort_order?: number };

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  color: string;
  sort_order: number;
  result_count?: number | null;
};

export type SearchHistoryItem = {
  id: string;
  query: string;
  normalized_query: string;
  usage_count: number;
  last_used_at: string;
};

export type SearchSuggestion = {
  kind: "recent" | "saved" | "label" | "contact" | "syntax";
  value: string;
  label: string;
  detail?: string;
};

export type MailPage = {
  items: Message[];
  total: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  normalizedQuery?: string;
};

export type SenderPolicy = {
  id: string;
  mailbox_id?: string | null;
  match_type: "address" | "domain";
  match_value: string;
  action: "inbox" | "spam" | "screen" | "archive" | "folder";
  target_folder_id?: string | null;
  enabled: boolean;
};

export type RetentionPolicy = {
  id: string;
  name: string;
  scope: "all" | "inbox" | "sent" | "trash" | "spam" | "quarantine" | string;
  retention_days: number;
  enabled: boolean;
};

export type ScreeningEvent = { id: string; decision: string; previous_folder?: string | null; created_at: string; restored_at?: string | null };
export type TrustData = Message & { screening_history?: ScreeningEvent[] };

export type Signature = {
  id: string;
  name: string;
  text_body: string;
  html_body?: string | null;
  mailbox_id?: string | null;
  is_default: boolean;
};

export type LinkInspection = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  chain?: Array<{ url: string; status: number; location?: string | null }>;
  warning?: string;
};

export type ComposeLibraryItem = {
  id: string;
  kind: "template" | "canned" | "snippet";
  name: string;
  subject?: string;
  text_body: string;
  html_body?: string | null;
  metadata?: Record<string, unknown>;
};

export type RuleConditionType =
  | "fromContains"
  | "toContains"
  | "ccContains"
  | "subjectContains"
  | "bodyContains"
  | "hasAttachment"
  | "isRead"
  | "isFlagged"
  | "isPinned";

export type RuleCondition = { type: RuleConditionType; value: string };

export type Rule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
};

export type RuleLabMatch = {
  id: string;
  subject: string;
  fromAddress: string;
  snippet: string;
  folder: string;
  reasons: string[];
  plannedActions: Record<string, unknown>;
};

export type RuleLabResult = {
  runId: string;
  mode: "preview" | "dry_run" | "apply";
  matchedCount: number;
  changedCount: number;
  matches?: RuleLabMatch[];
  impact?: { folders: Record<string, number>; labels: number; markRead: number; forwardCount: number; total: number };
  conflicts?: Array<{ severity: "error" | "warning"; message: string }>;
  failures?: Array<{ id: string; error: string }>;
  undoable?: boolean;
};

export type AutoReply = {
  id?: string;
  mailbox_id?: string;
  enabled: boolean;
  subject: string;
  body: string;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type AppSettings = {
  theme?: string;
  density?: string;
  reading_pane?: string;
  timezone?: string;
  focused_inbox_enabled?: boolean;
  desktop_notifications?: boolean;
  send_undo_seconds?: 0 | 10 | 20 | 30;
};

export type AdminMailbox = Mailbox & {
  owner_id: string;
  status: "active" | "suspended" | "archived" | string;
  quota_bytes: number;
  storage_used_bytes: number;
  sending_limit_daily: number;
  sending_used_today: number;
  inactivity_days: number;
};

export type AdminMember = {
  user_id: string;
  email: string;
  display_name: string;
  role: "owner" | "admin" | "member" | string;
  status: "active" | "suspended" | string;
  require_mfa: boolean;
  last_seen_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  banned_until?: string | null;
  storage_used_bytes: number;
  mailboxes: AdminMailbox[];
};

export type AdminOrganization = {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
};

export type AdminActivity = {
  id: string;
  email?: string;
  subject_user_id: string;
  event_type: string;
  is_suspicious: boolean;
  created_at: string;
  user_agent?: string | null;
};

export type AdminGroupMember = { id: string; member_email: string; member_user_id?: string | null; created_at?: string };

export type AdminGroup = {
  id: string;
  name: string;
  address: string;
  description: string;
  delivery_mode: "distribution" | "group" | string;
  enabled: boolean;
  members: AdminGroupMember[];
};

export type AdminOverview = {
  organization: AdminOrganization;
  members: AdminMember[];
  activity: AdminActivity[];
  groups: AdminGroup[];
  stats: { users: number; active_users: number; suspended_users: number; mailboxes: number; storage_used_bytes: number };
};

export type DeliveryOpsView = {
  providers: Array<{ provider: string; label: string; configured: boolean; circuit?: { status?: string; consecutive_failures?: number; last_latency_ms?: number; circuit_open_until?: string | null } | null }>;
  domains: Array<{ domain: string; score?: number; status?: string; sent_count?: number; bounced_count?: number; complaint_count?: number; daily_limit?: number; sent_used_today?: number }>;
  queue: { queued: number; retrying: number; running: number; dead: number };
  recentAttempts: Array<{ id?: string; provider?: string; status?: string; error_message?: string; started_at?: string }>;
};

export type Task = {
  id: string;
  title: string;
  notes: string;
  due_at?: string | null;
  priority: number;
  completed: boolean;
  source_message_id?: string | null;
};

export type WorkItem = Message & { overdue?: boolean };

export type WorkSummary = {
  reply_later: number;
  waiting_on: number;
  i_owe: number;
  overdue: number;
  total: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  all_day: boolean;
};

export type ComposeSeed = {
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
};

export type AppDialogOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AppPromptOptions = AppDialogOptions & {
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "password" | "email";
};

export type AppDialogRequest =
  | {
      type: "alert";
      options: AppDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: "confirm";
      options: AppDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: "prompt";
      options: AppPromptOptions;
      resolve: (value: string | null) => void;
    };

export type AppDialogResult = boolean | string | null;

export type AppDialogContextValue = {
  alert: (options: AppDialogOptions | string) => Promise<boolean>;
  confirm: (options: AppDialogOptions | string) => Promise<boolean>;
  prompt: (options: AppPromptOptions | string) => Promise<string | null>;
};

export type OnboardingStep = 0 | 1 | 2 | 3 | 4;

export type OnboardingState = {
  completed?: boolean;
  skipped?: boolean;
  step?: OnboardingStep;
  goal?: "personal" | "team" | "explore";
  domain?: string;
  mailboxLocal?: string;
  displayName?: string;
  dnsProvider?: string;
  mailboxAddress?: string;
  domainStatus?: "pending" | "verified" | "ready";
};

export type DomainRecord = {
  name?: string;
  type?: string;
  content?: string;
  priority?: number | null;
  ttl?: number | null;
  status?: string;
  purpose?: string;
};

export type DomainStatusResponse = {
  domain: string;
  ownershipVerified?: boolean;
  verified?: boolean;
  provider?: string | null;
  zoneId?: string | null;
  dnsReady?: boolean;
  routeReady?: boolean;
  automationStatus?: string;
  inboundRouteStatus?: string;
  routeTarget?: string | null;
  records?: DomainRecord[];
  manualRecords?: DomainRecord[];
  lastError?: string | null;
  expectedMxTargets?: string[];
  mailboxes?: Mailbox[];
  status?: string;
};

export type MfaFactor = { id: string; friendly_name?: string; factor_type: "totp" | "phone"; status: "verified" | "unverified" | string };
export type RecoveryMethod = { id: string; email_masked: string; verified_at: string | null; pending: boolean; last_sent_at?: string | null };
export type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string | null };

export const starterComposeLibrary: ComposeLibraryItem[] = [
  { id: "starter-welcome", kind: "template", name: "Warm introduction", subject: "Great to connect", text_body: "Hi {{first_name}},\n\nIt was great connecting with you. I wanted to follow up while this is fresh.\n\nBest,", html_body: "<p>Hi {{first_name}},</p><p>It was great connecting with you. I wanted to follow up while this is fresh.</p><p>Best,</p>" },
  { id: "starter-follow-up", kind: "template", name: "Project follow-up", subject: "Following up on {{company}}", text_body: "Hi {{first_name}},\n\nI’m following up on our conversation about {{company}}. Do you have time this week to continue?", html_body: "<p>Hi {{first_name}},</p><p>I’m following up on our conversation about {{company}}. Do you have time this week to continue?</p>" },
  { id: "starter-thanks", kind: "canned", name: "Thanks for reaching out", text_body: "Thanks for reaching out — I’ve received your message and will get back to you shortly." },
  { id: "starter-signoff", kind: "snippet", name: "Professional sign-off", text_body: "Best regards,\nJames" },
];

export type JsonSettings = Record<string, unknown>;
