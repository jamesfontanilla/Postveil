import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Flag,
  FolderPlus,
  Forward,
  Inbox,
  ListTodo,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pencil,
  PenLine,
  Pin,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "./lib/supabase";

type SystemFolder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "spam";
type ViewKey = SystemFolder | "focused" | "other" | `custom:${string}`;
type Message = {
  id: string;
  thread_id: string;
  mailbox_id: string | null;
  direction: "inbound" | "outbound";
  folder: string;
  status: string;
  custom_folder_id?: string | null;
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
  text_body?: string;
  html_body?: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_pinned?: boolean;
  is_flagged?: boolean;
  priority?: number;
  has_attachment?: boolean;
  spam_score?: number;
  spam_reasons?: string[];
  focused_category?: string;
  scheduled_at?: string | null;
  snoozed_until?: string | null;
  received_at?: string;
  sent_at?: string;
  created_at: string;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    byte_size: number;
  }>;
};
type Contact = {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string | null;
};
type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_default: boolean;
  can_send: boolean;
  can_receive?: boolean;
};
type CustomFolder = { id: string; name: string; color: string; slug: string };
type Label = { id: string; name: string; color: string };
type Signature = {
  id: string;
  name: string;
  text_body: string;
  is_default: boolean;
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
  | "isPinned";
type RuleCondition = { type: RuleConditionType; value: string };
type Rule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
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
};
type Task = {
  id: string;
  title: string;
  notes: string;
  due_at?: string | null;
  priority: number;
  completed: boolean;
};
type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  all_day: boolean;
};
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

