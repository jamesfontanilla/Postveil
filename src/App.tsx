import {
  ChangeEvent,
  createContext,
  DragEvent,
  FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Bell,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  Flag,
  FolderPlus,
  Forward,
  HelpCircle,
  History,
  Inbox,
  ListTodo,
  LogOut,
  Maximize2,
  Mail,
  Menu,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  PenLine,
  Pin,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Undo2,
  UploadCloud,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "./lib/supabase";
import { sanitizeEmailHtml } from "./lib/email-html";
import { qrImageSource } from "./lib/qr";
import RichEmailBody from "./components/RichEmailBody";
import AiWorkspace from "./components/AiWorkspace";

type SystemFolder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "spam" | "quarantine";
type ViewKey = SystemFolder | "focused" | "other" | "important" | "snoozed" | "muted" | `custom:${string}`;
  type Message = {
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
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    byte_size: number;
    content_id?: string | null;
    detected_content_type?: string | null;
    preview_state?: "ready" | "not_available" | "pending" | "failed";
    safety_status?: "unknown" | "clean_static" | "suspicious" | "blocked" | "infected";
    safety_reasons?: string[];
  }>;
};
type Contact = {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string | null;
  company?: string | null;
};
type Mailbox = {
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
type CustomFolder = { id: string; name: string; color: string; slug: string; parent_id?: string | null };
type Label = { id: string; name: string; color: string; parent_id?: string | null; sort_order?: number };
type SavedSearch = {
  id: string;
  name: string;
  query: string;
  color: string;
  sort_order: number;
  result_count?: number | null;
};
type SearchHistoryItem = {
  id: string;
  query: string;
  normalized_query: string;
  usage_count: number;
  last_used_at: string;
};
type SearchSuggestion = {
  kind: "recent" | "saved" | "label" | "contact" | "syntax";
  value: string;
  label: string;
  detail?: string;
};
type MailPage = {
  items: Message[];
  total: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  normalizedQuery?: string;
};
type SenderPolicy = {
  id: string;
  mailbox_id?: string | null;
  match_type: "address" | "domain";
  match_value: string;
  action: "inbox" | "spam" | "screen" | "archive" | "folder";
  target_folder_id?: string | null;
  enabled: boolean;
};
type OrganizationBlock = {
  id: string;
  match_type: "address" | "domain";
  match_value: string;
  enabled: boolean;
};
type RetentionPolicy = {
  id: string;
  name: string;
  scope: "all" | "inbox" | "sent" | "trash" | "spam" | "quarantine" | string;
  retention_days: number;
  enabled: boolean;
};
type ScreeningEvent = { id: string; decision: string; previous_folder?: string | null; created_at: string; restored_at?: string | null };
type TrustData = Message & { screening_history?: ScreeningEvent[] };
type DeliveryInspection = { message: Message; attempts: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> };
type Signature = {
  id: string;
  name: string;
  text_body: string;
  html_body?: string | null;
  mailbox_id?: string | null;
  is_default: boolean;
};
type LinkInspection = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  chain?: Array<{ url: string; status: number; location?: string | null }>;
  warning?: string;
};
type ComposeLibraryItem = {
  id: string;
  kind: "template" | "canned" | "snippet";
  name: string;
  shared?: boolean;
  subject?: string;
  text_body: string;
  html_body?: string | null;
  metadata?: Record<string, unknown>;
};
type RuleConditionType =
  | "fromContains"
  | "toContains"
  | "ccContains"
  | "subjectContains"
  | "bodyContains"
  | "hasAttachment"
  | "isRead"
  | "isFlagged"
  | "isPinned"
  | "priority"
  | "folder"
  | "eventTypeContains";
type RuleCondition = { type: RuleConditionType; value: string };
type Rule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  scope?: "personal" | "organization";
  organization_id?: string | null;
  trigger_type?: "inbound" | "event" | "scheduled";
  schedule?: Record<string, unknown>;
  next_run_at?: string | null;
};
type RuleLabMatch = {
  id: string;
  subject: string;
  fromAddress: string;
  snippet: string;
  folder: string;
  reasons: string[];
  plannedActions: Record<string, unknown>;
};
type RuleLabResult = {
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
type RuleRun = {
  id: string;
  rule_id: string;
  mode: "preview" | "dry_run" | "apply" | "replay";
  status: string;
  matched_count: number;
  changed_count: number;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
};
type AutoReply = {
  id?: string;
  mailbox_id?: string;
  enabled: boolean;
  subject: string;
  body: string;
  starts_at?: string | null;
  ends_at?: string | null;
};
type AppSettings = {
  theme?: string;
  density?: string;
  reading_pane?: string;
  timezone?: string;
  focused_inbox_enabled?: boolean;
  desktop_notifications?: boolean;
  send_undo_seconds?: 0 | 10 | 20 | 30;
};
type PrivacySettings = {
  owner_id: string;
  ai_processing_enabled: boolean;
  login_alerts_enabled: boolean;
  remote_images_enabled: boolean;
  privacy_analytics_enabled: boolean;
  metadata_minimization_enabled: boolean;
  external_portal_enabled: boolean;
  storage_region: string;
  no_training_ai_policy_acknowledged: boolean;
};
type SecurityActivity = {
  id: string;
  eventType: string;
  sessionId?: string | null;
  ipFingerprint?: string | null;
  userAgent?: string | null;
  suspicious: boolean;
  details?: Record<string, unknown>;
  createdAt: string;
};
type SecurityOverview = { privacy: PrivacySettings; activity: SecurityActivity[] };
type AdminMailbox = Mailbox & {
  owner_id: string;
  status: "active" | "suspended" | "archived" | string;
  quota_bytes: number;
  storage_used_bytes: number;
  sending_limit_daily: number;
  sending_used_today: number;
  inactivity_days: number;
};
type AdminMember = {
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
type AdminOrganization = {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
};
type AdminActivity = {
  id: string;
  email?: string;
  subject_user_id: string;
  event_type: string;
  is_suspicious: boolean;
  created_at: string;
  user_agent?: string | null;
};
type AdminGroupMember = { id: string; member_email: string; member_user_id?: string | null; created_at?: string };
type AdminGroup = { id: string; name: string; address: string; description: string; delivery_mode: "distribution" | "group" | string; enabled: boolean; members: AdminGroupMember[] };
type AdminOverview = {
  organization: AdminOrganization;
  members: AdminMember[];
  activity: AdminActivity[];
  groups: AdminGroup[];
  stats: { users: number; active_users: number; suspended_users: number; mailboxes: number; storage_used_bytes: number };
};
type DeliveryOpsView = {
  providers: Array<{ provider: string; label: string; configured: boolean; circuit?: { status?: string; consecutive_failures?: number; last_latency_ms?: number; circuit_open_until?: string | null } | null }>;
  domains: Array<{ domain: string; score?: number; status?: string; sent_count?: number; bounced_count?: number; complaint_count?: number; daily_limit?: number; sent_used_today?: number }>;
  queue: { queued: number; retrying: number; running: number; dead: number };
  recentAttempts: Array<{ id?: string; provider?: string; status?: string; error_message?: string; started_at?: string }>;
};
type Task = {
  id: string;
  title: string;
  notes: string;
  due_at?: string | null;
  priority: number;
  completed: boolean;
  source_message_id?: string | null;
  project_id?: string | null;
  assignee_id?: string | null;
  status?: "todo" | "in_progress" | "blocked" | "done";
  position?: number;
};
type WorkItem = Message & { overdue?: boolean };
type WorkSummary = {
  reply_later: number;
  waiting_on: number;
  i_owe: number;
  overdue: number;
  total: number;
};
type CollaborationMember = { user_id: string; email: string; display_name: string; role: string; status: string };
type CollaborationThreadState = { id?: string; owner_id: string; organization_id: string; thread_id: string; status: "new" | "open" | "pending" | "resolved" | "closed"; priority: "low" | "normal" | "high" | "urgent"; assignee_id?: string | null; sla_due_at?: string | null; sla_breached_at?: string | null };
type CollaborationComment = { id: string; body: string; kind: "comment" | "note"; visibility: "team" | "private"; author_id?: string; author?: CollaborationMember | null; mentioned_user_ids?: string[]; created_at: string; deleted_at?: string | null };
type CollaborationActivity = { id: string; event_type: string; payload?: Record<string, unknown>; actor?: CollaborationMember | null; created_at: string };
type CollaborationPresence = { user_id: string; state: "viewing" | "composing" | "idle"; last_seen_at: string; member?: CollaborationMember | null };
type CollaborationData = { thread: CollaborationThreadState; assignment?: Record<string, unknown> | null; comments: CollaborationComment[]; activity: CollaborationActivity[]; presence: CollaborationPresence[]; members: CollaborationMember[] };
type CollaborationOverview = { organization: { id: string; name: string }; members: CollaborationMember[]; sharedItems: Array<{ id: string; kind: string; name: string; payload: Record<string, unknown> }>; policies: Array<{ id: string; name: string; kind: string; priority: number; enabled: boolean; conditions: Record<string, unknown>; actions: Record<string, unknown> }>; activity: CollaborationActivity[]; analytics: { totalThreads: number; assignedThreads: number; unassignedThreads: number; slaBreached: number; statusCounts: Record<string, number>; priorityCounts: Record<string, number> } };
type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  all_day: boolean;
  calendar_id?: string | null;
  timezone?: string | null;
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
  reminders?: Array<{ minutes?: number; method?: string }>;
  visibility?: "private" | "shared";
  status?: "tentative" | "confirmed" | "cancelled";
  conference_url?: string | null;
  attendees?: Array<{ id?: string; email: string; display_name?: string; response?: string }>;
};
type WorkspaceCalendar = { id: string; owner_id: string; organization_id?: string | null; name: string; slug: string; color: string; timezone: string; visibility: "private" | "shared"; is_default: boolean };
type ContactGroup = { id: string; name: string; color?: string; contact_ids?: string[] };
type WorkspaceProject = { id: string; name: string; description: string; color: string; status: string; organization_id?: string | null };
type SchedulingLink = { id: string; title: string; slug: string; description?: string; duration_minutes: number; timezone: string; active: boolean; calendar_id?: string | null };
type WorkspaceOverview = { calendars: WorkspaceCalendar[]; events: CalendarEvent[]; contacts: Contact[]; groups: ContactGroup[]; projects: WorkspaceProject[]; tasks: Task[]; schedulingLinks: SchedulingLink[] };
type ComposeSeed = {
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
};

const starterComposeLibrary: ComposeLibraryItem[] = [
  { id: "starter-welcome", kind: "template", name: "Warm introduction", subject: "Great to connect", text_body: "Hi {{first_name}},\n\nIt was great connecting with you. I wanted to follow up while this is fresh.\n\nBest,", html_body: "<p>Hi {{first_name}},</p><p>It was great connecting with you. I wanted to follow up while this is fresh.</p><p>Best,</p>" },
  { id: "starter-follow-up", kind: "template", name: "Project follow-up", subject: "Following up on {{company}}", text_body: "Hi {{first_name}},\n\nI’m following up on our conversation about {{company}}. Do you have time this week to continue?", html_body: "<p>Hi {{first_name}},</p><p>I’m following up on our conversation about {{company}}. Do you have time this week to continue?</p>" },
  { id: "starter-thanks", kind: "canned", name: "Thanks for reaching out", text_body: "Thanks for reaching out — I’ve received your message and will get back to you shortly." },
  { id: "starter-signoff", kind: "snippet", name: "Professional sign-off", text_body: "Best regards,\nJames" },
];

function markdownToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.startsWith("<h") ? paragraph : `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function zonedLocalToIso(value: string, timeZone: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = parts;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const zoned = Object.fromEntries(formatter.formatToParts(new Date(naive)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(zoned.year), Number(zoned.month) - 1, Number(zoned.day), Number(zoned.hour) % 24, Number(zoned.minute));
  return new Date(naive - (asUtc - naive)).toISOString();
}

const folderNames: Record<SystemFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
  spam: "Spam",
  quarantine: "Quarantine",
};
const folderIcons: Record<SystemFolder, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: PenLine,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
  quarantine: ShieldAlert,
};

function displayName(address: string) {
  return address.split("@")[0] || address;
}
function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]) : [value.trim()[0] || "?"]).join("").toUpperCase();
}
function avatarGradient(email: string) {
  let hash = 0;
  for (const character of email) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 68% 58%), hsl(${(hue + 42) % 360} 72% 42%))` };
}
function storedBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}
function SenderAvatar({ name, email, avatarUrl, large = false }: { name: string; email: string; avatarUrl?: string | null; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className={`avatar ${large ? "large-avatar" : "row-avatar"} ${avatarUrl && !imageFailed ? "avatar-image" : ""}`} style={avatarUrl && !imageFailed ? undefined : avatarGradient(email)} aria-label={`${name} profile picture`}>
      {avatarUrl && !imageFailed ? <img src={avatarUrl} alt="" width={large ? 37 : 29} height={large ? 37 : 29} onError={() => setImageFailed(true)} /> : initials(name || email)}
    </div>
  );
}
function contactFor(address: string, contacts: Contact[]) {
  return contacts.find((contact) => contact.email.toLowerCase() === address.toLowerCase());
}
function senderForMessage(message: Message, contacts: Contact[], mailboxes: Mailbox[]) {
  const address = message.direction === "inbound" ? message.from_address : message.to_addresses?.[0] || message.from_address;
  const contact = contactFor(address, contacts);
  const mailbox = mailboxes.find((item) => item.address.toLowerCase() === message.from_address.toLowerCase());
  const name = message.direction === "inbound"
    ? contact?.display_name?.trim() || message.from_name?.trim() || displayName(address)
    : contact?.display_name?.trim() || mailbox?.display_name?.trim() || displayName(address);
  return { name, email: address, avatarUrl: contact?.avatar_url || null };
}
function detailIdentityForMessage(message: Message, contacts: Contact[], mailboxes: Mailbox[]) {
  if (message.direction === "inbound") return senderForMessage(message, contacts, mailboxes);
  const mailbox = mailboxes.find((item) => item.address.toLowerCase() === message.from_address.toLowerCase());
  return {
    name: message.from_name?.trim() || mailbox?.display_name?.trim() || displayName(message.from_address),
    email: message.from_address,
    avatarUrl: null,
  };
}
function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function messageStatusLabel(message: Message) {
  if (message.cancelled_at) return "Cancelled";
  if (message.direction === "inbound" && message.status === "queued") return "Receiving";
  if (message.direction === "outbound" && message.status === "queued") return "Sending";
  if (message.status === "received") return "Received";
  if (message.status === "sent") return "Sent";
  if (message.status === "delivered") return "Delivered";
  if (message.status === "failed") return "Failed";
  if (message.status === "bounced") return "Bounced";
  if (message.status === "scheduled") return "Scheduled";
  return message.status;
}
function workStateLabel(state?: string | null) {
  if (state === "reply_later") return "Reply later";
  if (state === "waiting_on") return "Waiting on";
  if (state === "i_owe") return "I owe";
  return "No work state";
}
function workDueLabel(value?: string | null) {
  if (!value) return "No follow-up date";
  const date = new Date(value);
  return date.getTime() <= Date.now() ? `Overdue · ${date.toLocaleString()}` : `Follow up · ${date.toLocaleString()}`;
}
function splitQuotedBody(value: string) {
  const lines = value.split(/\r?\n/);
  const quoteStart = lines.findIndex((line, index) =>
    index > 0 && (/^On .+wrote:\s*$/i.test(line.trim()) || /^>/.test(line.trim())),
  );
  if (quoteStart < 0) return { body: value.trim(), quote: "" };
  return {
    body: lines.slice(0, quoteStart).join("\n").trim(),
    quote: lines.slice(quoteStart).join("\n").trim(),
  };
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { authorization: `Bearer ${session.access_token}` }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload);
  return payload as T;
}

async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const form = new FormData();
  form.append("file", file);
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(path, {
    method: "POST",
    body: form,
    headers: session?.access_token
      ? { authorization: `Bearer ${session.access_token}` }
      : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `Upload failed (${response.status})`);
  return payload as T;
}

async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

type AppDialogOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type AppPromptOptions = AppDialogOptions & {
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "email";
};

type AppDialogRequest =
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
    }
  | {
      kind: "prompt";
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      defaultValue: string;
      placeholder: string;
      inputType: "text" | "number" | "email";
    };

type AppDialogResult = boolean | string | null;

type AppDialogContextValue = {
  confirm: (options: AppDialogOptions) => Promise<boolean>;
  prompt: (options: AppPromptOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("The Postveil dialog system is unavailable");
  return context;
}

function AppDialog({
  dialog,
  onResolve,
}: {
  dialog: AppDialogRequest | null;
  onResolve: (value: AppDialogResult) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!dialog) return;
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setValue(dialog.kind === "prompt" ? dialog.defaultValue : "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      );
      firstFocusable?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActiveRef.current && document.contains(previousActiveRef.current)) previousActiveRef.current.focus();
    };
  }, [dialog]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onResolve(dialog.kind === "prompt" ? null : false);
      return;
    }
    if (dialog.kind === "prompt" && event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      onResolve(value);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      ) ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!dialog) return null;
  const darkThemeActive = typeof document !== "undefined" && Boolean(document.querySelector(".theme-dark"));
  return (
    <div className={`app-dialog-backdrop${darkThemeActive ? " theme-dark-dialog" : ""}`} role="presentation">
      <section
        ref={dialogRef}
        className={`app-dialog${dialog.danger ? " app-dialog-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="postveil-dialog-title"
        aria-describedby="postveil-dialog-message"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="app-dialog-icon" aria-hidden="true"><AlertTriangle size={21} /></div>
        <div className="app-dialog-copy">
          <p className="app-dialog-kicker">{dialog.danger ? "CONFIRM ACTION" : "CHECK THIS FIRST"}</p>
          <h2 id="postveil-dialog-title">{dialog.title}</h2>
          <p id="postveil-dialog-message">{dialog.message}</p>
          {dialog.kind === "prompt" && (
            <input
              className="app-dialog-input"
              type={dialog.inputType}
              value={value}
              placeholder={dialog.placeholder}
              onChange={(event) => setValue(event.target.value)}
              aria-label={dialog.title}
            />
          )}
        </div>
        <div className="app-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => onResolve(dialog.kind === "prompt" ? null : false)}>
            {dialog.cancelLabel}
          </button>
          <button
            className={dialog.danger ? "app-dialog-danger-button" : "primary-button"}
            type="button"
            onClick={() => onResolve(dialog.kind === "prompt" ? value : true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AppDialogRequest | null>(null);
  const resolverRef = useRef<((value: AppDialogResult) => void) | null>(null);

  const resolveDialog = useCallback((value: AppDialogResult) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(value);
  }, []);

  const confirm = useCallback((options: AppDialogOptions) => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = (value) => resolve(value === true);
    setDialog({
      kind: "confirm",
      title: options.title || "Are you sure?",
      message: options.message,
      confirmLabel: options.confirmLabel || "Continue",
      cancelLabel: options.cancelLabel || "Cancel",
      danger: options.danger ?? false,
    });
  }), []);

  const prompt = useCallback((options: AppPromptOptions) => new Promise<string | null>((resolve) => {
    resolverRef.current?.(null);
    resolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
    setDialog({
      kind: "prompt",
      title: options.title || "Enter a value",
      message: options.message,
      confirmLabel: options.confirmLabel || "Save",
      cancelLabel: options.cancelLabel || "Cancel",
      danger: options.danger ?? false,
      defaultValue: options.defaultValue || "",
      placeholder: options.placeholder || "",
      inputType: options.inputType || "text",
    });
  }), []);

  useEffect(() => () => {
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const contextValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      <AppDialog dialog={dialog} onResolve={resolveDialog} />
    </AppDialogContext.Provider>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "recovery">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [ssoDomain, setSsoDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function startSocialLogin(provider: "google" | "azure" | "github") {
    setBusy(true);
    setError("");
    try {
      const result = await requireSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      if (result.error) throw result.error;
      if (result.data?.url) window.location.assign(result.data.url);
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "That sign-in provider is not available");
      setBusy(false);
    }
  }
  async function startOrganizationSso() {
    const domain = ssoDomain.trim().toLowerCase().replace(/^@/, "");
    if (!domain || !domain.includes(".")) { setError("Enter your organization email domain, such as company.com"); return; }
    setBusy(true);
    setError("");
    try {
      const result = await requireSupabase().auth.signInWithSSO({ domain });
      if (result.error) throw result.error;
      if (result.data?.url) window.location.assign(result.data.url);
    } catch (ssoError) {
      setError(ssoError instanceof Error ? ssoError.message : "Organization SSO is not configured for that domain");
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = requireSupabase();
      if (mode === "forgot") {
        const redirectTo = window.location.origin;
        const reset = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (reset.error) throw reset.error;
        await publicApiFetch("/api/auth/recovery-request", {
          method: "POST",
          body: JSON.stringify({ email }),
        }).catch(() => undefined);
        setNotice("If that address is registered, a reset link will arrive shortly. Check your inbox and spam folder.");
      } else if (mode === "recovery") {
        await publicApiFetch("/api/auth/mfa-recovery", { method: "POST", body: JSON.stringify({ email, code: recoveryCode }) });
        setNotice("If the details are valid, a recovery link will arrive shortly. Check your inbox.");
      } else {
        const result = mode === "signin"
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({ email, password });
        if (result.error) throw result.error;
        if (mode === "signup" && !result.data.session)
          setNotice("Check your inbox to confirm the account, then sign in here.");
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Authentication failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PRIVATE MAIL / {new Date().getFullYear()}</p>
        <h1>{mode === "forgot" || mode === "recovery" ? "Get back in safely." : "Keep your address close."}</h1>
        <p className="auth-copy">
          {mode === "forgot"
            ? "We’ll send a one-time reset link to your sign-in address or a verified recovery email."
            : mode === "recovery"
              ? "Use one unused recovery code to request a one-time password reset link."
            : "A focused mailbox for your custom domain. Sign in to open messages across desktop and mobile."}
        </p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          {mode !== "forgot" && mode !== "recovery" && <label>
              Password
              <input
                type="password"
                required
                minLength={mode === "signup" ? 12 : 6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "12+ characters with a number" : "Your password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </label>}
          {mode === "recovery" && <label>
            Recovery code
            <input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase().replace(/[^A-Z2-9-]/g, "").slice(0, 14))} placeholder="ABCD-EFGH-JKLM" autoComplete="one-time-code" />
          </label>}
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Working…" : mode === "forgot" ? "Send reset link" : mode === "recovery" ? "Request recovery link" : mode === "signin" ? "Open mailbox" : "Create account"}
          </button>
        </form>
        {mode === "signin" && (
          <div className="auth-sso" aria-label="Single sign-on options">
            <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
            <div className="auth-provider-grid">
              <button type="button" className="secondary-button" onClick={() => void startSocialLogin("google")} disabled={busy}>Google</button>
              <button type="button" className="secondary-button" onClick={() => void startSocialLogin("azure")} disabled={busy}>Microsoft</button>
              <button type="button" className="secondary-button" onClick={() => void startSocialLogin("github")} disabled={busy}>GitHub</button>
            </div>
            <div className="auth-sso-domain">
              <label>Organization SSO domain<input value={ssoDomain} onChange={(event) => setSsoDomain(event.target.value)} placeholder="company.com" autoComplete="organization" /></label>
              <button type="button" className="text-button" onClick={() => void startOrganizationSso()} disabled={busy || !ssoDomain.trim()}>Use SAML / custom OIDC SSO</button>
            </div>
            <small className="auth-sso-note">Providers must be enabled in the project’s Supabase Auth settings. Postveil never receives provider passwords.</small>
          </div>
        )}
        {mode === "signin" && <button className="text-button auth-link" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Forgot your password?</button>}
        {mode === "signin" && <button className="text-button auth-link" onClick={() => { setMode("recovery"); setError(""); setNotice(""); }}>Use a recovery code</button>}
        {mode !== "forgot" && mode !== "recovery" && <button className="text-button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setNotice(""); }}>
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>}
        {(mode === "forgot" || mode === "recovery") && <button className="text-button" onClick={() => { setMode("signin"); setError(""); setNotice(""); setRecoveryCode(""); }}>Back to sign in</button>}
      </section>
      <aside className="auth-aside">
        <div className="aside-note">
          <span className="status-dot" /> system ready
        </div>
        <p className="aside-quote">
          “The inbox is the room where your attention either gathers or
          scatters.”
        </p>
        <p className="aside-meta">
          Your messages stay private, organized, and addressed to the names you
          chose.
        </p>
      </aside>
    </main>
  );
}

function PasswordResetScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 12 characters with at least one letter and one number.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await requireSupabase().auth.updateUser({ password });
      if (result.error) throw result.error;
      setNotice("Password updated. Sign in again with your new password.");
      setCompleted(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password.</h1>
        <p className="auth-copy">This link is temporary. Set a strong password, then sign in again on your other devices.</p>
        <form onSubmit={submit} className="auth-form">
          <label>New password<input type="password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="12+ characters with a number" /></label>
          <label>Confirm new password<input type="password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" placeholder="Type it again" /></label>
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          {completed ? <button type="button" className="primary-button" onClick={onComplete}>Continue to mailbox</button> : <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>}
        </form>
      </section>
      <aside className="auth-aside"><div className="aside-note"><span className="status-dot" /> protected recovery</div><p className="aside-quote">One link. One new password. Back to your mailbox.</p><p className="aside-meta">Postveil never reveals whether an email address has an account.</p></aside>
    </main>
  );
}

type MfaFactor = { id: string; friendly_name?: string; factor_type: "totp" | "phone"; status: "verified" | "unverified" | string };
type RecoveryMethod = { id: string; email_masked: string; verified_at: string | null; pending: boolean; last_sent_at?: string | null };
type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string | null };

function MfaChallengeScreen({ onVerified }: { onVerified: () => void }) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void requireSupabase().auth.mfa.listFactors().then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message);
      const verified = ([...(data?.totp || []), ...(data?.phone || [])] as MfaFactor[]).filter((item) => item.status === "verified");
      setFactors(verified);
      setFactorId(verified[0]?.id || "");
    });
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId || code.replace(/\D/g, "").length !== 6) { setError("Enter the six-digit code from your authenticator app."); return; }
    setBusy(true);
    setError("");
    try {
      const challenge = await requireSupabase().auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await requireSupabase().auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.replace(/\D/g, "") });
      if (verified.error) throw verified.error;
      const refreshed = await requireSupabase().auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      onVerified();
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "That code was not accepted");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell"><section className="auth-card"><div className="brand-mark">P</div><p className="eyebrow">SECOND STEP</p><h1>Confirm it’s you.</h1><p className="auth-copy">Open your authenticator app and enter the six-digit code to continue to Postveil.</p>{factors.length > 1 && <label>Authenticator<select value={factorId} onChange={(event) => setFactorId(event.target.value)}>{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name || "Authenticator app"}</option>)}</select></label>}<form onSubmit={submit} className="auth-form"><label>Authentication code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button" disabled={busy || !factorId}>{busy ? "Checking…" : "Verify and open mailbox"}</button></form><button className="text-button" onClick={() => void requireSupabase().auth.signOut()}>Sign out</button></section><aside className="auth-aside"><div className="aside-note"><span className="status-dot" /> two-step verification</div><p className="aside-quote">Your password is only the first lock.</p><p className="aside-meta">Keep your authenticator app available. Recovery email is for resetting access, not a replacement for the second factor.</p></aside></main>
  );
}

function LegacyCompose({
  mailboxes,
  signatures,
  undoSeconds,
  seed,
  onClose,
  onSent,
}: {
  mailboxes: Mailbox[];
  signatures: Signature[];
  undoSeconds: 0 | 10 | 20 | 30;
  seed?: ComposeSeed;
  onClose: () => void;
  onSent: () => void;
}) {
  const defaultMailbox =
    mailboxes.find((mailbox) => mailbox.is_default) || mailboxes[0];
  const [fromAddress, setFromAddress] = useState(defaultMailbox?.address || "");
  const [sendMode, setSendMode] = useState<"send_as" | "send_on_behalf">("send_as");
  const [to, setTo] = useState(seed?.to || "");
  const [cc, setCc] = useState(seed?.cc || "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(seed?.subject || "");
  const [text, setText] = useState(seed?.text || "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [draftId, setDraftId] = useState(seed?.draftId || "");
  const [attachments, setAttachments] = useState<
    Array<{
      filename: string;
      object_key: string;
      byte_size: number;
      content_type?: string;
    }>
  >([]);
  const [signatureId, setSignatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(seed?.cc));
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [openTrackingEnabled, setOpenTrackingEnabled] = useState(false);
  const [clickTrackingEnabled, setClickTrackingEnabled] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<Array<{ code: string; title: string; detail: string }>>([]);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedMailbox = mailboxes.find((mailbox) => mailbox.address === fromAddress);
  useEffect(() => {
    if (!selectedMailbox?.is_shared) { setSendMode("send_as"); return; }
    if (sendMode === "send_as" && selectedMailbox.can_send_as) return;
    if (sendMode === "send_on_behalf" && selectedMailbox.can_send_on_behalf) return;
    setSendMode(selectedMailbox.can_send_as ? "send_as" : "send_on_behalf");
  }, [selectedMailbox?.id, selectedMailbox?.is_shared, selectedMailbox?.can_send_as, selectedMailbox?.can_send_on_behalf, sendMode]);
  const saveDraft = useCallback(async () => {
    if (!fromAddress || (!to.trim() && !subject.trim() && !text.trim())) return;
    setSaving(true);
    try {
      const saved = await apiFetch<Message>("/api/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: draftId || undefined,
          fromAddress,
          to,
          cc,
          bcc,
          subject,
          text,
        }),
      });
      if (saved?.id) setDraftId(saved.id);
      setLastSavedAt(new Date());
    } catch (draftError) {
      setError(
        draftError instanceof Error
          ? draftError.message
          : "Draft could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }, [bcc, cc, draftId, fromAddress, subject, text, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => void saveDraft(), 3000);
    return () => window.clearTimeout(timer);
  }, [saveDraft]);
  function chooseSignature(id: string) {
    setSignatureId(id);
    const signature = signatures.find((item) => item.id === id);
    if (signature && !text.includes(signature.text_body))
      setText(
        (current) => `${current}${current ? "\n\n" : ""}${signature.text_body}`,
      );
  }
  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading((current) => current + files.length);
    setError("");
    for (const file of files) {
      try {
        const item = await apiUpload<{
          filename: string;
          object_key: string;
          byte_size: number;
          content_type?: string;
        }>("/api/attachments", file, { fromAddress });
        setAttachments((current) => [...current, item]);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Attachment upload failed",
        );
      } finally {
        setUploading((current) => Math.max(0, current - 1));
      }
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    await uploadFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }
  function removeAttachment(objectKey: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.object_key !== objectKey),
    );
  }
  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }
  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setIsDragging(false);
  }
  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    await uploadFiles(Array.from(event.dataTransfer.files));
  }
  function draftStatus() {
    if (saving) return "Saving draft…";
    if (uploading) return `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…`;
    if (lastSavedAt) return `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (draftId) return "Draft saved";
    return "Draft saves automatically";
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/send", {
        method: "POST",
        body: JSON.stringify({
          fromAddress,
          sendMode,
          to,
          cc,
          bcc,
          subject,
          text,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          undoSendSeconds: undoSeconds,
          idempotencyKey: idempotencyKeyRef.current,
          warningsAcknowledged: warnings.map((warning) => warning.code),
          threadId: seed?.threadId,
          inReplyTo: seed?.inReplyTo,
          references: seed?.references,
          attachments,
          openTrackingEnabled,
          clickTrackingEnabled,
        }),
      });
      onSent();
      onClose();
    } catch (sendError) {
      if (sendError instanceof ApiError && Array.isArray(sendError.payload.warnings)) {
        setWarnings(sendError.payload.warnings as Array<{ code: string; title: string; detail: string }>);
        setError("");
      } else {
        setError(
          sendError instanceof Error
            ? sendError.message
            : "The message could not be sent",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  if (isMinimized) {
    return (
      <div className="compose-minimized" role="dialog" aria-label="Minimized draft">
        <button
          type="button"
          className="compose-minimized-main"
          onClick={() => setIsMinimized(false)}
        >
          <span className="compose-minimized-dot" />
          <span>
            <strong>{subject.trim() || "New message"}</strong>
            <small>{draftStatus()}</small>
          </span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close draft"
          title="Close draft"
        >
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="compose-overlay" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <form
        className={`compose-card${isExpanded ? " compose-card-expanded" : ""}`}
        onSubmit={send}
      >
        <div className="compose-head">
          <div>
            <p className="eyebrow">
              {seed?.to ? "REPLY / FORWARD" : "NEW MESSAGE"}
            </p>
            <h2 id="compose-title">{seed?.to ? "Continue the thread" : "New message"}</h2>
            <span className="compose-subtitle">
              {seed?.to ? "Your reply stays connected to this conversation." : "A private message from your mailbox."}
            </span>
          </div>
          <div className="compose-head-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize draft"
              title="Minimize draft"
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              className="icon-button compose-expand-button"
              onClick={() => setIsExpanded((current) => !current)}
              aria-label={isExpanded ? "Restore compose size" : "Expand compose"}
              title={isExpanded ? "Restore compose size" : "Expand compose"}
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close draft"
              title="Close draft"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="compose-fields">
          <div className="compose-recipient-row">
            <label className="compose-field-inline">
              From
              <select
                value={fromAddress}
                onChange={(event) => setFromAddress(event.target.value)}
                name="from"
              >
                {mailboxes
                  .filter((mailbox) => mailbox.can_send)
                  .map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.address}>
                      {mailbox.display_name ? `${mailbox.display_name} · ${mailbox.address}` : mailbox.address}
                    </option>
                  ))}
              </select>
            </label>
            {selectedMailbox?.is_shared && (
              <label className="compose-field-inline">
                Send mode
                <select value={sendMode} onChange={(event) => setSendMode(event.target.value as "send_as" | "send_on_behalf")}>
                  {selectedMailbox.can_send_as && <option value="send_as">Send as</option>}
                  {selectedMailbox.can_send_on_behalf && <option value="send_on_behalf">Send on behalf</option>}
                </select>
              </label>
            )}
            <button
              type="button"
              className="compose-recipient-toggle"
              onClick={() => setShowCcBcc((current) => !current)}
              aria-expanded={showCcBcc}
            >
              {showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
            </button>
          </div>
          <label>
            To
            <input
              required
              name="to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="recipient@example.com…"
              autoComplete="email"
            />
          </label>
          {showCcBcc && (
            <div className="compose-recipient-grid">
              <label>
                Cc
                <input
                  name="cc"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="Optional…"
                  autoComplete="email"
                />
              </label>
              <label>
                Bcc
                <input
                  name="bcc"
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  placeholder="Optional…"
                  autoComplete="email"
                />
              </label>
            </div>
          )}
          <label>
            Subject
            <input
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="What is this about?"
            />
          </label>
          <label className="message-input">
            Message
            <textarea
              required
              name="message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Start writing…"
              rows={isExpanded ? 13 : 8}
            />
          </label>
        </div>
        <div className="compose-option-row">
          <button
            type="button"
            className="compose-option-button"
            onClick={() => setShowMoreOptions((current) => !current)}
            aria-expanded={showMoreOptions}
          >
            <MoreHorizontal size={15} /> More options
          </button>
          {showMoreOptions && signatures.length > 0 && (
            <label className="compose-signature-select">
              <Tag size={14} aria-hidden="true" />
              <span className="sr-only">Signature</span>
              <select
                value={signatureId}
                onChange={(event) => chooseSignature(event.target.value)}
                aria-label="Add signature"
              >
                <option value="">Add signature</option>
                {signatures.map((signature) => (
                  <option key={signature.id} value={signature.id}>
                    {signature.name}
                  </option>
                ))}
              </select>
            </label>
          )}
           {showMoreOptions && (
             <label className="schedule-field">
              <Clock3 size={14} aria-hidden="true" />
              <span>Send later</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                aria-label="Schedule send"
               />
             </label>
           )}
           {showMoreOptions && (
             <div className="compose-tracking-controls" aria-label="Tracking controls">
               <label className="checkbox-row"><input type="checkbox" checked={openTrackingEnabled} onChange={(event) => setOpenTrackingEnabled(event.target.checked)} /> Track opens</label>
               <label className="checkbox-row"><input type="checkbox" checked={clickTrackingEnabled} onChange={(event) => setClickTrackingEnabled(event.target.checked)} /> Track link clicks</label>
             </div>
           )}
         </div>
        <div
          className={`attachment-dropzone${isDragging ? " is-dragging" : ""}`}
          role="group"
          aria-label="Attachment drop zone"
          aria-describedby="attachment-help"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(event) => void handleDrop(event)}
        >
          <UploadCloud size={18} aria-hidden="true" />
          <div>
            <strong>{isDragging ? "Drop files to attach" : "Add attachments"}</strong>
            <span id="attachment-help">Drag files here or choose from your device · 15 MB each</span>
          </div>
          <label className="file-button">
            <Paperclip size={15} /> Attach files
            <input ref={fileInputRef} type="file" multiple onChange={upload} />
          </label>
        </div>
        {warnings.length > 0 && (
          <div className="compose-warning" role="alert">
            <div className="compose-warning-head"><AlertTriangle size={15} /><strong>Review before sending</strong></div>
            {warnings.map((warning) => <p key={warning.code}><strong>{warning.title}.</strong> {warning.detail}</p>)}
            <small>Send again to confirm these checks.</small>
          </div>
        )}
        <div className="attachment-strip" aria-live="polite">
          {attachments.map((attachment) => (
            <span className="attachment-chip" key={attachment.object_key}>
              <Paperclip size={13} aria-hidden="true" />
              <span className="attachment-chip-copy">
                <strong>{attachment.filename}</strong>
                <small>{formatBytes(attachment.byte_size)}</small>
              </span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(attachment.object_key)}
                aria-label={`Remove ${attachment.filename}`}
                title={`Remove ${attachment.filename}`}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        {error && <div className="form-error compose-error">{error}</div>}
        <div className="compose-foot">
          <span className="compose-hint" aria-live="polite">
            <span className={`save-dot${saving ? " is-saving" : ""}`} />
            {draftStatus()}
          </span>
          <button className="primary-button" disabled={busy || uploading > 0}>
            <Send size={15} />{" "}
            {busy ? "Sending…" : scheduledAt ? "Schedule send" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Compose({
  mailboxes,
  signatures,
  contacts,
  undoSeconds,
  seed,
  onClose,
  onSent,
}: {
  mailboxes: Mailbox[];
  signatures: Signature[];
  contacts: Contact[];
  undoSeconds: 0 | 10 | 20 | 30;
  seed?: ComposeSeed;
  onClose: () => void;
  onSent: () => void;
}) {
  const { prompt } = useAppDialog();
  const defaultMailbox = mailboxes.find((mailbox) => mailbox.is_default) || mailboxes[0];
  const [fromAddress, setFromAddress] = useState(defaultMailbox?.address || "");
  const [sendMode, setSendMode] = useState<"send_as" | "send_on_behalf">("send_as");
  const [to, setTo] = useState(seed?.to || "");
  const [cc, setCc] = useState(seed?.cc || "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(seed?.subject || "");
  const [text, setText] = useState(seed?.text || "");
  const [html, setHtml] = useState("");
  const [composeMode, setComposeMode] = useState<"plain" | "html" | "markdown">("plain");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [draftId, setDraftId] = useState(seed?.draftId || "");
  const [attachments, setAttachments] = useState<Array<{ filename: string; object_key: string; byte_size: number; content_type?: string; detected_content_type?: string; safety_status?: string; safety_reasons?: string[] }>>([]);
  const [signatureId, setSignatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(seed?.cc));
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<ComposeLibraryItem[]>(starterComposeLibrary);
  const [libraryKind, setLibraryKind] = useState<ComposeLibraryItem["kind"]>("template");
  const [activeRecipientField, setActiveRecipientField] = useState<"to" | "cc" | "bcc" | null>(null);
  const [contactGroup, setContactGroup] = useState("");
  const [openTrackingEnabled, setOpenTrackingEnabled] = useState(false);
  const [clickTrackingEnabled, setClickTrackingEnabled] = useState(false);
  const [readReceipt, setReadReceipt] = useState(false);
  const [deliveryReceipt, setDeliveryReceipt] = useState(false);
  const [requestConfirmation, setRequestConfirmation] = useState(false);
  const [mailMerge, setMailMerge] = useState(false);
  const [replyTracking, setReplyTracking] = useState(false);
  const [followUpTracking, setFollowUpTracking] = useState(false);
  const [confidentialMode, setConfidentialMode] = useState(false);
  const [expiresHours, setExpiresHours] = useState("48");
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [confidentialPassword, setConfidentialPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<Array<{ code: string; title: string; detail: string }>>([]);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedMailbox = mailboxes.find((mailbox) => mailbox.address === fromAddress);
  const availableSignatures = signatures.filter((signature) => !signature.mailbox_id || signature.mailbox_id === selectedMailbox?.id);
  const groups = useMemo(() => {
    const byCompany = new Map<string, Contact[]>();
    contacts.forEach((contact) => {
      const key = contact.company?.trim() || "All contacts";
      byCompany.set(key, [...(byCompany.get(key) || []), contact]);
    });
    return [...byCompany.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [contacts]);
  const recipientList = (value: string) => value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
  const externalRecipients = [...recipientList(to), ...recipientList(cc), ...recipientList(bcc)].filter((address) => address.includes("@") && address.split("@").pop()?.toLowerCase() !== fromAddress.split("@").pop()?.toLowerCase());
  const localWarnings = [
    !subject.trim() ? { code: "missing_subject", title: "Subject is empty", detail: "Add a subject so the message is easier to find later." } : null,
    externalRecipients.length ? { code: "external_recipients", title: "External recipients", detail: `${externalRecipients.length} recipient${externalRecipients.length === 1 ? " is" : "s are"} outside your sender domain.` } : null,
    attachments.length ? { code: "attachment_check", title: "Attachment added", detail: "Double-check that the files are intended for every recipient." } : null,
    cc.trim() && bcc.trim() ? { code: "cc_bcc_check", title: "Cc and Bcc are both used", detail: "Bcc recipients remain hidden from the other recipients." } : null,
  ].filter(Boolean) as Array<{ code: string; title: string; detail: string }>;
  const detectedLinks = [...new Set((`${text} ${html}`.match(/https?:\/\/[^\s<]+/gi) || []).map((link) => link.replace(/[),.;]+$/, "")))];
  const previewHtml = composeMode === "html" ? html : composeMode === "markdown" ? markdownToHtml(text) : "";

  useEffect(() => {
    void apiFetch<ComposeLibraryItem[]>("/api/compose-library").then((rows) => {
      if (rows.length) setLibrary([...rows, ...starterComposeLibrary]);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!selectedMailbox?.is_shared) { setSendMode("send_as"); return; }
    if (sendMode === "send_as" && selectedMailbox.can_send_as) return;
    if (sendMode === "send_on_behalf" && selectedMailbox.can_send_on_behalf) return;
    setSendMode(selectedMailbox.can_send_as ? "send_as" : "send_on_behalf");
  }, [selectedMailbox?.id, selectedMailbox?.is_shared, selectedMailbox?.can_send_as, selectedMailbox?.can_send_on_behalf, sendMode]);
  const saveDraft = useCallback(async () => {
    if (!fromAddress || (!to.trim() && !subject.trim() && !text.trim() && !html.trim())) return;
    setSaving(true);
    try {
      const saved = await apiFetch<Message>("/api/drafts", { method: "POST", body: JSON.stringify({ id: draftId || undefined, fromAddress, to, cc, bcc, subject, text: text || html.replace(/<[^>]+>/g, " "), html: composeMode === "plain" ? null : composeMode === "markdown" ? markdownToHtml(text) : html, composeMode, timezone: timeZone, composeMetadata: { composeMode, timezone: timeZone, recurrence, confidentialMode, expiresHours: Number(expiresHours), passwordProtected, passwordHint, mailMerge, contactGroup, replyTracking, followUpTracking } }) });
      if (saved?.id) setDraftId(saved.id);
      setLastSavedAt(new Date());
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Draft could not be saved");
    } finally { setSaving(false); }
  }, [bcc, cc, composeMode, contactGroup, confidentialMode, draftId, expiresHours, followUpTracking, fromAddress, html, mailMerge, passwordHint, passwordProtected, recurrence, replyTracking, subject, text, timeZone, to]);
  useEffect(() => { const timer = window.setTimeout(() => void saveDraft(), 3000); return () => window.clearTimeout(timer); }, [saveDraft]);

  function chooseSignature(id: string) {
    setSignatureId(id);
    const signature = availableSignatures.find((item) => item.id === id);
    if (!signature) return;
    if (signature.text_body && !text.includes(signature.text_body)) setText((current) => `${current}${current ? "\n\n" : ""}${signature.text_body}`);
    if (signature.html_body && !html.includes(signature.html_body)) setHtml((current) => `${current}${current ? "<br /><br />" : ""}${signature.html_body || ""}`);
  }
  function applyLibraryItem(item: ComposeLibraryItem) {
    if (item.subject) setSubject(item.subject);
    setText(item.text_body || "");
    setHtml(item.html_body || "");
    setComposeMode(item.html_body ? "html" : "plain");
    setShowLibrary(false);
  }
  async function saveLibraryItem() {
    const name = await prompt({ title: "Save compose item", message: "Give this reusable item a short name.", defaultValue: subject.trim() || "New template", placeholder: "Item name" });
    if (!name?.trim()) return;
    const item = { id: crypto.randomUUID(), kind: libraryKind, name: name.trim(), subject, text_body: text, html_body: composeMode === "html" ? html : composeMode === "markdown" ? markdownToHtml(text) : null, metadata: { savedFrom: "composer" } };
    try {
      const saved = await apiFetch<ComposeLibraryItem>("/api/compose-library", { method: "POST", body: JSON.stringify(item) });
      setLibrary((current) => [saved, ...current]);
    } catch { setLibrary((current) => [item, ...current]); }
    setShowLibrary(true);
  }
  function insertVariable(variable: string) {
    const value = `{{${variable}}}`;
    if (composeMode === "html") setHtml((current) => `${current}${current ? "\n" : ""}${value}`);
    else setText((current) => `${current}${current ? "\n" : ""}${value}`);
  }
  function selectGroup(value: string) {
    setContactGroup(value);
    const members = groups.find(([name]) => name === value)?.[1] || [];
    if (members.length) { setTo(members.map((member) => member.email).join(", ")); setMailMerge(true); }
  }
  function setRecipient(field: "to" | "cc" | "bcc", value: string) { if (field === "to") setTo(value); else if (field === "cc") setCc(value); else setBcc(value); }
  function recipientValue(field: "to" | "cc" | "bcc") { return field === "to" ? to : field === "cc" ? cc : bcc; }
  function addContact(field: "to" | "cc" | "bcc", contact: Contact) { const current = recipientValue(field).trim(); setRecipient(field, `${current ? `${current}, ` : ""}${contact.email}`); setActiveRecipientField(null); }
  function draftStatus() { if (saving) return "Saving draft…"; if (uploading) return `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…`; if (lastSavedAt) return `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`; if (draftId) return "Draft saved"; return "Draft saves automatically"; }
  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading((current) => current + files.length); setError("");
    for (const file of files) {
      try { const item = await apiUpload<typeof attachments[number]>("/api/attachments", file, { fromAddress }); setAttachments((current) => [...current, item]); }
      catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed"); }
      finally { setUploading((current) => Math.max(0, current - 1)); }
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (confidentialMode && passwordProtected && confidentialPassword.length < 10) throw new Error("Use a confidential message password of at least 10 characters.");
      if (recurrence !== "none" && !scheduledAt) throw new Error("Choose a first send time before enabling recurring delivery.");
      const delay = Number(delayMinutes || 0);
      const effectiveScheduledAt = scheduledAt ? zonedLocalToIso(scheduledAt, timeZone) : delay > 0 ? new Date(Date.now() + delay * 60_000).toISOString() : null;
      const sendText = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      await apiFetch("/api/send", { method: "POST", body: JSON.stringify({ fromAddress, sendMode, to, cc, bcc, subject, text: sendText, html: composeMode === "plain" ? null : composeMode === "markdown" ? markdownToHtml(text) : html, scheduledAt: effectiveScheduledAt, timezone: timeZone, undoSendSeconds: undoSeconds, idempotencyKey: idempotencyKeyRef.current, warningsAcknowledged: warnings.map((warning) => warning.code), threadId: seed?.threadId, inReplyTo: seed?.inReplyTo, references: seed?.references, attachments, openTrackingEnabled, clickTrackingEnabled, composeMetadata: { composeMode, timezone: timeZone, recurrence, readReceipt, deliveryReceipt, requestConfirmation, mailMerge, contactGroup, replyTracking, followUpTracking, confidentialMode, expiresHours: Number(expiresHours), passwordProtected, confidentialPassword: passwordProtected ? confidentialPassword : undefined, passwordHint, linkPreviewEnabled, delayedMinutes: delay } }) });
      onSent(); onClose();
    } catch (sendError) {
      if (sendError instanceof ApiError && Array.isArray(sendError.payload.warnings)) setWarnings(sendError.payload.warnings as Array<{ code: string; title: string; detail: string }>);
      else setError(sendError instanceof Error ? sendError.message : "The message could not be sent");
    } finally { setBusy(false); }
  }
  if (isMinimized) return <div className="compose-minimized" role="dialog" aria-label="Minimized draft"><button type="button" className="compose-minimized-main" onClick={() => setIsMinimized(false)}><span className="compose-minimized-dot" /><span><strong>{subject.trim() || "New message"}</strong><small>{draftStatus()}</small></span></button><button type="button" className="icon-button" onClick={onClose} aria-label="Close draft" title="Close draft"><X size={16} /></button></div>;
  const inputFor = (field: "to" | "cc" | "bcc", label: string, placeholder: string) => {
    const value = recipientValue(field);
    const suggestions = contacts.filter((contact) => { const needle = value.split(/[,;]\s*/).pop()?.trim().toLowerCase() || ""; return needle && (contact.email.includes(needle) || contact.display_name.toLowerCase().includes(needle)); }).slice(0, 5);
    return <label className="compose-recipient-field">{label}<input name={field} value={value} onFocus={() => setActiveRecipientField(field)} onChange={(event) => { setRecipient(field, event.target.value); setActiveRecipientField(field); }} placeholder={placeholder} autoComplete="off" list="postveil-recipient-list" />{activeRecipientField === field && suggestions.length > 0 && <span className="recipient-suggestions" role="listbox">{suggestions.map((contact) => <button type="button" key={contact.id} onMouseDown={(event) => event.preventDefault()} onClick={() => addContact(field, contact)}><strong>{contact.display_name}</strong><small>{contact.email}{contact.company ? ` · ${contact.company}` : ""}</small></button>)}</span>}</label>;
  };
  return <div className="compose-overlay" role="dialog" aria-modal="true" aria-labelledby="compose-title"><form className={`compose-card compose-studio${isExpanded ? " compose-card-expanded" : ""}`} onSubmit={send}>
    <div className="compose-head"><div><p className="eyebrow">{seed?.to ? "REPLY / FORWARD" : "COMPOSE STUDIO"}</p><h2 id="compose-title">{seed?.to ? "Continue the thread" : "New message"}</h2><span className="compose-subtitle">Build a message with reusable content, delivery controls, and recipient safety checks.</span></div><div className="compose-head-actions"><button type="button" className="icon-button" onClick={() => setIsMinimized(true)} aria-label="Minimize draft" title="Minimize draft"><Minimize2 size={16} /></button><button type="button" className="icon-button compose-expand-button" onClick={() => setIsExpanded((current) => !current)} aria-label={isExpanded ? "Restore compose size" : "Expand compose"} title={isExpanded ? "Restore compose size" : "Expand compose"}><Maximize2 size={16} /></button><button type="button" className="icon-button" onClick={onClose} aria-label="Close draft" title="Close draft"><X size={18} /></button></div></div>
    <div className="compose-fields"><div className="compose-recipient-row"><label className="compose-field-inline">From<select value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} name="from">{mailboxes.filter((mailbox) => mailbox.can_send).map((mailbox) => <option key={mailbox.id} value={mailbox.address}>{mailbox.display_name ? `${mailbox.display_name} · ${mailbox.address}` : mailbox.address}</option>)}</select></label>{selectedMailbox?.is_shared && <label className="compose-field-inline">Send mode<select value={sendMode} onChange={(event) => setSendMode(event.target.value as "send_as" | "send_on_behalf")}>{selectedMailbox.can_send_as && <option value="send_as">Send as</option>}{selectedMailbox.can_send_on_behalf && <option value="send_on_behalf">Send on behalf</option>}</select></label>}<button type="button" className="compose-recipient-toggle" onClick={() => setShowCcBcc((current) => !current)} aria-expanded={showCcBcc}>{showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}</button></div>
      <div className="compose-address-grid">{inputFor("to", "To", "Name or email…")}{showCcBcc && inputFor("cc", "Cc", "Optional…")}{showCcBcc && inputFor("bcc", "Bcc", "Optional…")}</div><datalist id="postveil-recipient-list">{contacts.map((contact) => <option key={contact.id} value={contact.email}>{contact.display_name}</option>)}</datalist>
      {groups.length > 0 && <div className="compose-group-row"><span>Contact group</span><select value={contactGroup} onChange={(event) => selectGroup(event.target.value)}><option value="">Choose a group…</option>{groups.map(([name, members]) => <option key={name} value={name}>{name} · {members.length}</option>)}</select><label className="checkbox-row"><input type="checkbox" checked={mailMerge} onChange={(event) => setMailMerge(event.target.checked)} /> Personalize each recipient</label></div>}
      <label>Subject<input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What is this about?" /></label>
      <div className="compose-editor-head"><span>Message</span><div className="compose-mode-tabs" role="tablist" aria-label="Compose format">{(["plain", "html", "markdown"] as const).map((mode) => <button type="button" role="tab" aria-selected={composeMode === mode} className={composeMode === mode ? "is-active" : ""} key={mode} onClick={() => setComposeMode(mode)}>{mode === "plain" ? "Plain text" : mode === "html" ? "HTML" : "Markdown"}</button>)}</div></div>
      {composeMode === "html" && <div className="compose-rich-toolbar"><button type="button" onClick={() => setHtml((current) => `${current}<strong>Bold text</strong>`)}>Bold</button><button type="button" onClick={() => setHtml((current) => `${current}<a href=\"https://example.com\">Link</a>`)}>Link</button><button type="button" onClick={() => setHtml((current) => `${current}<ul><li>List item</li></ul>`)}>List</button></div>}
      <textarea className="compose-body-editor" required={!html.trim()} name="message" value={composeMode === "html" ? html : text} onChange={(event) => composeMode === "html" ? setHtml(event.target.value) : setText(event.target.value)} placeholder={composeMode === "html" ? "Write HTML…" : composeMode === "markdown" ? "Write with Markdown…" : "Start writing…"} rows={isExpanded ? 12 : 8} />
      {composeMode !== "plain" && <div className="compose-preview"><div className="compose-preview-label">Live preview</div><div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(previewHtml || "<p>Preview appears here.</p>") }} /></div>}
      <div className="compose-variable-row"><span>Insert variable</span>{["first_name", "company", "email"].map((variable) => <button type="button" key={variable} onClick={() => insertVariable(variable)}>{`{{${variable}}}`}</button>)}</div>
    </div>
    <div className="compose-option-row compose-studio-options"><button type="button" className="compose-option-button" onClick={() => setShowLibrary((current) => !current)} aria-expanded={showLibrary}>Templates & snippets</button>{showLibrary && <div className="compose-library"><div className="compose-library-head"><select value={libraryKind} onChange={(event) => setLibraryKind(event.target.value as ComposeLibraryItem["kind"])}><option value="template">Templates</option><option value="canned">Canned replies</option><option value="snippet">Snippets</option></select><button type="button" onClick={() => void saveLibraryItem()}>Save current</button></div>{library.filter((item) => item.kind === libraryKind).map((item) => <button type="button" key={item.id} onClick={() => applyLibraryItem(item)}><strong>{item.name}{item.shared ? " · Team" : ""}</strong><small>{item.subject || item.text_body.slice(0, 70)}</small></button>)}</div>}
      {availableSignatures.length > 0 && <label className="compose-signature-select"><Tag size={14} aria-hidden="true" /><select value={signatureId} onChange={(event) => chooseSignature(event.target.value)} aria-label="Add signature"><option value="">Signature</option>{availableSignatures.map((signature) => <option key={signature.id} value={signature.id}>{signature.name}</option>)}</select></label>}
      <label className="schedule-field"><Clock3 size={14} aria-hidden="true" /><span>{scheduledAt ? "Scheduled" : "Deliver"}</span><select value={delayMinutes} onChange={(event) => setDelayMinutes(event.target.value)} aria-label="Delayed delivery"><option value="0">Now</option><option value="5">In 5 min</option><option value="15">In 15 min</option><option value="30">In 30 min</option><option value="60">In 1 hour</option></select></label><label className="schedule-field"><span>Send at</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} aria-label="Schedule send" /></label><label className="schedule-field"><span>Zone</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} aria-label="Scheduling time zone"><option>{timeZone}</option><option>UTC</option><option>Asia/Manila</option><option>America/New_York</option><option>Europe/London</option><option>Australia/Sydney</option></select></label>
      <button type="button" className={`compose-option-button${showMoreOptions ? " is-active" : ""}`} onClick={() => setShowMoreOptions((current) => !current)} aria-expanded={showMoreOptions}>Delivery & privacy</button></div>
      {showMoreOptions && <div className="compose-advanced-panel"><div className="compose-advanced-grid"><label>Recurring<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}><option value="none">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Follow-up tracking<select value={followUpTracking ? "on" : "off"} onChange={(event) => setFollowUpTracking(event.target.value === "on")}><option value="off">Off</option><option value="on">Track reply follow-up</option></select></label></div><div className="compose-check-grid"><label className="checkbox-row"><input type="checkbox" checked={openTrackingEnabled} onChange={(event) => setOpenTrackingEnabled(event.target.checked)} /> Track opens</label><label className="checkbox-row"><input type="checkbox" checked={clickTrackingEnabled} onChange={(event) => setClickTrackingEnabled(event.target.checked)} /> Track clicks</label><label className="checkbox-row"><input type="checkbox" checked={deliveryReceipt} onChange={(event) => setDeliveryReceipt(event.target.checked)} /> Delivery receipt</label><label className="checkbox-row"><input type="checkbox" checked={readReceipt} onChange={(event) => setReadReceipt(event.target.checked)} /> Read receipt</label><label className="checkbox-row"><input type="checkbox" checked={requestConfirmation} onChange={(event) => setRequestConfirmation(event.target.checked)} /> Request confirmation</label><label className="checkbox-row"><input type="checkbox" checked={replyTracking} onChange={(event) => setReplyTracking(event.target.checked)} /> Track replies</label></div><div className="confidential-panel"><label className="checkbox-row"><input type="checkbox" checked={confidentialMode} onChange={(event) => setConfidentialMode(event.target.checked)} /> Confidential message mode</label>{confidentialMode && <div className="confidential-controls"><label>Expires after<select value={expiresHours} onChange={(event) => setExpiresHours(event.target.value)}><option value="1">1 hour</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="168">7 days</option></select></label><label className="checkbox-row"><input type="checkbox" checked={passwordProtected} onChange={(event) => setPasswordProtected(event.target.checked)} /> Password-protect external message</label>{passwordProtected && <><input type="password" autoComplete="new-password" minLength={10} value={confidentialPassword} onChange={(event) => setConfidentialPassword(event.target.value)} placeholder="Message password (10+ characters)" aria-label="Confidential message password" /><input value={passwordHint} onChange={(event) => setPasswordHint(event.target.value)} placeholder="Password hint (never the password)" /><small className="compose-help-text">The password is used once to protect this message and is never saved in your draft.</small></>}</div>}</div></div>}
    <div className="attachment-dropzone" role="group" aria-label="Attachment drop zone" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}><UploadCloud size={18} aria-hidden="true" /><div><strong>{isDragging ? "Drop files to attach" : "Add attachments"}</strong><span>Drag files here or choose from your device · 15 MB each</span></div><label className="file-button"><Paperclip size={15} /> Attach files<input ref={fileInputRef} type="file" multiple onChange={(event) => { void uploadFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /></label></div>
    {(localWarnings.length > 0 || warnings.length > 0) && <div className="compose-warning" role="alert"><div className="compose-warning-head"><AlertTriangle size={15} /><strong>Review before sending</strong></div>{[...localWarnings, ...warnings.filter((warning) => !localWarnings.some((local) => local.code === warning.code))].map((warning) => <p key={warning.code}><strong>{warning.title}.</strong> {warning.detail}</p>)}<small>These checks stay inside Postveil; your browser’s native alert is not used.</small></div>}
    {detectedLinks.length > 0 && linkPreviewEnabled && <div className="compose-link-previews"><div className="compose-preview-label">Link preview · {detectedLinks.length}</div>{detectedLinks.slice(0, 3).map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}><strong>{new URL(link).hostname}</strong><span>{link}</span></a>)}</div>}
    <div className="attachment-strip" aria-live="polite">{attachments.map((attachment) => <span className="attachment-chip" key={attachment.object_key}><Paperclip size={13} aria-hidden="true" /><span className="attachment-chip-copy"><strong>{attachment.filename}</strong><small>{formatBytes(attachment.byte_size)}</small></span><button type="button" className="attachment-remove" onClick={() => setAttachments((current) => current.filter((item) => item.object_key !== attachment.object_key))} aria-label={`Remove ${attachment.filename}`} title={`Remove ${attachment.filename}`}><X size={13} /></button></span>)}</div>
    {error && <div className="form-error compose-error">{error}</div>}<div className="compose-foot"><span className="compose-hint" aria-live="polite"><span className={`save-dot${saving ? " is-saving" : ""}`} />{draftStatus()}</span><button className="primary-button" disabled={busy || uploading > 0}><Send size={15} /> {busy ? "Sending…" : scheduledAt || delayMinutes !== "0" ? "Schedule send" : "Send"}</button></div>
  </form></div>;
}

const ruleConditionLabels: Record<RuleConditionType, string> = {
  fromContains: "Sender contains",
  toContains: "To contains",
  ccContains: "Cc contains",
  subjectContains: "Subject contains",
  bodyContains: "Body contains",
  hasAttachment: "Has attachment",
  isRead: "Read status",
  isFlagged: "Flagged",
  isPinned: "Pinned",
  priority: "Priority",
  folder: "Folder",
  eventTypeContains: "Event type contains",
};
const ruleConditionTypes = Object.keys(ruleConditionLabels) as RuleConditionType[];

function ruleConditionsFromRecord(record: Record<string, unknown> | undefined): RuleCondition[] {
  const source = record || {};
  const rows = ruleConditionTypes
    .filter((type) => source[type] !== undefined)
    .map((type) => ({ type, value: String(source[type]) }));
  return rows.length ? rows : [{ type: "fromContains", value: "" }];
}

function ruleConditionRecord(rows: RuleCondition[]): Record<string, unknown> {
  return rows.reduce<Record<string, unknown>>((result, row) => {
    const value = row.value.trim();
    if (!value) return result;
    result[row.type] = ["hasAttachment", "isRead", "isFlagged", "isPinned"].includes(row.type)
      ? value === "true"
      : row.type === "priority" ? Number(value) : value;
    return result;
  }, {});
}

function ruleSummary(part: Record<string, unknown>, empty: string): string {
  const labels = ruleConditionTypes
    .filter((type) => part[type] !== undefined)
    .map((type) => `${ruleConditionLabels[type]} ${String(part[type])}`);
  return labels.length ? labels.join(" · ") : empty;
}

function actionMode(actions: Record<string, unknown>, key: string): "ignore" | "true" | "false" {
  return typeof actions[key] === "boolean" ? (actions[key] ? "true" : "false") : "ignore";
}

function MailboxAdministration({ onChanged }: { onChanged: () => void }) {
  const { confirm, prompt } = useAppDialog();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliveryOps, setDeliveryOps] = useState<DeliveryOpsView | null>(null);
  const [search, setSearch] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inactivityDays, setInactivityDays] = useState("90");
  const [inactivityAction, setInactivityAction] = useState("notify");
  const [requireMfa, setRequireMfa] = useState(false);
  const [defaultQuotaGb, setDefaultQuotaGb] = useState("5");
  const [defaultSendingLimit, setDefaultSendingLimit] = useState("100");
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMailboxAddress, setNewMailboxAddress] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [newRequireMfa, setNewRequireMfa] = useState(false);
  const [editMemberId, setEditMemberId] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editMailboxId, setEditMailboxId] = useState("");
  const [editMailboxName, setEditMailboxName] = useState("");
  const [editMailboxQuotaGb, setEditMailboxQuotaGb] = useState("5");
  const [editMailboxSendingLimit, setEditMailboxSendingLimit] = useState("100");
  const [editMailboxCanSend, setEditMailboxCanSend] = useState(true);
  const [editMailboxCanReceive, setEditMailboxCanReceive] = useState(true);
  const [selectedMailboxId, setSelectedMailboxId] = useState("");
  const [selectedDelegateId, setSelectedDelegateId] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canSendAs, setCanSendAs] = useState(false);
  const [canSendOnBehalf, setCanSendOnBehalf] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [delegates, setDelegates] = useState<Array<{ member_id: string; email: string; display_name: string; can_read: boolean; can_send_as: boolean; can_send_on_behalf: boolean; can_manage: boolean }>>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupAddress, setNewGroupAddress] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupMember, setNewGroupMember] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<AdminOverview>("/api/admin/overview");
      setOverview(data);
      setDeliveryOps(await apiFetch<DeliveryOpsView>("/api/admin/delivery-ops").catch(() => null));
      setOrgName(data.organization.name);
      const settings = data.organization.settings || {};
      setInactivityDays(String(settings.inactivity_days ?? 90));
      setInactivityAction(String(settings.inactivity_action ?? "notify"));
      setRequireMfa(settings.require_mfa === true);
      setDefaultQuotaGb(String(Number(settings.default_quota_bytes || 5 * 1024 * 1024 * 1024) / 1024 / 1024 / 1024));
      setDefaultSendingLimit(String(settings.default_sending_limit_daily ?? 100));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Administration is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const allMailboxes = overview?.members.flatMap((member) => member.mailboxes.map((mailbox) => ({ ...mailbox, owner: member }))) || [];
  const filteredMembers = overview?.members.filter((member) => `${member.email} ${member.display_name} ${member.role} ${member.status}`.toLowerCase().includes(search.trim().toLowerCase())) || [];
  const activeMailbox = allMailboxes.find((item) => item.id === selectedMailboxId);

  async function saveOrganization() {
    setBusy(true); setError("");
    try {
      await apiFetch("/api/admin/organization", { method: "PATCH", body: JSON.stringify({ name: orgName, inactivity_days: Number(inactivityDays), inactivity_action: inactivityAction, require_mfa: requireMfa, default_quota_bytes: Math.max(0, Number(defaultQuotaGb) * 1024 * 1024 * 1024), default_sending_limit_daily: Math.max(0, Number(defaultSendingLimit)) }) });
      setNotice("Workspace settings saved");
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Workspace settings could not be saved"); }
    finally { setBusy(false); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email: newEmail, displayName: newDisplayName, mailboxAddress: newMailboxAddress || newEmail, role: newRole, requireMfa: newRequireMfa, quotaBytes: Number(defaultQuotaGb) * 1024 * 1024 * 1024, sendingLimitDaily: Number(defaultSendingLimit) }) });
      setNewEmail(""); setNewDisplayName(""); setNewMailboxAddress(""); setNewRole("member"); setNewRequireMfa(false);
      setNotice("Account created and invitation sent");
      await load(); onChanged();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Account could not be created"); }
    finally { setBusy(false); }
  }

  function selectMemberForEdit(memberId: string) {
    setEditMemberId(memberId);
    setEditDisplayName(overview?.members.find((member) => member.user_id === memberId)?.display_name || "");
  }

  async function saveMemberProfile(event: FormEvent) {
    event.preventDefault();
    const member = overview?.members.find((candidate) => candidate.user_id === editMemberId);
    if (!member || !editDisplayName.trim()) return;
    await updateMember(member, { displayName: editDisplayName.trim() }, "Account profile updated");
  }

  function selectMailboxForEdit(mailboxId: string) {
    const selected = allMailboxes.find((mailbox) => mailbox.id === mailboxId);
    setEditMailboxId(mailboxId);
    setEditMailboxName(selected?.display_name || "");
    setEditMailboxQuotaGb(String(Number(selected?.quota_bytes || 0) / 1024 / 1024 / 1024 || 0));
    setEditMailboxSendingLimit(String(selected?.sending_limit_daily ?? 0));
    setEditMailboxCanSend(selected?.can_send !== false);
    setEditMailboxCanReceive(selected?.can_receive !== false);
  }

  async function saveMailboxProfile(event: FormEvent) {
    event.preventDefault();
    const mailbox = allMailboxes.find((candidate) => candidate.id === editMailboxId);
    if (!mailbox) return;
    await updateMailbox(mailbox, { displayName: editMailboxName.trim() || mailbox.display_name, quotaBytes: Math.max(0, Number(editMailboxQuotaGb) * 1024 * 1024 * 1024), sendingLimitDaily: Math.max(0, Number(editMailboxSendingLimit)), canSend: editMailboxCanSend, canReceive: editMailboxCanReceive }, "Mailbox updated");
  }

  async function updateMember(member: AdminMember, patch: Record<string, unknown>, message: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/users/${member.user_id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice(message); await load(); onChanged(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Account could not be updated"); }
    finally { setBusy(false); }
  }

  async function resetPassword(member: AdminMember) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/users/${member.user_id}/reset-password`, { method: "POST" }); setNotice(`Password reset sent to ${member.email}`); }
    catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Password reset could not be sent"); }
    finally { setBusy(false); }
  }

  async function revokeSessions(member: AdminMember) {
    if (!(await confirm({
      title: "Sign out everywhere?",
      message: `Sign ${member.email} out on every device? They will need to sign in again.`,
      confirmLabel: "Sign out everywhere",
      danger: true,
    }))) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/users/${member.user_id}/revoke-sessions`, { method: "POST" }); setNotice(`All sessions revoked for ${member.email}`); }
    catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : "Sessions could not be revoked"); }
    finally { setBusy(false); }
  }

  async function deleteMember(member: AdminMember) {
    if (!(await confirm({
      title: "Delete this account permanently?",
      message: `Permanently delete ${member.email} and all of this account’s mailbox data. This cannot be undone.`,
      confirmLabel: "Delete account",
      danger: true,
    }))) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/users/${member.user_id}`, { method: "DELETE" }); setNotice(`${member.email} was permanently deleted`); await load(); onChanged(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Account could not be deleted"); }
    finally { setBusy(false); }
  }

  async function updateMailbox(mailbox: AdminMailbox, patch: Record<string, unknown>, message: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/mailboxes/${mailbox.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice(message); await load(); onChanged(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Mailbox could not be updated"); }
    finally { setBusy(false); }
  }

  async function deleteMailbox(mailbox: AdminMailbox) {
    if (!(await confirm({
      title: "Delete this mailbox permanently?",
      message: `Permanently delete ${mailbox.address} and all messages stored in it. This cannot be undone.`,
      confirmLabel: "Delete mailbox",
      danger: true,
    }))) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/mailboxes/${mailbox.id}`, { method: "DELETE" }); setNotice(`${mailbox.address} was deleted`); await load(); onChanged(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Mailbox could not be deleted"); }
    finally { setBusy(false); }
  }

  async function editSendingLimit(mailbox: AdminMailbox) {
    const value = await prompt({
      title: "Daily sending limit",
      message: `Set the maximum number of messages ${mailbox.address} can send per day.`,
      defaultValue: String(mailbox.sending_limit_daily),
      inputType: "number",
      confirmLabel: "Save limit",
    });
    if (value === null || !value.trim()) return;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) {
      setError("Enter a valid non-negative sending limit");
      return;
    }
    await updateMailbox(mailbox, { sendingLimitDaily: limit }, "Sending limit updated");
  }

  async function loadDelegates(mailboxId: string) {
    setSelectedMailboxId(mailboxId); setSelectedDelegateId("");
    if (!mailboxId) { setDelegates([]); return; }
    try { setDelegates(await apiFetch<typeof delegates>(`/api/admin/mailboxes/${mailboxId}/delegates`)); }
    catch (delegateError) { setError(delegateError instanceof Error ? delegateError.message : "Mailbox access could not be loaded"); }
  }

  async function saveDelegate(event: FormEvent) {
    event.preventDefault();
    if (!selectedMailboxId || !selectedDelegateId) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/mailboxes/${selectedMailboxId}/delegates/${selectedDelegateId}`, { method: "POST", body: JSON.stringify({ canRead, canSendAs, canSendOnBehalf, canManage }) }); setNotice("Mailbox permissions saved"); await loadDelegates(selectedMailboxId); }
    catch (delegateError) { setError(delegateError instanceof Error ? delegateError.message : "Mailbox permissions could not be saved"); }
    finally { setBusy(false); }
  }

  async function removeDelegate(delegateId: string) {
    if (!selectedMailboxId) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/mailboxes/${selectedMailboxId}/delegates/${delegateId}`, { method: "DELETE" }); setNotice("Mailbox access removed"); await loadDelegates(selectedMailboxId); }
    catch (delegateError) { setError(delegateError instanceof Error ? delegateError.message : "Mailbox access could not be removed"); }
    finally { setBusy(false); }
  }

  async function exportUsers() {
    const authSession = (await requireSupabase().auth.getSession()).data.session;
    const response = await fetch("/api/admin/users/export", { headers: authSession?.access_token ? { authorization: `Bearer ${authSession.access_token}` } : {} });
    if (!response.ok) throw new Error(`Export failed (${response.status})`);
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "postveil-users.csv"; link.click(); URL.revokeObjectURL(url); setNotice("User list exported");
  }

  async function importUsers(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const lines = file.text ? csvLines(await file.text()) : [];
    if (!lines.length) return;
    const [header, ...rows] = lines;
    const keys = header.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
    const users = rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index] || ""]))).filter((row) => row.email);
    setBusy(true); setError("");
    try { const result = await apiFetch<{ created: number; failed: number }>("/api/admin/users/import", { method: "POST", body: JSON.stringify({ users }) }); setNotice(`${result.created} account${result.created === 1 ? "" : "s"} imported${result.failed ? ` · ${result.failed} failed` : ""}`); await load(); onChanged(); }
    catch (importError) { setError(importError instanceof Error ? importError.message : "Users could not be imported"); }
    finally { setBusy(false); }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await apiFetch("/api/admin/groups", { method: "POST", body: JSON.stringify({ name: newGroupName, address: newGroupAddress, description: newGroupDescription }) });
      setNewGroupName(""); setNewGroupAddress(""); setNewGroupDescription(""); setNotice("Group address created"); await load();
    } catch (groupError) { setError(groupError instanceof Error ? groupError.message : "Group address could not be created"); }
    finally { setBusy(false); }
  }

  async function updateGroup(group: AdminGroup, patch: Record<string, unknown>, message: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/groups/${group.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice(message); await load(); }
    catch (groupError) { setError(groupError instanceof Error ? groupError.message : "Group address could not be updated"); }
    finally { setBusy(false); }
  }

  async function deleteGroup(group: AdminGroup) {
    if (!(await confirm({
      title: "Delete this group address?",
      message: `Delete ${group.address} and its recipient list?`,
      confirmLabel: "Delete group",
      danger: true,
    }))) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/groups/${group.id}`, { method: "DELETE" }); setNotice(`${group.address} was deleted`); setSelectedGroupId(""); await load(); }
    catch (groupError) { setError(groupError instanceof Error ? groupError.message : "Group address could not be deleted"); }
    finally { setBusy(false); }
  }

  async function addGroupMember(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroupId || !newGroupMember.trim()) return;
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/groups/${selectedGroupId}/members`, { method: "POST", body: JSON.stringify({ email: newGroupMember }) }); setNewGroupMember(""); setNotice("Group recipient added"); await load(); }
    catch (groupError) { setError(groupError instanceof Error ? groupError.message : "Recipient could not be added"); }
    finally { setBusy(false); }
  }

  async function removeGroupMember(groupId: string, memberId: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/groups/${groupId}/members/${memberId}`, { method: "DELETE" }); setNotice("Group recipient removed"); await load(); }
    catch (groupError) { setError(groupError instanceof Error ? groupError.message : "Recipient could not be removed"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="admin-loading" role="status">Loading workspace administration…</div>;
  if (!overview) return <div className="settings-alert settings-error" role="alert">{error || "Workspace administration is unavailable"}</div>;
  return (
    <div className="admin-console">
      <div className="admin-toolbar">
        <div><p className="eyebrow">WORKSPACE ADMINISTRATION</p><h3>Accounts, mailboxes, and access</h3><p>Manage people without exposing passwords or provider keys to the browser.</p></div>
        <div className="admin-toolbar-actions"><button className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={14} /> Refresh</button><label className="secondary-button admin-file-button"><Upload size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importUsers(event)} /></label><button className="secondary-button" onClick={() => void exportUsers()} disabled={busy}><Download size={14} /> Export CSV</button></div>
      </div>
      {error && <div className="settings-alert settings-error" role="alert">{error}</div>}
      {notice && <div className="form-notice" role="status">{notice}</div>}
      <div className="admin-stats"><div><strong>{overview.stats.users}</strong><span>Accounts</span></div><div><strong>{overview.stats.active_users}</strong><span>Active</span></div><div><strong>{overview.stats.mailboxes}</strong><span>Mailboxes</span></div><div><strong>{formatBytes(overview.stats.storage_used_bytes)}</strong><span>Storage used</span></div></div>
      {deliveryOps && <div className="setting-card delivery-ops-card"><div className="setting-card-head"><div><h3>Delivery operations</h3><p>Provider readiness, queue health, and reputation signals. Provider credentials never appear here.</p></div><RefreshCcw size={18} aria-hidden="true" /></div><div className="delivery-ops-grid">{deliveryOps.providers.map((provider) => <div className="delivery-provider" key={provider.provider}><div><strong>{provider.label}</strong><small>{provider.configured ? provider.circuit?.status || "ready" : "not configured"}</small></div><span className={`admin-badge ${provider.configured ? provider.circuit?.status === "circuit_open" ? "suspended" : "active" : "member"}`}>{provider.configured ? provider.circuit?.status || "ready" : "off"}</span></div>)}</div><div className="delivery-queue-stats"><span>{deliveryOps.queue.queued} queued</span><span>{deliveryOps.queue.retrying} retrying</span><span>{deliveryOps.queue.dead} dead-letter</span></div>{deliveryOps.domains.length > 0 && <div className="reputation-list"><strong>Sending-domain reputation</strong>{deliveryOps.domains.map((domain) => <div className="settings-item" key={domain.domain}><div><strong>{domain.domain}</strong><small>{domain.sent_count || 0} sent · {domain.bounced_count || 0} bounces · {domain.complaint_count || 0} complaints</small></div><span className={`admin-badge ${domain.status === "healthy" ? "active" : "security"}`}>{domain.status || "unknown"} · {Math.round(Number(domain.score || 0) * 100)}%</span></div>)}</div>}{deliveryOps.recentAttempts.some((attempt) => attempt.status === "failed") && <div className="delivery-error"><strong>Recent delivery failures</strong><span>{deliveryOps.recentAttempts.filter((attempt) => attempt.status === "failed").slice(0, 3).map((attempt) => `${attempt.provider || "provider"}: ${attempt.error_message || "failed"}`).join(" · ")}</span></div>}</div>}
      <div className="admin-grid">
        <div className="setting-card"><div className="setting-card-head"><div><h3>{overview.organization.name}</h3><p>Organization defaults apply to new mailbox accounts.</p></div><Users size={18} aria-hidden="true" /></div><label>Workspace name<input value={orgName} onChange={(event) => setOrgName(event.target.value)} /></label><div className="admin-form-row"><label>Inactivity days<input type="number" min="0" max="3650" value={inactivityDays} onChange={(event) => setInactivityDays(event.target.value)} /></label><label>Inactive account action<select value={inactivityAction} onChange={(event) => setInactivityAction(event.target.value)}><option value="notify">Notify only</option><option value="suspend">Suspend automatically</option></select></label></div><div className="admin-form-row"><label>Default quota (GB)<input type="number" min="0" step="0.5" value={defaultQuotaGb} onChange={(event) => setDefaultQuotaGb(event.target.value)} /></label><label>Daily sending limit<input type="number" min="0" value={defaultSendingLimit} onChange={(event) => setDefaultSendingLimit(event.target.value)} /></label></div><label className="toggle-row"><input type="checkbox" checked={requireMfa} onChange={(event) => setRequireMfa(event.target.checked)} /> Require two-step verification for this workspace</label><button className="primary-button" onClick={() => void saveOrganization()} disabled={busy}>Save workspace settings</button></div>
        <form className="setting-card" onSubmit={(event) => void createUser(event)}><div className="setting-card-head"><div><h3>Create mailbox account</h3><p>Invite a person, create their mailbox, and apply limits immediately.</p></div><Plus size={18} aria-hidden="true" /></div><label>Login email<input type="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="person@example.com" /></label><label>Display name<input value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} placeholder="Person name" /></label><label>Mailbox address<input type="email" value={newMailboxAddress} onChange={(event) => setNewMailboxAddress(event.target.value)} placeholder="person@your-domain.com" /></label><div className="admin-form-row"><label>Workspace role<select value={newRole} onChange={(event) => setNewRole(event.target.value as "member" | "admin")}><option value="member">Member</option><option value="admin">Administrator</option></select></label><label className="toggle-row"><input type="checkbox" checked={newRequireMfa} onChange={(event) => setNewRequireMfa(event.target.checked)} /> Require 2FA</label></div><button className="primary-button" disabled={busy}><Plus size={15} /> Create and invite</button></form>
        <form className="setting-card" onSubmit={(event) => void saveMemberProfile(event)}><div className="setting-card-head"><div><h3>Edit account profile</h3><p>Change a member’s display name without changing their sign-in address.</p></div><Pencil size={18} aria-hidden="true" /></div><label>Account<select value={editMemberId} onChange={(event) => selectMemberForEdit(event.target.value)}><option value="">Choose an account</option>{overview?.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name} · {member.email}</option>)}</select></label><label>Display name<input required value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} placeholder="Display name" /></label><button className="secondary-button" disabled={busy || !editMemberId}>Save profile</button></form>
        <form className="setting-card" onSubmit={(event) => void saveMailboxProfile(event)}><div className="setting-card-head"><div><h3>Edit mailbox settings</h3><p>Adjust a mailbox name, delivery switches, quota, and daily sending limit.</p></div><SlidersHorizontal size={18} aria-hidden="true" /></div><label>Mailbox<select value={editMailboxId} onChange={(event) => selectMailboxForEdit(event.target.value)}><option value="">Choose a mailbox</option>{allMailboxes.map((item) => <option key={item.id} value={item.id}>{item.address} · {item.owner.email}</option>)}</select></label><label>Display name<input required value={editMailboxName} onChange={(event) => setEditMailboxName(event.target.value)} placeholder="Mailbox name" /></label><div className="admin-form-row"><label>Quota (GB)<input type="number" min="0" step="0.5" value={editMailboxQuotaGb} onChange={(event) => setEditMailboxQuotaGb(event.target.value)} /></label><label>Daily send limit<input type="number" min="0" value={editMailboxSendingLimit} onChange={(event) => setEditMailboxSendingLimit(event.target.value)} /></label></div><div className="admin-form-row"><label className="toggle-row"><input type="checkbox" checked={editMailboxCanSend} onChange={(event) => setEditMailboxCanSend(event.target.checked)} /> Can send</label><label className="toggle-row"><input type="checkbox" checked={editMailboxCanReceive} onChange={(event) => setEditMailboxCanReceive(event.target.checked)} /> Can receive</label></div><button className="secondary-button" disabled={busy || !editMailboxId}>Save mailbox</button></form>
      </div>
      <div className="setting-card admin-groups-card"><div className="setting-card-head"><div><h3>Group addresses and distribution lists</h3><p>Route messages sent to a group address to its current recipients. Recipients may be workspace users or external addresses.</p></div><Users size={18} aria-hidden="true" /></div><form className="admin-form-row admin-group-create" onSubmit={(event) => void createGroup(event)}><label>Group name<input required value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Support team" /></label><label>Group address<input required type="email" value={newGroupAddress} onChange={(event) => setNewGroupAddress(event.target.value)} placeholder="support@your-domain.com" /></label><label>Description<input value={newGroupDescription} onChange={(event) => setNewGroupDescription(event.target.value)} placeholder="Who receives this address" /></label><button className="primary-button" disabled={busy}><Plus size={15} /> Add group</button></form>{overview.groups.map((group) => <article className={`admin-group${selectedGroupId === group.id ? " selected" : ""}`} key={group.id}><div className="admin-member-head"><div><strong>{group.name}</strong><small>{group.address} · {group.members.length} recipient{group.members.length === 1 ? "" : "s"}</small></div><div className="admin-badges"><span className={`admin-badge ${group.enabled ? "active" : "suspended"}`}>{group.enabled ? "active" : "disabled"}</span><span className="admin-badge member">{group.delivery_mode}</span></div></div><div className="admin-member-actions"><button className="text-button" onClick={() => setSelectedGroupId(selectedGroupId === group.id ? "" : group.id)}>{selectedGroupId === group.id ? "Hide recipients" : "Manage recipients"}</button><button className="text-button" onClick={() => void updateGroup(group, { enabled: !group.enabled }, group.enabled ? "Group address disabled" : "Group address enabled")} disabled={busy}>{group.enabled ? "Disable" : "Enable"}</button><button className="text-button danger-text-button" onClick={() => void deleteGroup(group)} disabled={busy}>Delete</button></div>{selectedGroupId === group.id && <div className="admin-group-members"><form className="admin-form-row" onSubmit={(event) => void addGroupMember(event)}><label>Recipient email<input required type="email" value={newGroupMember} onChange={(event) => setNewGroupMember(event.target.value)} placeholder="person@example.com" /></label><button className="secondary-button" disabled={busy}><Plus size={14} /> Add recipient</button></form>{group.members.map((member) => <div className="settings-item" key={member.id}><div><strong>{member.member_email}</strong><small>{member.member_user_id ? "Workspace member" : "External recipient"}</small></div><button className="text-button danger-text-button" onClick={() => void removeGroupMember(group.id, member.id)} disabled={busy}>Remove</button></div>)}{!group.members.length && <div className="rule-empty">No recipients yet. Messages to this address will not be delivered.</div>}</div>}</article>)}{!overview.groups.length && <div className="rule-empty">No group addresses configured.</div>}</div>
      <div className="setting-card admin-access-card"><div><h3>Shared mailbox access</h3><p>Grant precise read, send-as, send-on-behalf, or management permissions.</p></div><div className="admin-form-row"><label>Mailbox<select value={selectedMailboxId} onChange={(event) => void loadDelegates(event.target.value)}><option value="">Choose a mailbox</option>{allMailboxes.map((item) => <option key={item.id} value={item.id}>{item.address} · {item.owner.email}</option>)}</select></label><label>Person<select value={selectedDelegateId} onChange={(event) => setSelectedDelegateId(event.target.value)}><option value="">Choose a person</option>{overview.members.filter((member) => member.user_id !== activeMailbox?.owner_id).map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name} · {member.email}</option>)}</select></label></div><form className="admin-permission-form" onSubmit={(event) => void saveDelegate(event)}><label className="toggle-row"><input type="checkbox" checked={canRead} onChange={(event) => setCanRead(event.target.checked)} /> Read messages</label><label className="toggle-row"><input type="checkbox" checked={canSendAs} onChange={(event) => setCanSendAs(event.target.checked)} /> Send as mailbox</label><label className="toggle-row"><input type="checkbox" checked={canSendOnBehalf} onChange={(event) => setCanSendOnBehalf(event.target.checked)} /> Send on behalf</label><label className="toggle-row"><input type="checkbox" checked={canManage} onChange={(event) => setCanManage(event.target.checked)} /> Manage members</label><button className="primary-button" disabled={busy || !selectedMailboxId || !selectedDelegateId}>Save access</button></form>{selectedMailboxId && <div className="admin-delegates">{delegates.map((delegate) => <div className="settings-item" key={delegate.member_id}><div><strong>{delegate.display_name || delegate.email}</strong><small>{delegate.email} · {delegate.can_read ? "read" : "no read"}{delegate.can_send_as ? " · send as" : ""}{delegate.can_send_on_behalf ? " · on behalf" : ""}{delegate.can_manage ? " · manage" : ""}</small></div><button className="text-button danger-text-button" onClick={() => void removeDelegate(delegate.member_id)} disabled={busy}>Remove</button></div>)}{!delegates.length && <div className="rule-empty">No delegated access yet.</div>}</div>}</div>
      <div className="setting-card admin-activity-card"><div className="setting-card-head"><div><h3>Security and activity history</h3><p>Sign-ins, suspicious access, resets, and session revocations are retained here.</p></div><History size={18} aria-hidden="true" /></div>{overview.activity.slice(0, 20).map((event) => <div className="settings-item" key={event.id}><div><strong>{event.email || event.subject_user_id}</strong><small>{event.event_type.replace(/_/g, " ")} · {new Date(event.created_at).toLocaleString()}</small></div>{event.is_suspicious && <span className="admin-badge security"><ShieldAlert size={12} /> Review</span>}</div>)}{!overview.activity.length && <div className="rule-empty">No account activity recorded yet.</div>}</div>
    </div>
  );
}

function csvLines(value: string): string[][] {
  return value.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const cells: string[] = []; let cell = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; } else cell += character; }
    cells.push(cell.trim()); return cells;
  });
}

function CollaborationPanel() {
  const [overview, setOverview] = useState<CollaborationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sharedKind, setSharedKind] = useState("template");
  const [sharedName, setSharedName] = useState("");
  const [sharedContent, setSharedContent] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [policyKind, setPolicyKind] = useState("escalation");
  const [policyEvent, setPolicyEvent] = useState("message_received");
  const [policyPriority, setPolicyPriority] = useState("normal");
  const [policyStatus, setPolicyStatus] = useState("open");
  const [policyAssignee, setPolicyAssignee] = useState("");
  const [policySlaMinutes, setPolicySlaMinutes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setOverview(await apiFetch<CollaborationOverview>("/api/collaboration/overview")); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Collaboration workspace unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createShared(event: FormEvent) {
    event.preventDefault();
    if (!sharedName.trim() || !sharedContent.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/collaboration/shared-items", { method: "POST", body: JSON.stringify({ kind: sharedKind, name: sharedName.trim(), payload: { text: sharedContent.trim() } }) });
      setSharedName(""); setSharedContent(""); setNotice("Shared resource added to the workspace library"); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Shared resource could not be added"); }
    finally { setBusy(false); }
  }
  async function removeShared(id: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/collaboration/shared-items/${id}`, { method: "DELETE" }); setNotice("Shared resource removed"); await load(); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Shared resource could not be removed"); }
    finally { setBusy(false); }
  }
  async function createPolicy(event: FormEvent) {
    event.preventDefault();
    if (!policyName.trim()) return;
    setBusy(true); setError(""); setNotice("");
    const actions: Record<string, unknown> = { status: policyStatus, priority: policyPriority };
    if (policyAssignee) actions.assigneeId = policyAssignee;
    if (policySlaMinutes) actions.slaMinutes = Number(policySlaMinutes);
    try {
      await apiFetch("/api/collaboration/policies", { method: "POST", body: JSON.stringify({ name: policyName.trim(), kind: policyKind, conditions: { event: policyEvent }, actions, priority: (overview?.policies.length || 0) * 100 + 100 }) });
      setPolicyName(""); setPolicyAssignee(""); setPolicySlaMinutes(""); setNotice("Workspace workflow saved"); await load();
    } catch (policyError) { setError(policyError instanceof Error ? policyError.message : "Workflow could not be saved"); }
    finally { setBusy(false); }
  }
  async function togglePolicy(policy: CollaborationOverview["policies"][number]) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/collaboration/policies/${policy.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !policy.enabled }) }); setNotice(policy.enabled ? "Workflow paused" : "Workflow enabled"); await load(); }
    catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "Workflow could not be updated"); }
    finally { setBusy(false); }
  }
  async function removePolicy(id: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/collaboration/policies/${id}`, { method: "DELETE" }); setNotice("Workflow removed"); await load(); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Workflow could not be removed"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="admin-loading" role="status">Loading team collaboration…</div>;
  if (!overview) return <div className="settings-alert settings-error" role="alert">{error || "Team collaboration is unavailable"}</div>;
  const resources = overview.sharedItems || [];
  return <div className="collaboration-console">
    <div className="admin-toolbar">
      <div><p className="eyebrow">TEAM COLLABORATION</p><h3>{overview.organization.name}</h3><p>Coordinate shared inbox work with clear ownership, private notes, and a traceable activity trail.</p></div>
      <button className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={14} /> Refresh</button>
    </div>
    {error && <div className="settings-alert settings-error" role="alert">{error}</div>}
    {notice && <div className="form-notice" role="status">{notice}</div>}
    <div className="collaboration-stats"><div><strong>{overview.analytics.totalThreads}</strong><span>Tracked conversations</span></div><div><strong>{overview.analytics.assignedThreads}</strong><span>Assigned</span></div><div><strong>{overview.analytics.unassignedThreads}</strong><span>Unassigned</span></div><div className={overview.analytics.slaBreached ? "is-warning" : ""}><strong>{overview.analytics.slaBreached}</strong><span>SLA breaches</span></div></div>
    <div className="collaboration-grid">
      <section className="setting-card"><div className="setting-card-head"><div><h3>Workspace members</h3><p>Members can collaborate on delegated or shared mailbox conversations.</p></div><Users size={18} /></div><div className="collaboration-member-list">{overview.members.map((member) => <div className="collaboration-member" key={member.user_id}><span className="collaboration-avatar">{(member.display_name || member.email).slice(0, 1).toUpperCase()}</span><div><strong>{member.display_name || member.email}</strong><small>{member.email}</small></div><span className={`admin-badge ${member.role === "owner" || member.role === "admin" ? "active" : "member"}`}>{member.role}</span></div>)}</div></section>
      <section className="setting-card"><div className="setting-card-head"><div><h3>Shared library</h3><p>Team templates, contacts, signatures, labels, and calendar resources.</p></div><Tag size={18} /></div><form className="collaboration-form" onSubmit={(event) => void createShared(event)}><div className="admin-form-row"><label>Resource type<select value={sharedKind} onChange={(event) => setSharedKind(event.target.value)}><option value="template">Team template</option><option value="contact">Shared contact</option><option value="signature">Shared signature</option><option value="label">Shared label</option><option value="calendar">Shared calendar item</option></select></label><label>Name<input value={sharedName} onChange={(event) => setSharedName(event.target.value)} placeholder="Support reply" required /></label></div><label>Content or resource details<textarea value={sharedContent} onChange={(event) => setSharedContent(event.target.value)} placeholder="Reusable text, contact details, or calendar information" rows={3} required /></label><button className="primary-button" disabled={busy}><Plus size={15} /> Add shared resource</button></form><div className="collaboration-resource-list">{resources.map((item) => <div className="collaboration-resource" key={item.id}><div><span className="collaboration-resource-kind">{item.kind}</span><strong>{item.name}</strong><small>{String(item.payload?.text || "Shared with the workspace")}</small></div><button className="text-button danger-text-button" onClick={() => void removeShared(item.id)} disabled={busy} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button></div>)}{!resources.length && <div className="rule-empty">No shared resources yet.</div>}</div></section>
      <section className="setting-card collaboration-workflow-card"><div className="setting-card-head"><div><h3>Approval and escalation rules</h3><p>Automate assignment, priorities, status, and SLA deadlines for workspace events.</p></div><ShieldAlert size={18} /></div><form className="collaboration-form" onSubmit={(event) => void createPolicy(event)}><div className="admin-form-row"><label>Rule name<input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="Urgent inbound triage" required /></label><label>Rule type<select value={policyKind} onChange={(event) => setPolicyKind(event.target.value)}><option value="escalation">Escalation</option><option value="approval">Approval</option></select></label></div><div className="admin-form-row"><label>When<select value={policyEvent} onChange={(event) => setPolicyEvent(event.target.value)}><option value="message_received">A message arrives</option><option value="comment_added">A team comment is added</option><option value="assignment_changed">Assignment changes</option><option value="status_changed">Status changes</option><option value="priority_changed">Priority changes</option></select></label><label>Priority<select value={policyPriority} onChange={(event) => setPolicyPriority(event.target.value)}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label></div><div className="admin-form-row"><label>Set status<select value={policyStatus} onChange={(event) => setPolicyStatus(event.target.value)}><option value="new">New</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option></select></label><label>Assign to<select value={policyAssignee} onChange={(event) => setPolicyAssignee(event.target.value)}><option value="">Leave unassigned</option>{overview.members.filter((member) => member.status === "active").map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}</select></label></div><label>SLA minutes<input type="number" min="0" max="10080" value={policySlaMinutes} onChange={(event) => setPolicySlaMinutes(event.target.value)} placeholder="Default by priority" /></label><button className="primary-button" disabled={busy}><Plus size={15} /> Add workflow</button></form><div className="collaboration-policy-list">{overview.policies.map((policy) => <div className="collaboration-policy" key={policy.id}><div><strong>{policy.name}</strong><small>{policy.kind} · {String(policy.conditions?.event || "event")} · {policy.enabled ? "enabled" : "paused"}</small></div><div className="security-actions"><button className="text-button" onClick={() => void togglePolicy(policy)} disabled={busy}>{policy.enabled ? "Pause" : "Enable"}</button><button className="text-button danger-text-button" onClick={() => void removePolicy(policy.id)} disabled={busy}>Remove</button></div></div>)}{!overview.policies.length && <div className="rule-empty">No workspace workflows configured.</div>}</div></section>
      <section className="setting-card"><div className="setting-card-head"><div><h3>Team activity</h3><p>Recent assignments, comments, SLA events, and shared-resource changes.</p></div><History size={18} /></div><div className="collaboration-activity-list">{overview.activity.slice(0, 12).map((item) => <div className="collaboration-activity" key={item.id}><span className="collaboration-activity-dot" /><div><strong>{item.event_type.replace(/_/g, " ")}</strong><small>{item.actor?.display_name || item.actor?.email || "Workspace member"} · {new Date(item.created_at).toLocaleString()}</small></div></div>)}{!overview.activity.length && <div className="rule-empty">No collaboration activity yet.</div>}</div></section>
    </div>
  </div>;
}

function SettingsPanel({
  session,
  settings,
  folders,
  labels,
  mailboxes,
  rules,
  senderPolicies,
  onClose,
  onChanged,
  onOpenMessage,
  loadRemoteImages,
  onLoadRemoteImagesChange,
}: {
  session: Session;
  settings: AppSettings;
  folders: CustomFolder[];
  labels: Label[];
  mailboxes: Mailbox[];
  rules: Rule[];
  senderPolicies: SenderPolicy[];
  onClose: () => void;
  onChanged: () => void;
  onOpenMessage: (message: Message) => void;
  loadRemoteImages: boolean;
  onLoadRemoteImagesChange: (value: boolean) => void;
}) {
  const { confirm, prompt } = useAppDialog();
  const [tab, setTab] = useState<
    | "appearance"
    | "security"
    | "privacy"
    | "organize"
    | "contacts"
    | "spam"
    | "automation"
    | "collaboration"
    | "mailboxes"
    | "integrations"
    | "administration"
  >("appearance");
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("#6f7d91");
  const [folderParentId, setFolderParentId] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#2d5bff");
  const [labelParentId, setLabelParentId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactAvatarUrl, setContactAvatarUrl] = useState("");
  const [policyType, setPolicyType] = useState<"address" | "domain">("address");
  const [policyValue, setPolicyValue] = useState("");
  const [policyAction, setPolicyAction] = useState<SenderPolicy["action"]>("inbox");
  const [policyMailboxId, setPolicyMailboxId] = useState("");
  const [policyTargetFolderId, setPolicyTargetFolderId] = useState("");
  const [policyBusy, setPolicyBusy] = useState(false);
  const [screeningQueue, setScreeningQueue] = useState<Message[]>([]);
  const [screeningBusy, setScreeningBusy] = useState<string | null>(null);
  const [organizationBlocklist, setOrganizationBlocklist] = useState<OrganizationBlock[]>([]);
  const [organizationBlocklistAvailable, setOrganizationBlocklistAvailable] = useState(false);
  const [organizationBlockType, setOrganizationBlockType] = useState<OrganizationBlock["match_type"]>("domain");
  const [organizationBlockValue, setOrganizationBlockValue] = useState("");
  const [organizationBlockBusy, setOrganizationBlockBusy] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleConditions, setRuleConditions] = useState<RuleCondition[]>([
    { type: "fromContains", value: "" },
  ]);
  const [ruleExceptions, setRuleExceptions] = useState<RuleCondition[]>([]);
  const [ruleFolder, setRuleFolder] = useState("none");
  const [ruleCustomFolderId, setRuleCustomFolderId] = useState("");
  const [ruleMarkRead, setRuleMarkRead] = useState<"ignore" | "true" | "false">("ignore");
  const [ruleStar, setRuleStar] = useState<"ignore" | "true" | "false">("ignore");
  const [rulePin, setRulePin] = useState<"ignore" | "true" | "false">("ignore");
  const [ruleFlag, setRuleFlag] = useState<"ignore" | "true" | "false">("ignore");
  const [rulePriorityAction, setRulePriorityAction] = useState("ignore");
  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleForwardTo, setRuleForwardTo] = useState("");
  const [ruleSnoozeMinutes, setRuleSnoozeMinutes] = useState("");
  const [ruleAssignTo, setRuleAssignTo] = useState("");
  const [ruleAutoReply, setRuleAutoReply] = useState(false);
  const [ruleWebhookUrl, setRuleWebhookUrl] = useState("");
  const [ruleWebhookSecret, setRuleWebhookSecret] = useState("");
  const [ruleCreateTask, setRuleCreateTask] = useState("");
  const [ruleCreateCalendarEvent, setRuleCreateCalendarEvent] = useState(false);
  const [ruleStoreInB2, setRuleStoreInB2] = useState(false);
  const [ruleScope, setRuleScope] = useState<"personal" | "organization">("personal");
  const [ruleTriggerType, setRuleTriggerType] = useState<"inbound" | "event" | "scheduled">("inbound");
  const [ruleSchedule, setRuleSchedule] = useState<"hourly" | "daily" | "weekly">("daily");
  const [ruleScheduleAt, setRuleScheduleAt] = useState("");
  const [ruleStop, setRuleStop] = useState(true);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [rulePosition, setRulePosition] = useState(100);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureText, setSignatureText] = useState("");
  const [mailboxAddress, setMailboxAddress] = useState("");
  const [mailboxName, setMailboxName] = useState("");
  const [autoReply, setAutoReply] = useState<AutoReply>({
    enabled: false,
    subject: "Automatic reply",
    body: "",
  });
  const [notice, setNotice] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [recoveryMethods, setRecoveryMethods] = useState<RecoveryMethod[]>([]);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaPendingFactor, setMfaPendingFactor] = useState<MfaFactor | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{ id: string; qrCode: string; secret: string; uri: string } | null>(null);
  const [mfaQrFailed, setMfaQrFailed] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0);
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<string[]>([]);
  const [securityOverview, setSecurityOverview] = useState<SecurityOverview | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [accountExportBusy, setAccountExportBusy] = useState(false);
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
  const [retentionName, setRetentionName] = useState("");
  const [retentionScope, setRetentionScope] = useState<RetentionPolicy["scope"]>("all");
  const [retentionDays, setRetentionDays] = useState("365");
  const [ruleLab, setRuleLab] = useState<{ rule: Rule; result: RuleLabResult } | null>(null);
  const [ruleLabBusy, setRuleLabBusy] = useState(false);
  const [ruleRuns, setRuleRuns] = useState<RuleRun[]>([]);
  const ruleImportRef = useRef<HTMLInputElement>(null);
  const sieveImportRef = useRef<HTMLInputElement>(null);
  async function updateSettings(patch: JsonSettings) {
    await apiFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    onChanged();
  }
  async function createFolder() {
    if (!folderName.trim()) return;
    await apiFetch("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name: folderName, color: folderColor, parentId: folderParentId || null }),
    });
    setFolderName("");
    setNotice("Folder created");
    onChanged();
  }
  async function createLabel() {
    if (!labelName.trim()) return;
    await apiFetch("/api/labels", {
      method: "POST",
      body: JSON.stringify({ name: labelName, color: labelColor, parentId: labelParentId || null }),
    });
    setLabelName("");
    setNotice("Label created");
    onChanged();
  }
  async function loadRetentionPolicies() {
    try {
      setRetentionPolicies(await apiFetch<RetentionPolicy[]>("/api/retention-policies"));
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : "Retention policies unavailable");
    }
  }
  async function createRetentionPolicy() {
    if (!retentionName.trim()) return;
    try {
      await apiFetch("/api/retention-policies", { method: "POST", body: JSON.stringify({ name: retentionName.trim(), scope: retentionScope, retentionDays: Number(retentionDays) }) });
      setRetentionName("");
      setNotice("Retention policy saved");
      await loadRetentionPolicies();
    } catch (policyError) {
      setNotice(policyError instanceof Error ? policyError.message : "Could not save retention policy");
    }
  }
  async function toggleRetentionPolicy(policy: RetentionPolicy) {
    try {
      await apiFetch(`/api/retention-policies/${policy.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !policy.enabled }) });
      await loadRetentionPolicies();
    } catch (policyError) {
      setNotice(policyError instanceof Error ? policyError.message : "Could not update retention policy");
    }
  }
  async function createContact() {
    if (!contactEmail.trim()) return;
    await apiFetch("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ email: contactEmail, displayName: contactName, avatarUrl: contactAvatarUrl }),
    });
    setContactEmail("");
    setContactName("");
    setContactAvatarUrl("");
    setNotice("Contact saved");
    onChanged();
  }
  async function createSenderPolicy() {
    if (!policyValue.trim()) {
      setNotice(`Enter a ${policyType === "domain" ? "domain" : "sender address"}`);
      return;
    }
    setPolicyBusy(true);
    try {
      await apiFetch("/api/sender-policies", {
        method: "POST",
        body: JSON.stringify({
          matchType: policyType,
          matchValue: policyValue,
          action: policyAction,
          mailboxId: policyMailboxId || null,
          targetFolderId: policyAction === "folder" ? policyTargetFolderId || null : null,
        }),
      });
      setPolicyValue("");
      setPolicyTargetFolderId("");
      setNotice(policyAction === "inbox" ? "Trusted sender saved" : policyAction === "spam" ? "Blocked sender saved" : "Sender review rule saved");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save sender policy");
    } finally {
      setPolicyBusy(false);
    }
  }
  async function applyPolicyToExisting(policy: SenderPolicy) {
    if (!(await confirm({
      title: "Apply this decision to existing mail?",
      message: "Matching messages already in Postveil will be reviewed, up to 500 messages.",
      confirmLabel: "Apply decision",
    }))) return;
    try {
      const result = await apiFetch<{ matched: number; changed: number; capped?: boolean }>(`/api/sender-policies/${policy.id}/apply-existing`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      setNotice(`${result.changed} existing message${result.changed === 1 ? "" : "s"} updated${result.capped ? " · limited to 500" : ""}`);
      onChanged();
      if (tab === "spam") void loadScreeningQueue();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Existing messages could not be updated");
    }
  }
  async function loadScreeningQueue() {
    try { setScreeningQueue(await apiFetch<Message[]>("/api/screening/queue")); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "Screening queue unavailable"); }
  }
  async function loadRuleRuns() {
    try { setRuleRuns(await apiFetch<RuleRun[]>("/api/rule-runs")); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "Rule history unavailable"); }
  }
  async function loadOrganizationBlocklist() {
    try {
      setOrganizationBlocklist(await apiFetch<OrganizationBlock[]>("/api/admin/organization-blocklist"));
      setOrganizationBlocklistAvailable(true);
    } catch {
      setOrganizationBlocklistAvailable(false);
    }
  }
  async function createOrganizationBlock() {
    if (!organizationBlockValue.trim()) {
      setNotice(`Enter a ${organizationBlockType === "domain" ? "domain" : "sender address"}`);
      return;
    }
    setOrganizationBlockBusy(true);
    try {
      await apiFetch<OrganizationBlock>("/api/admin/organization-blocklist", { method: "POST", body: JSON.stringify({ matchType: organizationBlockType, matchValue: organizationBlockValue }) });
      setOrganizationBlockValue("");
      setNotice("Organization block saved");
      await loadOrganizationBlocklist();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Organization block could not be saved");
    } finally {
      setOrganizationBlockBusy(false);
    }
  }
  async function toggleOrganizationBlock(block: OrganizationBlock) {
    try {
      await apiFetch(`/api/admin/organization-blocklist/${block.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !block.enabled }) });
      await loadOrganizationBlocklist();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Organization block could not be updated");
    }
  }
  async function deleteOrganizationBlock(block: OrganizationBlock) {
    if (!(await confirm({ title: "Remove organization block?", message: `New mail matching ${block.match_value} will follow normal screening rules.`, confirmLabel: "Remove block", danger: true }))) return;
    try {
      await apiFetch(`/api/admin/organization-blocklist/${block.id}`, { method: "DELETE" });
      setNotice("Organization block removed");
      await loadOrganizationBlocklist();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Organization block could not be removed");
    }
  }
  async function decideScreening(message: Message, decision: "approve" | "block" | "reroute") {
    setScreeningBusy(message.id);
    try {
      await apiFetch(`/api/screening/${message.id}/decision`, { method: "POST", body: JSON.stringify({ decision, folder: decision === "reroute" ? "archive" : undefined }) });
      setScreeningQueue((current) => current.filter((item) => item.id !== message.id));
      setNotice(decision === "approve" ? "Message approved to Inbox" : decision === "block" ? "Message moved to Spam" : "Message archived");
      onChanged();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Screening decision failed"); }
    finally { setScreeningBusy(null); }
  }
  async function toggleSenderPolicy(policy: SenderPolicy) {
    try {
      await apiFetch(`/api/sender-policies/${policy.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !policy.enabled }),
      });
      setNotice(policy.enabled ? "Sender policy paused" : "Sender policy enabled");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update sender policy");
    }
  }
  async function deleteSenderPolicy(policy: SenderPolicy) {
    if (!(await confirm({
      title: "Remove this sender decision?",
      message: `Remove the decision for ${policy.match_value}? New messages from this sender will follow the default screening rules.`,
      confirmLabel: "Remove decision",
      danger: true,
    }))) return;
    try {
      await apiFetch(`/api/sender-policies/${policy.id}`, { method: "DELETE" });
      setNotice("Sender policy removed");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not remove sender policy");
    }
  }
  function resetRuleEditor() {
    setEditingRuleId(null);
    setRuleName("");
    setRuleConditions([{ type: "fromContains", value: "" }]);
    setRuleExceptions([]);
    setRuleFolder("none");
    setRuleCustomFolderId("");
    setRuleMarkRead("ignore");
    setRuleStar("ignore");
    setRulePin("ignore");
    setRuleFlag("ignore");
    setRulePriorityAction("ignore");
    setRuleLabel("");
    setRuleForwardTo("");
    setRuleSnoozeMinutes("");
    setRuleAssignTo("");
    setRuleAutoReply(false);
    setRuleWebhookUrl("");
    setRuleWebhookSecret("");
    setRuleCreateTask("");
    setRuleCreateCalendarEvent(false);
    setRuleStoreInB2(false);
    setRuleScope("personal");
    setRuleTriggerType("inbound");
    setRuleSchedule("daily");
    setRuleScheduleAt("");
    setRuleStop(true);
    setRuleEnabled(true);
    setRulePosition(Math.max(100, ...rules.map((rule) => rule.priority + 100)));
  }
  function editRule(rule: Rule) {
    const conditions = rule.conditions || {};
    const exceptions = conditions.exceptions && typeof conditions.exceptions === "object" && !Array.isArray(conditions.exceptions)
      ? conditions.exceptions as Record<string, unknown>
      : {};
    const actions = rule.actions || {};
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleConditions(ruleConditionsFromRecord(conditions));
    setRuleExceptions(ruleConditionsFromRecord(exceptions).filter((row) => row.value));
    setRuleFolder(typeof actions.customFolderId === "string" ? "custom" : typeof actions.folder === "string" ? actions.folder : "none");
    setRuleCustomFolderId(typeof actions.customFolderId === "string" ? actions.customFolderId : "");
    setRuleMarkRead(actionMode(actions, "markRead"));
    setRuleStar(actionMode(actions, "star"));
    setRulePin(actionMode(actions, "pin"));
    setRuleFlag(actionMode(actions, "flag"));
    setRulePriorityAction(typeof actions.priority === "number" ? String(actions.priority) : "ignore");
    setRuleLabel(typeof actions.label === "string" ? actions.label : "");
    setRuleForwardTo(typeof actions.forwardTo === "string" ? actions.forwardTo : "");
    setRuleSnoozeMinutes(typeof actions.snoozeMinutes === "number" ? String(actions.snoozeMinutes) : "");
    setRuleAssignTo(typeof actions.assignTo === "string" ? actions.assignTo : "");
    setRuleAutoReply(actions.autoReply === true);
    setRuleWebhookUrl(typeof actions.webhookUrl === "string" ? actions.webhookUrl : "");
    setRuleWebhookSecret(typeof actions.webhookSecret === "string" ? actions.webhookSecret : "");
    setRuleCreateTask(typeof actions.createTask === "string" ? actions.createTask : "");
    setRuleCreateCalendarEvent(actions.createCalendarEvent === true);
    setRuleStoreInB2(actions.storeInB2 === true);
    setRuleScope(rule.scope === "organization" ? "organization" : "personal");
    setRuleTriggerType(rule.trigger_type === "event" || rule.trigger_type === "scheduled" ? rule.trigger_type : "inbound");
    setRuleSchedule(rule.schedule?.frequency === "hourly" || rule.schedule?.frequency === "weekly" ? rule.schedule.frequency : "daily");
    setRuleScheduleAt(typeof rule.schedule?.at === "string" ? String(rule.schedule.at).slice(0, 16) : "");
    setRuleStop(actions.stopProcessing !== false);
    setRuleEnabled(rule.enabled);
    setRulePosition(rule.priority);
  }
  function updateCondition(setter: (value: RuleCondition[]) => void, rows: RuleCondition[], index: number, patch: Partial<RuleCondition>) {
    setter(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }
  function addCondition(setter: (value: RuleCondition[]) => void, rows: RuleCondition[]) {
    setter([...rows, { type: "subjectContains", value: "" }]);
  }
  function removeCondition(setter: (value: RuleCondition[]) => void, rows: RuleCondition[], index: number) {
    setter(rows.filter((_, rowIndex) => rowIndex !== index));
  }
  async function saveRule() {
    const conditions = ruleConditionRecord(ruleConditions);
    const exceptions = ruleConditionRecord(ruleExceptions);
    const actions: Record<string, unknown> = { stopProcessing: ruleStop };
    if (ruleFolder === "custom" && ruleCustomFolderId) actions.customFolderId = ruleCustomFolderId;
    else if (ruleFolder !== "none") actions.folder = ruleFolder;
    if (ruleMarkRead !== "ignore") actions.markRead = ruleMarkRead === "true";
    if (ruleStar !== "ignore") actions.star = ruleStar === "true";
    if (rulePin !== "ignore") actions.pin = rulePin === "true";
    if (ruleFlag !== "ignore") actions.flag = ruleFlag === "true";
    if (rulePriorityAction !== "ignore") actions.priority = Number(rulePriorityAction);
    if (ruleLabel.trim()) actions.label = ruleLabel.trim();
    if (ruleForwardTo.trim()) actions.forwardTo = ruleForwardTo.trim();
    if (ruleSnoozeMinutes.trim()) actions.snoozeMinutes = Number(ruleSnoozeMinutes);
    if (ruleAssignTo.trim()) actions.assignTo = ruleAssignTo.trim();
    if (ruleAutoReply) actions.autoReply = true;
    if (ruleWebhookUrl.trim()) actions.webhookUrl = ruleWebhookUrl.trim();
    if (ruleWebhookSecret.trim()) actions.webhookSecret = ruleWebhookSecret.trim();
    if (ruleCreateTask.trim()) actions.createTask = ruleCreateTask.trim();
    if (ruleCreateCalendarEvent) actions.createCalendarEvent = true;
    if (ruleStoreInB2) actions.storeInB2 = true;
    if (!ruleName.trim()) {
      setNotice("Name the rule before saving");
      return;
    }
    if (!Object.keys(conditions).length) {
      setNotice("Add at least one condition");
      return;
    }
    if (ruleFolder === "custom" && !ruleCustomFolderId) {
      setNotice("Choose a custom folder");
      return;
    }
    if (Object.keys(actions).length === 1) {
      setNotice("Choose at least one action");
      return;
    }
    setRuleBusy(true);
    try {
      await apiFetch(editingRuleId ? `/api/rules/${editingRuleId}` : "/api/rules", {
        method: editingRuleId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: ruleName,
          priority: rulePosition,
          enabled: ruleEnabled,
          conditions,
          exceptions,
          actions,
          scope: ruleScope,
          triggerType: ruleTriggerType,
          schedule: ruleTriggerType === "scheduled" ? { frequency: ruleSchedule, at: ruleScheduleAt ? new Date(ruleScheduleAt).toISOString() : null } : {},
        }),
      });
      resetRuleEditor();
      setNotice(editingRuleId ? "Rule updated" : "Rule created");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save rule");
    } finally {
      setRuleBusy(false);
    }
  }
  async function updateRule(rule: Rule, patch: Record<string, unknown>, message: string) {
    try {
      await apiFetch(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setNotice(message);
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update rule");
    }
  }
  async function deleteRule(rule: Rule) {
    if (!(await confirm({
      title: "Delete this rule?",
      message: `Delete the rule “${rule.name}”? Existing messages will not be changed.`,
      confirmLabel: "Delete rule",
      danger: true,
    }))) return;
    try {
      await apiFetch(`/api/rules/${rule.id}`, { method: "DELETE" });
      if (editingRuleId === rule.id) resetRuleEditor();
      setNotice("Rule deleted");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete rule");
    }
  }
  async function reorderRule(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const ids = rules.map((rule) => rule.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await apiFetch("/api/rules/reorder", { method: "POST", body: JSON.stringify({ ids }) });
      setNotice("Rule order updated");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not reorder rules");
    }
  }
  async function runRuleLab(rule: Rule, mode: "preview" | "dry-run") {
    setRuleLabBusy(true);
    try {
      const result = await apiFetch<RuleLabResult>(`/api/rules/${rule.id}/${mode}`, { method: "POST" });
      setRuleLab({ rule, result });
      setNotice(mode === "preview" ? "Preview ready — no messages changed" : "Dry-run ready — review the impact before applying");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not preview this rule");
    } finally {
      setRuleLabBusy(false);
    }
  }
  async function applyRuleLab() {
    if (!ruleLab) return;
    setRuleLabBusy(true);
    try {
      const result = await apiFetch<RuleLabResult>(`/api/rules/${ruleLab.rule.id}/apply`, { method: "POST", body: JSON.stringify({ runId: ruleLab.result.runId }) });
      setRuleLab({ rule: ruleLab.rule, result });
      setNotice(`${result.changedCount} message${result.changedCount === 1 ? "" : "s"} updated. Undo is available for 30 seconds.`);
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not apply this rule");
    } finally {
      setRuleLabBusy(false);
    }
  }
  async function undoRuleLab() {
    if (!ruleLab) return;
    setRuleLabBusy(true);
    try {
      await apiFetch(`/api/rule-runs/${ruleLab.result.runId}/undo`, { method: "POST" });
      setRuleLab(null);
      setNotice("Rule changes undone");
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Rule undo is no longer available");
    } finally {
      setRuleLabBusy(false);
    }
  }
  async function exportRules() {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch("/api/rules/export", { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "postveil-rules.json";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Rules exported");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Rules could not be exported");
    }
  }
  async function importRules(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const result = await apiFetch<{ imported: number; failures: Array<{ index: number; error: string }> }>("/api/rules/import", { method: "POST", body: JSON.stringify(payload) });
      setNotice(`${result.imported} rule${result.imported === 1 ? "" : "s"} imported${result.failures.length ? ` · ${result.failures.length} skipped` : ""}`);
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Rules file could not be imported");
    }
  }
  async function exportSieve() {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch("/api/rules/sieve", { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) throw new Error(`Sieve export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "postveil-rules.sieve"; link.click(); URL.revokeObjectURL(url);
      setNotice("Sieve rules exported");
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Sieve rules could not be exported"); }
  }
  async function importSieve(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const result = await apiFetch<{ imported: number; failures: Array<{ index: number; error: string }> }>("/api/rules/sieve", { method: "POST", body: JSON.stringify({ sieve: await file.text() }) });
      setNotice(`${result.imported} Sieve rule${result.imported === 1 ? "" : "s"} imported${result.failures.length ? ` · ${result.failures.length} skipped` : ""}`); onChanged();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Sieve rules could not be imported"); }
  }
  async function createSignature() {
    if (!signatureName.trim()) return;
    await apiFetch("/api/signatures", {
      method: "POST",
      body: JSON.stringify({
        mailboxId: mailboxes[0]?.id,
        name: signatureName,
        text: signatureText,
        isDefault: true,
      }),
    });
    setSignatureName("");
    setSignatureText("");
    setNotice("Signature saved");
    onChanged();
  }
  async function createMailbox() {
    if (!mailboxAddress.trim()) return;
    await apiFetch("/api/mailboxes", {
      method: "POST",
      body: JSON.stringify({
        address: mailboxAddress,
        displayName: mailboxName || mailboxAddress.split("@")[0],
      }),
    });
    setMailboxAddress("");
    setMailboxName("");
    setNotice("Mailbox added");
    onChanged();
  }
  async function updateMailbox(mailbox: Mailbox, patch: JsonSettings) {
    await apiFetch(`/api/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setNotice("Mailbox updated");
    onChanged();
  }
  async function saveAutoReply() {
    await apiFetch("/api/auto-replies", {
      method: "POST",
      body: JSON.stringify({
        mailboxId:
          autoReply.mailbox_id ||
          mailboxes.find((item) => item.is_default)?.id ||
          mailboxes[0]?.id,
        enabled: autoReply.enabled,
        subject: autoReply.subject,
        body: autoReply.body,
        startsAt: autoReply.starts_at || null,
        endsAt: autoReply.ends_at || null,
      }),
    });
    setNotice("Automatic reply saved");
  }
  async function loadSecurity() {
    setSecurityError("");
    try {
      const [methods, factorsResult] = await Promise.all([
        apiFetch<RecoveryMethod[]>("/api/recovery-methods"),
        requireSupabase().auth.mfa.listFactors(),
      ]);
      if (factorsResult.error) throw factorsResult.error;
      setRecoveryMethods(methods);
      const factors = [...(factorsResult.data?.totp || []), ...(factorsResult.data?.phone || [])] as MfaFactor[];
      setMfaFactors(factors.filter((factor) => factor.status === "verified"));
      setMfaPendingFactor(factors.find((factor) => factor.factor_type === "totp" && factor.status === "unverified") || null);
      const passkeyResult = await requireSupabase().auth.passkey.list();
      if (passkeyResult.error) throw passkeyResult.error;
      setPasskeys((passkeyResult.data || []) as Passkey[]);
      const recoveryCodeStatus = await apiFetch<{ remaining: number }>("/api/recovery-codes/status");
      setRecoveryCodeCount(recoveryCodeStatus.remaining);
      const overview = await apiFetch<SecurityOverview>("/api/security/overview");
      setSecurityOverview(overview);
      setPrivacySettings(overview.privacy);
      onLoadRemoteImagesChange(overview.privacy.remote_images_enabled);
    } catch (loadError) {
      setSecurityError(loadError instanceof Error ? loadError.message : "Security settings unavailable");
    }
  }
  async function updatePrivacy(patch: Partial<PrivacySettings>) {
    setPrivacyBusy(true);
    setSecurityError("");
    try {
      const next = await apiFetch<PrivacySettings>("/api/privacy-settings", { method: "PATCH", body: JSON.stringify(patch) });
      setPrivacySettings(next);
      if ("remote_images_enabled" in patch) onLoadRemoteImagesChange(next.remote_images_enabled);
      setNotice("Privacy preferences saved");
      const overview = await apiFetch<SecurityOverview>("/api/security/overview");
      setSecurityOverview(overview);
    } catch (privacyError) {
      setSecurityError(privacyError instanceof Error ? privacyError.message : "Privacy preferences could not be saved");
    } finally {
      setPrivacyBusy(false);
    }
  }
  async function exportAccountData() {
    setAccountExportBusy(true);
    setSecurityError("");
    try {
      const authSession = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch("/api/account/export", { headers: authSession?.access_token ? { authorization: `Bearer ${authSession.access_token}` } : {} });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `Export failed (${response.status})`); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `postveil-account-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
      setNotice("Account export downloaded");
      const overview = await apiFetch<SecurityOverview>("/api/security/overview"); setSecurityOverview(overview);
    } catch (exportError) {
      setSecurityError(exportError instanceof Error ? exportError.message : "Account export could not be downloaded");
    } finally {
      setAccountExportBusy(false);
    }
  }
  async function deleteAccount() {
    const email = await prompt({ title: "Delete your Postveil account?", message: "This permanently removes your mailbox data and cannot be undone. Enter your sign-in email to continue.", placeholder: session.user.email || "you@example.com", inputType: "email", confirmLabel: "Continue", danger: true });
    if (!email || email.trim().toLowerCase() !== (session.user.email || "").toLowerCase()) { if (email) setSecurityError("The sign-in email did not match."); return; }
    const phrase = await prompt({ title: "Confirm permanent deletion", message: "Type DELETE MY ACCOUNT exactly. Your mailbox and tracked storage objects will be removed.", placeholder: "DELETE MY ACCOUNT", confirmLabel: "Delete account", danger: true });
    if (phrase !== "DELETE MY ACCOUNT") { if (phrase !== null) setSecurityError("The confirmation phrase did not match."); return; }
    setSecurityBusy(true);
    setSecurityError("");
    try {
      await apiFetch("/api/account/delete", { method: "POST", body: JSON.stringify({ email, confirmation: phrase }) });
      await requireSupabase().auth.signOut({ scope: "global" });
      window.location.reload();
    } catch (deleteError) {
      setSecurityError(deleteError instanceof Error ? deleteError.message : "The account could not be deleted");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function registerPasskey() {
    setPasskeyBusy(true); setSecurityError("");
    try {
      const result = await requireSupabase().auth.registerPasskey();
      if (result.error) throw result.error;
      setNotice("Passkey added to this account");
      await loadSecurity();
    } catch (passkeyError) { setSecurityError(passkeyError instanceof Error ? passkeyError.message : "Could not add that passkey"); }
    finally { setPasskeyBusy(false); }
  }
  async function renamePasskey(passkey: Passkey) {
    const friendlyName = (await prompt({
      title: "Name this passkey",
      message: "Choose a name you will recognize when signing in on this device.",
      defaultValue: passkey.friendly_name || "Passkey",
      placeholder: "e.g. Work laptop",
      confirmLabel: "Save name",
    }))?.trim();
    if (!friendlyName || friendlyName === passkey.friendly_name) return;
    setPasskeyBusy(true); setSecurityError("");
    try { const result = await requireSupabase().auth.passkey.update({ passkeyId: passkey.id, friendlyName }); if (result.error) throw result.error; setNotice("Passkey renamed"); await loadSecurity(); }
    catch (passkeyError) { setSecurityError(passkeyError instanceof Error ? passkeyError.message : "Could not rename that passkey"); }
    finally { setPasskeyBusy(false); }
  }
  async function removePasskey(passkey: Passkey) {
    if (!(await confirm({
      title: "Remove this passkey?",
      message: `Remove ${passkey.friendly_name || "this passkey"}? You will no longer be able to use it to sign in.`,
      confirmLabel: "Remove passkey",
      danger: true,
    }))) return;
    setPasskeyBusy(true); setSecurityError("");
    try { const result = await requireSupabase().auth.passkey.delete({ passkeyId: passkey.id }); if (result.error) throw result.error; setNotice("Passkey removed"); await loadSecurity(); }
    catch (passkeyError) { setSecurityError(passkeyError instanceof Error ? passkeyError.message : "Could not remove that passkey"); }
    finally { setPasskeyBusy(false); }
  }
  async function revokeOtherSessions() {
    setSecurityBusy(true); setSecurityError("");
    try { const result = await requireSupabase().auth.signOut({ scope: "others" }); if (result.error) throw result.error; setNotice("Other sessions revoked"); }
    catch (sessionError) { setSecurityError(sessionError instanceof Error ? sessionError.message : "Other sessions could not be revoked"); }
    finally { setSecurityBusy(false); }
  }
  async function generateRecoveryCodes() {
    if (!(await confirm({
      title: "Generate new recovery codes?",
      message: "Any previous unused recovery codes will stop working. Save the new set somewhere private.",
      confirmLabel: "Generate codes",
      danger: true,
    }))) return;
    setSecurityBusy(true); setSecurityError("");
    try { const result = await apiFetch<{ codes: string[]; remaining: number }>("/api/recovery-codes", { method: "POST" }); setGeneratedRecoveryCodes(result.codes); setRecoveryCodeCount(result.remaining); setNotice("New recovery codes generated. Save them somewhere private."); }
    catch (codeError) { setSecurityError(codeError instanceof Error ? codeError.message : "Recovery codes could not be generated"); }
    finally { setSecurityBusy(false); }
  }
  async function sendPrimaryReset() {
    setSecurityBusy(true);
    setSecurityError("");
    try {
      const result = await requireSupabase().auth.resetPasswordForEmail(session.user.email || "", { redirectTo: window.location.origin });
      if (result.error) throw result.error;
      setNotice("A password reset link was sent to your sign-in email");
    } catch (resetError) {
      setSecurityError(resetError instanceof Error ? resetError.message : "Could not send a reset link");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function addRecoveryEmail() {
    if (!recoveryEmail.trim()) return;
    setSecurityBusy(true);
    setSecurityError("");
    try {
      const method = await apiFetch<RecoveryMethod>("/api/recovery-methods", { method: "POST", body: JSON.stringify({ email: recoveryEmail }) });
      setRecoveryEmail("");
      setVerificationId(method.id);
      setVerificationCode("");
      setNotice(`Verification code sent to ${method.email_masked}`);
      await loadSecurity();
    } catch (addError) {
      setSecurityError(addError instanceof Error ? addError.message : "Could not add that recovery email");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function verifyRecoveryEmail() {
    if (!verificationId) return;
    setSecurityBusy(true);
    setSecurityError("");
    try {
      await apiFetch(`/api/recovery-methods/${verificationId}/verify`, { method: "POST", body: JSON.stringify({ code: verificationCode }) });
      setVerificationId(null);
      setVerificationCode("");
      setNotice("Recovery email verified");
      await loadSecurity();
    } catch (verifyError) {
      setSecurityError(verifyError instanceof Error ? verifyError.message : "Could not verify that code");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function removeRecoveryEmail(method: RecoveryMethod) {
    if (!(await confirm({
      title: "Remove this recovery email?",
      message: `Remove ${method.email_masked} as a recovery email? It will no longer help recover this account.`,
      confirmLabel: "Remove email",
      danger: true,
    }))) return;
    setSecurityBusy(true);
    try {
      await apiFetch(`/api/recovery-methods/${method.id}`, { method: "DELETE" });
      if (verificationId === method.id) setVerificationId(null);
      setNotice("Recovery email removed");
      await loadSecurity();
    } catch (removeError) {
      setSecurityError(removeError instanceof Error ? removeError.message : "Could not remove that recovery email");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function beginMfaSetup() {
    setSecurityBusy(true);
    setSecurityError("");
    try {
      const client = requireSupabase();
      const factorsResult = await client.auth.mfa.listFactors();
      if (factorsResult.error) throw factorsResult.error;
      const pendingFactor = ([...(factorsResult.data?.totp || []), ...(factorsResult.data?.phone || [])] as MfaFactor[]).find((factor) => factor.factor_type === "totp" && factor.status === "unverified") || null;
      if (pendingFactor) {
        const discarded = await client.auth.mfa.unenroll({ factorId: pendingFactor.id });
        if (discarded.error) throw discarded.error;
        setMfaPendingFactor(null);
      }
      let result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Postveil authenticator" });
      if (result.error && /friendly name.*already exists/i.test(result.error.message)) {
        const retryFactors = await client.auth.mfa.listFactors();
        if (retryFactors.error) throw retryFactors.error;
        const retryPending = ([...(retryFactors.data?.totp || []), ...(retryFactors.data?.phone || [])] as MfaFactor[]).find((factor) => factor.factor_type === "totp" && factor.status === "unverified") || null;
        if (retryPending) {
          const discarded = await client.auth.mfa.unenroll({ factorId: retryPending.id });
          if (discarded.error) throw discarded.error;
          result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Postveil authenticator" });
        }
      }
      if (result.error) throw result.error;
      setMfaSetup({ id: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret, uri: result.data.totp.uri });
      setMfaPendingFactor(null);
      setMfaQrFailed(false);
      setMfaCode("");
    } catch (enrollError) {
      const message = enrollError instanceof Error ? enrollError.message : "";
      if (/friendly name.*already exists/i.test(message)) {
        let pendingFactor: MfaFactor | null = null;
        try {
          const factorsResult = await requireSupabase().auth.mfa.listFactors();
          if (!factorsResult.error) {
            pendingFactor = ([...(factorsResult.data?.totp || []), ...(factorsResult.data?.phone || [])] as MfaFactor[]).find((factor) => factor.factor_type === "totp" && factor.status === "unverified") || null;
          }
        } catch {
          // Keep the actionable duplicate-name message even if the refresh fails.
        }
        setMfaPendingFactor(pendingFactor);
        setSecurityError(pendingFactor ? "An unfinished authenticator setup already exists. Click Generate a new QR code to replace it." : "An authenticator with this name already exists. Refresh Security & access before starting again.");
      } else {
        setSecurityError(message || "Could not start authenticator setup");
      }
    } finally {
      setSecurityBusy(false);
    }
  }
  async function verifyMfaSetup() {
    if (!mfaSetup) return;
    setSecurityBusy(true);
    setSecurityError("");
    try {
      const challenge = await requireSupabase().auth.mfa.challenge({ factorId: mfaSetup.id });
      if (challenge.error) throw challenge.error;
      const result = await requireSupabase().auth.mfa.verify({ factorId: mfaSetup.id, challengeId: challenge.data.id, code: mfaCode.replace(/\D/g, "") });
      if (result.error) throw result.error;
      const refreshed = await requireSupabase().auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      setMfaSetup(null);
      setMfaPendingFactor(null);
      setMfaQrFailed(false);
      setMfaCode("");
      setNotice("Two-step verification is now on");
      await loadSecurity();
    } catch (verifyError) {
      setSecurityError(verifyError instanceof Error ? verifyError.message : "That authenticator code was not accepted");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function cancelMfaSetup() {
    if (!mfaSetup) return;
    setSecurityBusy(true);
    setSecurityError("");
    try {
      const result = await requireSupabase().auth.mfa.unenroll({ factorId: mfaSetup.id });
      if (result.error) throw result.error;
      setMfaSetup(null);
      setMfaPendingFactor(null);
      setMfaQrFailed(false);
      setMfaCode("");
      setNotice("Authenticator setup cancelled");
      await loadSecurity();
    } catch (cancelError) {
      setSecurityError(cancelError instanceof Error ? cancelError.message : "Could not cancel authenticator setup");
    } finally {
      setSecurityBusy(false);
    }
  }
  async function removeMfaFactor(factor: MfaFactor) {
    if (!(await confirm({
      title: "Remove this authenticator?",
      message: `Remove ${factor.friendly_name || "this authenticator"}? You will need to set up two-step verification again to protect the account.`,
      confirmLabel: "Remove authenticator",
      danger: true,
    }))) return;
    setSecurityBusy(true);
    try {
      const result = await requireSupabase().auth.mfa.unenroll({ factorId: factor.id });
      if (result.error) throw result.error;
      await requireSupabase().auth.refreshSession();
      setNotice("Authenticator removed");
      await loadSecurity();
    } catch (removeError) {
      setSecurityError(removeError instanceof Error ? removeError.message : "Could not remove that authenticator");
    } finally {
      setSecurityBusy(false);
    }
  }
  useEffect(() => {
    if (tab !== "automation") return;
    void apiFetch<AutoReply[]>("/api/auto-replies")
      .then((rows) => {
        if (rows[0]) setAutoReply(rows[0]);
      })
      .catch((loadError) =>
        setNotice(
          loadError instanceof Error
            ? loadError.message
            : "Automatic reply unavailable",
        ),
      );
  }, [tab]);
  useEffect(() => {
    if (tab === "security" || tab === "privacy") void loadSecurity();
    if (tab === "spam") { void loadScreeningQueue(); void loadOrganizationBlocklist(); }
    if (tab === "automation") void loadRuleRuns();
    if (tab === "organize") void loadRetentionPolicies();
  }, [tab]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
  const activePrivacy: PrivacySettings = privacySettings || {
    owner_id: session.user.id,
    ai_processing_enabled: false,
    login_alerts_enabled: true,
    remote_images_enabled: loadRemoteImages,
    privacy_analytics_enabled: false,
    metadata_minimization_enabled: true,
    external_portal_enabled: true,
    storage_region: "default",
    no_training_ai_policy_acknowledged: false,
  };
  const securityChecks = [
    { label: "Passkey or hardware security key", enabled: passkeys.length > 0 },
    { label: "Authenticator app (TOTP)", enabled: mfaFactors.length > 0 },
    { label: "Recovery codes saved", enabled: recoveryCodeCount > 0 },
    { label: "Verified recovery email", enabled: recoveryMethods.some((method) => Boolean(method.verified_at)) },
    { label: "Login alerts", enabled: activePrivacy.login_alerts_enabled },
    { label: "Remote images blocked", enabled: !activePrivacy.remote_images_enabled },
    { label: "Metadata minimization", enabled: activePrivacy.metadata_minimization_enabled },
    { label: "AI processing off by default", enabled: !activePrivacy.ai_processing_enabled },
  ];
  const securityScore = Math.round((securityChecks.filter((check) => check.enabled).length / securityChecks.length) * 100);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="panel-title">
          <div>
            <p className="eyebrow">MAILBOX SETTINGS</p>
            <h2 id="settings-title">Settings & organization</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>
        <div className="settings-tabs">
          {(
            [
              ["appearance", "Appearance"],
              ["security", "Security & access"],
              ["privacy", "Privacy & encryption"],
              ["organize", "Folders & labels"],
              ["contacts", "Contacts"],
              ["spam", "Spam & trust"],
              ["automation", "Rules & signatures"],
              ["collaboration", "Team collaboration"],
              ["mailboxes", "Mailboxes"],
              ["administration", "Administration"],
              ["integrations", "Integrations"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "security" && securityError && <div className="settings-alert settings-error" role="alert">{securityError}</div>}
        {tab === "collaboration" && <CollaborationPanel />}
        {tab === "security" && (
          <div className="settings-grid security-settings-grid">
            <div className="setting-card">
              <div className="setting-card-head">
                <div>
                  <h3>Password</h3>
                  <p>Send a one-time password reset link to your sign-in email.</p>
                </div>
                <ShieldAlert size={18} aria-hidden="true" />
              </div>
              <div className="security-email">{session.user.email || "Your sign-in email"}</div>
              <button className="secondary-button" onClick={() => void sendPrimaryReset()} disabled={securityBusy}><Mail size={15} /> Send reset link</button>
            </div>
            <div className="setting-card">
              <div className="setting-card-head">
                <div>
                  <h3>Two-step verification</h3>
                  <p>Use an authenticator app after your password. Postveil will require it at every new sign-in.</p>
                </div>
                <span className={`security-status ${mfaFactors.length ? "enabled" : mfaPendingFactor ? "pending" : ""}`}>{mfaFactors.length ? "On" : mfaPendingFactor ? "Setup paused" : "Off"}</span>
              </div>
              {mfaPendingFactor && !mfaSetup && <div className="mfa-pending"><strong>Previous authenticator setup found</strong><small>You closed setup before verifying the code. Starting again will replace that unfinished factor with a fresh QR code.</small></div>}
              {mfaFactors.length === 0 && !mfaSetup && <button className="secondary-button" onClick={() => void beginMfaSetup()} disabled={securityBusy}><ShieldAlert size={15} /> {securityBusy ? "Generating QR code…" : mfaPendingFactor ? "Generate a new QR code" : "Set up authenticator app"}</button>}
              {mfaFactors.map((factor) => <div className="settings-item security-factor" key={factor.id}><div><strong>{factor.friendly_name || (factor.factor_type === "totp" ? "Authenticator app" : "Phone")}</strong><small>Verified · {factor.factor_type.toUpperCase()}</small></div><button className="text-button danger-text-button" onClick={() => void removeMfaFactor(factor)} disabled={securityBusy}>Remove</button></div>)}
              {mfaSetup && <div className="mfa-enrollment">
                <strong>Scan this QR code</strong>
                <small>Use Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app. Setup stays off until you enter a valid six-digit code.</small>
                {mfaQrFailed || !qrImageSource(mfaSetup.qrCode) ? <div className="mfa-qr-fallback" role="status">The QR preview could not be rendered. Use the setup key below instead.</div> : <img className="mfa-qr" src={qrImageSource(mfaSetup.qrCode)} onError={() => setMfaQrFailed(true)} alt="QR code for authenticator setup" />}
                <details><summary>Can’t scan? Use the setup key</summary><code>{mfaSetup.secret}</code><small>Or use this authenticator URI:</small><code>{mfaSetup.uri}</code></details>
                <input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter the six-digit code" aria-label="Authenticator verification code" />
                <div className="security-actions"><button className="primary-button" onClick={() => void verifyMfaSetup()} disabled={securityBusy || mfaCode.length !== 6}>Verify and turn on</button><button className="text-button" onClick={() => void cancelMfaSetup()} disabled={securityBusy}>Cancel</button></div>
              </div>}
            </div>
            <div className="setting-card">
              <div className="setting-card-head">
                <div>
                  <h3>Passkeys and devices</h3>
                  <p>Use a phishing-resistant passkey and revoke other active sessions when a device is lost.</p>
                </div>
                <span className="security-status enabled">{passkeys.length} saved</span>
              </div>
              {passkeys.map((passkey) => <div className="settings-item security-factor" key={passkey.id}><div><strong>{passkey.friendly_name || "Passkey"}</strong><small>Added {new Date(passkey.created_at).toLocaleDateString()}{passkey.last_used_at ? ` · last used ${new Date(passkey.last_used_at).toLocaleDateString()}` : ""}</small></div><div className="security-actions"><button className="text-button" onClick={() => void renamePasskey(passkey)} disabled={passkeyBusy}>Rename</button><button className="text-button danger-text-button" onClick={() => void removePasskey(passkey)} disabled={passkeyBusy}>Remove</button></div></div>)}
              <div className="security-actions"><button className="secondary-button" onClick={() => void registerPasskey()} disabled={passkeyBusy}><ShieldAlert size={15} /> {passkeyBusy ? "Working…" : "Add passkey"}</button><button className="text-button" onClick={() => void revokeOtherSessions()} disabled={securityBusy}>Sign out other devices</button></div>
              <small className="field-help">Passkeys require Supabase Auth passkey support to be enabled for this project and the production relying-party domain to be configured.</small>
            </div>
            <div className="setting-card">
              <div className="setting-card-head"><div><h3>Recovery codes</h3><p>One-time backup codes can help you regain access if your authenticator is unavailable.</p></div><span className="rule-count">{recoveryCodeCount}/10</span></div>
              <button className="secondary-button" onClick={() => void generateRecoveryCodes()} disabled={securityBusy}><ShieldAlert size={15} /> Generate new codes</button>
              {generatedRecoveryCodes.length > 0 && <div className="recovery-code-list" role="status"><strong>Save these now — they will not be shown again.</strong><div>{generatedRecoveryCodes.map((code) => <code key={code}>{code}</code>)}</div></div>}
              <small className="field-help">Each code works once and is stored only as a hash. Never paste these codes into support requests.</small>
            </div>
            <div className="setting-card">
              <div className="setting-card-head">
                <div>
                  <h3>Recovery emails</h3>
                  <p>Add other working addresses for password recovery. Every address must be verified before it can be used.</p>
                </div>
                <span className="rule-count">{recoveryMethods.filter((method) => method.verified_at).length}/5</span>
              </div>
              <div className="inline-form security-recovery-form"><input type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="backup@example.com" aria-label="Recovery email address" /><button className="secondary-button" onClick={() => void addRecoveryEmail()} disabled={securityBusy}><Plus size={15} /> Add</button></div>
              {recoveryMethods.length === 0 && <div className="rule-empty">No recovery email added yet.</div>}
              {recoveryMethods.map((method) => <div className="settings-item security-factor" key={method.id}><div><strong>{method.email_masked}</strong><small>{method.verified_at ? "Verified recovery email" : "Verification needed"}</small></div><div className="security-actions"><button className="text-button danger-text-button" onClick={() => void removeRecoveryEmail(method)} disabled={securityBusy}>Remove</button>{!method.verified_at && <button className="text-button" onClick={() => { setVerificationId(method.id); setVerificationCode(""); }}>Verify</button>}</div></div>)}
              {verificationId && <div className="verification-box"><strong>Enter the code we sent</strong><small>Check the recovery inbox for a six-digit code.</small><input inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" aria-label="Recovery email verification code" /><button className="primary-button" onClick={() => void verifyRecoveryEmail()} disabled={securityBusy || verificationCode.length !== 6}>Verify recovery email</button></div>}
            </div>
            <div className="setting-card">
              <h3>How recovery works</h3>
              <p>Postveil keeps your recovery addresses separate from your sign-in email. A recovery request never reveals whether an account exists, and every reset link is one-time.</p>
              <small className="field-help">Keep at least one recovery address available and store your authenticator app on a device you control. Recovery email can reset access; it cannot bypass an enabled authenticator challenge.</small>
            </div>
          </div>
        )}
        {tab === "privacy" && (
          <div className="privacy-center">
            <div className="privacy-hero">
              <div>
                <p className="eyebrow">SECURITY CHECKLIST</p>
                <h3>Your account protection</h3>
                <p>Review the controls that protect sign-in, mailbox content, and external sharing.</p>
              </div>
              <div className={`security-score security-score-${securityScore >= 80 ? "good" : securityScore >= 50 ? "fair" : "low"}`} aria-label={`Security score ${securityScore} out of 100`}><strong>{securityScore}</strong><span>/ 100</span><small>security score</small></div>
            </div>
            <div className="setting-card privacy-checklist-card">
              <div className="setting-card-head"><div><h3>Checklist</h3><p>Complete the high-value controls first. Hardware keys are supported through passkeys.</p></div><ShieldAlert size={18} aria-hidden="true" /></div>
              <div className="security-checklist">{securityChecks.map((check) => <div className={`security-check ${check.enabled ? "is-complete" : ""}`} key={check.label}><span aria-hidden="true">{check.enabled ? "✓" : "·"}</span><strong>{check.label}</strong><small>{check.enabled ? "Protected" : "Recommended"}</small></div>)}</div>
            </div>
            <div className="setting-card privacy-controls-card">
              <div className="setting-card-head"><div><h3>Privacy controls</h3><p>These choices are stored per account. Postveil does not use mailbox content for analytics.</p></div><ShieldAlert size={18} aria-hidden="true" /></div>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.login_alerts_enabled} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ login_alerts_enabled: event.target.checked })} /><span><strong>Login alerts</strong><small>Notify this mailbox when a new sign-in looks unfamiliar.</small></span></label>
              <label className="privacy-toggle"><input type="checkbox" checked={!activePrivacy.remote_images_enabled} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ remote_images_enabled: !event.target.checked })} /><span><strong>Block remote images by default</strong><small>Inline images still work. Remote images load only through the privacy proxy after you allow them.</small></span></label>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.metadata_minimization_enabled} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ metadata_minimization_enabled: event.target.checked })} /><span><strong>Minimize metadata</strong><small>Keep diagnostic details limited to what is needed for delivery, abuse prevention, and your security history.</small></span></label>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.privacy_analytics_enabled} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ privacy_analytics_enabled: event.target.checked })} /><span><strong>Privacy-preserving product analytics</strong><small>Off by default. Only aggregate, non-message interaction counts may be collected when enabled.</small></span></label>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.no_training_ai_policy_acknowledged} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ no_training_ai_policy_acknowledged: event.target.checked })} /><span><strong>Acknowledge the no-training AI policy</strong><small>AI providers must be configured with a no-training setting before mailbox text can be sent to them.</small></span></label>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.ai_processing_enabled} disabled={privacyBusy || !activePrivacy.no_training_ai_policy_acknowledged} onChange={(event) => void updatePrivacy({ ai_processing_enabled: event.target.checked })} /><span><strong>Allow AI processing</strong><small>Disabled by default. When enabled, only the minimum requested text should be sent for an on-demand feature.</small></span></label>
              <label className="privacy-select-row"><span><strong>Storage region preference</strong><small>This preference is saved now; actual routing requires a matching storage deployment.</small></span><select value={activePrivacy.storage_region} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ storage_region: event.target.value })}><option value="default">Deployment default</option><option value="ap-southeast-1">Asia Pacific</option><option value="us-east-1">United States</option><option value="eu-west-1">European Union</option><option value="custom">Custom organization region</option></select></label>
              <label className="privacy-toggle"><input type="checkbox" checked={activePrivacy.external_portal_enabled} disabled={privacyBusy} onChange={(event) => void updatePrivacy({ external_portal_enabled: event.target.checked })} /><span><strong>Protected external-message portal</strong><small>Allow expiring, optionally password-protected links for recipients outside Postveil.</small></span></label>
            </div>
            <div className="setting-card encryption-boundary-card">
              <div className="setting-card-head"><div><h3>Encryption boundary</h3><p>These labels describe what is actually protected in the current deployment.</p></div><ShieldAlert size={18} aria-hidden="true" /></div>
              <div className="capability-row"><div><strong>Transport encryption</strong><small>TLS is required for the application and provider callbacks.</small></div><span className="capability-status ready">Active</span></div>
              <div className="capability-row"><div><strong>Protected message portal</strong><small>Payloads are encrypted at rest with a Worker secret and expire automatically.</small></div><span className="capability-status ready">Active</span></div>
              <div className="capability-row"><div><strong>Client-side E2EE, PGP, key transparency, and user-held keys</strong><small>Not active. Ordinary SMTP cannot provide universal E2EE, and this server-side mailbox path still handles plaintext for delivery.</small></div><span className="capability-status pending">Not enabled</span></div>
              <div className="capability-row"><div><strong>Encrypted attachments, encrypted backups, key escrow, and automatic rotation</strong><small>Requires a dedicated envelope-key service and migration of existing stored objects before it can be enabled safely.</small></div><span className="capability-status pending">Architecture required</span></div>
            </div>
            <div className="setting-card enterprise-identity-card">
              <div className="setting-card-head"><div><h3>Identity providers</h3><p>Social OAuth buttons and domain-based SAML/custom OIDC sign-in are available on the login screen when enabled in Supabase Auth.</p></div><Users size={18} aria-hidden="true" /></div>
              <div className="capability-row"><div><strong>Google, Microsoft, and GitHub</strong><small>OAuth credentials and redirect URLs must be configured in Supabase before users can sign in.</small></div><span className="capability-status setup">Project setup</span></div>
              <div className="capability-row"><div><strong>SAML 2.0 and custom OIDC</strong><small>Organization domain-based SSO is supported by Supabase Auth. Register the provider and domain before advertising it to members.</small></div><span className="capability-status setup">Organization setup</span></div>
            </div>
            <div className="setting-card data-rights-card">
              <div className="setting-card-head"><div><h3>Your data</h3><p>Export your mailbox data or permanently remove the account. Exported JSON includes message content and attachment metadata, not binary object-storage files.</p></div><Download size={18} aria-hidden="true" /></div>
              <div className="security-actions"><button className="secondary-button" onClick={() => void exportAccountData()} disabled={accountExportBusy}>{accountExportBusy ? "Preparing export…" : "Export my data"}</button><button className="danger-outline-button" onClick={() => void deleteAccount()} disabled={securityBusy}>Delete account</button></div>
            </div>
            <div className="setting-card security-activity-card">
              <div className="setting-card-head"><div><h3>Recent security activity</h3><p>IP addresses are shown as short fingerprints rather than stored in readable form.</p></div><History size={18} aria-hidden="true" /></div>
              {(securityOverview?.activity || []).slice(0, 12).map((event) => <div className="settings-item" key={event.id}><div><strong>{event.eventType.replace(/_/g, " ")}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.ipFingerprint || "no IP fingerprint"}</small></div>{event.suspicious && <span className="admin-badge security"><ShieldAlert size={12} /> Review</span>}</div>)}
              {!securityOverview?.activity.length && <div className="rule-empty">No security events recorded yet.</div>}
            </div>
            <div className="privacy-disclosure"><strong>Important:</strong> Postveil does not claim universal end-to-end encryption. Use the protected portal or compatible PGP clients for recipients who cannot receive encrypted mail directly.</div>
          </div>
        )}
        {tab === "appearance" && (
          <div className="settings-grid">
            <div className="setting-card">
              <h3>Interface</h3>
              <p>Shape the desk around how you work.</p>
              <div className="choice-row">
                <button
                  className={settings.theme === "light" ? "selected" : ""}
                  onClick={() => void updateSettings({ theme: "light" })}
                >
                  Light
                </button>
                <button
                  className={settings.theme === "dark" ? "selected" : ""}
                  onClick={() => void updateSettings({ theme: "dark" })}
                >
                  Dark
                </button>
              </div>
              <div className="choice-row">
                <button
                  className={
                    settings.density === "comfortable" ? "selected" : ""
                  }
                  onClick={() =>
                    void updateSettings({ density: "comfortable" })
                  }
                >
                  Comfortable
                </button>
                <button
                  className={settings.density === "compact" ? "selected" : ""}
                  onClick={() => void updateSettings({ density: "compact" })}
                >
                  Compact
                </button>
                <button
                  className={settings.density === "spacious" ? "selected" : ""}
                  onClick={() => void updateSettings({ density: "spacious" })}
                >
                  Spacious
                </button>
              </div>
              <label className="settings-select-row">
                <span>Undo Send</span>
                <select
                  value={settings.send_undo_seconds ?? 0}
                  onChange={(event) => void updateSettings({ send_undo_seconds: Number(event.target.value) })}
                >
                  <option value={0}>Off</option>
                  <option value={10}>10 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                </select>
              </label>
              <small className="setting-note">New messages wait this long before the sending queue releases them.</small>
              <label className="toggle-row image-preference-row">
                <input
                  type="checkbox"
                  checked={loadRemoteImages}
                  onChange={(event) => onLoadRemoteImagesChange(event.target.checked)}
                />
                Load remote images privately
              </label>
              <small className="setting-note">Inline images always render. Remote images stay blocked unless Postveil fetches them through its privacy proxy.</small>
            </div>
            <div className="setting-card">
              <h3>Attention</h3>
              <p>Focused Inbox uses sender history and message signals.</p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.focused_inbox_enabled !== false}
                  onChange={(event) =>
                    void updateSettings({
                      focused_inbox_enabled: event.target.checked,
                    })
                  }
                />{" "}
                Focused Inbox
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings.desktop_notifications)}
                  onChange={(event) =>
                    void updateSettings({
                      desktop_notifications: event.target.checked,
                    })
                  }
                />{" "}
                Desktop notifications
              </label>
            </div>
          </div>
        )}
        {tab === "organize" && (
          <div className="settings-grid">
            <div className="setting-card">
              <h3>Custom folders</h3>
              <div className="inline-form">
                <input
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="Folder name"
                />
                <input className="color-input" type="color" value={folderColor} onChange={(event) => setFolderColor(event.target.value)} aria-label="Folder color" />
                <select value={folderParentId} onChange={(event) => setFolderParentId(event.target.value)} aria-label="Parent folder">
                  <option value="">Top level</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                <button
                  className="secondary-button"
                  onClick={() => void createFolder()}
                >
                  <Plus size={15} /> Add
                </button>
              </div>
              {folders.map((folder) => (
                <div className="settings-item" key={folder.id}>
                  <span
                    className="color-dot"
                    style={{ background: folder.color }}
                  />
                  {folder.name}
                </div>
              ))}
            </div>
            <div className="setting-card">
              <h3>Labels</h3>
              <div className="inline-form">
                <input
                  value={labelName}
                  onChange={(event) => setLabelName(event.target.value)}
                  placeholder="Label name"
                />
                <input className="color-input" type="color" value={labelColor} onChange={(event) => setLabelColor(event.target.value)} aria-label="Label color" />
                <select value={labelParentId} onChange={(event) => setLabelParentId(event.target.value)} aria-label="Parent label">
                  <option value="">Top level</option>
                  {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                </select>
                <button
                  className="secondary-button"
                  onClick={() => void createLabel()}
                >
                  <Plus size={15} /> Add
                </button>
              </div>
              {labels.map((label) => (
                <div className="settings-item" key={label.id}>
                  <span
                    className="color-dot"
                    style={{ background: label.color }}
                  />
                  {label.name}
                </div>
              ))}
            </div>
            <div className="setting-card retention-card">
              <div className="setting-card-head">
                <div>
                  <h3>Retention and legal holds</h3>
                  <p>Automatically remove old mail by scope. Messages on legal hold are always skipped.</p>
                </div>
                <ShieldAlert size={18} aria-hidden="true" />
              </div>
              <div className="inline-form retention-form">
                <input value={retentionName} onChange={(event) => setRetentionName(event.target.value)} placeholder="Policy name" aria-label="Retention policy name" />
                <select value={retentionScope} onChange={(event) => setRetentionScope(event.target.value)} aria-label="Retention scope">
                  <option value="all">All mail</option><option value="inbox">Inbox</option><option value="sent">Sent</option><option value="trash">Trash</option><option value="spam">Spam</option><option value="quarantine">Quarantine</option>
                </select>
                <input type="number" min="1" max="36500" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} aria-label="Retention days" />
                <button className="secondary-button" onClick={() => void createRetentionPolicy()}><Plus size={15} /> Add</button>
              </div>
              <small className="field-help">Days are counted from message creation. The scheduled Worker enforces enabled policies.</small>
              {retentionPolicies.map((policy) => (
                <div className="settings-item retention-policy-row" key={policy.id}>
                  <div><strong>{policy.name}</strong><small>{policy.scope} · {policy.retention_days} days</small></div>
                  <button className={`security-status ${policy.enabled ? "enabled" : ""}`} onClick={() => void toggleRetentionPolicy(policy)}>{policy.enabled ? "On" : "Off"}</button>
                </div>
              ))}
              {retentionPolicies.length === 0 && <div className="rule-empty">No automatic retention policies yet.</div>}
            </div>
          </div>
        )}
        {tab === "contacts" && (
          <div className="settings-grid">
            <div className="setting-card">
              <h3>People</h3>
              <p>Save trusted senders so spam scoring learns who matters.</p>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Display name"
              />
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="Email address"
              />
              <input
                type="url"
                value={contactAvatarUrl}
                onChange={(event) => setContactAvatarUrl(event.target.value)}
                placeholder="Profile image URL (optional, https://)"
              />
              <small className="field-help">Names come from the message header. Add a photo here for a saved sender.</small>
              <button
                className="secondary-button"
                onClick={() => void createContact()}
              >
                <Users size={15} /> Save contact
              </button>
            </div>
          </div>
        )}
        {tab === "spam" && (
          <div className="settings-grid spam-settings-grid">
            <div className="setting-card">
              <div className="setting-card-head">
                <div>
                  <h3>Sender decisions</h3>
                  <p>Trust a sender you know or block mail before it reaches the Inbox.</p>
                </div>
                <ShieldAlert size={18} aria-hidden="true" />
              </div>
              <div className="policy-form">
                <select value={policyAction} onChange={(event) => setPolicyAction(event.target.value as typeof policyAction)} aria-label="Sender decision">
                  <option value="inbox">Always trust</option>
                  <option value="spam">Always block</option>
                  <option value="screen">Always review</option>
                  <option value="archive">Archive automatically</option>
                  <option value="folder">Move to folder</option>
                </select>
                <select value={policyType} onChange={(event) => setPolicyType(event.target.value as typeof policyType)} aria-label="Sender match type">
                  <option value="address">This email address</option>
                  <option value="domain">This domain</option>
                </select>
                <input
                  value={policyValue}
                  onChange={(event) => setPolicyValue(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void createSenderPolicy(); }}
                  placeholder={policyType === "domain" ? "example.com" : "sender@example.com"}
                  aria-label={policyType === "domain" ? "Domain" : "Email address"}
                  type={policyType === "domain" ? "text" : "email"}
                />
                <select value={policyMailboxId} onChange={(event) => setPolicyMailboxId(event.target.value)} aria-label="Mailbox scope">
                  <option value="">All mailboxes</option>
                  {mailboxes.map((item) => <option value={item.id} key={item.id}>{item.display_name || item.address}</option>)}
                </select>
                {policyAction === "folder" && <select value={policyTargetFolderId} onChange={(event) => setPolicyTargetFolderId(event.target.value)} aria-label="Destination folder">
                  <option value="">Choose destination folder</option>
                  {folders.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>}
                <button className="secondary-button" onClick={() => void createSenderPolicy()} disabled={policyBusy}>
                  {policyAction === "inbox" ? <Check size={15} /> : <ShieldAlert size={15} />}
                  {policyBusy ? "Saving…" : "Save decision"}
                </button>
              </div>
              <small className="field-help">Address rules are stronger than domain rules. Trusted senders still cannot bypass confirmed malware or a dangerous attachment.</small>
            </div>
            <div className="setting-card policy-list-card">
              <div className="setting-card-head">
                <div>
                  <h3>Saved decisions</h3>
                  <p>These choices override the normal spam score for matching mail.</p>
                </div>
                <span className="rule-count">{senderPolicies.length}</span>
              </div>
              {senderPolicies.length === 0 ? (
                <div className="rule-empty">No sender decisions yet.</div>
              ) : senderPolicies.map((policy) => (
                <div className={`settings-item policy-item ${policy.enabled ? "" : "disabled"}`} key={policy.id}>
                  <div className="policy-copy">
                    <strong>{policy.match_value}</strong>
                    <small>{policy.action === "inbox" ? "Trusted" : policy.action === "spam" ? "Blocked" : policy.action === "screen" ? "Review" : policy.action === "archive" ? "Archive" : "Move to folder"} · {policy.match_type}{policy.mailbox_id ? " · mailbox-specific" : " · all mailboxes"}</small>
                  </div>
                  <div className="rule-list-actions">
                    <button className="text-button policy-apply-button" onClick={() => void applyPolicyToExisting(policy)}>Apply to existing</button>
                    <label className="rule-toggle" title={policy.enabled ? "Pause policy" : "Enable policy"}>
                      <input type="checkbox" checked={policy.enabled} onChange={() => void toggleSenderPolicy(policy)} aria-label={`${policy.enabled ? "Disable" : "Enable"} ${policy.match_value}`} />
                      <span />
                    </label>
                    <button className="icon-button compact-icon danger-icon" onClick={() => void deleteSenderPolicy(policy)} aria-label={`Remove ${policy.match_value}`} title="Remove"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            {organizationBlocklistAvailable && <div className="setting-card policy-list-card organization-blocklist-card">
              <div className="setting-card-head">
                <div>
                  <h3>Organization blocklist</h3>
                  <p>Administrators can stop a sender or domain for every mailbox in this workspace.</p>
                </div>
                <ShieldAlert size={18} aria-hidden="true" />
              </div>
              <div className="policy-form">
                <select value={organizationBlockType} onChange={(event) => setOrganizationBlockType(event.target.value as OrganizationBlock["match_type"])} aria-label="Organization block type">
                  <option value="domain">This domain</option>
                  <option value="address">This email address</option>
                </select>
                <input value={organizationBlockValue} onChange={(event) => setOrganizationBlockValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createOrganizationBlock(); }} placeholder={organizationBlockType === "domain" ? "example.com" : "sender@example.com"} aria-label="Organization block value" />
                <button className="secondary-button" onClick={() => void createOrganizationBlock()} disabled={organizationBlockBusy}><ShieldAlert size={15} /> {organizationBlockBusy ? "Saving…" : "Block for workspace"}</button>
              </div>
              <small className="field-help">This runs before personal sender decisions. It never overrides confirmed malware blocking.</small>
              {organizationBlocklist.length === 0 ? <div className="rule-empty">No organization-wide blocks yet.</div> : organizationBlocklist.map((block) => (
                <div className={`settings-item policy-item ${block.enabled ? "" : "disabled"}`} key={block.id}>
                  <div className="policy-copy"><strong>{block.match_value}</strong><small>{block.match_type} · workspace-wide</small></div>
                  <div className="rule-list-actions">
                    <label className="rule-toggle" title={block.enabled ? "Pause organization block" : "Enable organization block"}><input type="checkbox" checked={block.enabled} onChange={() => void toggleOrganizationBlock(block)} aria-label={`${block.enabled ? "Disable" : "Enable"} organization block for ${block.match_value}`} /><span /></label>
                    <button className="icon-button compact-icon danger-icon" onClick={() => void deleteOrganizationBlock(block)} aria-label={`Remove organization block for ${block.match_value}`} title="Remove"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>}
            <div className="setting-card screening-queue-card">
              <div className="setting-card-head">
                <div>
                  <h3>Screening queue</h3>
                  <p>Messages needing a decision stay available here without losing their trust evidence.</p>
                </div>
                <span className="rule-count">{screeningQueue.length}</span>
              </div>
              {screeningQueue.length === 0 ? <div className="rule-empty">No messages waiting for review.</div> : screeningQueue.map((message) => (
                <div className="screening-queue-item" key={message.id}>
                  <button className="screening-queue-main" onClick={() => { onClose(); onOpenMessage(message); }}>
                    <strong>{message.subject || "(no subject)"}</strong>
                    <span>{message.from_name || message.from_address}</span>
                    <small>{message.spam_score !== undefined ? `${Math.round((message.spam_score || 0) * 100)}% risk` : "Risk review"} · {message.snippet || "No preview"}</small>
                  </button>
                  <div className="screening-queue-actions">
                    <button className="text-button" disabled={screeningBusy === message.id} onClick={() => void decideScreening(message, "approve")}>Approve</button>
                    <button className="text-button danger-text-button" disabled={screeningBusy === message.id} onClick={() => void decideScreening(message, "block")}>Block</button>
                    <button className="text-button" disabled={screeningBusy === message.id} onClick={() => void decideScreening(message, "reroute")}>Archive</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="setting-card spam-explainer-card">
              <h3>How screening works</h3>
              <p>Postveil combines authentication alignment, sender history, user feedback, links, risky requests, and attachments.</p>
              <div className="screening-legend">
                <span><i className="legend-dot safe" /> Inbox</span>
                <span><i className="legend-dot review" /> Warning</span>
                <span><i className="legend-dot danger" /> Spam</span>
              </div>
              <small className="field-help">One failed authentication check is only a signal. Messages need multiple risk signals before automatic Spam placement.</small>
            </div>
          </div>
        )}
        {tab === "automation" && (
          <div className="settings-grid">
            <div className="setting-card rule-builder-card">
              <div className="setting-card-head">
                <div>
                  <h3>{editingRuleId ? "Edit rule" : "New rule"}</h3>
                  <p>Rules run from top to bottom when new mail arrives.</p>
                </div>
                {editingRuleId && (
                  <button className="text-button" onClick={resetRuleEditor}>
                    Cancel edit
                  </button>
                )}
              </div>
              <input
                value={ruleName}
                onChange={(event) => setRuleName(event.target.value)}
                placeholder="Rule name, e.g. Finance invoices"
                aria-label="Rule name"
              />
              <div className="rule-builder-section">
                <div className="rule-section-label">When a message matches all of these</div>
                {ruleConditions.map((condition, index) => (
                  <div className="rule-condition-row" key={`condition-${index}`}>
                    <select
                      value={condition.type}
                      onChange={(event) => updateCondition(setRuleConditions, ruleConditions, index, { type: event.target.value as RuleConditionType })}
                      aria-label="Condition type"
                    >
                      {ruleConditionTypes.map((type) => <option key={type} value={type}>{ruleConditionLabels[type]}</option>)}
                    </select>
                    {["hasAttachment", "isRead", "isFlagged", "isPinned"].includes(condition.type) ? (
                      <select
                        value={condition.value}
                        onChange={(event) => updateCondition(setRuleConditions, ruleConditions, index, { value: event.target.value })}
                        aria-label="Condition value"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        value={condition.value}
                        onChange={(event) => updateCondition(setRuleConditions, ruleConditions, index, { value: event.target.value })}
                        placeholder="Value"
                        aria-label="Condition value"
                      />
                    )}
                    <button
                      className="icon-button compact-icon"
                      onClick={() => removeCondition(setRuleConditions, ruleConditions, index)}
                      disabled={ruleConditions.length === 1}
                      aria-label="Remove condition"
                      title="Remove condition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button className="text-button" onClick={() => addCondition(setRuleConditions, ruleConditions)}>
                  <Plus size={13} /> Add condition
                </button>
              </div>
              <div className="rule-builder-section">
                <div className="rule-section-label">Except when any of these match</div>
                {ruleExceptions.length === 0 && <small className="rule-muted">No exceptions</small>}
                {ruleExceptions.map((condition, index) => (
                  <div className="rule-condition-row" key={`exception-${index}`}>
                    <select
                      value={condition.type}
                      onChange={(event) => updateCondition(setRuleExceptions, ruleExceptions, index, { type: event.target.value as RuleConditionType })}
                      aria-label="Exception type"
                    >
                      {ruleConditionTypes.map((type) => <option key={type} value={type}>{ruleConditionLabels[type]}</option>)}
                    </select>
                    {["hasAttachment", "isRead", "isFlagged", "isPinned"].includes(condition.type) ? (
                      <select
                        value={condition.value}
                        onChange={(event) => updateCondition(setRuleExceptions, ruleExceptions, index, { value: event.target.value })}
                        aria-label="Exception value"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        value={condition.value}
                        onChange={(event) => updateCondition(setRuleExceptions, ruleExceptions, index, { value: event.target.value })}
                        placeholder="Value"
                        aria-label="Exception value"
                      />
                    )}
                    <button
                      className="icon-button compact-icon"
                      onClick={() => removeCondition(setRuleExceptions, ruleExceptions, index)}
                      aria-label="Remove exception"
                      title="Remove exception"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button className="text-button" onClick={() => addCondition(setRuleExceptions, ruleExceptions)}>
                  <Plus size={13} /> Add exception
                </button>
              </div>
              <div className="rule-builder-section">
                <div className="rule-section-label">Do this</div>
                <div className="rule-action-grid">
                  <select value={ruleFolder} onChange={(event) => setRuleFolder(event.target.value)} aria-label="Move message">
                    <option value="none">Do not move</option>
                    <option value="inbox">Move to Inbox</option>
                    <option value="archive">Move to Archive</option>
                    <option value="spam">Move to Spam</option>
                    <option value="trash">Move to Trash</option>
                    <option value="custom">Move to custom folder…</option>
                  </select>
                  {ruleFolder === "custom" && (
                    <select value={ruleCustomFolderId} onChange={(event) => setRuleCustomFolderId(event.target.value)} aria-label="Custom folder">
                      <option value="">Choose folder</option>
                      {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  )}
                  <select value={ruleMarkRead} onChange={(event) => setRuleMarkRead(event.target.value as typeof ruleMarkRead)} aria-label="Read action">
                    <option value="ignore">Leave read status</option>
                    <option value="true">Mark as read</option>
                    <option value="false">Mark as unread</option>
                  </select>
                  <select value={ruleStar} onChange={(event) => setRuleStar(event.target.value as typeof ruleStar)} aria-label="Star action">
                    <option value="ignore">Leave star</option>
                    <option value="true">Star it</option>
                    <option value="false">Remove star</option>
                  </select>
                  <select value={rulePin} onChange={(event) => setRulePin(event.target.value as typeof rulePin)} aria-label="Pin action">
                    <option value="ignore">Leave pin</option>
                    <option value="true">Pin it</option>
                    <option value="false">Unpin it</option>
                  </select>
                  <select value={ruleFlag} onChange={(event) => setRuleFlag(event.target.value as typeof ruleFlag)} aria-label="Flag action">
                    <option value="ignore">Leave flag</option>
                    <option value="true">Flag it</option>
                    <option value="false">Clear flag</option>
                  </select>
                  <select value={rulePriorityAction} onChange={(event) => setRulePriorityAction(event.target.value)} aria-label="Priority action">
                    <option value="ignore">Leave priority</option>
                    <option value="0">Set low priority</option>
                    <option value="1">Set normal priority</option>
                    <option value="2">Set high priority</option>
                  </select>
                  <input
                    value={ruleLabel}
                    onChange={(event) => setRuleLabel(event.target.value)}
                    placeholder="Add label (optional)"
                    list="rule-labels"
                    aria-label="Add label"
                  />
                  <datalist id="rule-labels">{labels.map((label) => <option key={label.id} value={label.name} />)}</datalist>
                  <input
                    value={ruleForwardTo}
                    onChange={(event) => setRuleForwardTo(event.target.value)}
                    placeholder="Forward to (optional)"
                    type="email"
                    aria-label="Forward to"
                  />
                  <input
                    value={ruleSnoozeMinutes}
                    onChange={(event) => setRuleSnoozeMinutes(event.target.value)}
                    placeholder="Snooze minutes (optional)"
                    type="number"
                    min="1"
                    max="43200"
                    aria-label="Snooze minutes"
                  />
                  <input
                    value={ruleAssignTo}
                    onChange={(event) => setRuleAssignTo(event.target.value)}
                    placeholder="Assign to account id or self"
                    aria-label="Assign to account id or self"
                  />
                  <input
                    value={ruleCreateTask}
                    onChange={(event) => setRuleCreateTask(event.target.value)}
                    placeholder="Create task (optional title)"
                    aria-label="Create task title"
                  />
                  <input
                    value={ruleWebhookUrl}
                    onChange={(event) => setRuleWebhookUrl(event.target.value)}
                    placeholder="Webhook URL (HTTPS)"
                    type="url"
                    aria-label="Webhook URL"
                  />
                  {ruleWebhookUrl && <input
                    value={ruleWebhookSecret}
                    onChange={(event) => setRuleWebhookSecret(event.target.value)}
                    placeholder="Webhook signing secret (optional)"
                    type="password"
                    autoComplete="new-password"
                    aria-label="Webhook signing secret"
                  />}
                </div>
                <div className="rule-automation-options">
                  <label className="toggle-row"><input type="checkbox" checked={ruleAutoReply} onChange={(event) => setRuleAutoReply(event.target.checked)} /> Send automatic reply</label>
                  <label className="toggle-row"><input type="checkbox" checked={ruleCreateCalendarEvent} onChange={(event) => setRuleCreateCalendarEvent(event.target.checked)} /> Create calendar event</label>
                  <label className="toggle-row"><input type="checkbox" checked={ruleStoreInB2} onChange={(event) => setRuleStoreInB2(event.target.checked)} /> Save a private copy to object storage</label>
                </div>
                <label className="toggle-row">
                  <input type="checkbox" checked={ruleStop} onChange={(event) => setRuleStop(event.target.checked)} /> Stop processing more rules
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Rule is enabled
                </label>
              </div>
              <div className="rule-builder-section rule-trigger-section">
                <div className="rule-section-label">Run this automation</div>
                <div className="rule-trigger-grid">
                  <label>Scope<select value={ruleScope} onChange={(event) => setRuleScope(event.target.value as typeof ruleScope)}><option value="personal">My mailboxes</option><option value="organization">Shared with workspace</option></select></label>
                  <label>Trigger<select value={ruleTriggerType} onChange={(event) => setRuleTriggerType(event.target.value as typeof ruleTriggerType)}><option value="inbound">When new mail arrives</option><option value="event">When a mail event occurs</option><option value="scheduled">On a schedule</option></select></label>
                  {ruleTriggerType === "event" && <small className="rule-muted">Add an “Event type contains” condition above, such as delivered, bounced, or opened.</small>}
                  {ruleTriggerType === "scheduled" && <><label>Frequency<select value={ruleSchedule} onChange={(event) => setRuleSchedule(event.target.value as typeof ruleSchedule)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>First run<input type="datetime-local" value={ruleScheduleAt} onChange={(event) => setRuleScheduleAt(event.target.value)} /></label></>}
                </div>
                <small className="rule-muted">Organization rules require workspace administrator access. Scheduled and event rules are processed by the Worker queue.</small>
              </div>
              <div className="rule-builder-footer">
                <small className="rule-muted">Rules are evaluated from top to bottom.</small>
                <button className="secondary-button" onClick={() => void saveRule()} disabled={ruleBusy}>
                  <SlidersHorizontal size={15} /> {ruleBusy ? "Saving…" : editingRuleId ? "Save changes" : "Add rule"}
                </button>
              </div>
            </div>
            <div className="setting-card rules-list-card">
              <div className="setting-card-head">
                <div>
                  <h3>Rules in order</h3>
                  <p>Preview a rule first, then apply it with a short undo window.</p>
                </div>
                <div className="rule-list-head-actions">
                  <button className="text-button" onClick={() => void exportRules()} title="Download rules as JSON"><Download size={13} /> Export</button>
                  <button className="text-button" onClick={() => ruleImportRef.current?.click()} title="Import rules from JSON"><Upload size={13} /> Import</button>
                  <input ref={ruleImportRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importRules(event)} />
                  <button className="text-button" onClick={() => void exportSieve()} title="Download Sieve-compatible rules">Sieve export</button>
                  <button className="text-button" onClick={() => sieveImportRef.current?.click()} title="Import basic Sieve rules">Sieve import</button>
                  <input ref={sieveImportRef} className="sr-only" type="file" accept="text/plain,.sieve" onChange={(event) => void importSieve(event)} />
                  <span className="rule-count">{rules.length}</span>
                </div>
              </div>
              {rules.length === 0 ? (
                <div className="rule-empty">No rules yet. Build your first one on the left.</div>
              ) : rules.map((rule, index) => {
                const exceptions = rule.conditions?.exceptions && typeof rule.conditions.exceptions === "object" && !Array.isArray(rule.conditions.exceptions)
                  ? rule.conditions.exceptions as Record<string, unknown>
                  : {};
                const actionText = rule.actions?.customFolderId
                  ? `Move to ${folders.find((folder) => folder.id === rule.actions.customFolderId)?.name || "custom folder"}`
                  : rule.actions?.folder
                    ? `Move to ${String(rule.actions.folder)}`
                    : "Metadata only";
                return (
                  <article className={`rule-list-item ${rule.enabled ? "" : "disabled"}`} key={rule.id}>
                    <div className="rule-list-copy">
                      <div className="rule-list-title"><span className="rule-order">{index + 1}</span><strong>{rule.name}</strong>{!rule.enabled && <span className="rule-disabled-badge">Disabled</span>}</div>
                      <small>{ruleSummary(rule.conditions, "Every message")} → {actionText}{Object.keys(exceptions).length ? " · with exception" : ""}</small>
                    </div>
                    <div className="rule-list-actions">
                      <label className="rule-toggle" title={rule.enabled ? "Disable rule" : "Enable rule"}>
                        <input type="checkbox" checked={rule.enabled} onChange={(event) => void updateRule(rule, { enabled: event.target.checked }, event.target.checked ? "Rule enabled" : "Rule disabled")} />
                        <span />
                      </label>
                      <button className="icon-button compact-icon" disabled={index === 0} onClick={() => void reorderRule(index, -1)} aria-label="Move rule up" title="Move up"><ArrowUp size={14} /></button>
                      <button className="icon-button compact-icon" disabled={index === rules.length - 1} onClick={() => void reorderRule(index, 1)} aria-label="Move rule down" title="Move down"><ArrowDown size={14} /></button>
                      <button className="icon-button compact-icon" onClick={() => editRule(rule)} aria-label="Edit rule" title="Edit"><Pencil size={14} /></button>
                      <button className="icon-button compact-icon" onClick={() => void runRuleLab(rule, "preview")} aria-label="Preview rule" title="Preview existing mail"><Eye size={14} /></button>
                      <button className="icon-button compact-icon danger-icon" onClick={() => void deleteRule(rule)} aria-label="Delete rule" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="setting-card rule-history-card">
              <div className="setting-card-head">
                <div>
                  <h3>Execution history</h3>
                  <p>Preview, dry-run, scheduled, and applied runs stay visible for review.</p>
                </div>
                <span className="rule-count">{ruleRuns.length}</span>
              </div>
              {ruleRuns.length === 0 ? <div className="rule-empty">No rule runs yet.</div> : ruleRuns.slice(0, 12).map((run) => <div className="settings-item rule-history-item" key={run.id}><div><strong>{rules.find((rule) => rule.id === run.rule_id)?.name || "Rule run"}</strong><small>{run.mode.replace(/_/g, " ")} · {run.status} · {run.matched_count} matched · {run.changed_count} changed</small></div><time dateTime={run.started_at}>{new Date(run.started_at).toLocaleString()}</time></div>)}
            </div>
            {ruleLab && (
              <div className="setting-card rule-lab-panel" aria-live="polite">
                <div className="setting-card-head">
                  <div>
                    <p className="eyebrow">RULE LAB</p>
                    <h3>{ruleLab.rule.name}</h3>
                    <p>{ruleLab.result.mode === "apply" ? `${ruleLab.result.changedCount} changed` : `${ruleLab.result.matchedCount} matching messages`} · {ruleLab.result.mode === "preview" ? "Preview only" : ruleLab.result.mode === "dry_run" ? "Dry-run only" : "Applied"}</p>
                  </div>
                  <button className="icon-button compact-icon" onClick={() => setRuleLab(null)} aria-label="Close rule lab"><X size={14} /></button>
                </div>
                {(ruleLab.result.conflicts || []).length > 0 && (
                  <div className="rule-conflicts">
                    {(ruleLab.result.conflicts || []).map((conflict, index) => (
                      <div className={conflict.severity === "error" ? "rule-conflict error" : "rule-conflict"} key={`${conflict.message}-${index}`}>
                        <AlertTriangle size={14} /> <span>{conflict.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ruleLab.result.impact && (
                  <div className="rule-impact-grid">
                    <div><strong>{ruleLab.result.impact.total}</strong><span>matches</span></div>
                    <div><strong>{Object.values(ruleLab.result.impact.folders).reduce((total, count) => total + count, 0)}</strong><span>folder moves</span></div>
                    <div><strong>{ruleLab.result.impact.labels}</strong><span>labels</span></div>
                    <div><strong>{ruleLab.result.impact.forwardCount}</strong><span>forwards skipped</span></div>
                  </div>
                )}
                {ruleLab.result.matches && ruleLab.result.matches.length > 0 ? (
                  <div className="rule-match-list">
                    {ruleLab.result.matches.slice(0, 5).map((match) => (
                      <div className="rule-match-item" key={match.id}>
                        <div><strong>{match.subject}</strong><small>{match.fromAddress} · {match.folder}</small></div>
                        <span title={match.reasons.join(" · ")}>{match.reasons[0] || "Matched"}</span>
                      </div>
                    ))}
                    {ruleLab.result.matches.length > 5 && <small className="rule-muted">Showing 5 of {ruleLab.result.matches.length} matches.</small>}
                  </div>
                ) : <div className="rule-empty">No existing messages match this rule.</div>}
                <div className="rule-lab-actions">
                  <button className="secondary-button" onClick={() => void runRuleLab(ruleLab.rule, "dry-run")} disabled={ruleLabBusy}><History size={14} /> Dry-run</button>
                  {ruleLab.result.mode !== "apply" ? <button className="primary-button" onClick={() => void (async () => { if (await confirm({ title: "Apply this rule to existing mail?", message: `Apply “${ruleLab.rule.name}” to ${ruleLab.result.matchedCount} existing message${ruleLab.result.matchedCount === 1 ? "" : "s"}?`, confirmLabel: "Apply changes" })) void applyRuleLab(); })()} disabled={ruleLabBusy || !ruleLab.result.matchedCount || (ruleLab.result.conflicts || []).some((conflict) => conflict.severity === "error")}><Check size={14} /> Apply changes</button> : ruleLab.result.undoable ? <button className="secondary-button" onClick={() => void undoRuleLab()} disabled={ruleLabBusy}><RotateCcw size={14} /> Undo changes</button> : null}
                </div>
              </div>
            )}
            <div className="setting-card">
              <h3>Signatures</h3>
              <input
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                placeholder="Signature name"
              />
              <textarea
                value={signatureText}
                onChange={(event) => setSignatureText(event.target.value)}
                placeholder="Regards, James"
                rows={4}
              />
              <button
                className="secondary-button"
                onClick={() => void createSignature()}
              >
                <PenLine size={15} /> Save signature
              </button>
            </div>
            <div className="setting-card">
              <h3>Automatic replies</h3>
              <p>
                Send one rate-limited vacation response for the selected
                mailbox.
              </p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={autoReply.enabled}
                  onChange={(event) =>
                    setAutoReply((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />{" "}
                Enabled
              </label>
              <input
                value={autoReply.subject}
                onChange={(event) =>
                  setAutoReply((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
                placeholder="Automatic reply subject"
              />
              <textarea
                value={autoReply.body}
                onChange={(event) =>
                  setAutoReply((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                placeholder="I am away and will reply soon."
                rows={4}
              />
              <button
                className="secondary-button"
                onClick={() => void saveAutoReply()}
              >
                <Bell size={15} /> Save reply
              </button>
            </div>
          </div>
        )}
        {tab === "mailboxes" && (
          <div className="settings-grid">
            <div className="setting-card">
              <h3>Add an address</h3>
              <p>
                Each address can send through Brevo and receive through
                Cloudflare routing.
              </p>
              <input
                value={mailboxName}
                onChange={(event) => setMailboxName(event.target.value)}
                placeholder="Display name"
              />
              <input
                type="email"
                value={mailboxAddress}
                onChange={(event) => setMailboxAddress(event.target.value)}
                placeholder="name@your-domain.com"
              />
              <button
                className="secondary-button"
                onClick={() => void createMailbox()}
              >
                <Plus size={15} /> Add mailbox
              </button>
            </div>
            <div className="setting-card">
              <h3>Connected addresses</h3>
              {mailboxes.map((item) => (
                <div className="settings-item mailbox-setting" key={item.id}>
                  <div>
                    <strong>{item.address}</strong>
                    <small>
                      {item.display_name}
                      {item.is_default ? " · default" : ""}
                    </small>
                  </div>
                  <div className="choice-row">
                    <button
                      className={item.can_send ? "selected" : ""}
                      onClick={() =>
                        void updateMailbox(item, { can_send: !item.can_send })
                      }
                    >
                      Send
                    </button>
                    <button
                      className={item.can_receive ? "selected" : ""}
                      onClick={() =>
                        void updateMailbox(item, {
                          can_receive: !item.can_receive,
                        })
                      }
                    >
                      Receive
                    </button>
                    {!item.is_default && (
                      <button
                        onClick={() =>
                          void updateMailbox(item, { is_default: true })
                        }
                      >
                        Default
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "administration" && <MailboxAdministration onChanged={onChanged} />}
        {tab === "integrations" && (
          <div className="settings-grid">
            <div className="setting-card">
              <h3>Optional connections</h3>
              <p>
                Calendar, OneDrive, Teams, Google Drive, and AI can be attached
                here without putting provider secrets in the browser.
              </p>
              <div className="integration-row">
                <span>Google Calendar</span>
                <small>
                  Connect through OAuth when credentials are configured.
                </small>
              </div>
              <div className="integration-row">
                <span>Microsoft Graph</span>
                <small>Mail and Teams connectors are not configured.</small>
              </div>
              <div className="integration-row">
                <span>AI assistant</span>
                <small>Optional and disabled by default.</small>
              </div>
            </div>
          </div>
        )}
        {notice && <div className="form-notice">{notice}</div>}
      </section>
    </div>
  );
}

type JsonSettings = Record<string, unknown>;

function Workspace({
  mode,
  tasks: initialTasks,
  events: initialEvents,
  workItems,
  workSummary,
  onOpenMessage,
  onRefresh,
}: {
  mode: "calendar" | "tasks" | "contacts" | "projects";
  tasks: Task[];
  events: CalendarEvent[];
  workItems: WorkItem[];
  workSummary: WorkSummary;
  onOpenMessage: (message: Message) => void;
  onRefresh: () => void;
}) {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarSearch, setCalendarSearch] = useState("");
  const [activeCalendarId, setActiveCalendarId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventAttendees, setEventAttendees] = useState("");
  const [eventRecurrence, setEventRecurrence] = useState("");
  const [eventTimezone, setEventTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [newCalendarName, setNewCalendarName] = useState("");
  const [availabilityEmail, setAvailabilityEmail] = useState("");
  const [availability, setAvailability] = useState<Array<{ starts: string; ends: string }> | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [contactGroupId, setContactGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const data = overview || {
    calendars: [],
    events: initialEvents,
    contacts: [],
    groups: [],
    projects: [],
    tasks: initialTasks,
    schedulingLinks: [],
  } satisfies WorkspaceOverview;
  const calendars = data.calendars;
  const selectedCalendarId = activeCalendarId || calendars.find((calendar) => calendar.is_default)?.id || calendars[0]?.id || "";
  const events = data.events.filter((event) => !calendarSearch.trim() || `${event.title} ${event.description} ${event.location || ""}`.toLowerCase().includes(calendarSearch.trim().toLowerCase()));
  const contacts = data.contacts.filter((contact) => !contactQuery.trim() || `${contact.display_name} ${contact.email} ${contact.company || ""}`.toLowerCase().includes(contactQuery.trim().toLowerCase()));
  const activeProject = data.projects.find((project) => project.id === activeProjectId) || data.projects[0];
  const projectTasks = data.tasks.filter((task) => task.project_id === activeProject?.id);
  const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(1 - monthStart.getDay());
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(monthGridStart);
    day.setDate(monthGridStart.getDate() + index);
    return day;
  });
  function eventsOnDay(day: Date) {
    return events.filter((event) => {
      const starts = new Date(event.starts_at);
      return starts.getFullYear() === day.getFullYear() && starts.getMonth() === day.getMonth() && starts.getDate() === day.getDate();
    });
  }
  const refreshOverview = useCallback(async () => {
    try {
      const next = await apiFetch<WorkspaceOverview>("/api/workspace/overview");
      setOverview(next);
      if (!activeCalendarId && next.calendars[0]) setActiveCalendarId(next.calendars.find((calendar) => calendar.is_default)?.id || next.calendars[0].id);
      if (!activeProjectId && next.projects[0]) setActiveProjectId(next.projects[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace unavailable");
    }
  }, [activeCalendarId, activeProjectId]);
  useEffect(() => { void refreshOverview(); }, [refreshOverview]);
  async function mutate(path: string, options: RequestInit, success?: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(path, options);
      if (success) setError(success);
      await refreshOverview();
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace change could not be saved");
    } finally {
      setBusy(false);
    }
  }
  async function addEvent() {
    if (!eventTitle.trim()) return setError("Add an event title first");
    const start = eventStart ? new Date(eventStart) : new Date(Date.now() + 3600000);
    const end = eventEnd ? new Date(eventEnd) : new Date(start.getTime() + 3600000);
    if (end <= start) return setError("The event must end after it starts");
    await mutate("/api/calendar", { method: "POST", body: JSON.stringify({ calendarId: selectedCalendarId || undefined, title: eventTitle, startsAt: start.toISOString(), endsAt: end.toISOString(), location: eventLocation, timezone: eventTimezone, recurrenceRule: eventRecurrence || null, attendees: eventAttendees.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean) }) }, "Event saved");
    setEventTitle(""); setEventStart(""); setEventEnd(""); setEventLocation(""); setEventAttendees(""); setEventRecurrence("");
  }
  async function addCalendar() {
    if (!newCalendarName.trim()) return;
    await mutate("/api/calendars", { method: "POST", body: JSON.stringify({ name: newCalendarName, timezone: eventTimezone }) }, "Calendar created");
    setNewCalendarName("");
  }
  async function checkAvailability() {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ from: new Date().toISOString(), email: availabilityEmail.trim() });
      const result = await apiFetch<{ busy: Array<{ starts: string; ends: string }> }>(`/api/calendar/availability?${params.toString()}`);
      setAvailability(result.busy);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Availability could not be checked"); }
    finally { setBusy(false); }
  }
  async function addSchedulingLink() {
    if (!linkTitle.trim()) return;
    await mutate("/api/scheduling-links", { method: "POST", body: JSON.stringify({ title: linkTitle, calendarId: selectedCalendarId || undefined, timezone: eventTimezone }) }, "Scheduling link created");
    setLinkTitle("");
  }
  async function addContact() {
    if (!contactEmail.trim()) return setError("An email is required");
    await mutate("/api/contacts", { method: "POST", body: JSON.stringify({ displayName: contactName, email: contactEmail, company: contactCompany, groupId: contactGroupId || undefined }) }, "Contact saved");
    setContactName(""); setContactEmail(""); setContactCompany("");
  }
  async function addGroup() {
    if (!groupName.trim()) return;
    await mutate("/api/contact-groups", { method: "POST", body: JSON.stringify({ name: groupName }) }, "Group created");
    setGroupName("");
  }
  async function importContacts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    await mutate("/api/contacts/import", { method: "POST", body: JSON.stringify({ csv: await file.text(), groupId: contactGroupId || undefined }) }, "Contacts imported");
    event.currentTarget.value = "";
  }
  async function exportContacts() {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch("/api/contacts/export", { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) throw new Error("Contacts could not be exported");
      const blob = await response.blob(); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "postveil-contacts.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Contacts could not be exported"); }
  }
  async function downloadContact(contact: Contact) {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/contacts/${contact.id}.vcf`, { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) throw new Error("Contact export failed");
      const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(await response.blob()); anchor.download = `${(contact.display_name || "contact").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "contact"}.vcf`; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Contact export failed"); }
  }
  async function addProject() {
    if (!projectName.trim()) return;
    await mutate("/api/projects", { method: "POST", body: JSON.stringify({ name: projectName, description: projectDescription }) }, "Project created");
    setProjectName(""); setProjectDescription("");
  }
  async function addProjectTask() {
    if (!activeProject?.id || !taskTitle.trim()) return;
    await mutate(`/api/projects/${activeProject.id}/tasks`, { method: "POST", body: JSON.stringify({ title: taskTitle, dueAt: taskDue ? new Date(taskDue).toISOString() : null }) }, "Task added");
    setTaskTitle(""); setTaskDue("");
  }
  async function setTaskStatus(task: Task, status: NonNullable<Task["status"]>) {
    await mutate(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
  async function makeTaskFromMessage(item: WorkItem) {
    await mutate(`/api/messages/${item.id}/task`, { method: "POST", body: JSON.stringify({ projectId: activeProject?.id || null, title: item.subject || "Follow up on message" }) }, "Task created from email");
  }
  async function assignMessage(item: WorkItem, projectId: string) {
    await mutate(`/api/messages/${item.id}/project`, { method: "POST", body: JSON.stringify({ projectId: projectId || null }) }, "Email assigned to project");
  }
  async function downloadEvent(event: CalendarEvent) {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/calendar/${event.id}.ics`, { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) throw new Error("Event export failed");
      const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(await response.blob()); anchor.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Event export failed"); }
  }
  const title = mode === "calendar" ? "Calendar" : mode === "contacts" ? "Contacts" : mode === "projects" ? "Projects" : "Work";
  return (
    <section className="workspace-view">
      <div className="workspace-head">
        <div><p className="eyebrow">POSTVEIL WORKSPACE</p><h1>{mode === "calendar" ? <CalendarDays size={23} /> : mode === "contacts" ? <Users size={23} /> : mode === "projects" ? <Briefcase size={23} /> : <ListTodo size={23} />} {title}</h1></div>
        <div className="workspace-stamp">A private, email-connected workspace for dates, people, tasks, and project momentum.</div>
      </div>
      {error && <div className={`inline-error workspace-error ${error.endsWith("saved") || error.endsWith("created") || error.endsWith("imported") || error.endsWith("assigned") ? "workspace-success" : ""}`}>{error}</div>}

      {mode === "calendar" && <>
        <div className="workspace-toolbar"><div className="workspace-view-switcher" role="group" aria-label="Calendar view">{(["month", "week", "day", "agenda"] as const).map((view) => <button key={view} className={calendarView === view ? "selected" : ""} onClick={() => setCalendarView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div><div className="calendar-nav"><button className="secondary-button" onClick={() => setCalendarDate(new Date())}>Today</button><button className="icon-button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} aria-label="Previous month"><ArrowLeft size={15} /></button><strong>{calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button className="icon-button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} aria-label="Next month"><ArrowDown size={15} className="rotate-90" /></button></div><label className="calendar-search"><Search size={14} /><input value={calendarSearch} onChange={(event) => setCalendarSearch(event.target.value)} placeholder="Search events" /></label></div>
        <div className="workspace-grid calendar-workspace-grid">
          <div className="workspace-stack">
            <div className="setting-card workspace-create"><div className="card-heading"><div><p className="eyebrow">NEW APPOINTMENT</p><h3>Schedule an event</h3></div><CalendarDays size={18} /></div><input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Meeting title" aria-label="Event title" /><div className="workspace-field-grid"><label>Starts<input type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} /></label><label>Ends<input type="datetime-local" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)} /></label></div><div className="workspace-field-grid"><label>Calendar<select value={selectedCalendarId} onChange={(event) => setActiveCalendarId(event.target.value)}><option value="">Personal calendar</option>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name} · {calendar.timezone}</option>)}</select></label><label>Time zone<select value={eventTimezone} onChange={(event) => setEventTimezone(event.target.value)}><option>UTC</option><option>Asia/Manila</option><option>America/New_York</option><option>Europe/London</option><option>Australia/Sydney</option></select></label></div><input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} placeholder="Location or video link (optional)" /><input value={eventAttendees} onChange={(event) => setEventAttendees(event.target.value)} placeholder="Invitees, separated by commas" /><div className="workspace-field-grid"><label>Repeat<select value={eventRecurrence} onChange={(event) => setEventRecurrence(event.target.value)}><option value="">Does not repeat</option><option value="FREQ=DAILY">Daily</option><option value="FREQ=WEEKLY">Weekly</option><option value="FREQ=MONTHLY">Monthly</option></select></label><label>Reminder<select defaultValue="15"><option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="60">1 hour before</option></select></label></div><button className="primary-button" onClick={() => void addEvent()} disabled={busy}><Plus size={15} /> Add event</button></div>
            <div className="setting-card"><div className="card-heading"><div><p className="eyebrow">CALENDARS</p><h3>Personal and shared</h3></div><Users size={18} /></div>{calendars.map((calendar) => <button className={`workspace-resource-row ${selectedCalendarId === calendar.id ? "active" : ""}`} key={calendar.id} onClick={() => setActiveCalendarId(calendar.id)}><span className="color-dot" style={{ background: calendar.color }} /><span><strong>{calendar.name}</strong><small>{calendar.visibility} · {calendar.timezone}</small></span></button>)}<div className="inline-form"><input value={newCalendarName} onChange={(event) => setNewCalendarName(event.target.value)} placeholder="New calendar" /><button className="secondary-button" onClick={() => void addCalendar()} disabled={busy}><Plus size={14} /> Add</button></div></div>
            <div className="setting-card"><div className="card-heading"><div><p className="eyebrow">AVAILABILITY</p><h3>Find a clear time</h3></div><Clock3 size={18} /></div><input value={availabilityEmail} onChange={(event) => setAvailabilityEmail(event.target.value)} placeholder="Workspace member email (optional)" /><button className="secondary-button" onClick={() => void checkAvailability()} disabled={busy}>Check next 7 days</button>{availability && <small className="field-help">{availability.length ? `${availability.length} busy block${availability.length === 1 ? "" : "s"} found.` : "No busy blocks found."}</small>}</div>
            <div className="setting-card"><div className="card-heading"><div><p className="eyebrow">SCHEDULING LINKS</p><h3>Let people book time</h3></div><Share2Icon /></div><div className="inline-form"><input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="e.g. 30-minute intro" /><button className="secondary-button" onClick={() => void addSchedulingLink()} disabled={busy}><Plus size={14} /> Create</button></div>{data.schedulingLinks.map((link) => <div className="workspace-resource-row" key={link.id}><span><strong>{link.title}</strong><small>/{link.slug} · {link.duration_minutes} min · {link.timezone}</small></span><button className="icon-button compact-icon" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/book/${link.slug}`)} aria-label={`Copy ${link.title} link`}><CopyIcon /></button></div>)}</div>
          </div>
          <div className="workspace-list"><div className="workspace-calendar-panel"><div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>{calendarView === "month" ? <div className="calendar-month-grid">{monthDays.map((day) => <div className={`calendar-day ${day.getMonth() !== calendarDate.getMonth() ? "muted" : ""} ${day.toDateString() === new Date().toDateString() ? "today" : ""}`} key={day.toISOString()}><span>{day.getDate()}</span>{eventsOnDay(day).slice(0, 3).map((event) => <button className="calendar-event-chip" key={event.id} onClick={() => void downloadEvent(event)} title="Download calendar event">{event.title}</button>)}{eventsOnDay(day).length > 3 && <small>+{eventsOnDay(day).length - 3} more</small>}</div>)}</div> : <div className={`calendar-agenda-list ${calendarView}`}><div className="calendar-list-heading"><div><p className="eyebrow">{calendarView.toUpperCase()} VIEW</p><h3>{calendarView === "agenda" ? "Upcoming events" : `${calendarDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })} schedule`}</h3></div><label className="calendar-search"><Search size={14} /><input value={calendarSearch} onChange={(event) => setCalendarSearch(event.target.value)} placeholder="Search calendar" /></label></div>{events.length ? events.map((event) => <article className="event-card" key={event.id}><div className="event-time">{formatDate(event.starts_at)}</div><div className="event-copy"><strong>{event.title}</strong><p>{new Date(event.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {event.timezone || "UTC"}</p>{event.location && <small>{event.location}</small>}{event.recurrence_rule && <small>Repeats · {event.recurrence_rule.replace("FREQ=", "").toLowerCase()}</small>}</div><button className="secondary-button" onClick={() => void downloadEvent(event)}><Download size={13} /> .ics</button></article>) : <div className="list-empty"><CalendarDays size={25} /><p>No events match this view.</p></div>}</div>}</div></div>
        </div>
      </>}

      {mode === "contacts" && <div className="workspace-grid contacts-workspace-grid"><div className="workspace-stack"><div className="setting-card workspace-create"><div className="card-heading"><div><p className="eyebrow">ADDRESS BOOK</p><h3>Add a contact</h3></div><Users size={18} /></div><input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Full name" /><input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Email address" type="email" /><input value={contactCompany} onChange={(event) => setContactCompany(event.target.value)} placeholder="Company (optional)" /><select value={contactGroupId} onChange={(event) => setContactGroupId(event.target.value)}><option value="">No group</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="primary-button" onClick={() => void addContact()} disabled={busy}><Plus size={15} /> Save contact</button></div><div className="setting-card"><div className="card-heading"><div><p className="eyebrow">GROUPS</p><h3>Contact groups</h3></div><Tag size={18} /></div>{data.groups.map((group) => <div className="workspace-resource-row" key={group.id}><span className="color-dot" style={{ background: group.color }} /><strong>{group.name}</strong><small>{group.contact_ids?.length || 0} contacts</small></div>)}<div className="inline-form"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New group" /><button className="secondary-button" onClick={() => void addGroup()} disabled={busy}><Plus size={14} /> Add</button></div></div><div className="setting-card"><div className="card-heading"><div><p className="eyebrow">PORTABILITY</p><h3>Bring your address book</h3></div><Upload size={18} /></div><label className="file-button"><Upload size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importContacts(event)} /></label><button className="secondary-button" onClick={() => void exportContacts()}><Download size={13} /> Export CSV</button><small className="field-help">CSV headers: name, email, company. Duplicate email addresses are updated, not duplicated.</small></div></div><div className="workspace-list"><div className="workspace-list-toolbar"><div><p className="eyebrow">CONTACTS</p><h3>{contacts.length} people</h3></div><label className="calendar-search"><Search size={14} /><input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Search people" /></label></div>{contacts.length ? contacts.map((contact) => <article className="contact-card" key={contact.id}><div className="row-avatar">{(contact.display_name || contact.email).slice(0, 1).toUpperCase()}</div><div><strong>{contact.display_name || contact.email}</strong><p>{contact.email}</p>{contact.company && <small>{contact.company}</small>}</div><span className="contact-card-actions"><button className="secondary-button" onClick={() => void downloadContact(contact)}><Download size={13} /> vCard</button></span></article>) : <div className="list-empty"><Users size={25} /><p>No contacts match your search.</p></div>}</div></div>}

      {mode === "projects" && <div className="projects-workspace"><div className="setting-card project-create-row"><div><p className="eyebrow">PROJECTS</p><h3>Turn conversations into momentum</h3></div><div className="inline-form"><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" /><input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Short description" /><button className="primary-button" onClick={() => void addProject()} disabled={busy}><Plus size={15} /> New project</button></div></div><div className="project-tabs">{data.projects.map((project) => <button key={project.id} className={activeProject?.id === project.id ? "active" : ""} onClick={() => setActiveProjectId(project.id)}><span className="color-dot" style={{ background: project.color }} />{project.name}<small>{data.tasks.filter((task) => task.project_id === project.id).length}</small></button>)}{!data.projects.length && <div className="list-empty compact-empty"><Briefcase size={22} /><p>Create your first project.</p></div>}</div>{activeProject && <><div className="workspace-board-head"><div><p className="eyebrow">PROJECT BOARD</p><h2>{activeProject.name}</h2><p>{activeProject.description || "Organize email, tasks, and follow-ups in one shared queue."}</p></div><div className="inline-form"><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a task" /><input type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} /><button className="secondary-button" onClick={() => void addProjectTask()} disabled={busy}><Plus size={14} /> Add task</button></div></div><div className="kanban-board">{(["todo", "in_progress", "blocked", "done"] as const).map((status) => <section className="kanban-column" key={status}><div className="kanban-column-head"><h3>{status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1)}</h3><span>{projectTasks.filter((task) => (task.status || (task.completed ? "done" : "todo")) === status).length}</span></div>{projectTasks.filter((task) => (task.status || (task.completed ? "done" : "todo")) === status).map((task) => <article className="kanban-card" key={task.id}><strong>{task.title}</strong>{task.due_at && <small>Due {new Date(task.due_at).toLocaleDateString()}</small>}<select value={task.status || (task.completed ? "done" : "todo")} onChange={(event) => void setTaskStatus(task, event.target.value as NonNullable<Task["status"]>)} aria-label={`Status for ${task.title}`}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></article>)}</section>)}</div></>}{workItems.length > 0 && <div className="setting-card project-message-queue"><div className="card-heading"><div><p className="eyebrow">FROM YOUR INBOX</p><h3>Assign follow-ups to {activeProject?.name || "a project"}</h3></div><Mail size={18} /></div>{workItems.slice(0, 8).map((item) => <div className="project-message-row" key={item.id}><button className="text-button" onClick={() => onOpenMessage(item)}>{item.subject || "(no subject)"}</button><button className="secondary-button" onClick={() => void assignMessage(item, activeProject?.id || "")} disabled={!activeProject || busy}>Assign</button><button className="secondary-button" onClick={() => void makeTaskFromMessage(item)} disabled={!activeProject || busy}>Create task</button></div>)}</div>}</div>}

      {mode === "tasks" && <div className="workspace-grid"><div className="workspace-stack"><div className="work-summary" aria-label="Work summary"><div className="work-summary-card"><span>Reply later</span><strong>{workSummary.reply_later}</strong></div><div className="work-summary-card"><span>Waiting on</span><strong>{workSummary.waiting_on}</strong></div><div className="work-summary-card"><span>I owe</span><strong>{workSummary.i_owe}</strong></div><div className={`work-summary-card ${workSummary.overdue ? "overdue" : ""}`}><span>Overdue</span><strong>{workSummary.overdue}</strong></div></div><div className="setting-card"><div className="card-heading"><div><p className="eyebrow">QUICK TASK</p><h3>Capture the next action</h3></div><ListTodo size={18} /></div><input id="quick-task-title" placeholder="Task title" onKeyDown={(event) => { if (event.key === "Enter" && event.currentTarget.value.trim()) void mutate("/api/tasks", { method: "POST", body: JSON.stringify({ title: event.currentTarget.value.trim() }) }, "Task added").then(() => { event.currentTarget.value = ""; }); }} /><small className="field-help">Press Enter to save. Put longer work into a project board.</small></div></div><div className="workspace-list"><div className="work-queue-head"><div><p className="eyebrow">MESSAGE QUEUE</p><h3>Follow-ups</h3></div><span>{workItems.length} open</span></div>{workItems.length ? workItems.map((item) => <article className={`work-item ${item.overdue ? "overdue" : ""}`} key={item.id}><button onClick={() => onOpenMessage(item)} className="work-item-main"><span className="work-state-label">{workStateLabel(item.work_state)}</span><strong>{item.subject || "(no subject)"}</strong><small>{item.from_address} · {workDueLabel(item.follow_up_at)}</small>{item.work_note && <em>{item.work_note}</em>}</button></article>) : <div className="list-empty compact-empty"><Briefcase size={25} /><p>No message follow-ups yet.</p><small>Use Reply later, Waiting on, or I owe from a message.</small></div>}<div className="work-queue-head task-queue-head"><div><p className="eyebrow">TASKS</p><h3>Personal task list</h3></div><span>{data.tasks.filter((task) => !task.completed).length} open</span></div>{data.tasks.length ? data.tasks.map((task) => <label className={`task-card ${task.completed ? "completed" : ""}`} key={task.id}><input type="checkbox" checked={task.completed} onChange={() => void setTaskStatus(task, task.completed ? "todo" : "done")} /><span><strong>{task.title}</strong><small>{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}{task.project_id ? " · In a project" : ""}</small></span></label>) : <div className="list-empty compact-empty"><ListTodo size={25} /><p>No tasks yet.</p></div>}</div></div>}
    </section>
  );
}

function Share2Icon() { return <span className="workspace-share-icon" aria-hidden="true">↗</span>; }
function CopyIcon() { return <span aria-hidden="true">⧉</span>; }

function MailboxApp({ session }: { session: Session }) {
  const { confirm, prompt } = useAppDialog();
  const imagePreferenceKey = `postveil.load_remote_images:${session.user.id}`;
  const [view, setView] = useState<"mail" | "calendar" | "tasks" | "contacts" | "projects" | "ai">("mail");
  const [folder, setFolder] = useState<ViewKey>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [senderPolicies, setSenderPolicies] = useState<SenderPolicy[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: "light",
    density: "comfortable",
    focused_inbox_enabled: true,
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workSummary, setWorkSummary] = useState<WorkSummary>({ reply_later: 0, waiting_on: 0, i_owe: 0, overdue: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [inlineImageUrls, setInlineImageUrls] = useState<Record<string, string>>({});
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [collaborationData, setCollaborationData] = useState<CollaborationData | null>(null);
  const [collaborationBusy, setCollaborationBusy] = useState(false);
  const [collaborationComment, setCollaborationComment] = useState("");
  const [collaborationCommentKind, setCollaborationCommentKind] = useState<"comment" | "note">("comment");
  const [collaborationCommentVisibility, setCollaborationCommentVisibility] = useState<"team" | "private">("team");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [loadRemoteImages, setLoadRemoteImages] = useState(() => storedBooleanPreference(imagePreferenceKey, false));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [showAllThreadMessages, setShowAllThreadMessages] = useState(false);
  const [showMessageDetails, setShowMessageDetails] = useState(false);
  const [trustLensOpen, setTrustLensOpen] = useState(false);
  const [trustLensBusy, setTrustLensBusy] = useState(false);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [deliveryInspection, setDeliveryInspection] = useState<DeliveryInspection | null>(null);
  const [deliveryInspectionOpen, setDeliveryInspectionOpen] = useState(false);
  const [deliveryInspectionBusy, setDeliveryInspectionBusy] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllResults, setSelectAllResults] = useState(false);
  const [bulkAction, setBulkAction] = useState("archive");
  const [bulkFolder, setBulkFolder] = useState("archive");
  const [bulkLabelId, setBulkLabelId] = useState("");
  const [bulkPriority, setBulkPriority] = useState("1");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkUndo, setBulkUndo] = useState<{ requestId: string; label: string } | null>(null);
  const [draggedMessageId, setDraggedMessageId] = useState<string | null>(null);
  const [savedSearchFormOpen, setSavedSearchFormOpen] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearchBusy, setSavedSearchBusy] = useState(false);
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [normalizedQuery, setNormalizedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resultTotal, setResultTotal] = useState<number | null>(null);
  const previousMessageIds = useRef<Set<string>>(new Set());
  const recordedSearchRef = useRef("");
  const mailListRequestRef = useRef(0);
  const loadMeta = useCallback(async () => {
    try {
      const [addresses, contactRows, customFolders, labelRows, signatureRows, ruleRows, policyRows, preference, savedRows, historyRows] =
        await Promise.all([
          apiFetch<Mailbox[]>("/api/mailboxes"),
          apiFetch<Contact[]>("/api/contacts"),
          apiFetch<CustomFolder[]>("/api/folders"),
          apiFetch<Label[]>("/api/labels"),
          apiFetch<Signature[]>("/api/signatures"),
          apiFetch<Rule[]>("/api/rules"),
          apiFetch<SenderPolicy[]>("/api/sender-policies").catch(() => []),
          apiFetch<AppSettings>("/api/settings"),
          apiFetch<SavedSearch[]>("/api/saved-searches?counts=true").catch(() => []),
          apiFetch<SearchHistoryItem[]>("/api/search/history").catch(() => []),
        ]);
      setMailboxes(addresses);
      setContacts(contactRows);
      setFolders(customFolders);
      setLabels(labelRows);
      setSignatures(signatureRows);
      setRules(ruleRows);
      setSenderPolicies(policyRows);
      setSettings(preference);
      setSavedSearches(savedRows);
      setSearchHistory(historyRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Mailbox settings unavailable",
      );
    }
  }, []);
  const loadMessages = useCallback(
    async (target: ViewKey = folder, showLoading = true, pageNumber = 1, append = false) => {
      const requestId = mailListRequestRef.current + 1;
      mailListRequestRef.current = requestId;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          folder: target,
          page: String(pageNumber),
          page_size: "80",
          filter,
          sort,
        });
        if (query.trim()) params.set("q", query.trim());
        params.set("meta", "true");
        const payload = await apiFetch<MailPage | Message[]>(`/api/mail?${params.toString()}`);
        if (requestId !== mailListRequestRef.current) return;
        const nextPage = Array.isArray(payload) ? { items: payload, total: null, page: pageNumber, hasMore: payload.length >= 80, normalizedQuery: "" } : payload;
        setMessages((current) => (append ? [...current, ...nextPage.items] : nextPage.items));
        setPage(nextPage.page);
        setHasMore(nextPage.hasMore);
        setResultTotal(nextPage.total);
        setNormalizedQuery(nextPage.normalizedQuery || "");
        if (pageNumber === 1 && !append && nextPage.normalizedQuery && recordedSearchRef.current !== nextPage.normalizedQuery) {
          recordedSearchRef.current = nextPage.normalizedQuery;
          void apiFetch<SearchHistoryItem>("/api/search/history", { method: "POST", body: JSON.stringify({ query: query.trim() }) })
            .then((item) => setSearchHistory((current) => [item, ...current.filter((entry) => entry.normalized_query !== item.normalized_query)].slice(0, 20)))
            .catch(() => undefined);
        }
        if (pageNumber === 1 && !append) void apiFetch<SavedSearch[]>("/api/saved-searches?counts=true").then(setSavedSearches).catch(() => undefined);
      } catch (loadError) {
        if (requestId !== mailListRequestRef.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Mailbox unavailable",
        );
      } finally {
        if (requestId === mailListRequestRef.current) setLoading(false);
      }
    },
    [filter, folder, query, sort],
  );
  useEffect(() => {
    if (!bulkUndo) return;
    const timer = window.setTimeout(() => setBulkUndo(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [bulkUndo]);
  const loadWorkspace = useCallback(async () => {
    try {
      const [taskRows, eventRows, workRows, summary] = await Promise.all([
        apiFetch<Task[]>("/api/tasks"),
        apiFetch<CalendarEvent[]>("/api/calendar"),
        apiFetch<WorkItem[]>("/api/work"),
        apiFetch<WorkSummary>("/api/work/summary"),
      ]);
      setTasks(taskRows);
      setEvents(eventRows);
      setWorkItems(workRows);
      setWorkSummary(summary);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Workspace unavailable",
      );
    }
  }, []);
  function clearListSelection() {
    setSelectedIds(new Set());
    setSelectAllResults(false);
  }
  function openMailFolder(target: ViewKey) {
    detailRequestRef.current += 1;
    mailListRequestRef.current += 1;
    setView("mail");
    setFolder(target);
    setActiveSavedSearchId(null);
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setMessages([]);
    setPage(1);
    setHasMore(false);
    setResultTotal(null);
    setNormalizedQuery("");
    setLoading(true);
    setDetailLoading(false);
    clearListSelection();
    setMobileNav(false);
  }
  function closeSelectedMessage() {
    detailRequestRef.current += 1;
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setInlineImageUrls({});
    setDetailLoading(false);
    setTrustLensOpen(false);
    setTrustData(null);
    setDeliveryInspectionOpen(false);
    setDeliveryInspection(null);
    setShowMoreActions(false);
  }
  function updateRemoteImagePreference(value: boolean) {
    setLoadRemoteImages(value);
    try {
      window.localStorage.setItem(imagePreferenceKey, String(value));
    } catch {
      // The preference still applies for this session when storage is unavailable.
    }
  }
  function toggleMessageSelection(id: string) {
    if (selectAllResults) {
      setSelectedIds(new Set(messages.map((message) => message.id).filter((messageId) => messageId !== id)));
      setSelectAllResults(false);
      return;
    }
    setSelectAllResults(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectCurrentPage() {
    setSelectedIds(new Set(messages.map((message) => message.id)));
    setSelectAllResults(false);
  }
  async function createSavedSearch() {
    const queryText = query.trim();
    const name = savedSearchName.trim();
    if (!name) { setError("Enter a name for the saved search"); return; }
    if (!queryText) { setError("Enter a search query before saving it"); return; }
    setSavedSearchBusy(true);
    setError("");
    try {
      const saved = await apiFetch<SavedSearch>("/api/saved-searches", { method: "POST", body: JSON.stringify({ name, query: queryText }) });
      setSavedSearches((current) => [...current, saved].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)));
      setSavedSearchName("");
      setSavedSearchFormOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be created");
    } finally {
      setSavedSearchBusy(false);
    }
  }
  async function renameSavedSearch(saved: SavedSearch) {
    const name = (await prompt({
      title: "Rename saved search",
      message: "Choose a short name that will help you find this search later.",
      defaultValue: saved.name,
      placeholder: "Search name",
      confirmLabel: "Save name",
    }))?.trim();
    if (!name || name === saved.name) return;
    try {
      const updated = await apiFetch<SavedSearch>(`/api/saved-searches/${saved.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setSavedSearches((current) => current.map((item) => item.id === saved.id ? { ...item, ...updated } : item));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be renamed");
    }
  }
  async function deleteSavedSearch(saved: SavedSearch) {
    if (!(await confirm({
      title: "Delete this saved search?",
      message: `Delete saved search “${saved.name}”? Your messages will not be changed.`,
      confirmLabel: "Delete search",
      danger: true,
    }))) return;
    try {
      await apiFetch(`/api/saved-searches/${saved.id}`, { method: "DELETE" });
      setSavedSearches((current) => current.filter((item) => item.id !== saved.id));
      if (activeSavedSearchId === saved.id) {
        setActiveSavedSearchId(null);
        setQuery("");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be deleted");
    }
  }
  async function reorderSavedSearch(saved: SavedSearch, direction: -1 | 1) {
    const ordered = [...savedSearches].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
    const index = ordered.findIndex((item) => item.id === saved.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    setSavedSearches(ordered.map((item, itemIndex) => ({ ...item, sort_order: itemIndex })));
    try {
      await apiFetch("/api/saved-searches/reorder", { method: "POST", body: JSON.stringify({ ids: ordered.map((item) => item.id) }) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved searches could not be reordered");
    }
  }
  function openSavedSearch(saved: SavedSearch) {
    openMailFolder("inbox");
    setQuery(saved.query);
    setActiveSavedSearchId(saved.id);
  }
  function applySearchSuggestion(suggestion: SearchSuggestion) {
    setQuery(suggestion.value);
    setActiveSavedSearchId(null);
    clearListSelection();
    setSearchFocused(false);
  }
  async function clearSearchHistory() {
    try {
      await apiFetch("/api/search/history", { method: "DELETE" });
      setSearchHistory([]);
      setSearchSuggestions([]);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Search history could not be cleared");
    }
  }
  async function downloadSearchResults(format: "csv" | "json" = "csv") {
    try {
      const currentSession = (await requireSupabase().auth.getSession()).data.session;
      const params = new URLSearchParams({ folder, filter, sort, format });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/mail/export?${params.toString()}`, { headers: currentSession?.access_token ? { authorization: `Bearer ${currentSession.access_token}` } : {} });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.error || `Export failed (${response.status})`));
      }
      const blob = await response.blob();
      const download = document.createElement("a");
      download.href = URL.createObjectURL(blob);
      download.download = `postveil-search-${new Date().toISOString().slice(0, 10)}.${format}`;
      download.click();
      URL.revokeObjectURL(download.href);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Search results could not be exported");
    }
  }
  async function undoBulkAction() {
    if (!bulkUndo) return;
    const requestId = bulkUndo.requestId;
    try {
      await apiFetch("/api/mail/bulk/undo", { method: "POST", body: JSON.stringify({ requestId }) });
      setBulkUndo(null);
      setBulkNotice("Bulk change undone");
      await loadMessages(folder, false);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Undo is no longer available");
    }
  }
  async function runBulkAction() {
    const allResults = selectAllResults;
    const visibleSelection = allResults ? messages.map((message) => message.id) : [...selectedIds];
    if (!visibleSelection.length && !allResults) { setError("Select at least one message"); return; }
    const countLabel = allResults ? `${resultTotal ?? "all"} matching messages` : `${visibleSelection.length} message${visibleSelection.length === 1 ? "" : "s"}`;
    if (bulkAction === "trash" && !(await confirm({
      title: "Move messages to Trash?",
      message: `Move ${countLabel} to Trash? You can restore them later.`,
      confirmLabel: "Move to Trash",
      danger: true,
    }))) return;
    setBulkBusy(true);
    setError("");
    setBulkNotice("");
    const action: JsonSettings = { type: bulkAction };
    if (bulkAction === "move") {
      if (bulkFolder.startsWith("custom:")) {
        action.folder = "custom";
        action.customFolderId = bulkFolder.slice(7);
      } else {
        action.folder = bulkFolder;
      }
    }
    if (bulkAction === "label") {
      if (!bulkLabelId) { setError("Choose a label first"); setBulkBusy(false); return; }
      action.labelId = bulkLabelId;
    }
    if (bulkAction === "priority") action.priority = Number(bulkPriority);
    if (bulkAction === "reminder") {
      const reminder = new Date();
      reminder.setDate(reminder.getDate() + 1);
      reminder.setHours(9, 0, 0, 0);
      action.reminderAt = reminder.toISOString();
      action.reminderNote = "Follow up on this message";
    }
    const idempotencyKey = crypto.randomUUID();
    try {
      const payload = await apiFetch<{ requestId: string; changedIds: string[]; exported?: JsonSettings[]; failures: Array<{ id: string; error: string }>; undoable: boolean; truncated?: boolean }>("/api/mail/bulk", {
        method: "POST",
        body: JSON.stringify({ messageIds: allResults ? [] : visibleSelection, scope: allResults ? "all_results" : "selected", query: query.trim(), folder, action, idempotencyKey }),
      });
      const movedOut = ["archive", "move", "trash", "spam", "restore", "snooze"].includes(bulkAction);
      const selectedSet = new Set(payload.changedIds);
      setMessages((current) => movedOut ? current.filter((message) => !selectedSet.has(message.id)) : current.map((message) => {
        if (!selectedSet.has(message.id)) return message;
        if (bulkAction === "mark_read" || bulkAction === "mark_unread") return { ...message, is_read: bulkAction === "mark_read" };
        if (bulkAction === "star" || bulkAction === "unstar") return { ...message, is_starred: bulkAction === "star" };
        if (bulkAction === "pin" || bulkAction === "unpin") return { ...message, is_pinned: bulkAction === "pin" };
        if (bulkAction === "flag" || bulkAction === "unflag") return { ...message, is_flagged: bulkAction === "flag" };
        return message;
      }));
      clearListSelection();
      await loadMessages(folder, false);
      if (bulkAction === "export" && payload.exported?.length) {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(new Blob([JSON.stringify(payload.exported, null, 2)], { type: "application/json" }));
        download.download = `postveil-export-${new Date().toISOString().slice(0, 10)}.json`;
        download.click();
        URL.revokeObjectURL(download.href);
      }
      if (payload.failures.length) setError(`${payload.changedIds.length} changed; ${payload.failures.length} failed. ${payload.failures[0].error}`);
      else setBulkNotice(`${payload.changedIds.length || (bulkAction === "export" ? visibleSelection.length : 0)} message${payload.changedIds.length === 1 ? "" : "s"} updated${payload.truncated ? " (first 500 matching messages)" : ""}`);
      if (payload.undoable && payload.changedIds.length) setBulkUndo({ requestId: payload.requestId, label: "Undo change" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }
  useEffect(() => {
    void loadMeta();
    void loadWorkspace();
  }, [loadMeta, loadWorkspace]);
  useEffect(() => {
    if (
      settings.desktop_notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    )
      void Notification.requestPermission();
  }, [settings.desktop_notifications]);
  useEffect(() => {
    const nextIds = new Set(messages.map((message) => message.id));
    const previousIds = previousMessageIds.current;
    if (
      previousIds.size > 0 &&
      folder === "inbox" &&
      settings.desktop_notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      messages
        .filter((message) => !previousIds.has(message.id) && !message.is_read)
        .slice(0, 3)
        .forEach(
          (message) =>
            new Notification(message.subject || "New message", {
              body: `${message.from_address}: ${message.snippet || "Open Postveil to read it."}`,
            }),
        );
    }
    previousMessageIds.current = nextIds;
  }, [folder, messages, settings.desktop_notifications]);
  useEffect(() => {
    if (view !== "mail") return;
    void loadMessages(folder, true);
    const interval = window.setInterval(
      () => void loadMessages(folder, false),
      15000,
    );
    let channel:
      | ReturnType<NonNullable<typeof supabase>["channel"]>
      | undefined;
    if (supabase) {
      setLiveState("connecting");
      channel = supabase
        .channel(`messages-${folder}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `owner_id=eq.${session.user.id}` },
          () => void loadMessages(folder, false),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setLiveState("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveState("reconnecting");
          else if (status === "CLOSED") setLiveState("offline");
        });
    } else {
      setLiveState("offline");
    }
    return () => {
      window.clearInterval(interval);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [folder, view, loadMessages]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (view === "mail") void loadMessages(folder, false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, filter, sort, folder, view, loadMessages]);
  useEffect(() => {
    const threadId = selected?.thread_id;
    if (!threadId) return;
    void loadCollaboration(threadId);
    void updateCollaborationPresence("viewing");
    const timer = window.setInterval(() => { void loadCollaboration(threadId); void updateCollaborationPresence("viewing"); }, 15_000);
    return () => { window.clearInterval(timer); void updateCollaborationPresence("idle"); };
  }, [selected?.thread_id]);
  useEffect(() => {
    if (!searchFocused) return;
    const timer = window.setTimeout(() => {
      void apiFetch<SearchSuggestion[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
        .then(setSearchSuggestions)
        .catch(() => setSearchSuggestions([]));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, searchFocused]);
  async function loadCollaboration(threadId: string) {
    try { setCollaborationData(await apiFetch<CollaborationData>(`/api/collaboration/threads/${encodeURIComponent(threadId)}`)); }
    catch { setCollaborationData(null); }
  }
  async function updateCollaboration(patch: Record<string, unknown>) {
    if (!selected?.thread_id) return;
    setCollaborationBusy(true); setError("");
    try { await apiFetch<CollaborationThreadState>(`/api/collaboration/threads/${encodeURIComponent(selected.thread_id)}/assignment`, { method: "PATCH", body: JSON.stringify(patch) }); await loadCollaboration(selected.thread_id); }
    catch (collaborationError) { setError(collaborationError instanceof Error ? collaborationError.message : "Collaboration update failed"); }
    finally { setCollaborationBusy(false); }
  }
  async function addCollaborationComment() {
    if (!selected?.thread_id || !collaborationComment.trim()) return;
    setCollaborationBusy(true); setError("");
    const mentionedUserIds = (collaborationData?.members || []).filter((member) => collaborationComment.toLowerCase().includes(member.email.toLowerCase())).map((member) => member.user_id);
    try {
      await apiFetch(`/api/collaboration/threads/${encodeURIComponent(selected.thread_id)}/comments`, { method: "POST", body: JSON.stringify({ body: collaborationComment, kind: collaborationCommentKind, visibility: collaborationCommentVisibility, mentionedUserIds }) });
      setCollaborationComment("");
      await loadCollaboration(selected.thread_id);
    } catch (commentError) { setError(commentError instanceof Error ? commentError.message : "Comment could not be posted"); }
    finally { setCollaborationBusy(false); }
  }
  async function updateCollaborationPresence(state: "viewing" | "composing" | "idle") {
    if (!selected?.thread_id) return;
    await apiFetch(`/api/collaboration/threads/${encodeURIComponent(selected.thread_id)}/presence`, { method: "POST", body: JSON.stringify({ state }) }).catch(() => undefined);
  }
  async function openMessage(message: Message) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setView("mail");
    setMobileNav(false);
    if (["inbox", "sent", "drafts", "archive", "trash", "spam", "quarantine"].includes(message.folder)) setFolder(message.folder as ViewKey);
    setSelectedId(message.id);
    setSelected(message);
    setInlineImageUrls({});
    setDetailLoading(true);
    setError("");
    setShowAllThreadMessages(false);
    setCollaborationData(null);
    setCollaborationComment("");
    setShowMessageDetails(false);
    setThreadMessages([]);
    setTrustLensOpen(false);
    setTrustData(null);
    setDeliveryInspectionOpen(false);
    setDeliveryInspection(null);
    setShowMoreActions(false);
    try {
      const detail = await apiFetch<Message>(`/api/mail/${message.id}`);
      if (detailRequestRef.current !== requestId) return;
      setSelected(detail);
      void apiFetch<TrustData>(`/api/mail/${message.id}/trust`).then((trust) => {
        if (detailRequestRef.current === requestId) setTrustData(trust);
      }).catch(() => undefined);
      const inlineAttachments = (detail.attachments || []).filter((attachment) => attachment.content_id);
      if (inlineAttachments.length) {
        const inlineResults = await Promise.all(inlineAttachments.map(async (attachment) => {
          try {
            const result = await apiFetch<{ url: string }>(`/api/attachments/${attachment.id}?json=true`);
            return [String(attachment.content_id).trim().replace(/^<|>$/g, "").toLowerCase(), result.url] as const;
          } catch {
            return null;
          }
        }));
        if (detailRequestRef.current !== requestId) return;
        setInlineImageUrls(Object.fromEntries(inlineResults.filter((item): item is readonly [string, string] => Boolean(item && item[0] && item[1]))));
      }
      void apiFetch<DeliveryInspection>(`/api/mail/${message.id}/inspection`).then(setDeliveryInspection).catch(() => undefined);
      const thread = await apiFetch<Message[]>(`/api/threads/${message.thread_id}`);
      if (detailRequestRef.current !== requestId) return;
      setThreadMessages(thread);
      void loadCollaboration(message.thread_id);
      if (!message.is_read) {
        await apiFetch(`/api/mail/${message.id}`, {
          method: "POST",
          body: JSON.stringify({ isRead: true }),
        });
        if (detailRequestRef.current !== requestId) return;
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, is_read: true } : item,
          ),
        );
      }
    } catch (openError) {
      if (detailRequestRef.current !== requestId) return;
      setError(
        openError instanceof Error ? openError.message : "Message unavailable",
      );
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }
  async function toggleTrustLens() {
    if (!selected) return;
    if (trustLensOpen) { setTrustLensOpen(false); return; }
    setTrustLensOpen(true);
    if (trustData) return;
    setTrustLensBusy(true);
    try { setTrustData(await apiFetch<TrustData>(`/api/mail/${selected.id}/trust`)); }
    catch (trustError) { setError(trustError instanceof Error ? trustError.message : "Trust details unavailable"); }
    finally { setTrustLensBusy(false); }
  }
  async function toggleDeliveryInspection() {
    if (!selected) return;
    if (deliveryInspectionOpen) { setDeliveryInspectionOpen(false); return; }
    setDeliveryInspectionOpen(true);
    if (deliveryInspection) return;
    setDeliveryInspectionBusy(true);
    try { setDeliveryInspection(await apiFetch<DeliveryInspection>(`/api/mail/${selected.id}/inspection`)); }
    catch (inspectionError) { setError(inspectionError instanceof Error ? inspectionError.message : "Delivery details unavailable"); }
    finally { setDeliveryInspectionBusy(false); }
  }
  async function openRawSource() {
    if (!selected) return;
    try {
      const current = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/mail/${selected.id}/source`, { headers: current?.access_token ? { authorization: `Bearer ${current.access_token}` } : {} });
      if (!response.ok) throw new Error(`Raw source unavailable (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (sourceError) { setError(sourceError instanceof Error ? sourceError.message : "Raw source unavailable"); }
  }
  async function submitSpamFeedback(feedback: "spam" | "not_spam") {
    if (!selected) return;
    try {
      await apiFetch(`/api/mail/${selected.id}/feedback`, { method: "POST", body: JSON.stringify({ feedback }) });
      setSelected(null);
      setSelectedId(null);
      setThreadMessages([]);
      setTrustData(null);
      await loadMessages(folder, false);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "Feedback could not be saved");
    }
  }
  async function mutateMessage(body: JsonSettings) {
    if (!selected) return;
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadMessages(folder, false);
      if (body.workState !== undefined || body.followUpAt !== undefined || body.workNote !== undefined) void loadWorkspace();
      if (typeof body.folder === "string" || typeof body.snoozedUntil === "string") {
        setSelected(null);
        setSelectedId(null);
        setThreadMessages([]);
        return;
      }
      const detail = await apiFetch<Message>(`/api/mail/${selected.id}`);
      setSelected(detail);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
      );
    }
  }
  function clearMessageSelection() {
    detailRequestRef.current += 1;
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setDetailLoading(false);
    setTrustLensOpen(false);
    setTrustData(null);
    setShowMoreActions(false);
  }
  async function restoreSelected() {
    if (!selected || selected.folder !== "trash") return;
    setTrashBusy(true);
    setError("");
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "restore" }),
      });
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Restore failed");
    } finally {
      setTrashBusy(false);
    }
  }
  async function permanentlyDeleteSelected() {
    if (!selected || selected.folder !== "trash") return;
    if (!(await confirm({
      title: "Delete this message permanently?",
      message: "This message and its attachments cannot be recovered after permanent deletion.",
      confirmLabel: "Delete permanently",
      danger: true,
    }))) return;
    setTrashBusy(true);
    setError("");
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "permanent_delete" }),
      });
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Permanent delete failed");
    } finally {
      setTrashBusy(false);
    }
  }
  async function emptyTrash() {
    if (!(await confirm({
      title: "Empty Trash permanently?",
      message: "Messages and attachments in Trash cannot be recovered after this action.",
      confirmLabel: "Empty Trash",
      danger: true,
    }))) return;
    setTrashBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ ok: boolean; deleted: number; storageCleanupFailed?: number }>("/api/trash/empty", {
        method: "POST",
      });
      clearMessageSelection();
      await loadMessages("trash", false);
      if (result.storageCleanupFailed) {
        setError(`Trash emptied, but ${result.storageCleanupFailed} stored file${result.storageCleanupFailed === 1 ? "" : "s"} could not be removed.`);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Trash could not be emptied");
    } finally {
      setTrashBusy(false);
    }
  }
  async function assignLabel(labelId: string) {
    if (!selected) return;
    try {
      await apiFetch("/api/labels/assign", {
        method: "POST",
        body: JSON.stringify({ messageId: selected.id, labelId }),
      });
      setError("");
    } catch (labelError) {
      setError(
        labelError instanceof Error
          ? labelError.message
          : "Label assignment failed",
      );
    }
  }
  async function openAttachment(id: string) {
    try {
      const result = await apiFetch<{ url: string }>(
        `/api/attachments/${id}?json=true`,
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (attachmentError) {
      setError(
        attachmentError instanceof Error
          ? attachmentError.message
          : "Attachment unavailable",
      );
    }
  }
  async function previewAttachment(id: string) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/attachments/${id}/preview`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Preview unavailable");
    }
  }
  async function loadExternalEmailImage(source: string) {
    const current = (await requireSupabase().auth.getSession()).data.session;
    const response = await fetch(`/api/email-image-proxy?url=${encodeURIComponent(source)}`, {
      headers: current?.access_token ? { authorization: `Bearer ${current.access_token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(typeof payload.error === "string" ? payload.error : "Image could not be loaded privately");
    }
    const blob = await response.blob();
    if (!blob.type.toLowerCase().startsWith("image/")) throw new Error("The remote content was not an image");
    return URL.createObjectURL(blob);
  }
  async function inspectEmailLink(source: string): Promise<LinkInspection> {
    return apiFetch<LinkInspection>(`/api/link-inspection?url=${encodeURIComponent(source)}`);
  }
  async function downloadAllAttachments(messageId: string) {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/messages/${messageId}/attachments/download`, { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Attachment download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "attachments.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Attachment download failed");
    }
  }
  async function cancelSelectedSend() {
    if (!selected || !["queued", "scheduled"].includes(selected.status)) return;
    try {
      await apiFetch(`/api/outbox/${selected.id}/cancel`, { method: "POST" });
      await loadMessages(folder, false);
      await openMessage({ ...selected, status: "draft", folder: "drafts", cancelled_at: new Date().toISOString() });
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Send could not be cancelled");
    }
  }
  async function mutateThread(patch: JsonSettings) {
    if (!selected?.thread_id) return;
    try {
      await apiFetch(`/api/threads/${selected.thread_id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadMessages(folder, false);
      const detail = await apiFetch<Message>(`/api/mail/${selected.id}`);
      setSelected(detail);
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : "Conversation action failed");
    }
  }
  async function reportSelectedMessage(reportType: "spam" | "phishing") {
    if (!selected) return;
    if (reportType === "phishing" && !(await confirm({
      title: "Report this message as phishing?",
      message: "This will move the message to Quarantine and escalate it as a suspected phishing attempt. You can still review it there.",
      confirmLabel: "Report phishing",
      danger: true,
    }))) return;
    try {
      await apiFetch("/api/mail/report", { method: "POST", body: JSON.stringify({ messageId: selected.id, reportType }) });
      setBulkNotice(reportType === "phishing" ? "Reported as phishing and moved to Quarantine" : "Reported as spam");
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Report could not be submitted");
    }
  }
  async function blockSelectedSender(matchType: "address" | "domain") {
    if (!selected) return;
    const value = matchType === "domain" ? selected.from_address.split("@")[1] : selected.from_address;
    if (!value) return;
    try {
      await apiFetch("/api/sender-blocks", { method: "POST", body: JSON.stringify({ matchType, matchValue: value }) });
      await reportSelectedMessage("spam");
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Sender could not be blocked");
    }
  }
  async function toggleLegalHold() {
    if (!selected) return;
    const held = !selected.legal_hold;
    try {
      await apiFetch("/api/mail/legal-hold", { method: "POST", body: JSON.stringify({ messageId: selected.id, held }) });
      setSelected({ ...selected, legal_hold: held });
      setBulkNotice(held ? "Legal hold enabled" : "Legal hold removed");
    } catch (holdError) {
      setError(holdError instanceof Error ? holdError.message : "Legal hold could not be changed");
    }
  }
  async function moveDraggedMessage(target: ViewKey, messageId: string) {
    if (["focused", "other", "important", "snoozed", "muted"].includes(target)) return;
    try {
      const body = target.startsWith("custom:") ? { folder: "custom", customFolderId: target.slice(7) } : { folder: target };
      await apiFetch(`/api/mail/${messageId}`, { method: "POST", body: JSON.stringify(body) });
      setBulkNotice("Message moved");
      await loadMessages(folder, false);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Message could not be moved");
    } finally {
      setDraggedMessageId(null);
    }
  }
  function openCompose(seed?: ComposeSeed) {
    setComposeSeed(seed);
    setComposeOpen(true);
  }
  const activeSavedSearch = activeSavedSearchId ? savedSearches.find((item) => item.id === activeSavedSearchId) : undefined;
  const currentLabel = activeSavedSearch
    ? activeSavedSearch.name
    : folder === "focused"
      ? "Focused"
      : folder === "other"
        ? "Other"
        : folder === "important"
          ? "Important"
          : folder === "snoozed"
            ? "Snoozed"
            : folder === "muted"
              ? "Muted conversations"
        : folder.startsWith("custom:")
          ? folders.find((item) => item.id === folder.slice(7))?.name ||
            "Folder"
          : folderNames[folder as SystemFolder];
  const CurrentIcon = activeSavedSearch
    ? Bookmark
    : folder === "focused" || folder === "other" || folder === "important" || folder === "snoozed" || folder === "muted" || folder.startsWith("custom:")
      ? Mail
      : folderIcons[folder as SystemFolder];
  const unread = messages.filter((message) => !message.is_read).length;
  const selectedReplySeed = selected
    ? {
        to:
          selected.direction === "inbound"
            ? selected.from_address
            : selected.to_addresses?.[0],
        subject: selected.subject.startsWith("Re:")
          ? selected.subject
          : `Re: ${selected.subject}`,
        text: `\n\n— Original message —\n${selected.text_body || selected.snippet}`,
        threadId: selected.thread_id,
        inReplyTo: selected.message_id_header || undefined,
        references: [selected.references_header, selected.message_id_header]
          .filter(Boolean)
          .join(" "),
      }
    : undefined;
  const selectedReplyAllSeed = selected
    ? {
        ...selectedReplySeed,
        to:
          selected.direction === "inbound"
            ? selected.from_address
            : selected.to_addresses.join(", "),
        cc: [
          ...(selected.cc_addresses || []),
          ...(selected.direction === "inbound" ? selected.to_addresses : []),
        ]
          .filter(
            (address) =>
              address.toLowerCase() !==
              (session.user.email || "").toLowerCase(),
          )
          .join(", "),
      }
    : undefined;
  const detailIdentity = selected
    ? detailIdentityForMessage(selected, contacts, mailboxes)
    : null;
  const selectedContact = detailIdentity ? contactFor(detailIdentity.email, contacts) : undefined;
  const customFolderDepth = (folderId: string): number => {
    let depth = 0;
    let parentId = folders.find((item) => item.id === folderId)?.parent_id || null;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId) && depth < 8) {
      visited.add(parentId);
      depth += 1;
      parentId = folders.find((item) => item.id === parentId)?.parent_id || null;
    }
    return depth;
  };
  function folderDropProps(target: ViewKey) {
    return {
      onDragOver: (event: DragEvent<HTMLButtonElement>) => event.preventDefault(),
      onDrop: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const messageId = event.dataTransfer.getData("text/postveil-message");
        if (messageId) void moveDraggedMessage(target, messageId);
      },
    };
  }
  return (
    <main
      className={`app-shell${selected ? " mobile-message-open" : ""} theme-${settings.theme || "light"} density-${settings.density || "comfortable"}`}
    >
      <header className="mobile-topbar">
        <button
          className="icon-button"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Open navigation"
          aria-expanded={mobileNav}
          aria-controls="mailbox-navigation"
        >
          <Menu size={19} />
        </button>
        <div className="mini-brand">
          <span>P</span> Postveil
        </div>
        <button
          className="icon-button"
          onClick={() => void loadMessages()}
          aria-label="Refresh"
        >
          <RefreshCcw size={17} />
        </button>
      </header>
      {mobileNav && <button className="mobile-nav-backdrop" type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <aside id="mailbox-navigation" className={`sidebar ${mobileNav ? "mobile-visible" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark small">P</div>
            <div>
              <strong>Postveil</strong>
              <span>private mail</span>
            </div>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="compose-button"
          onClick={() => {
            openCompose();
            setMobileNav(false);
          }}
        >
          <PenLine size={17} /> Compose
        </button>
        <nav className="folder-nav" aria-label="Mailbox folders">
          <button
            className={`folder-link ${view === "mail" && folder === "inbox" ? "active" : ""}`}
            {...folderDropProps("inbox")}
            onClick={() => openMailFolder("inbox")}
          >
            <Inbox size={17} />
            <span>Inbox</span>
            {unread > 0 && <em>{unread}</em>}
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "focused" ? "active" : ""}`}
            {...folderDropProps("focused")}
            onClick={() => openMailFolder("focused")}
          >
            <Eye size={17} />
            <span>Focused</span>
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "other" ? "active" : ""}`}
            {...folderDropProps("other")}
            onClick={() => openMailFolder("other")}
          >
            <Mail size={17} />
            <span>Other</span>
          </button>
          {(
            ["sent", "drafts", "archive", "trash", "spam", "quarantine"] as SystemFolder[]
          ).map((item) => {
            const Icon = folderIcons[item];
            return (
              <button
                key={item}
                className={`folder-link ${view === "mail" && folder === item ? "active" : ""}`}
                {...folderDropProps(item)}
                onClick={() => openMailFolder(item)}
              >
                <Icon size={17} />
                <span>{folderNames[item]}</span>
              </button>
            );
          })}
          {folders.map((customFolder) => (
            <button
              key={customFolder.id}
              className={`folder-link ${view === "mail" && folder === `custom:${customFolder.id}` ? "active" : ""}`}
              style={{ paddingLeft: `${16 + customFolderDepth(customFolder.id) * 18}px` }}
              {...folderDropProps(`custom:${customFolder.id}`)}
              onClick={() => openMailFolder(`custom:${customFolder.id}`)}
            >
              <Tag size={17} color={customFolder.color} />
              <span>{customFolder.name}</span>
            </button>
          ))}
          {(["important", "snoozed", "muted"] as const).map((item) => (
            <button
              key={item}
              className={`folder-link ${view === "mail" && folder === item ? "active" : ""}`}
              {...folderDropProps(item)}
              onClick={() => openMailFolder(item)}
            >
              {item === "important" ? <Flag size={17} /> : item === "snoozed" ? <Clock3 size={17} /> : <Bell size={17} />}
              <span>{item === "important" ? "Important" : item === "snoozed" ? "Snoozed" : "Muted"}</span>
            </button>
          ))}
        </nav>
        <section className="saved-searches" aria-label="Saved searches">
          <div className="saved-search-head">
            <span className="eyebrow">SAVED SEARCHES</span>
            <button
              className="icon-button compact-icon"
              onClick={() => setSavedSearchFormOpen((current) => !current)}
              aria-label="Create saved search"
              title="Create saved search from the current query"
            >
              <Plus size={15} />
            </button>
          </div>
          {savedSearchFormOpen && (
            <div className="saved-search-form">
              <input
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
                placeholder="Search name"
                aria-label="Saved search name"
                maxLength={80}
              />
              <small>{query.trim() ? `Saves: ${query.trim()}` : "Type a query first"}</small>
              <button className="primary-button" onClick={() => void createSavedSearch()} disabled={savedSearchBusy || !query.trim()}>
                {savedSearchBusy ? "Saving…" : "Save search"}
              </button>
            </div>
          )}
          <div className="saved-search-list">
            {savedSearches.map((saved) => (
              <div className={`saved-search-row ${activeSavedSearchId === saved.id ? "active" : ""}`} key={saved.id}>
                <button className="saved-search-link" onClick={() => openSavedSearch(saved)} title={saved.query}>
                  <Bookmark size={15} color={saved.color} />
                  <span>{saved.name}</span>
                  <em>{saved.result_count ?? "—"}</em>
                </button>
                <div className="saved-search-controls">
                  <button className="icon-button compact-icon" onClick={() => void reorderSavedSearch(saved, -1)} aria-label={`Move ${saved.name} up`} title="Move up"><ArrowUp size={12} /></button>
                  <button className="icon-button compact-icon" onClick={() => void reorderSavedSearch(saved, 1)} aria-label={`Move ${saved.name} down`} title="Move down"><ArrowDown size={12} /></button>
                  <button className="icon-button compact-icon" onClick={() => void renameSavedSearch(saved)} aria-label={`Rename ${saved.name}`} title="Rename"><Pencil size={12} /></button>
                  <button className="icon-button compact-icon danger-icon" onClick={() => void deleteSavedSearch(saved)} aria-label={`Delete ${saved.name}`} title="Delete"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            {savedSearches.length === 0 && !savedSearchFormOpen && <small className="saved-search-empty">Save a query here for one-click access.</small>}
          </div>
        </section>
        <div className="sidebar-divider" />
        <nav className="folder-nav secondary-nav">
          <button
            className={
              view === "calendar" ? "active folder-link" : "folder-link"
            }
            onClick={() => setView("calendar")}
          >
            <CalendarDays size={17} />
            <span>Calendar</span>
          </button>
          <button
            className={view === "tasks" ? "active folder-link" : "folder-link"}
            onClick={() => setView("tasks")}
          >
            <Briefcase size={17} />
            <span>Work</span>
            {workSummary.total > 0 && <em className="nav-count">{workSummary.total}</em>}
            {workSummary.overdue > 0 && <em className="nav-overdue">{workSummary.overdue} due</em>}
          </button>
          <button
            className={view === "contacts" ? "active folder-link" : "folder-link"}
            onClick={() => setView("contacts")}
          >
            <Users size={17} />
            <span>Contacts</span>
          </button>
          <button
            className={view === "projects" ? "active folder-link" : "folder-link"}
            onClick={() => setView("projects")}
          >
            <Briefcase size={17} />
            <span>Projects</span>
          </button>
          <button
            className={view === "ai" ? "active folder-link" : "folder-link"}
            onClick={() => setView("ai")}
          >
            <Sparkles size={17} />
            <span>AI & privacy</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="account-chip">
          <div className="avatar">
            {(session.user.email || "J").slice(0, 1).toUpperCase()}
          </div>
          <div className="account-text">
            <strong>{displayName(session.user.email || "James")}</strong>
            <span>{session.user.email}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => void requireSupabase().auth.signOut()}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {view === "mail" ? (
        <>
          <section className="message-column">
            <div className="column-head">
              <div>
                <p className="eyebrow">INBOX VIEW</p>
                <h1>
                  <CurrentIcon size={22} /> {currentLabel}
                </h1>
              </div>
              <div className="head-actions">
                {folder === "trash" && (
                  <button
                    className="secondary-button trash-empty-button"
                    onClick={() => void emptyTrash()}
                    disabled={trashBusy || messages.length === 0}
                    title="Permanently delete every message in Trash"
                  >
                    <Trash2 size={14} /> Empty trash
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => void loadMessages()}
                  aria-label="Refresh messages"
                >
                  <RefreshCcw size={17} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Settings"
                >
                  <Settings2 size={17} />
                </button>
              </div>
            </div>
            <div className="search-workbench">
              <div className="search-box">
                <Search size={16} />
                <input
                  value={query}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearchFocused(false);
                      setSearchHelpOpen(false);
                    }
                    if (event.key === "Enter") setSearchFocused(false);
                  }}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveSavedSearchId(null);
                    clearListSelection();
                  }}
                  placeholder="Search messages, people, or files"
                  aria-label="Search messages"
                />
                <button className={`search-tool-button ${searchHelpOpen ? "active" : ""}`} onClick={() => setSearchHelpOpen((current) => !current)} aria-label="Search syntax help" title="Search syntax help"><HelpCircle size={16} /></button>
                <select
                  value={sort}
                  onChange={(event) => {
                    clearListSelection();
                    setSort(event.target.value);
                  }}
                  aria-label="Sort messages"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
                <button className="search-tool-button" onClick={() => void downloadSearchResults("csv")} aria-label="Export search results" title="Export search results"><Download size={16} /></button>
              </div>
              {searchFocused && searchSuggestions.length > 0 && (
                <div className="search-suggestions" role="listbox" aria-label="Search suggestions">
                  <div className="search-suggestion-head"><span>Suggestions</span>{searchHistory.length > 0 && <button className="text-button" onClick={() => void clearSearchHistory()}>Clear history</button>}</div>
                  {searchSuggestions.map((suggestion, index) => (
                    <button className="search-suggestion" key={`${suggestion.kind}-${suggestion.value}-${index}`} onClick={() => applySearchSuggestion(suggestion)} role="option">
                      <span className={`search-suggestion-kind kind-${suggestion.kind}`}>{suggestion.kind === "recent" ? <History size={13} /> : suggestion.kind === "saved" ? <Bookmark size={13} /> : suggestion.kind === "label" ? <Tag size={13} /> : <Search size={13} />}</span>
                      <span className="search-suggestion-copy"><strong>{suggestion.label}</strong>{suggestion.detail && <small>{suggestion.detail}</small>}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchHelpOpen && (
                <div className="search-help" aria-label="Search syntax documentation">
                  <div className="search-help-head"><div><p className="eyebrow">SEARCH SYNTAX</p><strong>Find exactly what you need</strong></div><button className="icon-button" onClick={() => setSearchHelpOpen(false)} aria-label="Close search help"><X size={15} /></button></div>
                  <div className="search-help-grid">
                    <code>from:alex@example.com</code><span>Sender</span><code>to:team@example.com</code><span>Recipient</span>
                    <code>subject:"launch plan"</code><span>Subject phrase</span><code>filename:invoice</code><span>Attachment name</span>
                    <code>type:pdf</code><span>File type</span><code>label:Projects</code><span>Label</span>
                    <code>in:sent domain:example.com</code><span>Folder or domain</span><code>auth:pass</code><span>Authentication</span>
                    <code>is:unread has:attachment</code><span>State and attachments</span><code>has:calendar has:work</code><span>Events and follow-ups</span>
                    <code>spam:&gt;70% links:&gt;0</code><span>Risk and links</span><code>after:7d larger:5MB</code><span>Date and size</span>
                    <code>work:reply_later project:launch</code><span>Work and project</span><code>without attachments this week</code><span>Natural language</span>
                  </div>
                  <small>Prefix any filter with <code>-</code> to exclude it. Use quotes for phrases. Export includes up to 5,000 matching results.</small>
                </div>
              )}
              <div className="search-filter-row" aria-label="Quick search filters">
                {[{ value: "all", label: "All mail" }, { value: "unread", label: "Unread" }, { value: "starred", label: "Starred" }, { value: "attachments", label: "Attachments" }].map((item) => (
                  <button key={item.value} className={`search-chip ${filter === item.value ? "active" : ""}`} onClick={() => { clearListSelection(); setFilter(item.value); }}>{item.label}</button>
                ))}
                {query.trim() && normalizedQuery && <span className="search-status-copy">Query active · {resultTotal ?? 0} result{(resultTotal ?? 0) === 1 ? "" : "s"}</span>}
              </div>
            </div>
            <div className={`sync-status sync-${liveState}`} role="status" aria-live="polite">
              <span className="sync-dot" />
              {liveState === "live" ? "Live updates" : liveState === "connecting" ? "Connecting to live updates…" : liveState === "reconnecting" ? "Reconnecting…" : "Polling for updates"}
            </div>
            {error && <div className="inline-error">{error}</div>}
            {!loading && messages.length > 0 && (
              <div className="selection-bar" aria-label="Message selection controls">
                <label>
                  <input
                    type="checkbox"
                    checked={selectAllResults || messages.every((message) => selectedIds.has(message.id))}
                    onChange={(event) => event.target.checked ? selectCurrentPage() : clearListSelection()}
                    aria-label="Select all messages on this page"
                  />
                  <span>Select page</span>
                </label>
                <span className="selection-count">{resultTotal ?? messages.length} result{(resultTotal ?? messages.length) === 1 ? "" : "s"}</span>
                {selectedIds.size > 0 && !selectAllResults && <button className="text-button" onClick={clearListSelection}>Clear</button>}
                {query.trim() && !selectAllResults && selectedIds.size === messages.length && resultTotal !== null && resultTotal > messages.length && (
                  <button className="text-button selection-all-button" onClick={() => setSelectAllResults(true)}>Select all {resultTotal} results</button>
                )}
                {selectAllResults && <span className="selection-all-label">All matching results selected</span>}
              </div>
            )}
            {(selectedIds.size > 0 || selectAllResults) && (
              <div className="bulk-toolbar" aria-label="Bulk message actions">
                <strong>{selectAllResults ? `${resultTotal ?? "All"} selected` : `${selectedIds.size} selected`}</strong>
                <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} aria-label="Bulk action">
                  <option value="archive">Archive</option>
                  <option value="move">Move to…</option>
                  <option value="mark_read">Mark read</option>
                  <option value="mark_unread">Mark unread</option>
                  <option value="star">Star</option>
                  <option value="unstar">Unstar</option>
                  <option value="flag">Flag</option>
                  <option value="unflag">Unflag</option>
                  <option value="important">Mark important</option>
                  <option value="not_important">Remove importance</option>
                  <option value="mute">Mute conversations</option>
                  <option value="unmute">Unmute conversations</option>
                  <option value="ignore">Ignore threads</option>
                  <option value="unignore">Stop ignoring threads</option>
                  <option value="priority">Set priority</option>
                  {labels.length > 0 && <option value="label">Add label…</option>}
                  <option value="snooze">Snooze 1 hour</option>
                  <option value="reminder">Remind me tomorrow</option>
                  <option value="reply_later">Reply later</option>
                  <option value="waiting_on">Waiting on</option>
                  <option value="i_owe">I owe</option>
                  <option value="create_task">Create task</option>
                  <option value="export">Export JSON</option>
                  <option value="restore">Restore</option>
                  <option value="spam">Move to Spam</option>
                  <option value="trash">Move to Trash</option>
                </select>
                 {bulkAction === "move" && (
                   <select value={bulkFolder} onChange={(event) => setBulkFolder(event.target.value)} aria-label="Bulk destination folder">
                     {(["inbox", "sent", "drafts", "archive", "trash", "spam", "quarantine"] as SystemFolder[]).map((item) => <option key={item} value={item}>{folderNames[item]}</option>)}
                     {folders.map((item) => <option key={item.id} value={`custom:${item.id}`}>{item.name}</option>)}
                   </select>
                 )}
                {bulkAction === "priority" && (
                  <select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)} aria-label="Bulk priority">
                    <option value="0">Normal</option><option value="1">Important</option><option value="2">High</option>
                  </select>
                )}
                {bulkAction === "label" && (
                  <select value={bulkLabelId} onChange={(event) => setBulkLabelId(event.target.value)} aria-label="Bulk label">
                    <option value="">Choose label</option>
                    {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                  </select>
                )}
                <button className="primary-button" onClick={() => void runBulkAction()} disabled={bulkBusy}>{bulkBusy ? "Applying…" : "Apply"}</button>
              </div>
            )}
            {bulkNotice && (
              <div className="inline-notice" role="status" aria-live="polite">
                <span>{bulkNotice}</span>
                {bulkUndo && <button className="text-button" onClick={() => void undoBulkAction()}>{bulkUndo.label}</button>}
              </div>
            )}
            <div className="message-list">
              {loading ? (
                <div className="list-empty">
                  <div className="pulse-dot" />
                  <p>Gathering your mail…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="list-empty">
                  <div className="empty-glyph">
                    <Mail size={22} />
                  </div>
                  <h3>
                    {folder === "trash"
                      ? "Trash is empty"
                      : currentLabel === "Inbox"
                      ? "A quiet inbox"
                      : `No mail in ${currentLabel.toLowerCase()}`}
                  </h3>
                  <p>
                    {folder === "trash"
                      ? "Deleted messages stay here until you restore or permanently remove them."
                      : "New messages and saved rules will appear here."}
                  </p>
                  {folder !== "trash" && (
                    <button className="text-button" onClick={() => openCompose()}>
                      Write the first message
                    </button>
                  )}
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row ${selectedId === message.id ? "selected" : ""} ${selectedIds.has(message.id) ? "bulk-selected" : ""} ${message.is_read ? "read" : "unread"} ${draggedMessageId === message.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/postveil-message", message.id);
                      setDraggedMessageId(message.id);
                    }}
                    onDragEnd={() => setDraggedMessageId(null)}
                    onClick={() => void openMessage(message)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openMessage(message);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <input
                      className="message-select-checkbox"
                      type="checkbox"
                      checked={selectedIds.has(message.id) || selectAllResults}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleMessageSelection(message.id)}
                      aria-label={`Select ${message.subject || "message"}`}
                    />
                    {(() => {
                      const sender = senderForMessage(message, contacts, mailboxes);
                      return <SenderAvatar name={sender.name} email={sender.email} avatarUrl={sender.avatarUrl} />;
                    })()}
                    <div className="row-copy">
                      <div className="row-top">
                        <strong>
                          {message.direction === "inbound"
                            ? senderForMessage(message, contacts, mailboxes).name
                            : `To ${senderForMessage(message, contacts, mailboxes).name}`}
                        </strong>
                        <time>
                          {formatDate(
                            message.received_at ||
                              message.sent_at ||
                              message.created_at,
                          )}
                        </time>
                      </div>
                      <div className="row-address">
                        {senderForMessage(message, contacts, mailboxes).email}
                      </div>
                      <div className="row-subject">
                        {message.subject || "(no subject)"}
                        {message.status !== "received" && (
                          <span className={`message-status message-status-${message.status}`}>
                            {messageStatusLabel(message)}
                          </span>
                        )}
                        {message.has_attachment && <Paperclip size={13} />}
                        {message.is_pinned && (
                          <Pin size={13} fill="currentColor" />
                        )}
                        {message.is_important && <Flag size={13} fill="currentColor" />}
                        {message.is_muted && <span className="message-state-pill">Muted</span>}
                        {message.reminder_at && <Bell size={13} />}
                      </div>
                      <p>{message.snippet || "No preview available."}</p>
                    </div>
                    {message.spam_score && message.spam_score >= 0.35 ? (
                      <span className="score-badge">
                        {Math.round(message.spam_score * 100)}%
                      </span>
                    ) : null}
                    {message.is_starred && (
                      <Star
                        className="row-star"
                        size={15}
                        fill="currentColor"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
            {!loading && hasMore && (
              <button className="load-more-button" onClick={() => void loadMessages(folder, false, page + 1, true)} disabled={bulkBusy}>
                Load more{resultTotal !== null ? ` · ${Math.max(resultTotal - messages.length, 0)} remaining` : ""}
              </button>
            )}
          </section>
          <section className="reading-pane">
            {!selected ? (
              <div className="reading-empty">
                <div className="empty-glyph large">
                  <Mail size={30} />
                </div>
                <p>Select a message to read it here.</p>
                <span>Your inbox, without the noise.</span>
              </div>
            ) : (
              <article key={selected.id} className={`message-detail ${detailLoading ? "is-detail-loading" : ""}`} aria-busy={detailLoading}>
                <div className="detail-head">
                  <div>
                    <button className="mobile-detail-back" type="button" onClick={closeSelectedMessage}>
                      <ArrowLeft size={15} aria-hidden="true" /> Back to messages
                    </button>
                    <p className="eyebrow">{selected.direction === "inbound" ? "RECEIVED" : "SENT"}</p>
                    <h2>{selected.subject || "(no subject)"}</h2>
                    <div className="detail-meta">
                      <span>{messageStatusLabel(selected)}</span>
                      {selected.spam_score !== undefined && selected.spam_score >= 0.35 && (
                        <span>
                          Spam risk {Math.round(selected.spam_score * 100)}%
                        </span>
                      )}
                      {selected.focused_category && (
                        <span>{selected.focused_category === "focused" ? "Focused" : "Other"}</span>
                      )}
                      {selected.is_important && <span className="detail-status-accent">Important</span>}
                      {selected.is_muted && <span>Muted</span>}
                      {selected.legal_hold && <span className="detail-status-accent">Legal hold</span>}
                    </div>
                  </div>
                  <div className="head-actions">
                    <button
                      className="icon-button"
                      title={selected.is_starred ? "Unstar message" : "Star message"}
                      onClick={() =>
                        void mutateMessage({ isStarred: !selected.is_starred })
                      }
                      aria-label={selected.is_starred ? "Unstar message" : "Star message"}
                    >
                      <Star
                        size={17}
                        fill={selected.is_starred ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-button"
                      title={selected.is_pinned ? "Unpin message" : "Pin message"}
                      onClick={() =>
                        void mutateMessage({ isPinned: !selected.is_pinned })
                      }
                      aria-label={selected.is_pinned ? "Unpin message" : "Pin message"}
                    >
                      <Pin
                        size={17}
                        fill={selected.is_pinned ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className={`icon-button ${selected.is_important ? "is-active" : ""}`}
                      title={selected.is_important ? "Remove importance" : "Mark important"}
                      onClick={() => void mutateMessage({ isImportant: !selected.is_important })}
                      aria-label={selected.is_important ? "Remove importance" : "Mark important"}
                    >
                      <Flag size={17} fill={selected.is_important ? "currentColor" : "none"} />
                    </button>
                    {selected.folder === "trash" ? (
                      <>
                        <button
                          className="icon-button"
                          title="Restore to previous folder"
                          onClick={() => void restoreSelected()}
                          aria-label="Restore message"
                          disabled={trashBusy}
                        >
                          <Undo2 size={17} />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          title="Delete permanently"
                          onClick={() => void permanentlyDeleteSelected()}
                          aria-label="Delete message permanently"
                          disabled={trashBusy}
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="icon-button"
                          title="Archive message"
                          onClick={() => void mutateMessage({ folder: "archive" })}
                          aria-label="Archive message"
                        >
                          <Archive size={17} />
                        </button>
                        <button
                          className="icon-button"
                          title="Move message to trash"
                          onClick={() => void mutateMessage({ folder: "trash" })}
                          aria-label="Delete message"
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {detailLoading && (
                  <div className="detail-loading" role="status" aria-live="polite">
                    <span className="detail-loading-dot" /> Updating message…
                  </div>
                )}
                {selected.folder === "trash" && (
                  <div className="trash-notice" role="status">
                    <Trash2 size={15} />
                    <span>This message is in Trash. Restore it to its previous folder or delete it permanently.</span>
                  </div>
                )}
                {selected.work_state && selected.work_state !== "none" && (
                  <div className={`work-state-callout ${selected.follow_up_at && new Date(selected.follow_up_at).getTime() <= Date.now() ? "overdue" : ""}`}>
                    <Briefcase size={15} />
                    <div><strong>{workStateLabel(selected.work_state)}</strong><span>{workDueLabel(selected.follow_up_at)}{selected.work_note ? ` · ${selected.work_note}` : ""}</span></div>
                    <button className="text-button" onClick={() => void mutateMessage({ workState: "none" })}>Clear</button>
                  </div>
                )}
                <div className="sender-line">
                  {detailIdentity && <SenderAvatar name={detailIdentity.name} email={detailIdentity.email} avatarUrl={detailIdentity.avatarUrl} large />}
                  <div className="sender-copy">
                    <strong>{detailIdentity?.name}</strong>
                    <small>{detailIdentity?.email}</small>
                    <span>to {selected.to_addresses?.join(", ") || "your mailbox"}</span>
                    {selected.unsubscribe_url && /^(https?:\/\/|mailto:)/i.test(selected.unsubscribe_url) && (
                      <a className="unsubscribe-link" href={selected.unsubscribe_url} target="_blank" rel="noreferrer noopener">Unsubscribe</a>
                    )}
                    {showMessageDetails && (
                      <dl className="sender-details">
                        <div><dt>From</dt><dd>{detailIdentity?.email || "Not available"}</dd></div>
                        <div><dt>To</dt><dd>{selected.to_addresses?.join(", ") || "Not available"}</dd></div>
                        {selected.cc_addresses && selected.cc_addresses.length > 0 && <div><dt>CC</dt><dd>{selected.cc_addresses.join(", ")}</dd></div>}
                        {selected.bcc_addresses && selected.bcc_addresses.length > 0 && <div><dt>BCC</dt><dd>{selected.bcc_addresses.join(", ")}</dd></div>}
                        {selected.reply_to && <div><dt>Reply-To</dt><dd>{selected.reply_to}</dd></div>}
                        <div><dt>Date</dt><dd>{new Date(selected.received_at || selected.sent_at || selected.created_at).toLocaleString()}</dd></div>
                        <div><dt>Message ID</dt><dd>{selected.message_id_header || "Not available"}</dd></div>
                      </dl>
                    )}
                  </div>
                  <button
                    className="details-toggle"
                    aria-expanded={showMessageDetails}
                    onClick={() => setShowMessageDetails((current) => !current)}
                  >
                    {showMessageDetails ? "Hide details" : "Details"}
                    <ChevronDown size={14} className={showMessageDetails ? "rotated" : ""} />
                  </button>
                </div>
                <details className="sender-profile-card">
                  <summary><Users size={14} /> Sender profile and contact history</summary>
                  <div className="sender-profile-grid">
                    <div><span className="eyebrow">CONTACT</span><strong>{selectedContact?.display_name || detailIdentity?.name || "Unknown sender"}</strong><small>{detailIdentity?.email}</small></div>
                    <div><span className="eyebrow">HISTORY</span><strong>{messages.filter((item) => item.from_address.toLowerCase() === detailIdentity?.email.toLowerCase()).length} visible messages</strong><small>{selectedContact ? "Saved contact" : "Not saved as a contact"}</small></div>
                  </div>
                </details>
                {collaborationData && <section className="collaboration-thread-card" aria-label="Team workspace"><div className="collaboration-thread-head"><div><p className="eyebrow">TEAM WORKSPACE</p><h3>Conversation collaboration</h3><small>{collaborationData.presence.some((item) => item.user_id !== session.user.id && item.state === "composing") ? "Someone is replying right now" : collaborationData.presence.some((item) => item.user_id !== session.user.id) ? "A teammate is viewing this conversation" : "Only you are viewing this conversation"}</small></div><Users size={17} /></div><div className="collaboration-thread-controls"><label>Status<select value={collaborationData.thread.status} onChange={(event) => void updateCollaboration({ status: event.target.value })} disabled={collaborationBusy}><option value="new">New</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select value={collaborationData.thread.priority} onChange={(event) => void updateCollaboration({ priority: event.target.value })} disabled={collaborationBusy}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Owner<select value={collaborationData.thread.assignee_id || ""} onChange={(event) => void updateCollaboration({ assigneeId: event.target.value || null })} disabled={collaborationBusy}><option value="">Unassigned</option>{collaborationData.members.filter((member) => member.status === "active").map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}</select></label></div><div className={`collaboration-sla ${collaborationData.thread.sla_breached_at ? "is-breached" : ""}`}><Clock3 size={14} /><span><strong>{collaborationData.thread.sla_breached_at ? "SLA breached" : "SLA target"}</strong><small>{collaborationData.thread.sla_due_at ? new Date(collaborationData.thread.sla_due_at).toLocaleString() : "Not set"}</small></span></div>{collaborationData.presence.filter((item) => item.user_id !== session.user.id).length > 0 && <div className="collaboration-presence-list">{collaborationData.presence.filter((item) => item.user_id !== session.user.id).map((item) => <span key={item.user_id}><span className="presence-dot" />{item.member?.display_name || item.member?.email || "Teammate"}{item.state === "composing" ? " is replying…" : " is viewing"}</span>)}</div>}<div className="collaboration-comment-form"><div className="collaboration-comment-options"><select value={collaborationCommentKind} onChange={(event) => setCollaborationCommentKind(event.target.value as "comment" | "note")} aria-label="Collaboration message type"><option value="comment">Team comment</option><option value="note">Internal note</option></select><select value={collaborationCommentVisibility} onChange={(event) => setCollaborationCommentVisibility(event.target.value as "team" | "private")} aria-label="Comment visibility"><option value="team">Visible to team</option><option value="private">Private to admins and author</option></select></div><textarea value={collaborationComment} onChange={(event) => { setCollaborationComment(event.target.value); void updateCollaborationPresence("composing"); }} onFocus={() => void updateCollaborationPresence("composing")} onBlur={() => void updateCollaborationPresence("viewing")} placeholder="Add a comment or internal note… Mention a teammate by email." rows={3} /><button className="secondary-button" onClick={() => void addCollaborationComment()} disabled={collaborationBusy || !collaborationComment.trim()}><Send size={14} /> Post to team</button></div>{collaborationData.comments.length > 0 && <div className="collaboration-comments">{collaborationData.comments.filter((comment) => !comment.deleted_at).slice(-8).map((comment) => <article className={`collaboration-comment ${comment.kind === "note" ? "is-note" : ""}`} key={comment.id}><div className="collaboration-comment-meta"><strong>{comment.author?.display_name || comment.author?.email || "Workspace member"}</strong><span>{comment.kind === "note" ? "Internal note" : "Comment"} · {comment.visibility === "private" ? "Private" : "Team"}</span><time>{new Date(comment.created_at).toLocaleString()}</time></div><p>{comment.body}</p></article>)}</div>}{collaborationData.activity.length > 0 && <details className="collaboration-thread-history"><summary><History size={14} /> Conversation activity</summary><div>{collaborationData.activity.slice(-8).reverse().map((item) => <p key={item.id}><strong>{item.event_type.replace(/_/g, " ")}</strong><small>{item.actor?.display_name || item.actor?.email || "Workspace member"} · {new Date(item.created_at).toLocaleString()}</small></p>)}</div></details>}</section>}
                {selected.spam_reasons && selected.spam_reasons.length > 0 && (
                  <div className="signal-box">
                    <ShieldAlert size={15} />
                    <div>
                      <strong>Why this was flagged</strong>
                      <span>{selected.spam_reasons.join(" · ")}</span>
                    </div>
                  </div>
                )}
                {(() => {
                  const evidence = selected.trust_evidence || {};
                  const auth = selected.auth_results || {};
                  const authStatus = (key: "spf" | "dkim" | "dmarc" | "arc" | "tls") => String(selected[`auth_${key}` as keyof Message] || auth[key] || "missing").toLowerCase();
                  const warnings: string[] = [];
                  const notes: string[] = [];
                  (["spf", "dkim", "dmarc"] as const).forEach((key) => { const value = authStatus(key); if (["fail", "softfail", "permerror", "temperror"].includes(value)) warnings.push(`${key.toUpperCase()} ${value}`); });
                  if (authStatus("arc") === "fail") warnings.push("ARC failed");
                  if (authStatus("tls") === "fail") warnings.push("TLS failed");
                  if (evidence.external_sender === true) notes.push("External sender");
                  if (selected.sender_first_seen || evidence.first_seen_sender === true) notes.push("First-time sender");
                  if (evidence.display_name_spoof === true) warnings.push("Display name resembles a known brand");
                  if (typeof evidence.lookalike_domain === "string" && evidence.lookalike_domain) warnings.push(`Lookalike ${evidence.lookalike_domain} domain`);
                  if (evidence.suspicious_reply_to === true) warnings.push("Reply-To points to a different domain");
                  const linkReputation = Array.isArray(evidence.link_reputation) ? evidence.link_reputation as Array<{ host?: string; reputation?: string }> : [];
                  if (linkReputation.some((link) => link.reputation === "suspicious")) warnings.push("Suspicious link reputation signal");
                  if (Number(evidence.qr_code_count || 0) > 0) warnings.push("QR-code candidate detected — inspect before scanning");
                  const attachmentReputation = Array.isArray(evidence.attachment_reputation) ? evidence.attachment_reputation as Array<{ filename?: string; status?: string }> : [];
                  if (attachmentReputation.some((attachment) => attachment.status === "blocked")) warnings.push("Blocked attachment");
                  else if (attachmentReputation.some((attachment) => attachment.status === "suspicious")) warnings.push("Attachment needs review");
                  if (attachmentReputation.length > 0) notes.push("Static attachment checks only; malware sandbox is not configured");
                  if (evidence.brand_indicator && typeof evidence.brand_indicator === "object" && (evidence.brand_indicator as Record<string, unknown>).present === true) notes.push("Brand indicator declared but not independently verified");
                  if (evidence.phishing_escalated === true) warnings.push("Phishing report escalated to Quarantine");
                  if (!warnings.length && !notes.length) return null;
                  return <div className={`trust-warning-banner ${warnings.length ? "has-warnings" : ""}`} role={warnings.length ? "alert" : "status"}>
                    <ShieldAlert size={16} aria-hidden="true" />
                    <div><strong>{warnings.length ? "Review before interacting" : "Sender context"}</strong><span>{[...warnings, ...notes].join(" · ")}</span><small>These are advisory signals, not proof of malicious intent. Avoid links, attachments, and replies until the sender is verified.</small></div>
                  </div>;
                })()}
                {trustLensOpen && <div className="trust-lens">
                  <button className="trust-lens-toggle" onClick={() => void toggleTrustLens()} aria-expanded={trustLensOpen}>
                    <span className="trust-lens-title"><ShieldAlert size={15} /><span><strong>Trust Lens</strong><small> Authentication and sender evidence</small></span></span>
                    <span>{trustLensBusy ? "Loading…" : trustLensOpen ? "Hide" : "Inspect"} <ChevronDown size={14} className={trustLensOpen ? "rotated" : ""} /></span>
                  </button>
                  {trustLensOpen && trustData && (() => {
                    const auth = trustData.auth_results || {};
                    const evidence = trustData.trust_evidence || {};
                    const status = (key: "spf" | "dkim" | "dmarc" | "arc" | "tls") => String(trustData[`auth_${key}` as keyof TrustData] || auth[key] || "missing");
                    const statusClass = (value: string) => value === "pass" ? "trust-status-pass" : value === "missing" || value === "none" ? "trust-status-missing" : "trust-status-fail";
                    const hosts = Array.isArray(evidence.link_hosts) ? evidence.link_hosts as Array<{ host?: string; count?: number }> : [];
                    const history = trustData.screening_history || [];
                    const brandIndicator = evidence.brand_indicator && typeof evidence.brand_indicator === "object" ? evidence.brand_indicator as Record<string, unknown> : null;
                    return <div className="trust-lens-body">
                      <p className="trust-lens-note">Advisory signals only. Authentication results describe what the receiving server observed; they do not guarantee that a message is safe.</p>
                      <div className="trust-lens-grid">
                        {(["spf", "dkim", "dmarc", "arc", "tls"] as const).map((key) => <div className="trust-lens-item" key={key}><strong>{key.toUpperCase()}</strong><span className={statusClass(status(key))}>{status(key)}</span></div>)}
                      </div>
                      <div className="trust-lens-grid">
                        <div className="trust-lens-item"><strong>Sender history</strong><span>{trustData.sender_first_seen ? "First seen sender" : "Seen before"}</span></div>
                        <div className="trust-lens-item"><strong>Contact</strong><span>{trustData.known_contact ? "Known contact" : "Not in contacts"}</span></div>
                        <div className="trust-lens-item"><strong>Reply-To</strong><span className={trustData.reply_to_mismatch ? "trust-status-fail" : "trust-status-pass"}>{trustData.reply_to_mismatch ? "Different address" : "Matches sender"}</span></div>
                        <div className="trust-lens-item"><strong>Tracking pixels</strong><span>{trustData.tracking_pixel_count || 0} detected</span></div>
                        <div className="trust-lens-item"><strong>Sender boundary</strong><span className={evidence.external_sender ? "trust-status-fail" : "trust-status-pass"}>{evidence.external_sender ? "External sender" : "Same domain"}</span></div>
                        <div className="trust-lens-item"><strong>Identity signals</strong><span className={evidence.display_name_spoof || evidence.lookalike_domain ? "trust-status-fail" : "trust-status-missing"}>{evidence.display_name_spoof ? "Brand-like display name" : evidence.lookalike_domain ? `Lookalike ${String(evidence.lookalike_domain)}` : "No match detected"}</span></div>
                        <div className="trust-lens-item"><strong>QR candidates</strong><span>{Number(evidence.qr_code_count || 0)} detected</span></div>
                        <div className="trust-lens-item"><strong>Attachment checks</strong><span>{Array.isArray(evidence.attachment_reputation) && evidence.attachment_reputation.length ? "Static checks only" : "No attachments"}</span></div>
                      </div>
                      <div className="trust-lens-section"><strong>Link hosts · {trustData.link_count || 0} links</strong>{hosts.length ? <div className="trust-host-list">{hosts.map((item) => <span className="trust-host" key={item.host}>{item.host}{item.count && item.count > 1 ? ` · ${item.count}` : ""}</span>)}</div> : <p className="trust-lens-note">No web links detected.</p>}</div>
                      {brandIndicator?.present === true && <div className="trust-lens-section"><strong>Brand indicator</strong><p className="trust-lens-note">A BIMI-style declaration was present, but Postveil has not independently verified the logo or domain.</p></div>}
                      {history.length > 0 && <div className="trust-lens-section"><strong>Screening history</strong><p className="trust-lens-note">{history.slice(0, 3).map((item) => `${item.decision} · ${new Date(item.created_at).toLocaleString()}`).join("  |  ")}</p></div>}
                    </div>;
                  })()}
                  {trustLensOpen && !trustData && trustLensBusy && <div className="trust-lens-body"><p className="trust-lens-note">Loading sender evidence…</p></div>}
                </div>}
                {deliveryInspectionOpen && <div className="delivery-inspection">
                  <div className="delivery-inspection-head">
                    <span><History size={15} /><strong>Delivery timeline</strong></span>
                    <small>{deliveryInspectionBusy ? "Loading…" : selected.delivery_status || selected.status}</small>
                  </div>
                  {deliveryInspection && <>
                    <div className="delivery-summary-grid">
                      <div><span>Provider</span><strong>{selected.provider || "Not assigned"}</strong></div>
                      <div><span>Message size</span><strong>{selected.message_size_bytes ? formatBytes(selected.message_size_bytes) : "Not recorded"}</strong></div>
                      <div><span>Tracking</span><strong>{selected.open_tracking_enabled || selected.click_tracking_enabled ? `${selected.open_tracking_enabled ? "opens" : ""}${selected.open_tracking_enabled && selected.click_tracking_enabled ? " + " : ""}${selected.click_tracking_enabled ? "clicks" : ""}` : "off"}</strong></div>
                      <div><span>Provider ID</span><strong>{selected.provider_message_id || "Pending"}</strong></div>
                    </div>
                    {selected.delivery_error && <div className="delivery-error"><strong>{selected.delivery_error_code || "Delivery issue"}</strong><span>{selected.delivery_error}</span></div>}
                    <div className="delivery-timeline-list">
                      {(() => { const timeline: Array<Record<string, unknown> & { kind: string; at?: unknown }> = [...deliveryInspection.attempts.map((item) => ({ ...item, kind: "attempt", at: item.started_at || item.completed_at })), ...deliveryInspection.events.map((item) => ({ ...item, kind: "event", at: item.occurred_at || item.created_at }))]; return timeline.sort((a, b) => Date.parse(String(a.at || "")) - Date.parse(String(b.at || ""))).map((item, index) => <div className="delivery-timeline-item" key={`${String(item.id || item.event_id || item.at)}-${index}`}><span className="delivery-timeline-dot" /><div><strong>{String(item.kind === "attempt" ? item.status || "attempt" : item.event_type || "event")}</strong><small>{String(item.provider || selected.provider || "provider")} · {item.at ? new Date(String(item.at)).toLocaleString() : "time unavailable"}</small>{typeof item.error_message === "string" && <p>{item.error_message}</p>}{typeof item.payload === "object" && item.payload !== null && <p>{String((item.payload as Record<string, unknown>).reason || "")}</p>}</div></div>); })()}
                      {!deliveryInspection.attempts.length && !deliveryInspection.events.length && <p className="delivery-empty">No provider events yet. Accepted means the provider took custody; delivery confirmation arrives through its webhook.</p>}
                    </div>
                    <details className="raw-inspection"><summary>Full headers and MIME parts</summary><div className="inspection-columns"><div><strong>Headers</strong>{(selected.raw_headers || []).map((header, index) => <code key={`${header.key}-${index}`}>{header.key}: {header.value}</code>)}{!(selected.raw_headers || []).length && <small>No stored headers.</small>}</div><div><strong>MIME parts</strong>{(selected.mime_parts || []).map((part, index) => <code key={index}>{JSON.stringify(part)}</code>)}{!(selected.mime_parts || []).length && <small>No MIME metadata.</small>}</div></div></details>
                  </>}
                </div>}
                {labels.length > 0 && (
                  <div className="detail-labels">
                    <span className="eyebrow">LABELS</span>
                    {labels.map((label) => (
                      <button
                        key={label.id}
                        className="label-chip"
                        onClick={() => void assignLabel(label.id)}
                        style={{ borderColor: label.color, color: label.color }}
                      >
                        <Tag size={12} /> {label.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="body-copy body-copy-rich">
                  <RichEmailBody
                    htmlBody={selected.html_body}
                    textBody={selected.text_body}
                    fallback={selected.snippet}
                    inlineImageUrls={inlineImageUrls}
                    loadRemoteImages={loadRemoteImages}
                    loadExternalImage={loadExternalEmailImage}
                    inspectLink={inspectEmailLink}
                  />
                </div>
                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="attachments">
                    <div className="attachments-head">
                      <p className="eyebrow">ATTACHMENTS · {selected.attachments.length}</p>
                      {selected.attachments.length > 1 && <button className="attachment-download-all" onClick={() => void downloadAllAttachments(selected.id)}><Download size={13} /> Download all</button>}
                    </div>
                    {selected.attachments.map((attachment) => (
                      <div className="attachment-card" key={attachment.id}>
                        <div className="attachment-card-main">
                          <Paperclip size={14} />
                          <span><strong>{attachment.filename}</strong><small>{formatBytes(attachment.byte_size)} · {attachment.detected_content_type || attachment.content_type}</small></span>
                        </div>
                        <div className="attachment-card-actions">
                          {attachment.preview_state === "ready" && <button className="attachment-mini-action" onClick={() => void previewAttachment(attachment.id)}><Eye size={13} /> Preview</button>}
                          <button className="attachment-mini-action" onClick={() => void openAttachment(attachment.id)}><Download size={13} /> Download</button>
                        </div>
                        <small className={`attachment-safety attachment-safety-${attachment.safety_status || "unknown"}`}><ShieldAlert size={12} /> {attachment.safety_status === "suspicious" ? "Review before opening" : "Malware scan unavailable; static checks only"}</small>
                      </div>
                    ))}
                  </div>
                )}
                {threadMessages.length > 1 && (
                  <div className="conversation-section">
                    <div className="conversation-head">
                      <p className="eyebrow">CONVERSATION</p>
                      <span>{threadMessages.length} messages</span>
                    </div>
                    {!showAllThreadMessages && (
                      <button
                        className="thread-expand"
                        onClick={() => setShowAllThreadMessages(true)}
                      >
                        <ChevronDown size={15} /> Show {threadMessages.length - 1} earlier messages
                      </button>
                    )}
                    <div className="thread-stack">
                      {(showAllThreadMessages ? threadMessages : [selected]).map((threadMessage) => (
                        <button
                          key={threadMessage.id}
                          className={threadMessage.id === selected.id ? "active" : ""}
                          onClick={() => void openMessage(threadMessage)}
                        >
                          <span>{senderForMessage(threadMessage, contacts, mailboxes).name}</span>
                          <strong>{threadMessage.snippet || threadMessage.subject || "No preview available."}</strong>
                          <small>
                            {formatDate(threadMessage.received_at || threadMessage.sent_at || threadMessage.created_at)}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="detail-actions">
                  {selected.direction === "outbound" && ["queued", "scheduled"].includes(selected.status) && !selected.cancelled_at ? (
                    <button className="secondary-button danger-button" onClick={() => void cancelSelectedSend()}>
                      <Undo2 size={15} /> Cancel send
                    </button>
                  ) : selected.folder === "trash" ? (
                    <>
                      <button
                        className="primary-button"
                        onClick={() => void restoreSelected()}
                        disabled={trashBusy}
                      >
                        <Undo2 size={15} /> Restore
                      </button>
                      <button
                        className="secondary-button danger-button"
                        onClick={() => void permanentlyDeleteSelected()}
                        disabled={trashBusy}
                      >
                        <Trash2 size={15} /> Delete forever
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary-button"
                        onClick={() => openCompose(selectedReplySeed)}
                      >
                        <PenLine size={15} /> Reply
                      </button>
                      <button
                        className="secondary-button detail-quick-action"
                        onClick={() => openCompose(selectedReplyAllSeed)}
                      >
                        <Users size={15} /> Reply all
                      </button>
                      <div className="more-actions">
                        <button
                          className="secondary-button"
                          aria-expanded={showMoreActions}
                          aria-haspopup="menu"
                          onClick={() => setShowMoreActions((current) => !current)}
                        >
                          <MoreHorizontal size={15} /> More
                        </button>
                        {showMoreActions && (
                          <div className="action-menu" role="menu">
                            <button role="menuitem" onClick={() => openCompose({ to: selected.to_addresses?.[0], subject: `Fwd: ${selected.subject}`, text: `\n\n— Forwarded message —\n${selected.text_body || selected.snippet}` })}>
                              <Forward size={15} /> Forward
                            </button>
                             <button role="menuitem" onClick={() => { setShowMoreActions(false); void toggleTrustLens(); }}>
                               <ShieldAlert size={15} /> {trustLensOpen ? "Hide trust details" : "Inspect trust details"}
                             </button>
                             <button role="menuitem" onClick={() => { setShowMoreActions(false); void toggleDeliveryInspection(); }}>
                               <History size={15} /> {deliveryInspectionOpen ? "Hide delivery timeline" : "Delivery timeline"}
                             </button>
                             <button role="menuitem" onClick={() => { setShowMoreActions(false); void openRawSource(); }}>
                               <Download size={15} /> View raw source
                             </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ isRead: false })}>
                              <Eye size={15} /> Mark unread
                            </button>
                            <button role="menuitem" onClick={() => void submitSpamFeedback(selected.folder === "spam" ? "not_spam" : "spam")}>
                              <ShieldAlert size={15} /> {selected.folder === "spam" ? "Not spam" : "Spam"}
                            </button>
                            {selected.folder !== "spam" && <button role="menuitem" onClick={() => { setShowMoreActions(false); void reportSelectedMessage("spam"); }}>
                              <ShieldAlert size={15} /> Report spam and move
                            </button>}
                            <button role="menuitem" onClick={() => void mutateMessage({ snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() })}>
                              <Clock3 size={15} /> Snooze 1h
                            </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ isFlagged: !selected.is_flagged })}>
                              <Flag size={15} /> {selected.is_flagged ? "Unflag" : "Flag"}
                            </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ isImportant: !selected.is_important })}>
                              <Flag size={15} /> {selected.is_important ? "Remove importance" : "Mark important"}
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void mutateThread({ isMuted: !selected.is_muted }); }}>
                              <Bell size={15} /> {selected.is_muted ? "Unmute conversation" : "Mute conversation"}
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void mutateThread({ isIgnored: !selected.is_ignored }); }}>
                              <Eye size={15} /> {selected.is_ignored ? "Stop ignoring thread" : "Ignore thread"}
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void blockSelectedSender("address"); }}>
                              <ShieldAlert size={15} /> Block sender
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void blockSelectedSender("domain"); }}>
                              <ShieldAlert size={15} /> Block domain
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void reportSelectedMessage("phishing"); }}>
                              <AlertTriangle size={15} /> Report phishing
                            </button>
                            <button role="menuitem" onClick={() => { setShowMoreActions(false); void toggleLegalHold(); }}>
                              <ShieldAlert size={15} /> {selected.legal_hold ? "Remove legal hold" : "Place on legal hold"}
                            </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ workState: "reply_later" })}>
                              <Clock3 size={15} /> Reply later
                            </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ workState: "waiting_on" })}>
                              <Users size={15} /> Waiting on
                            </button>
                            <button role="menuitem" onClick={() => void mutateMessage({ workState: "i_owe" })}>
                              <Briefcase size={15} /> I owe
                            </button>
                            {selected.work_state && selected.work_state !== "none" && <button role="menuitem" onClick={() => void mutateMessage({ workState: "none" })}>
                              <Check size={15} /> Clear work state
                            </button>}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </article>
            )}
          </section>
        </>
      ) : view === "ai" ? (
        <AiWorkspace />
      ) : (
        <Workspace
          mode={view}
          tasks={tasks}
          events={events}
          workItems={workItems}
          workSummary={workSummary}
          onOpenMessage={(message) => void openMessage(message)}
          onRefresh={() => {
            void loadWorkspace();
          }}
        />
      )}
      {composeOpen && (
        <Compose
          mailboxes={mailboxes}
          signatures={signatures}
          contacts={contacts}
          undoSeconds={settings.send_undo_seconds ?? 0}
          seed={composeSeed}
          onClose={() => {
            setComposeOpen(false);
            setComposeSeed(undefined);
          }}
          onSent={() => {
            void loadMessages("sent");
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          session={session}
          settings={settings}
          folders={folders}
          labels={labels}
          mailboxes={mailboxes}
          rules={rules}
          senderPolicies={senderPolicies}
          onClose={() => setSettingsOpen(false)}
          onOpenMessage={(message) => void openMessage(message)}
          loadRemoteImages={loadRemoteImages}
          onLoadRemoteImagesChange={updateRemoteImagePreference}
          onChanged={() => {
            void loadMeta();
          }}
        />
      )}
    </main>
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      setRecovering(hashParams.get("type") === "recovery");
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        if (event === "SIGNED_OUT") {
          setRecovering(false);
          setMfaRequired(false);
        }
        setSession(nextSession);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || recovering || !supabase) {
      setMfaRequired(false);
      return;
    }
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (active && !error) setMfaRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
    });
    return () => { active = false; };
  }, [session, recovering]);
  if (!ready)
    return (
      <div className="loading-screen">
        <div className="brand-mark">P</div>
        <p>Loading Postveil…</p>
      </div>
    );
  if (!supabase)
    return (
      <div className="loading-screen">
        <div className="brand-mark">P</div>
        <h2>Supabase is not configured</h2>
        <p>Add the public project URL and key to the deployment environment.</p>
      </div>
    );
  if (recovering) return <PasswordResetScreen onComplete={() => setRecovering(false)} />;
  if (!session) return <AuthScreen />;
  if (mfaRequired) return <MfaChallengeScreen onVerified={() => setMfaRequired(false)} />;
  return <MailboxApp session={session} />;
}

export default function App() {
  return (
    <AppDialogProvider>
      <AppContent />
    </AppDialogProvider>
  );
}