const folderNames: Record<SystemFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
  spam: "Spam",
};
const folderIcons: Record<SystemFolder, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: PenLine,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
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
function SenderAvatar({ name, email, avatarUrl, large = false }: { name: string; email: string; avatarUrl?: string | null; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className={`avatar ${large ? "large-avatar" : "row-avatar"} ${avatarUrl && !imageFailed ? "avatar-image" : ""}`} style={avatarUrl && !imageFailed ? undefined : avatarGradient(email)} aria-label={`${name} profile picture`}>
      {avatarUrl && !imageFailed ? <img src={avatarUrl} alt="" onError={() => setImageFailed(true)} /> : initials(name || email)}
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
function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
    throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

async function apiUpload<T>(path: string, file: File): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const form = new FormData();
  form.append("file", file);
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

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = requireSupabase();
      const result =
        mode === "signin"
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session)
        setNotice(
          "Check your inbox to confirm the account, then sign in here.",
        );
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
        <h1>Keep your address close.</h1>
        <p className="auth-copy">
          A focused mailbox for your custom domain. Sign in to open messages
          across desktop and mobile.
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
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          <button className="primary-button" disabled={busy}>
            {busy
              ? "Opening…"
              : mode === "signin"
                ? "Open mailbox"
                : "Create account"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>
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

function Compose({
  mailboxes,
  signatures,
  seed,
  onClose,
  onSent,
}: {
  mailboxes: Mailbox[];
  signatures: Signature[];
  seed?: ComposeSeed;
  onClose: () => void;
  onSent: () => void;
}) {
  const defaultMailbox =
    mailboxes.find((mailbox) => mailbox.is_default) || mailboxes[0];
  const [fromAddress, setFromAddress] = useState(defaultMailbox?.address || "");
  const [to, setTo] = useState(seed?.to || "");
  const [cc, setCc] = useState(seed?.cc || "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(seed?.subject || "");
  const [text, setText] = useState(seed?.text || "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [draftId, setDraftId] = useState(seed?.draftId || "");
  const [attachments, setAttachments] = useState<
    Array<{ filename: string; object_key: string; byte_size: number }>
  >([]);
  const [signatureId, setSignatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(event.target.files || [])) {
      try {
        const item = await apiUpload<{
          filename: string;
          object_key: string;
          byte_size: number;
        }>("/api/attachments", file);
        setAttachments((current) => [...current, item]);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Attachment upload failed",
        );
      }
    }
    event.target.value = "";
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
          to,
          cc,
          bcc,
          subject,
          text,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          threadId: seed?.threadId,
          inReplyTo: seed?.inReplyTo,
          references: seed?.references,
          attachments,
        }),
      });
      onSent();
      onClose();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The message could not be sent",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="compose-overlay" role="presentation">
      <form className="compose-card" onSubmit={send}>
        <div className="compose-head">
          <div>
            <p className="eyebrow">
              {seed?.to ? "REPLY / FORWARD" : "NEW MESSAGE"}
            </p>
            <h2>{seed?.to ? "Continue the thread" : "Write a note"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close compose"
          >
            <X size={18} />
          </button>
        </div>
        <div className="compose-fields">
          <label>
            From
            <select
              value={fromAddress}
              onChange={(event) => setFromAddress(event.target.value)}
            >
              {mailboxes
                .filter((mailbox) => mailbox.can_send)
                .map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.address}>
                    {mailbox.address}
                  </option>
                ))}
            </select>
          </label>
          <label>
            To
            <input
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="recipient@example.com"
            />
          </label>
          <label>
            CC
            <input
              value={cc}
              onChange={(event) => setCc(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            BCC
            <input
              value={bcc}
              onChange={(event) => setBcc(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Subject
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="What is this about?"
            />
          </label>
          <label className="message-input">
            Message
            <textarea
              required
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Start writing…"
              rows={8}
            />
          </label>
        </div>
        {signatures.length > 0 && (
          <div className="compose-tools">
            <Tag size={15} />
            <select
              value={signatureId}
              onChange={(event) => chooseSignature(event.target.value)}
            >
              <option value="">Add signature</option>
              {signatures.map((signature) => (
                <option key={signature.id} value={signature.id}>
                  {signature.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="attachment-strip">
          {attachments.map((attachment) => (
            <span key={attachment.object_key}>
              <Paperclip size={13} />
              {attachment.filename}{" "}
              <small>{formatBytes(attachment.byte_size)}</small>
            </span>
          ))}
        </div>
        {error && <div className="form-error compose-error">{error}</div>}
        <div className="compose-foot">
          <label className="file-button">
            <Paperclip size={15} /> Attach
            <input type="file" multiple onChange={upload} />
          </label>
          <label className="schedule-field">
            <Clock3 size={15} />
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              aria-label="Schedule send"
            />
          </label>
          <span className="compose-hint">
            {saving
              ? "Saving draft…"
              : draftId
                ? "Draft saved"
                : "Autosaves after you start writing"}
          </span>
          <button className="primary-button" disabled={busy}>
            <Send size={15} />{" "}
            {busy ? "Sending…" : scheduledAt ? "Schedule" : "Send message"}
          </button>
        </div>
      </form>
    </div>
  );
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
      : value;
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

function SettingsPanel({
  settings,
  folders,
  labels,
  mailboxes,
  rules,
  onClose,
  onChanged,
}: {
  settings: AppSettings;
  folders: CustomFolder[];
  labels: Label[];
  mailboxes: Mailbox[];
  rules: Rule[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<
    | "appearance"
    | "organize"
    | "contacts"
    | "automation"
    | "mailboxes"
    | "integrations"
  >("appearance");
  const [folderName, setFolderName] = useState("");
  const [labelName, setLabelName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactAvatarUrl, setContactAvatarUrl] = useState("");
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
      body: JSON.stringify({ name: folderName }),
    });
    setFolderName("");
    setNotice("Folder created");
    onChanged();
  }
  async function createLabel() {
    if (!labelName.trim()) return;
    await apiFetch("/api/labels", {
      method: "POST",
      body: JSON.stringify({ name: labelName }),
    });
    setLabelName("");
    setNotice("Label created");
    onChanged();
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
    if (!window.confirm(`Delete the rule “${rule.name}”?`)) return;
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
  async function runRule(rule: Rule) {
    try {
      const result = await apiFetch<{ matched: number; note?: string }>(`/api/rules/${rule.id}:run`, { method: "POST" });
      setNotice(`${rule.name} matched ${result.matched} existing message${result.matched === 1 ? "" : "s"}.${result.note ? ` ${result.note}` : ""}`);
      onChanged();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not run rule");
    }
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
  return (
    <div className="modal-backdrop">
      <section className="settings-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">MAILBOX SETTINGS</p>
            <h2>Settings & organization</h2>
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
              ["organize", "Folders & labels"],
              ["contacts", "Contacts"],
              ["automation", "Rules & signatures"],
              ["mailboxes", "Mailboxes"],
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
              </div>
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
                  />
                  <datalist id="rule-labels">{labels.map((label) => <option key={label.id} value={label.name} />)}</datalist>
                  <input
                    value={ruleForwardTo}
                    onChange={(event) => setRuleForwardTo(event.target.value)}
                    placeholder="Forward to (optional)"
                    type="email"
                  />
                </div>
                <label className="toggle-row">
                  <input type="checkbox" checked={ruleStop} onChange={(event) => setRuleStop(event.target.checked)} /> Stop processing more rules
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Rule is enabled
                </label>
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
                  <p>Disable, reorder, edit, or run a rule against recent mail.</p>
                </div>
                <span className="rule-count">{rules.length}</span>
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
                      <button className="icon-button compact-icon" onClick={() => void runRule(rule)} aria-label="Run rule now" title="Run on existing mail"><Play size={14} /></button>
                      <button className="icon-button compact-icon danger-icon" onClick={() => void deleteRule(rule)} aria-label="Delete rule" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
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
  tasks,
  events,
  onRefresh,
}: {
  mode: "calendar" | "tasks";
  tasks: Task[];
  events: CalendarEvent[];
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  async function addTask() {
    if (!title.trim()) return;
    setError("");
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          dueAt: date ? new Date(date).toISOString() : null,
        }),
      });
      setTitle("");
      setDate("");
      onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the task",
      );
    }
  }
  async function addEvent() {
    if (!title.trim()) return;
    setError("");
    try {
      const start = date
        ? new Date(date)
        : new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await apiFetch("/api/calendar", {
        method: "POST",
        body: JSON.stringify({
          title,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      setTitle("");
      setDate("");
      onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the event",
      );
    }
  }
  async function toggleTask(task: Task) {
    setError("");
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed }),
      });
      onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the task",
      );
    }
  }
  return (
    <section className="workspace-view">
      <div className="workspace-head">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>
            {mode === "calendar" ? (
              <>
                <CalendarDays size={23} /> Calendar
              </>
            ) : (
              <>
                <ListTodo size={23} /> To Do
              </>
            )}
          </h1>
        </div>
        <div className="workspace-stamp">
          {mode === "calendar"
            ? "Events from email can become appointments."
            : "Turn a message into a next action."}
        </div>
      </div>
      {error && <div className="inline-error workspace-error">{error}</div>}
      <div className="workspace-grid">
        <div className="setting-card workspace-create">
          <h3>{mode === "calendar" ? "Add an event" : "Add a task"}</h3>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "calendar" ? "Event title" : "Task title"}
          />
          <input
            type={mode === "calendar" ? "datetime-local" : "datetime-local"}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button
            className="primary-button"
            onClick={() => void (mode === "calendar" ? addEvent() : addTask())}
          >
            <Plus size={15} /> Add {mode === "calendar" ? "event" : "task"}
          </button>
        </div>
        <div className="workspace-list">
          {mode === "calendar" ? (
            events.length ? (
              events.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-time">
                    {formatDate(event.starts_at)}
                  </div>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{new Date(event.starts_at).toLocaleString()}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="list-empty">
                <CalendarDays size={25} />
                <p>No events yet.</p>
              </div>
            )
          ) : tasks.length ? (
            tasks.map((task) => (
              <label
                className={`task-card ${task.completed ? "completed" : ""}`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => void toggleTask(task)}
                />
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {task.due_at
                      ? `Due ${new Date(task.due_at).toLocaleString()}`
                      : "No due date"}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <div className="list-empty">
              <ListTodo size={25} />
              <p>No tasks yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MailboxApp({ session }: { session: Session }) {
  const [view, setView] = useState<"mail" | "calendar" | "tasks">("mail");
  const [folder, setFolder] = useState<ViewKey>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: "light",
    density: "comfortable",
    focused_inbox_enabled: true,
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const previousMessageIds = useRef<Set<string>>(new Set());
  const loadMeta = useCallback(async () => {
    try {
      const [addresses, contactRows, customFolders, labelRows, signatureRows, ruleRows, preference] =
        await Promise.all([
          apiFetch<Mailbox[]>("/api/mailboxes"),
          apiFetch<Contact[]>("/api/contacts"),
          apiFetch<CustomFolder[]>("/api/folders"),
          apiFetch<Label[]>("/api/labels"),
          apiFetch<Signature[]>("/api/signatures"),
          apiFetch<Rule[]>("/api/rules"),
          apiFetch<AppSettings>("/api/settings"),
        ]);
      setMailboxes(addresses);
      setContacts(contactRows);
      setFolders(customFolders);
      setLabels(labelRows);
      setSignatures(signatureRows);
      setRules(ruleRows);
      setSettings(preference);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Mailbox settings unavailable",
      );
    }
  }, []);
  const loadMessages = useCallback(
    async (target: ViewKey = folder, showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          folder: target,
          limit: "80",
          sort,
        });
        if (query.trim()) params.set("q", query.trim());
        if (filter === "unread") params.set("unread", "true");
        if (filter === "starred") params.set("starred", "true");
        if (filter === "attachments") params.set("attachments", "true");
        setMessages(
          await apiFetch<Message[]>(`/api/mail?${params.toString()}`),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Mailbox unavailable",
        );
      } finally {
        setLoading(false);
      }
    },
    [filter, folder, query, sort],
  );
  const loadWorkspace = useCallback(async () => {
    try {
      const [taskRows, eventRows] = await Promise.all([
        apiFetch<Task[]>("/api/tasks"),
        apiFetch<CalendarEvent[]>("/api/calendar"),
      ]);
      setTasks(taskRows);
      setEvents(eventRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Workspace unavailable",
      );
    }
  }, []);
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
              body: `${message.from_address}: ${message.snippet || "Open Parcel to read it."}`,
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
      5000,
    );
    let channel:
      | ReturnType<NonNullable<typeof supabase>["channel"]>
      | undefined;
    if (supabase) {
      channel = supabase
        .channel(`messages-${folder}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => void loadMessages(folder, false),
        )
        .subscribe();
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
  async function openMessage(message: Message) {
    setSelectedId(message.id);
    try {
      const detail = await apiFetch<Message>(`/api/mail/${message.id}`);
      setSelected(detail);
      setThreadMessages(
        await apiFetch<Message[]>(`/api/threads/${message.thread_id}`),
      );
      if (!message.is_read) {
        await apiFetch(`/api/mail/${message.id}`, {
          method: "POST",
          body: JSON.stringify({ isRead: true }),
        });
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, is_read: true } : item,
          ),
        );
      }
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : "Message unavailable",
      );
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
      const detail = await apiFetch<Message>(`/api/mail/${selected.id}`);
      setSelected(detail);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
      );
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
  function openCompose(seed?: ComposeSeed) {
    setComposeSeed(seed);
    setComposeOpen(true);
  }
  const currentLabel =
    folder === "focused"
      ? "Focused"
      : folder === "other"
        ? "Other"
        : folder.startsWith("custom:")
          ? folders.find((item) => item.id === folder.slice(7))?.name ||
            "Folder"
          : folderNames[folder as SystemFolder];
  const CurrentIcon =
    folder === "focused" || folder === "other" || folder.startsWith("custom:")
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
  return (
    <main
      className={`app-shell theme-${settings.theme || "light"} density-${settings.density || "comfortable"}`}
    >
      <header className="mobile-topbar">
        <button
          className="icon-button"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <div className="mini-brand">
          <span>P</span> Parcel
        </div>
        <button
          className="icon-button"
          onClick={() => void loadMessages()}
          aria-label="Refresh"
        >
          <RefreshCcw size={17} />
        </button>
      </header>
      <aside className={`sidebar ${mobileNav ? "mobile-visible" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark small">P</div>
            <div>
              <strong>Parcel</strong>
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
            onClick={() => {
              setView("mail");
              setFolder("inbox");
              setMobileNav(false);
            }}
          >
            <Inbox size={17} />
            <span>Inbox</span>
            {unread > 0 && <em>{unread}</em>}
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "focused" ? "active" : ""}`}
            onClick={() => {
              setView("mail");
              setFolder("focused");
              setMobileNav(false);
            }}
          >
            <Eye size={17} />
            <span>Focused</span>
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "other" ? "active" : ""}`}
            onClick={() => {
              setView("mail");
              setFolder("other");
              setMobileNav(false);
            }}
          >
            <Mail size={17} />
            <span>Other</span>
          </button>
          {(
            ["sent", "drafts", "archive", "trash", "spam"] as SystemFolder[]
          ).map((item) => {
            const Icon = folderIcons[item];
            return (
              <button
                key={item}
                className={`folder-link ${view === "mail" && folder === item ? "active" : ""}`}
                onClick={() => {
                  setView("mail");
                  setFolder(item);
                  setMobileNav(false);
                }}
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
              onClick={() => {
                setView("mail");
                setFolder(`custom:${customFolder.id}`);
                setMobileNav(false);
              }}
            >
              <Tag size={17} color={customFolder.color} />
              <span>{customFolder.name}</span>
            </button>
          ))}
        </nav>
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
            <ListTodo size={17} />
            <span>To Do</span>
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
            <div className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages, people, or files"
              />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter messages"
              >
                <option value="all">All mail</option>
                <option value="unread">Unread</option>
                <option value="starred">Starred</option>
                <option value="attachments">Attachments</option>
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="Sort messages"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
            {error && <div className="inline-error">{error}</div>}
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
                    {currentLabel === "Inbox"
                      ? "A quiet inbox"
                      : `No mail in ${currentLabel.toLowerCase()}`}
                  </h3>
                  <p>New messages and saved rules will appear here.</p>
                  <button className="text-button" onClick={() => openCompose()}>
                    Write the first message
                  </button>
                </div>
              ) : (
                messages.map((message) => (
                  <button
                    key={message.id}
                    className={`message-row ${selectedId === message.id ? "selected" : ""} ${message.is_read ? "read" : "unread"}`}
                    onClick={() => void openMessage(message)}
                  >
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
                        {message.has_attachment && <Paperclip size={13} />}
                        {message.is_pinned && (
                          <Pin size={13} fill="currentColor" />
                        )}
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
                  </button>
                ))
              )}
            </div>
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
              <article className="message-detail">
                <div className="detail-head">
                  <div>
                    <p className="eyebrow">
                      {selected.direction === "inbound" ? "RECEIVED" : "SENT"} /{" "}
                      {formatDate(
                        selected.received_at ||
                          selected.sent_at ||
                          selected.created_at,
                      )}
                    </p>
                    <h2>{selected.subject || "(no subject)"}</h2>
                    <div className="detail-meta">
                      <span>{selected.status}</span>
                      {selected.spam_score !== undefined && (
                        <span>
                          spam risk {Math.round(selected.spam_score * 100)}%
                        </span>
                      )}
                      {selected.focused_category && (
                        <span>{selected.focused_category}</span>
                      )}
                    </div>
                  </div>
                  <div className="head-actions">
                    <button
                      className="icon-button"
                      onClick={() =>
                        void mutateMessage({ isStarred: !selected.is_starred })
                      }
                      aria-label="Star message"
                    >
                      <Star
                        size={17}
                        fill={selected.is_starred ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() =>
                        void mutateMessage({ isPinned: !selected.is_pinned })
                      }
                      aria-label="Pin message"
                    >
                      <Pin
                        size={17}
                        fill={selected.is_pinned ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => void mutateMessage({ folder: "archive" })}
                      aria-label="Archive message"
                    >
                      <Archive size={17} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => void mutateMessage({ folder: "trash" })}
                      aria-label="Delete message"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <div className="sender-line">
                  {(() => {
                    const sender = senderForMessage(selected, contacts, mailboxes);
                    return <SenderAvatar name={sender.name} email={sender.email} avatarUrl={sender.avatarUrl} large />;
                  })()}
                  <div>
                    <strong>{senderForMessage(selected, contacts, mailboxes).name}</strong>
                    <small>{senderForMessage(selected, contacts, mailboxes).email}</small>
                    <span>to {selected.to_addresses?.join(", ")}</span>
                  </div>
                </div>
                {selected.spam_reasons && selected.spam_reasons.length > 0 && (
                  <div className="signal-box">
                    <ShieldAlert size={15} />
                    <div>
                      <strong>Why this was flagged</strong>
                      <span>{selected.spam_reasons.join(" · ")}</span>
                    </div>
                  </div>
                )}
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
                <div className="body-copy">
                  {selected.text_body || selected.snippet || "No message body."}
                </div>
                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="attachments">
                    <p className="eyebrow">ATTACHMENTS</p>
                    {selected.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        className="attachment-link"
                        onClick={() => void openAttachment(attachment.id)}
                      >
                        <Paperclip size={14} />
                        <span>{attachment.filename}</span>
                        <small>{formatBytes(attachment.byte_size)}</small>
                      </button>
                    ))}
                  </div>
                )}
                {threadMessages.length > 1 && (
                  <div className="thread-stack">
                    <p className="eyebrow">
                      THREAD / {threadMessages.length} MESSAGES
                    </p>
                    {threadMessages.map((threadMessage) => (
                      <button
                        key={threadMessage.id}
                        className={
                          threadMessage.id === selected.id ? "active" : ""
                        }
                        onClick={() => void openMessage(threadMessage)}
                      >
                        <span>{senderForMessage(threadMessage, contacts, mailboxes).name}</span>
                        <strong>{threadMessage.subject}</strong>
                        <small>
                          {formatDate(
                            threadMessage.received_at ||
                              threadMessage.sent_at ||
                              threadMessage.created_at,
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    onClick={() => openCompose(selectedReplySeed)}
                  >
                    <PenLine size={15} /> Reply
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => openCompose(selectedReplyAllSeed)}
                  >
                    <Users size={15} /> Reply all
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      openCompose({
                        to: selected.to_addresses?.[0],
                        subject: `Fwd: ${selected.subject}`,
                        text: `\n\n— Forwarded message —\n${selected.text_body || selected.snippet}`,
                      })
                    }
                  >
                    <Forward size={15} /> Forward
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void mutateMessage({ isRead: false })}
                  >
                    <Eye size={15} /> Mark unread
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void mutateMessage({
                        folder: selected.folder === "spam" ? "inbox" : "spam",
                      })
                    }
                  >
                    <ShieldAlert size={15} />{" "}
                    {selected.folder === "spam" ? "Not spam" : "Spam"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void mutateMessage({
                        snoozedUntil: new Date(
                          Date.now() + 60 * 60 * 1000,
                        ).toISOString(),
                      })
                    }
                  >
                    <Clock3 size={15} /> Snooze 1h
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void mutateMessage({ isFlagged: !selected.is_flagged })
                    }
                  >
                    <Flag size={15} /> Flag
                  </button>
                </div>
              </article>
            )}
          </section>
        </>
      ) : (
        <Workspace
          mode={view}
          tasks={tasks}
          events={events}
          onRefresh={() => {
            void loadWorkspace();
          }}
        />
      )}
      {composeOpen && (
        <Compose
          mailboxes={mailboxes}
          signatures={signatures}
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
          settings={settings}
          folders={folders}
          labels={labels}
          mailboxes={mailboxes}
          rules={rules}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => {
            void loadMeta();
          }}
        />
      )}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => setSession(nextSession),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  if (!ready)
    return (
      <div className="loading-screen">
        <div className="brand-mark">P</div>
        <p>Loading Parcel…</p>
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
  return session ? <MailboxApp session={session} /> : <AuthScreen />;
}
