import {
  ChangeEvent,
  createContext,
  DragEvent,
  FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Archive,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Building2,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Columns,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flag,
  Folder,
  FolderInput,
  FolderPlus,
  Forward,
  Globe2,
  HardDrive,
  HelpCircle,
  History,
  Inbox,
  Info,
  Keyboard,
  LayoutGrid,
  ListTodo,
  LogOut,
  Maximize2,
  Mail,
  MailOpen,
  Menu,
  Minimize2,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pencil,
  PenLine,
  Pin,
  Plus,
  Printer,
  RefreshCcw,
  Reply,
  ReplyAll,
  RotateCcw,
  Search,
  Send,
  Settings,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Undo2,
  UploadCloud,
  Upload,
  Users,
  X,
} from "lucide-react";
import { requireSupabase, supabase, type JsonRecord, type Session } from "./lib/supabase";
import { sanitizeEmailHtml } from "./lib/email-html";
import { qrImageSource } from "./lib/qr";
import RichEmailBody from "./components/RichEmailBody";
import BrandMark from "./components/BrandMark";
import PublicHome from "./components/auth/PublicHome";
import PasswordResetScreen from "./components/auth/PasswordResetScreen";
import AuthScreen from "./components/auth/AuthScreen";
import { MfaSetupRequiredScreen, MfaChallengeScreen } from "./components/auth/MfaScreens";
import OnboardingWizard from "./components/auth/OnboardingWizard";
import { apiFetch, apiUpload, publicApiFetch, recordExplicitSignIn, ApiError } from "./lib/api";
import {
  markdownToHtml,
  zonedLocalToIso,
  displayName,
  initials,
  avatarGradient,
  formatDate,
  messageStatusLabel,
  workStateLabel,
  displayWorkNote,
  workDueLabel,
  formatBytes,
} from "./lib/format";
import { AppDialogProvider, useAppDialog } from "./context/AppDialogContext";
import Compose from "./components/modals/ComposeModal";

import {
  type SystemFolder,
  type ViewKey,
  TURNSTILE_SITE_KEY,
  type Message,
  type Contact,
  type Mailbox,
  type CustomFolder,
  type Label,
  type SavedSearch,
  type SearchHistoryItem,
  type SearchSuggestion,
  type MailPage,
  type SenderPolicy,
  type RetentionPolicy,
  type ScreeningEvent,
  type TrustData,
  type Signature,
  type LinkInspection,
  type ComposeLibraryItem,
  type RuleConditionType,
  type RuleCondition,
  type Rule,
  type RuleLabMatch,
  type RuleLabResult,
  type AutoReply,
  type AppSettings,
  type AdminMailbox,
  type AdminMember,
  type AdminOrganization,
  type AdminActivity,
  type AdminGroupMember,
  type AdminGroup,
  type AdminOverview,
  type DeliveryOpsView,
  type Task,
  type WorkItem,
  type WorkSummary,
  type CalendarEvent,
  type ComposeSeed,
  type MfaFactor,
  type RecoveryMethod,
  type Passkey,
  type OnboardingState,
  starterComposeLibrary,
} from "./types/mail";



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

  async function updateMailbox(mailbox: AdminMailbox, patch: Record<string, unknown>, message: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/mailboxes/${mailbox.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice(message); await load(); onChanged(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Mailbox could not be updated"); }
    finally { setBusy(false); }
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
  initialTab,
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
  initialTab?:
    | "appearance"
    | "security"
    | "organize"
    | "contacts"
    | "spam"
    | "automation"
    | "mailboxes"
    | "integrations"
    | "administration";
}) {
  const { confirm, prompt } = useAppDialog();
  const [tab, setTab] = useState<
    | "appearance"
    | "security"
    | "organize"
    | "contacts"
    | "spam"
    | "automation"
    | "mailboxes"
    | "integrations"
    | "administration"
  >(initialTab || "appearance");
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
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
  const [retentionName, setRetentionName] = useState("");
  const [retentionScope, setRetentionScope] = useState<RetentionPolicy["scope"]>("all");
  const [retentionDays, setRetentionDays] = useState("365");
  const [ruleLab, setRuleLab] = useState<{ rule: Rule; result: RuleLabResult } | null>(null);
  const [ruleLabBusy, setRuleLabBusy] = useState(false);
  const [settingsQuery, setSettingsQuery] = useState("");
  const ruleImportRef = useRef<HTMLInputElement>(null);
  const settingsSections = [
    { key: "appearance", label: "General", group: "Personal", description: "Appearance and reading preferences", icon: SlidersHorizontal },
    { key: "security", label: "Security & access", group: "Personal", description: "Sign-in, MFA, and recovery", icon: ShieldCheck },
    { key: "organize", label: "Folders & labels", group: "Mail", description: "Shape how messages are filed", icon: FolderPlus },
    { key: "contacts", label: "Contacts", group: "Mail", description: "People and sender details", icon: Users },
    { key: "spam", label: "Spam & trust", group: "Mail", description: "Screening and sender decisions", icon: ShieldAlert },
    { key: "automation", label: "Rules & signatures", group: "Mail", description: "Automations for incoming mail", icon: SlidersHorizontal },
    { key: "mailboxes", label: "Mailboxes", group: "Workspace", description: "Addresses and sending identities", icon: Mail },
    { key: "administration", label: "Administration", group: "Workspace", description: "Organization controls", icon: Building2 },
    { key: "integrations", label: "Integrations", group: "Workspace", description: "Connected services and providers", icon: Globe2 },
  ] as const;
  const activeSettingsSection = settingsSections.find((section) => section.key === tab) || settingsSections[0];
  const filteredSettingsSections = settingsSections.filter((section) => `${section.label} ${section.description} ${section.group}`.toLowerCase().includes(settingsQuery.trim().toLowerCase()));
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
    } catch (loadError) {
      setSecurityError(loadError instanceof Error ? loadError.message : "Security settings unavailable");
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
    if (tab === "security") void loadSecurity();
    if (tab === "spam") void loadScreeningQueue();
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
        <div className="settings-layout">
        <aside className="settings-sidebar">
          <label className="settings-search-field">
            <Search size={15} aria-hidden="true" />
            <input value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="Search settings" aria-label="Search settings" />
            {settingsQuery && <button type="button" aria-label="Clear settings search" onClick={() => setSettingsQuery("")}><X size={13} /></button>}
          </label>
          <p className="settings-nav-label">Settings</p>
          <nav className="settings-tabs" aria-label="Settings sections">
            {filteredSettingsSections.length > 0 ? filteredSettingsSections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <button key={section.key} className={tab === section.key ? "active" : ""} onClick={() => setTab(section.key)}>
                  <SectionIcon size={16} aria-hidden="true" />
                  <span><strong>{section.label}</strong><small>{section.description}</small></span>
                </button>
              );
            }) : <span className="settings-search-empty">No settings match “{settingsQuery}”.</span>}
          </nav>
          <div className="settings-sidebar-note"><ShieldCheck size={14} aria-hidden="true" /><span>Private by default<small>Changes apply to this Postveil workspace.</small></span></div>
        </aside>
        <div className="settings-content">
        <header className="settings-content-header">
          <div><p className="eyebrow">{activeSettingsSection.group.toUpperCase()}</p><h3>{activeSettingsSection.label}</h3><p>{activeSettingsSection.description}. Keep the important controls close and the rest out of the way.</p></div>
          <span className="settings-location">Settings / {activeSettingsSection.label}</span>
        </header>
        {tab === "security" && securityError && <div className="settings-alert settings-error" role="alert">{securityError}</div>}
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
                  <p>Use an authenticator app after your password. Workspace administrators must verify it at every new sign-in.</p>
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
              <div className="security-actions"><button className="secondary-button" disabled title="Passkey support will be enabled after the WebAuthn credential service is added"><ShieldAlert size={15} /> Passkeys coming soon</button><button className="text-button" onClick={() => void revokeOtherSessions()} disabled={securityBusy}>Sign out other devices</button></div>
              <small className="field-help">Passkeys require a WebAuthn credential service and production relying-party configuration. TOTP authenticator apps are available now.</small>
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
                  <p>Preview a rule first, then apply it with a short undo window.</p>
                </div>
                <div className="rule-list-head-actions">
                  <button className="text-button" onClick={() => void exportRules()} title="Download rules as JSON"><Download size={13} /> Export</button>
                  <button className="text-button" onClick={() => ruleImportRef.current?.click()} title="Import rules from JSON"><Upload size={13} /> Import</button>
                  <input ref={ruleImportRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importRules(event)} />
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
                Each address can send through the configured delivery provider and receive through
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
        </div>
        </div>
      </section>
    </div>
  );
}

type JsonSettings = Record<string, unknown>;

function Workspace({
  mode,
  tasks,
  events,
  workItems,
  workSummary,
  onOpenMessage,
  onRefresh,
}: {
  mode: "calendar" | "tasks";
  tasks: Task[];
  events: CalendarEvent[];
  workItems: WorkItem[];
  workSummary: WorkSummary;
  onOpenMessage: (message: Message) => void;
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
                <Briefcase size={23} /> Work
              </>
            )}
          </h1>
        </div>
        <div className="workspace-stamp">
          {mode === "calendar"
            ? "Events from email can become appointments."
            : "Keep promises, follow-ups, and next actions in one queue."}
        </div>
      </div>
      {error && <div className="inline-error workspace-error">{error}</div>}
      {mode === "tasks" && (
        <div className="work-summary" aria-label="Work summary">
          <div className="work-summary-card"><span>Reply later</span><strong>{workSummary.reply_later}</strong></div>
          <div className="work-summary-card"><span>Waiting on</span><strong>{workSummary.waiting_on}</strong></div>
          <div className="work-summary-card"><span>I owe</span><strong>{workSummary.i_owe}</strong></div>
          <div className={`work-summary-card ${workSummary.overdue ? "overdue" : ""}`}><span>Overdue</span><strong>{workSummary.overdue}</strong></div>
        </div>
      )}
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
          ) : (
            <>
              <div className="work-queue-head"><div><p className="eyebrow">MESSAGE QUEUE</p><h3>Follow-ups</h3></div><span>{workItems.length} open</span></div>
              {workItems.length ? workItems.map((item) => (
                <article className={`work-item ${item.overdue ? "overdue" : ""}`} key={item.id}>
                  <button onClick={() => onOpenMessage(item)} className="work-item-main">
                    <span className="work-state-label">{workStateLabel(item.work_state)}</span>
                    <strong>{item.subject || "(no subject)"}</strong>
                    <small>{item.from_address} · {workDueLabel(item.follow_up_at)}</small>
                    {displayWorkNote(item.work_note) && <em>{displayWorkNote(item.work_note)}</em>}
                  </button>
                  <button className="icon-button compact-icon" onClick={() => onOpenMessage(item)} aria-label={`Open ${item.subject || "message"}`} title="Open message"><ArrowDown size={14} className="open-work-icon" /></button>
                </article>
              )) : <div className="list-empty compact-empty"><Briefcase size={25} /><p>No message follow-ups yet.</p><small>Use Reply later, Waiting on, or I owe from a message.</small></div>}
              <div className="work-queue-head task-queue-head"><div><p className="eyebrow">TASKS</p><h3>To Do</h3></div><span>{tasks.filter((task) => !task.completed).length} open</span></div>
              {tasks.length ? tasks.map((task) => (
                <label className={`task-card ${task.completed ? "completed" : ""}`} key={task.id}>
                  <input type="checkbox" checked={task.completed} onChange={() => void toggleTask(task)} />
                  <span><strong>{task.title}</strong><small>{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}</small></span>
                </label>
              )) : <div className="list-empty compact-empty"><ListTodo size={25} /><p>No tasks yet.</p></div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function MailboxApp({ session }: { session: Session }) {
  const { confirm, prompt } = useAppDialog();
  const imagePreferenceKey = `postveil.load_remote_images:${session.user.id}`;
  const [view, setView] = useState<"mail" | "calendar" | "tasks">("mail");
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
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    | "appearance"
    | "security"
    | "organize"
    | "contacts"
    | "spam"
    | "automation"
    | "mailboxes"
    | "integrations"
    | "administration"
  >("appearance");
  const [mobileNav, setMobileNav] = useState(false);
  const [loadRemoteImages, setLoadRemoteImages] = useState(() => storedBooleanPreference(imagePreferenceKey, false));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [showAllThreadMessages, setShowAllThreadMessages] = useState(false);
  const [threadOrder, setThreadOrder] = useState<"newest" | "oldest">("newest");
  const [showMessageDetails, setShowMessageDetails] = useState(false);
  const [trustLensOpen, setTrustLensOpen] = useState(false);
  const [trustLensBusy, setTrustLensBusy] = useState(false);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [moreSubmenu, setMoreSubmenu] = useState<"security" | "view" | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [messageReactions, setMessageReactions] = useState<Record<string, string>>({});
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
  const [ribbonTab, setRibbonTab] = useState<"home" | "view" | "file" | "help">("home");
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [whatsNewModalOpen, setWhatsNewModalOpen] = useState(false);
  const [readingPanePosition, setReadingPanePosition] = useState<"right" | "bottom" | "off">("right");
  const [folderPaneCollapsed, setFolderPaneCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth <= 1024);
  const [inboxUnreadCount, setInboxUnreadCount] = useState<number>(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [normalizedQuery, setNormalizedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resultTotal, setResultTotal] = useState<number | null>(null);
  const previousMessageIds = useRef<Set<string>>(new Set());
  const recordedSearchRef = useRef("");
  const mailListRequestRef = useRef(0);
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest(".mail-ribbon-dropdown-wrapper")) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);
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
  const updateSettings = async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch {
      // ignore
    }
  };
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
    setRibbonTab("home");
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
    setShowMoreActions(false);
    setMoreSubmenu(null);
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
  async function runBulkAction(nextAction = bulkAction) {
    const allResults = selectAllResults;
    const visibleSelection = allResults ? messages.map((message) => message.id) : [...selectedIds];
    if (!visibleSelection.length && !allResults) { setError("Select at least one message"); return; }
    const countLabel = allResults ? `${resultTotal ?? "all"} matching messages` : `${visibleSelection.length} message${visibleSelection.length === 1 ? "" : "s"}`;
    if (nextAction === "trash" && !(await confirm({
      title: "Move messages to Trash?",
      message: `Move ${countLabel} to Trash? You can restore them later.`,
      confirmLabel: "Move to Trash",
      danger: true,
    }))) return;
    setBulkBusy(true);
    setError("");
    setBulkNotice("");
    const action: JsonSettings = { type: nextAction };
    if (nextAction === "move") {
      if (bulkFolder.startsWith("custom:")) {
        action.folder = "custom";
        action.customFolderId = bulkFolder.slice(7);
      } else {
        action.folder = bulkFolder;
      }
    }
    if (nextAction === "label") {
      if (!bulkLabelId) { setError("Choose a label first"); setBulkBusy(false); return; }
      action.labelId = bulkLabelId;
    }
    if (nextAction === "priority") action.priority = Number(bulkPriority);
    if (nextAction === "reminder") {
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
      const movedOut = ["archive", "move", "trash", "spam", "restore", "snooze"].includes(nextAction);
      const selectedSet = new Set(payload.changedIds);
      setMessages((current) => movedOut ? current.filter((message) => !selectedSet.has(message.id)) : current.map((message) => {
        if (!selectedSet.has(message.id)) return message;
        if (nextAction === "mark_read" || nextAction === "mark_unread") return { ...message, is_read: nextAction === "mark_read" };
        if (nextAction === "star" || nextAction === "unstar") return { ...message, is_starred: nextAction === "star" };
        if (nextAction === "pin" || nextAction === "unpin") return { ...message, is_pinned: nextAction === "pin" };
        if (nextAction === "flag" || nextAction === "unflag") return { ...message, is_flagged: nextAction === "flag" };
        return message;
      }));
      clearListSelection();
      await loadMessages(folder, false);
      if (nextAction === "export" && payload.exported?.length) {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(new Blob([JSON.stringify(payload.exported, null, 2)], { type: "application/json" }));
        download.download = `postveil-export-${new Date().toISOString().slice(0, 10)}.json`;
        download.click();
        URL.revokeObjectURL(download.href);
      }
      if (payload.failures.length) setError(`${payload.changedIds.length} changed; ${payload.failures.length} failed. ${payload.failures[0].error}`);
      else setBulkNotice(`${payload.changedIds.length || (nextAction === "export" ? visibleSelection.length : 0)} message${payload.changedIds.length === 1 ? "" : "s"} updated${payload.truncated ? " (first 500 matching messages)" : ""}`);
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
    if (!searchFocused) return;
    const timer = window.setTimeout(() => {
      void apiFetch<SearchSuggestion[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
        .then(setSearchSuggestions)
        .catch(() => setSearchSuggestions([]));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, searchFocused]);
  useEffect(() => {
    if (folder === "inbox" && filter === "all" && !query.trim()) {
      setInboxUnreadCount(messages.filter((m) => !m.is_read).length);
    }
  }, [folder, filter, query, messages]);
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
    setShowMessageDetails(false);
    setThreadMessages([]);
    setTrustLensOpen(false);
    setTrustData(null);
    setShowMoreActions(false);
    setMoreSubmenu(null);
    try {
      const detail = await apiFetch<Message>(`/api/mail/${message.id}`);
      if (detailRequestRef.current !== requestId) return;
      setSelected(detail);
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
      const thread = await apiFetch<Message[]>(`/api/threads/${message.thread_id}`);
      if (detailRequestRef.current !== requestId) return;
      setThreadMessages(thread);
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
  function openInNewWindow(msg: Message) {
    const popup = window.open("", "postveil-email", "noopener,noreferrer,width=920,height=760");
    if (!popup) return;
    const bodyContent = msg.html_body || `<pre style="font-family:inherit;white-space:pre-wrap;">${(msg.text_body || msg.snippet || "No content").replace(/[&<>]/g, (c: string) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as Record<string, string>)[c] || c))}</pre>`;
    popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(msg.subject || "Email").replace(/[&<>"']/g, "")} · Postveil</title><style>body{margin:0;background:#f4f6f2;color:#17221f;font:15px/1.6 system-ui,-apple-system,sans-serif}.email{box-sizing:border-box;width:min(860px,100%);margin:0 auto;padding:40px 28px;background:#fff;min-height:100vh;overflow-wrap:anywhere}.email img{max-width:100%;height:auto}.email table{max-width:100%}a{color:#1f6b57}h1{font-size:20px;margin-top:0}</style></head><body><main class="email" aria-label="Email message"><h1>${(msg.subject || "(no subject)").replace(/[&<>"']/g, "")}</h1><div style="font-size:13px;color:#616161;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #edebe9;">From: ${msg.from_address}<br>Date: ${new Date(msg.received_at || msg.sent_at || msg.created_at).toLocaleString()}</div>${bodyContent}</main></body></html>`);
    popup.document.close();
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
    setMoreSubmenu(null);
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
  const orderedThreadMessages = useMemo(() => [...threadMessages].sort((left, right) => {
    const leftTime = Date.parse(left.received_at || left.sent_at || left.created_at || "") || 0;
    const rightTime = Date.parse(right.received_at || right.sent_at || right.created_at || "") || 0;
    return threadOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
  }), [threadMessages, threadOrder]);
  const hasMailSelection = selectedIds.size > 0 || selectAllResults;
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
  function handleRibbonTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, current: "home" | "view" | "file" | "help") {
    const tabs = ["home", "view", "file", "help"] as const;
    const index = tabs.indexOf(current);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    setRibbonTab(next);
    window.requestAnimationFrame(() => document.getElementById(`mail-ribbon-tab-${next}`)?.focus());
  }
  return (
    <div
      className={`outlook-viewport theme-${settings.theme || "light"} density-${settings.density || "comfortable"}`}
    >
      <header className="outlook-global-header" data-purpose="outlook-global-header">
        <div className="outlook-header-left">
          <button
            className="outlook-header-btn waffle-btn"
            title="App Launcher"
            onClick={() => setView(view === "mail" ? "calendar" : "mail")}
            aria-label="App Launcher"
          >
            <LayoutGrid size={18} />
          </button>
          <div className="outlook-header-brand">
            <BrandMark small />
            <span className="outlook-brand-name">Postveil</span>
          </div>
        </div>

        <div className="outlook-header-center">
          <div className="outlook-search-bar">
            <Search size={15} className="outlook-search-icon" />
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
              aria-label="Search"
            />
            {query ? (
              <button
                className="outlook-search-clear"
                onClick={() => {
                  setQuery("");
                  clearListSelection();
                }}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
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
          </div>
        </div>

        <div className="outlook-header-right">
          <button
            className="outlook-header-btn"
            onClick={() => void loadMessages()}
            title="Refresh messages"
            aria-label="Refresh messages"
          >
            <RefreshCcw size={16} />
          </button>
          <button
            className="outlook-header-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
          >
            <Settings2 size={16} />
          </button>
          <button
            className="outlook-header-btn"
            onClick={() => {
              setRibbonTab("help");
            }}
            title="Help & syntax guide"
            aria-label="Help"
          >
            <HelpCircle size={16} />
          </button>
          <div
            className="outlook-user-avatar"
            onClick={() => setSettingsOpen(true)}
            title={session.user.email || "Account profile"}
            role="button"
            tabIndex={0}
          >
            {(session.user.email || "J").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {/* OUTLOOK TOP RIBBON TOOLBAR */}
      <div className="mail-ribbon" aria-label="Mail ribbon">
        <div className="mail-ribbon-tabs" role="tablist" aria-label="Mail ribbon tabs">
          {(["file", "home", "view", "help"] as const).map((tabName) => (
            <button
              key={tabName}
              id={`mail-ribbon-tab-${tabName}`}
              className={`mail-ribbon-tab ${ribbonTab === tabName ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={ribbonTab === tabName}
              aria-controls={`mail-ribbon-panel-${tabName}`}
              tabIndex={ribbonTab === tabName ? 0 : -1}
              onClick={() => setRibbonTab(tabName)}
              onKeyDown={(event) => handleRibbonTabKeyDown(event, tabName)}
            >
              {tabName === "home" ? "Home" : tabName === "view" ? "View" : tabName === "file" ? "File" : "Help"}
            </button>
          ))}
          {hasMailSelection && (
            <span className="mail-ribbon-context-label">
              Selection tools · {selectAllResults ? `${resultTotal ?? "all"} matching` : `${selectedIds.size} selected`}
            </span>
          )}
        </div>

        {ribbonTab === "home" && (
          <div className="mail-ribbon-toolbar" id="mail-ribbon-panel-home" role="tabpanel" aria-labelledby="mail-ribbon-tab-home">
            {/* New Mail Split Button */}
            <div className="mail-ribbon-split-btn">
              <button
                className="mail-ribbon-command primary"
                onClick={() => openCompose()}
                title="New mail (c)"
              >
                <PenLine size={15} />
                <span>New mail</span>
              </button>
              <div className="mail-ribbon-dropdown-wrapper">
                <button
                  className="mail-ribbon-split-arrow"
                  onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "new-menu" ? null : "new-menu"); }}
                  title="New item options"
                  aria-label="New item options"
                >
                  <ChevronDown size={11} />
                </button>
                {activeDropdown === "new-menu" && (
                  <div className="mail-ribbon-dropdown-menu">
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); openCompose(); }}>
                      <Mail size={14} color="#1f6b57" />
                      <span>Email message</span>
                    </button>
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); setView("calendar"); }}>
                      <CalendarDays size={14} color="#1f6b57" />
                      <span>Calendar event</span>
                    </button>
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); setView("tasks"); }}>
                      <ListTodo size={14} color="#1f6b57" />
                      <span>To Do task</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mail-ribbon-separator" />

            {/* Delete & Triage Group */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("trash");
                else if (selected) void mutateMessage({ folder: "trash" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Delete message (# / Del)"
            >
              <Trash2 size={16} color="#ef4444" />
              <span>Delete</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("archive");
                else if (selected) void mutateMessage({ folder: "archive" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Archive message (e)"
            >
              <Archive size={16} color="#1f6b57" />
              <span>Archive</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("spam");
                else if (selected) void mutateMessage({ folder: "spam" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Report junk / phishing"
            >
              <ShieldAlert size={16} color="#f59e0b" />
              <span>Report</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (!selected && !hasMailSelection) return;
                const senderEmail = selected?.from_address;
                if (senderEmail) {
                  void runBulkAction("archive");
                  setBulkNotice(`Swept all recent emails from ${senderEmail}`);
                } else {
                  void runBulkAction("archive");
                }
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Sweep: Automatically clean up messages from this sender"
            >
              <Sparkles size={16} color="#1f6b57" />
              <span>Sweep</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Move & Categorize Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "move-menu" ? null : "move-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Move to folder"
              >
                <FolderInput size={16} color="#1f6b57" />
                <span>Move to</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "move-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  {(["inbox", "archive", "spam", "trash"] as SystemFolder[]).map((f) => (
                    <button
                      key={f}
                      className="mail-ribbon-menu-item"
                      onClick={() => {
                        setActiveDropdown(null);
                        if (hasMailSelection) {
                          setBulkAction("move");
                          setBulkFolder(f);
                          void runBulkAction();
                        } else if (selected) {
                          void mutateMessage({ folder: f });
                        }
                      }}
                    >
                      <Folder size={14} />
                      <span>{folderNames[f]}</span>
                    </button>
                  ))}
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="mail-ribbon-menu-item"
                      onClick={() => {
                        setActiveDropdown(null);
                        if (hasMailSelection) {
                          setBulkAction("move");
                          setBulkFolder(`custom:${f.id}`);
                          void runBulkAction();
                        }
                      }}
                    >
                      <FolderPlus size={14} />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "categorize-menu" ? null : "categorize-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Categorize message"
              >
                <Tag size={16} color="#1f6b57" />
                <span>Categorize</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "categorize-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  {labels.length > 0 ? (
                    labels.map((lbl) => (
                      <button
                        key={lbl.id}
                        className="mail-ribbon-menu-item"
                        onClick={() => {
                          setActiveDropdown(null);
                          if (hasMailSelection) {
                            setBulkAction("label");
                            setBulkLabelId(lbl.id);
                            void runBulkAction();
                          }
                        }}
                      >
                        <Tag size={13} color={lbl.color || "#1f6b57"} />
                        <span>{lbl.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="mail-ribbon-menu-empty">No categories yet (create in Settings)</span>
                  )}
                </div>
              )}
            </div>

            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "snooze-menu" ? null : "snooze-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Snooze email"
              >
                <Clock3 size={16} color="#6366f1" />
                <span>Snooze</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "snooze-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const later = new Date();
                      later.setHours(18, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: later.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Later today (6:00 PM)</span>
                  </button>
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      tomorrow.setHours(9, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: tomorrow.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Tomorrow morning (9:00 AM)</span>
                  </button>
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const nextWeek = new Date();
                      nextWeek.setDate(nextWeek.getDate() + 7);
                      nextWeek.setHours(9, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: nextWeek.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Next week (Monday 9:00 AM)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("mark_unread");
                else if (selected) void mutateMessage({ isRead: !selected.is_read });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title={selected?.is_read ? "Mark as unread (u)" : "Mark as read (u)"}
            >
              <MailOpen size={16} color="#1f6b57" />
              <span>{selected?.is_read ? "Unread" : "Read"}</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("flag");
                else if (selected) void mutateMessage({ isStarred: !selected.is_starred });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Flag or star message (s)"
            >
              <Flag size={16} color={selected?.is_starred ? "#ef4444" : "#6b7280"} />
              <span>{selected?.is_starred ? "Flagged" : "Flag"}</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (selected) void mutateMessage({ isPinned: !selected.is_pinned });
              }}
              disabled={!selected || bulkBusy}
              title="Pin message to top"
            >
              <Pin size={16} color={selected?.is_pinned ? "#1f6b57" : "#6b7280"} />
              <span>{selected?.is_pinned ? "Pinned" : "Pin"}</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Respond Group */}
            <button
              className="mail-ribbon-command"
              onClick={() => selectedReplySeed && openCompose(selectedReplySeed)}
              disabled={!selected}
              title="Reply to sender (r)"
            >
              <Reply size={16} color="#1f6b57" />
              <span>Reply</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => selectedReplyAllSeed && openCompose(selectedReplyAllSeed)}
              disabled={!selected}
              title="Reply to all recipients (a)"
            >
              <ReplyAll size={16} color="#1f6b57" />
              <span>Reply all</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (!selected) return;
                openCompose({
                  to: selected.to_addresses?.[0],
                  subject: selected.subject.startsWith("Fwd:") ? selected.subject : `Fwd: ${selected.subject}`,
                  text: `\n\n— Forwarded message —\nFrom: ${selected.from_name ? `${selected.from_name} <${selected.from_address}>` : selected.from_address}\nSubject: ${selected.subject}\n\n${selected.text_body || selected.snippet}`,
                });
              }}
              disabled={!selected}
              title="Forward message (f)"
            >
              <Forward size={16} color="#1f6b57" />
              <span>Forward</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Utilities */}
            <button
              className="mail-ribbon-command"
              onClick={() => void undoBulkAction()}
              disabled={!bulkUndo || bulkBusy}
              title={bulkUndo ? `Undo ${bulkUndo.label}` : "Nothing to undo"}
            >
              <Undo2 size={16} color="#6b7280" />
              <span>Undo</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => window.print()}
              title="Print message (Ctrl+P)"
            >
              <Printer size={16} color="#4b5563" />
              <span>Print</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => void loadMessages()}
              title="Sync mailbox"
            >
              <RefreshCcw size={16} color="#1f6b57" />
              <span>Sync</span>
            </button>
          </div>
        )}

        {ribbonTab === "view" && (
          <div className="mail-ribbon-toolbar mail-ribbon-view-panel" id="mail-ribbon-panel-view" role="tabpanel" aria-labelledby="mail-ribbon-tab-view">
            {/* View settings */}
            <button
              className="mail-ribbon-command"
              onClick={() => setSettingsOpen(true)}
              title="Open view settings"
            >
              <Settings2 size={16} color="#1f6b57" />
              <span>View settings</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                clearListSelection();
                setQuery("");
                setFilter("all");
                setSort("newest");
                setReadingPanePosition("right");
                setFolderPaneCollapsed(false);
                void updateSettings({ density: "comfortable" });
                void loadMessages();
              }}
              title="Reset view to default"
            >
              <RotateCcw size={16} color="#6b7280" />
              <span>Reset view</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Layout Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "reading-pane-menu" ? null : "reading-pane-menu"); }}
                title="Configure reading pane layout"
              >
                <Columns size={16} color="#1f6b57" />
                <span>Reading pane: {readingPanePosition === "right" ? "Right" : readingPanePosition === "bottom" ? "Bottom" : "Off"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "reading-pane-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "right" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("right"); setActiveDropdown(null); }}
                  >
                    <PanelRight size={14} />
                    <span>Show on the right</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "bottom" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("bottom"); setActiveDropdown(null); }}
                  >
                    <Columns size={14} />
                    <span>Show at the bottom</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "off" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("off"); setActiveDropdown(null); }}
                  >
                    <Eye size={14} />
                    <span>Hide (list only)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className={`mail-ribbon-command ${folderPaneCollapsed ? "is-active" : ""}`}
              onClick={() => setFolderPaneCollapsed(!folderPaneCollapsed)}
              title={folderPaneCollapsed ? "Expand folder pane" : "Collapse folder pane"}
            >
              <PanelLeft size={16} color="#1f6b57" />
              <span>Folder pane</span>
            </button>

            <button
              className={`mail-ribbon-command ${filter === "all" ? "" : "is-active"}`}
              onClick={() => setFilter(filter === "all" ? "unread" : "all")}
              title="Toggle Focused vs Unread mailbox view"
            >
              <Inbox size={16} color="#1f6b57" />
              <span>Focused inbox</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Density Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "density-menu" ? null : "density-menu"); }}
                title="Message list display density"
              >
                <LayoutGrid size={16} color="#1f6b57" />
                <span>Density: {settings.density || "comfortable"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "density-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "comfortable" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "comfortable" }); setActiveDropdown(null); }}
                  >
                    <span>Comfortable</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "compact" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "compact" }); setActiveDropdown(null); }}
                  >
                    <span>Compact</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "spacious" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "spacious" }); setActiveDropdown(null); }}
                  >
                    <span>Spacious</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "sort-menu" ? null : "sort-menu"); }}
                title="Sort messages"
              >
                <ArrowUpDown size={16} color="#1f6b57" />
                <span>{sort === "newest" ? "Newest on top" : "Oldest on top"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "sort-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button className="mail-ribbon-menu-item" onClick={() => { setSort("newest"); setActiveDropdown(null); }}>
                    <span>Newest on top</span>
                  </button>
                  <button className="mail-ribbon-menu-item" onClick={() => { setSort("oldest"); setActiveDropdown(null); }}>
                    <span>Oldest on top</span>
                  </button>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="mail-ribbon-group" aria-label="Filter messages">
              <span className="mail-ribbon-group-label">Show</span>
              {([
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
                { value: "starred", label: "Flagged" },
                { value: "attachments", label: "Files" },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`mail-ribbon-command mail-ribbon-filter ${filter === item.value ? "is-active" : ""}`}
                  onClick={() => { clearListSelection(); setFilter(item.value); }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mail-ribbon-separator" />

            {/* Dark mode */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                const nextTheme = settings.theme === "dark" ? "light" : "dark";
                void updateSettings({ theme: nextTheme });
              }}
              title="Toggle Light / Dark mode"
            >
              {settings.theme === "dark" ? <Sun size={16} color="#f59e0b" /> : <Moon size={16} color="#1f6b57" />}
              <span>{settings.theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>
        )}

        {ribbonTab === "file" && (
          <div className="mail-ribbon-toolbar mail-ribbon-file-panel" id="mail-ribbon-panel-file" role="tabpanel" aria-labelledby="mail-ribbon-tab-file">
            {/* Account info card */}
            <div className="mail-ribbon-account-card">
              <div className="mail-ribbon-account-avatar">
                {(session.user.email || "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="mail-ribbon-account-details">
                <strong>{session.user.email}</strong>
                <span>Postveil Sovereign Edge · AWS SES (ap-southeast-1)</span>
              </div>
            </div>

            <div className="mail-ribbon-separator" />

            {/* Account & Administration Commands */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("appearance");
                setSettingsOpen(true);
              }}
              title="Open mailbox settings"
            >
              <Settings2 size={16} color="#1f6b57" />
              <span>Account settings</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("mailboxes");
                setSettingsOpen(true);
              }}
              title="Manage custom domains and DNS"
            >
              <Globe2 size={16} color="#1f6b57" />
              <span>Custom domains</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("automation");
                setSettingsOpen(true);
              }}
              title="Inbox rules and automated filters"
            >
              <SlidersHorizontal size={16} color="#1f6b57" />
              <span>Rules & alerts</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="Inspect storage & edge metrics"
            >
              <HardDrive size={16} color="#1f6b57" />
              <span>Storage & quota</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => void runBulkAction("export")}
              disabled={!hasMailSelection || bulkBusy}
              title="Export selected messages as JSON"
            >
              <Download size={16} color="#1f6b57" />
              <span>Export mail</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => window.print()}
              title="Print view or messages"
            >
              <Printer size={16} color="#4b5563" />
              <span>Print</span>
            </button>
            <button
              className="mail-ribbon-command danger"
              onClick={() => void requireSupabase().auth.signOut()}
              title="Sign out of Postveil"
            >
              <LogOut size={16} color="#ef4444" />
              <span>Sign out</span>
            </button>
          </div>
        )}

        {ribbonTab === "help" && (
          <div className="mail-ribbon-toolbar mail-ribbon-help-panel" id="mail-ribbon-panel-help" role="tabpanel" aria-labelledby="mail-ribbon-tab-help">
            {/* Help & Learning */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setRibbonTab("home");
                setSearchFocused(true);
                setSearchHelpOpen(true);
              }}
              title="Open search syntax and help guide"
            >
              <HelpCircle size={16} color="#1f6b57" />
              <span>Help guide</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setShortcutsModalOpen(true)}
              title="Keyboard shortcuts cheat sheet"
            >
              <Keyboard size={16} color="#1f6b57" />
              <span>Keyboard shortcuts</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Diagnostics & Health */}
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="View live connection diagnostics"
            >
              <Activity size={16} color="#1f6b57" />
              <span>System diagnostics</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if ("serviceWorker" in navigator) {
                  void navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (const r of regs) void r.update();
                  });
                }
                window.location.reload();
              }}
              title="Check for updates and reload latest assets"
            >
              <RefreshCcw size={16} color="#1f6b57" />
              <span>Check for updates</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Product & Feedback */}
            <button
              className="mail-ribbon-command"
              onClick={() => setWhatsNewModalOpen(true)}
              title="See what's new in Postveil"
            >
              <Sparkles size={16} color="#1f6b57" />
              <span>What's new</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                window.open("https://github.com/jamesfontanilla/Postveil/issues", "_blank");
              }}
              title="Submit feedback or report an issue"
            >
              <Send size={16} color="#1f6b57" />
              <span>Feedback</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="About Postveil sovereign mail client"
            >
              <Info size={16} color="#1f6b57" />
              <span>About Postveil</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. MAIN WORKSPACE WITH APP RAIL + APP SHELL */}
      <div className="outlook-main-container">
        {/* NARROW 48px APP RAIL */}
        <nav className="outlook-app-rail" aria-label="App Navigation" data-purpose="app-rail">
          <button
            className={`outlook-rail-btn ${view === "mail" ? "active" : ""}`}
            onClick={() => setView("mail")}
            title="Mail"
          >
            <Mail size={18} />
          </button>
          <button
            className={`outlook-rail-btn ${view === "calendar" ? "active" : ""}`}
            onClick={() => setView("calendar")}
            title="Calendar"
          >
            <CalendarDays size={18} />
          </button>
          <button
            className={`outlook-rail-btn ${view === "tasks" ? "active" : ""}`}
            onClick={() => setView("tasks")}
            title="To Do"
          >
            <ListTodo size={18} />
            {workSummary.total > 0 && <span className="outlook-rail-badge">{workSummary.total}</span>}
          </button>
          <button
            className="outlook-rail-btn"
            onClick={() => {
              setView("mail");
              setFilter("attachments");
            }}
            title="P-Drive / Files"
          >
            <HardDrive size={18} />
          </button>

          <div className="outlook-rail-divider" />

          <button
            className="outlook-rail-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings2 size={18} />
          </button>
        </nav>

        {/* Existing app-shell begins here */}
        <main
          className={`app-shell${selected ? " mobile-message-open" : ""}`}
        >
      <header className="mobile-topbar">
        <button
          className="icon-button"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Open navigation"
          aria-expanded={mobileNav}
          aria-controls="mailbox-navigation"
        >
          <Menu size={20} />
        </button>
        <div className="mini-brand">
          <span>P</span> Postveil
        </div>
        <div className="mobile-topbar-actions">
          <button
            className={`icon-button ${mobileSearchOpen ? "is-active" : ""}`}
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            aria-label="Search mail"
            title="Search mail"
          >
            <Search size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => void loadMessages()}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCcw size={17} />
          </button>
          <button
            className="icon-button mobile-compose-btn"
            onClick={() => openCompose()}
            aria-label="New message"
            title="New message"
          >
            <PenLine size={18} />
          </button>
        </div>
      </header>
      {mobileSearchOpen && (
        <div className="mobile-search-strip">
          <Search size={15} color="#6b7280" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail..."
            aria-label="Search mail query"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className="icon-button mobile-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="icon-button mobile-search-close"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="Close search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {mobileNav && <button className="mobile-nav-backdrop" type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <aside id="mailbox-navigation" className={`sidebar ${mobileNav ? "mobile-visible" : ""} ${folderPaneCollapsed && !mobileNav ? "folder-pane-collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <BrandMark small />
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
            {inboxUnreadCount > 0 && <em>{inboxUnreadCount}</em>}
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
            className="folder-link"
            onClick={() => {
              setSettingsOpen(true);
              setMobileNav(false);
            }}
          >
            <Settings size={17} />
            <span>Settings</span>
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
        <div className={`mail-workspace ${selected ? "is-reading-message" : ""}`}>
          <div className="mail-columns">
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
            <div className="message-list-toolbar" aria-label="Message list filters">
              <div className="search-filter-row" aria-label="Quick search filters">
                {[{ value: "all", label: "All mail" }, { value: "unread", label: "Unread" }, { value: "starred", label: "Starred" }, { value: "attachments", label: "Attachments" }].map((item) => (
                  <button key={item.value} type="button" className={`search-chip ${filter === item.value ? "active" : ""}`} onClick={() => { clearListSelection(); setFilter(item.value); }} aria-pressed={filter === item.value}>{item.label}</button>
                ))}
                {query.trim() && normalizedQuery && <span className="search-status-copy">Query: {query.trim()} ({resultTotal ?? 0})</span>}
              </div>
              <div className="message-list-sort-actions">
                <select
                  value={sort}
                  onChange={(event) => {
                    clearListSelection();
                    setSort(event.target.value);
                  }}
                  aria-label="Sort messages"
                  className="message-list-sort-select"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <button className="icon-button compact-icon" onClick={() => void downloadSearchResults("csv")} aria-label="Export search results" title="Export CSV"><Download size={15} /></button>
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
          <section
            className={`reading-pane ${readingPanePosition === "bottom" ? "reading-pane-bottom" : readingPanePosition === "off" ? "reading-pane-hidden" : ""}`}
            tabIndex={0}
            aria-label="Reading pane"
          >
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
                    <h2>{selected.subject || "(no subject)"}</h2>
                    <div className="detail-meta">
                      {selected.spam_score !== undefined && selected.spam_score >= 0.35 && (
                        <span>Spam risk {Math.round(selected.spam_score * 100)}%</span>
                      )}
                      {selected.is_important && <span className="detail-status-accent">Important</span>}
                      {selected.is_muted && <span>Muted</span>}
                      {selected.legal_hold && <span className="detail-status-accent">Legal hold</span>}
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
                  </div>
                  <div className="outlook-subject-actions">
                    <button
                      className="icon-button"
                      title={selected.is_pinned ? "Unpin message" : "Pin message"}
                      onClick={() => void mutateMessage({ isPinned: !selected.is_pinned })}
                      aria-label={selected.is_pinned ? "Unpin message" : "Pin message"}
                    >
                      <Pin size={16} fill={selected.is_pinned ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="icon-button"
                      title="Print message"
                      onClick={() => window.print()}
                      aria-label="Print message"
                    >
                      <Printer size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Open in new window"
                      onClick={() => openInNewWindow(selected)}
                      aria-label="Open in new window"
                    >
                      <ExternalLink size={16} />
                    </button>
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

                <div className="outlook-banners-group">
                  {selected.direction === "inbound" && selected.from_address && !mailboxes.some((mb) => selected.from_address.toLowerCase().endsWith(mb.address.toLowerCase().split("@")[1] || "")) && (
                    <div className="outlook-banner outlook-banner-external">
                      <div className="outlook-banner-content">
                        <AlertTriangle size={15} color="#f7630c" />
                        <span><strong>CAUTION:</strong> This email originated from outside your organization. Do not click links or open attachments unless you recognize the sender.</span>
                      </div>
                    </div>
                  )}
                  {selected.unsubscribe_url && /^(https?:\/\/|mailto:)/i.test(selected.unsubscribe_url) && (
                    <div className="outlook-banner outlook-banner-privacy">
                      <div className="outlook-banner-content">
                        <span>Getting too much email? You can unsubscribe from this sender.</span>
                      </div>
                      <a className="outlook-banner-btn" href={selected.unsubscribe_url} target="_blank" rel="noreferrer noopener">
                        Unsubscribe
                      </a>
                    </div>
                  )}
                </div>

                <div className="sender-line">
                  {detailIdentity && <SenderAvatar name={detailIdentity.name} email={detailIdentity.email} avatarUrl={detailIdentity.avatarUrl} large />}
                  <div className="sender-copy">
                    <div className="sender-title-row">
                      <strong>{detailIdentity?.name || selected.from_address}</strong>
                      <button
                        type="button"
                        className="sender-trust-badge"
                        onClick={() => void toggleTrustLens()}
                        title="Trust & Privacy: Inspect sender verification (SPF, DKIM, DMARC) and tracker protection"
                        aria-label="Inspect Trust and Privacy details"
                      >
                        <ShieldCheck size={13} className="trust-badge-icon" />
                        <span>Trust &amp; Privacy</span>
                      </button>
                    </div>
                    <div className="recipient-row">
                      <span>To: {selected.to_addresses?.join(", ") || "you"}</span>
                      <button
                        className="details-chevron-btn"
                        onClick={() => setShowMessageDetails((current) => !current)}
                        title={showMessageDetails ? "Hide full message details" : "View full message details"}
                        aria-expanded={showMessageDetails}
                      >
                        <ChevronDown size={13} className={showMessageDetails ? "rotated" : ""} />
                      </button>
                    </div>
                    {showMessageDetails && (
                      <dl className="sender-details">
                        <div><dt>From</dt><dd>{detailIdentity?.email || selected.from_address || "Not available"}</dd></div>
                        <div><dt>To</dt><dd>{selected.to_addresses?.join(", ") || "Not available"}</dd></div>
                        {selected.cc_addresses && selected.cc_addresses.length > 0 && <div><dt>CC</dt><dd>{selected.cc_addresses.join(", ")}</dd></div>}
                        {selected.bcc_addresses && selected.bcc_addresses.length > 0 && <div><dt>BCC</dt><dd>{selected.bcc_addresses.join(", ")}</dd></div>}
                        {selected.reply_to && <div><dt>Reply-To</dt><dd>{selected.reply_to}</dd></div>}
                        <div><dt>Date</dt><dd>{new Date(selected.received_at || selected.sent_at || selected.created_at).toLocaleString()}</dd></div>
                        <div><dt>Message ID</dt><dd>{selected.message_id_header || "Not available"}</dd></div>
                      </dl>
                    )}
                  </div>
                  <time className="sender-time" dateTime={selected.received_at || selected.sent_at || selected.created_at}>
                    {formatDate(selected.received_at || selected.sent_at || selected.created_at)}
                  </time>
                  <div className="message-header-actions" aria-label="Quick message actions" style={{ position: "relative" }}>
                    <button
                      className="message-header-action"
                      onClick={() => setShowReactions((prev) => !prev)}
                      aria-label="React"
                      title="React to message"
                    >
                      <Smile size={16} />
                    </button>
                    {showReactions && (
                      <div className="outlook-reaction-flyout">
                        {["👍", "❤️", "👏", "😂", "😮", "🎉"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setMessageReactions((prev) => ({ ...prev, [selected.id]: emoji }));
                              setShowReactions(false);
                            }}
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="message-header-action" onClick={() => openCompose(selectedReplySeed)} aria-label="Reply" title="Reply">
                      <Reply size={16} />
                    </button>
                    <button className="message-header-action" onClick={() => openCompose(selectedReplyAllSeed)} aria-label="Reply all" title="Reply all">
                      <Users size={16} />
                    </button>
                    <button className="message-header-action" onClick={() => openCompose(selectedReplySeed ? { ...selectedReplySeed, subject: selectedReplySeed.subject.startsWith("Fwd:") ? selectedReplySeed.subject : `Fwd: ${selectedReplySeed.subject}`, to: selected.from_address, cc: "" } : undefined)} aria-label="Forward" title="Forward">
                      <Forward size={16} />
                    </button>
                    <button
                      className="message-header-action"
                      onClick={() => {
                        setShowMoreActions((current) => !current);
                        setMoreSubmenu(null);
                      }}
                      aria-expanded={showMoreActions}
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {showMoreActions && (
                      <>
                        <div
                          className="fluent-menu-backdrop"
                          onClick={() => {
                            setShowMoreActions(false);
                            setMoreSubmenu(null);
                          }}
                        />
                        <div className="fluent-menu" role="menu">
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isRead: !selected.is_read }); }}
                          >
                            <Eye size={15} /> <span>{selected.is_read ? "Mark unread" : "Mark as read"}</span>
                          </button>
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isFlagged: !selected.is_flagged }); }}
                          >
                            <Flag size={15} fill={selected.is_flagged ? "currentColor" : "none"} /> <span>{selected.is_flagged ? "Unflag" : "Flag"}</span>
                          </button>
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isPinned: !selected.is_pinned }); }}
                          >
                            <Pin size={15} fill={selected.is_pinned ? "currentColor" : "none"} /> <span>{selected.is_pinned ? "Unpin" : "Pin"}</span>
                          </button>
                          {selected.folder !== "trash" && (
                            <>
                              <button
                                role="menuitem"
                                className="fluent-menu-item"
                                onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ folder: "archive" }); }}
                              >
                                <Archive size={15} /> <span>Archive</span>
                              </button>
                              <button
                                role="menuitem"
                                className="fluent-menu-item danger"
                                onClick={() => {
                                  setShowMoreActions(false);
                                  setMoreSubmenu(null);
                                  void (async () => {
                                    if (await confirm({ title: "Move message to Trash?", message: "You can restore this message later.", confirmLabel: "Move to Trash", danger: true })) {
                                      void mutateMessage({ folder: "trash" });
                                    }
                                  })();
                                }}
                              >
                                <Trash2 size={15} /> <span>Delete</span>
                              </button>
                            </>
                          )}
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); window.print(); }}
                          >
                            <Printer size={15} /> <span>Print</span>
                          </button>

                          <div className="fluent-menu-divider" />

                          {/* Security options flyout submenu */}
                          <div
                            className="fluent-submenu-wrap"
                            onMouseEnter={() => setMoreSubmenu("security")}
                            onMouseLeave={() => setMoreSubmenu((curr) => (curr === "security" ? null : curr))}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={`fluent-menu-item fluent-submenu-trigger${moreSubmenu === "security" ? " active" : ""}`}
                              onClick={() => setMoreSubmenu((curr) => (curr === "security" ? null : "security"))}
                              aria-expanded={moreSubmenu === "security"}
                            >
                              <span className="fluent-menu-item-content">
                                <ShieldAlert size={15} /> <span>Security options</span>
                              </span>
                              <ChevronRight size={14} className="chevron-right" />
                            </button>
                            {moreSubmenu === "security" && (
                              <div className="fluent-submenu" role="menu">
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void blockSelectedSender("address"); }}
                                >
                                  <ShieldAlert size={15} /> <span>Block sender</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void blockSelectedSender("domain"); }}
                                >
                                  <ShieldAlert size={15} /> <span>Block domain</span>
                                </button>
                                <div className="fluent-menu-divider" />
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void submitSpamFeedback(selected.folder === "spam" ? "not_spam" : "spam"); }}
                                >
                                  <ShieldAlert size={15} /> <span>{selected.folder === "spam" ? "Not junk" : "Report junk"}</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void reportSelectedMessage("phishing"); }}
                                >
                                  <AlertTriangle size={15} /> <span>Report phishing</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* View flyout submenu */}
                          <div
                            className="fluent-submenu-wrap"
                            onMouseEnter={() => setMoreSubmenu("view")}
                            onMouseLeave={() => setMoreSubmenu((curr) => (curr === "view" ? null : curr))}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={`fluent-menu-item fluent-submenu-trigger${moreSubmenu === "view" ? " active" : ""}`}
                              onClick={() => setMoreSubmenu((curr) => (curr === "view" ? null : "view"))}
                              aria-expanded={moreSubmenu === "view"}
                            >
                              <span className="fluent-menu-item-content">
                                <FileText size={15} /> <span>View</span>
                              </span>
                              <ChevronRight size={14} className="chevron-right" />
                            </button>
                            {moreSubmenu === "view" && (
                              <div className="fluent-submenu" role="menu">
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void openRawSource(); }}
                                >
                                  <Download size={15} /> <span>View raw source</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); openInNewWindow(selected); }}
                                >
                                  <ExternalLink size={15} /> <span>Open in new window</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="fluent-menu-divider" />

                          {/* Conversation actions */}
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => {
                              setShowMoreActions(false);
                              setMoreSubmenu(null);
                              void mutateThread({ isIgnored: !selected.is_ignored, isMuted: !selected.is_muted });
                            }}
                          >
                            <Bell size={15} /> <span>{selected.is_ignored ? "Stop ignoring conversation" : "Ignore conversation"}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {messageReactions[selected.id] && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f3f2f1", border: "1px solid #edebe9", borderRadius: 12, padding: "2px 8px", fontSize: 13, marginTop: 4, alignSelf: "flex-start" }}>
                    <span>{messageReactions[selected.id]}</span>
                    <span style={{ fontSize: 11, color: "#616161" }}>1</span>
                  </div>
                )}

                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="outlook-attachment-well">
                    <div className="outlook-attachment-head">
                      <span>Attachments ({selected.attachments.length})</span>
                      {selected.attachments.length > 1 && (
                        <button className="outlook-download-all-btn" onClick={() => void downloadAllAttachments(selected.id)}>
                          <Download size={13} /> Download all
                        </button>
                      )}
                    </div>
                    <div className="outlook-attachment-grid">
                      {selected.attachments.map((attachment) => {
                        const ext = attachment.filename.split(".").pop()?.toUpperCase() || "FILE";
                        const badgeColor = ext === "PDF" ? "#d83b01" : ["DOC", "DOCX"].includes(ext) ? "#0078d4" : ["XLS", "XLSX", "CSV"].includes(ext) ? "#107c41" : ["PNG", "JPG", "JPEG", "GIF"].includes(ext) ? "#5c2d91" : "#605e5c";
                        return (
                          <div className="outlook-attachment-card" key={attachment.id}>
                            <div className="outlook-file-badge" style={{ background: badgeColor }}>
                              {ext.slice(0, 4)}
                            </div>
                            <div className="outlook-attachment-meta">
                              <strong title={attachment.filename}>{attachment.filename}</strong>
                              <small>{formatBytes(attachment.byte_size)}</small>
                            </div>
                            <div className="outlook-card-actions">
                              {attachment.preview_state === "ready" && (
                                <button title="Preview attachment" onClick={() => void previewAttachment(attachment.id)}>
                                  <Eye size={14} />
                                </button>
                              )}
                              <button title="Download attachment" onClick={() => void openAttachment(attachment.id)}>
                                <Download size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

                {threadMessages.length > 1 && (
                  <div className="conversation-section">
                    <div className="conversation-head">
                      <span>{threadMessages.length} messages in this conversation</span>
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
                      {(showAllThreadMessages ? orderedThreadMessages : [selected]).map((threadMessage) => (
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

                <div className="outlook-quick-reply-dock">
                  {selected.direction === "outbound" && ["queued", "scheduled"].includes(selected.status) && !selected.cancelled_at ? (
                    <button className="secondary-button danger-button" onClick={() => void cancelSelectedSend()}>
                      <Undo2 size={15} /> Cancel send
                    </button>
                  ) : selected.folder === "trash" ? (
                    <div className="outlook-quick-reply-buttons">
                      <button
                        className="outlook-quick-reply-btn primary"
                        onClick={() => void restoreSelected()}
                        disabled={trashBusy}
                      >
                        <Undo2 size={15} /> Restore
                      </button>
                      <button
                        className="outlook-quick-reply-btn"
                        onClick={() => void permanentlyDeleteSelected()}
                        disabled={trashBusy}
                      >
                        <Trash2 size={15} /> Delete forever
                      </button>
                    </div>
                  ) : (
                    <div className="outlook-quick-reply-buttons">
                      <button className="outlook-quick-reply-btn primary" onClick={() => openCompose(selectedReplySeed)}>
                        <Reply size={15} /> Reply
                      </button>
                      <button className="outlook-quick-reply-btn" onClick={() => openCompose(selectedReplyAllSeed)}>
                        <Users size={15} /> Reply all
                      </button>
                      <button className="outlook-quick-reply-btn" onClick={() => openCompose(selectedReplySeed ? { ...selectedReplySeed, subject: selectedReplySeed.subject.startsWith("Fwd:") ? selectedReplySeed.subject : `Fwd: ${selectedReplySeed.subject}`, to: selected.from_address, cc: "" } : undefined)}>
                        <Forward size={15} /> Forward
                      </button>
                    </div>
                  )}
                </div>

                {trustLensOpen && (
                  <div className="outlook-modal-overlay" onClick={() => setTrustLensOpen(false)} role="dialog" aria-modal="true" aria-labelledby="trust-lens-modal-title">
                    <div className="outlook-modal-box" onClick={(e) => e.stopPropagation()}>
                      <div className="outlook-modal-header">
                        <h3 id="trust-lens-modal-title"><ShieldAlert size={18} color="#1f6b57" /> Trust Lens · Sender Authentication & Evidence</h3>
                        <button className="icon-button" onClick={() => setTrustLensOpen(false)} aria-label="Close Trust Lens"><X size={18} /></button>
                      </div>
                      {trustData ? (() => {
                        const auth = trustData.auth_results || {};
                        const evidence = trustData.trust_evidence || {};
                        const status = (key: "spf" | "dkim" | "dmarc" | "arc" | "tls") => String(trustData[`auth_${key}` as keyof TrustData] || auth[key] || "missing");
                        const statusClass = (value: string) => value === "pass" ? "trust-status-pass" : value === "missing" || value === "none" ? "trust-status-missing" : "trust-status-fail";
                        const hosts = Array.isArray(evidence.link_hosts) ? evidence.link_hosts as Array<{ host?: string; count?: number }> : [];
                        const history = trustData.screening_history || [];
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
                          </div>
                          <div className="trust-lens-section"><strong>Link hosts · {trustData.link_count || 0} links</strong>{hosts.length ? <div className="trust-host-list">{hosts.map((item) => <span className="trust-host" key={item.host}>{item.host}{item.count && item.count > 1 ? ` · ${item.count}` : ""}</span>)}</div> : <p className="trust-lens-note">No web links detected.</p>}</div>
                          {history.length > 0 && <div className="trust-lens-section"><strong>Screening history</strong><p className="trust-lens-note">{history.slice(0, 3).map((item) => `${item.decision} · ${new Date(item.created_at).toLocaleString()}`).join("  |  ")}</p></div>}
                        </div>;
                      })() : (
                        <div className="trust-lens-body"><p className="trust-lens-note">{trustLensBusy ? "Loading sender evidence…" : "No evidence available."}</p></div>
                      )}
                    </div>
                  </div>
                )}

              </article>
            )}
          </section>
          </div>
        </div>
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
          initialTab={settingsInitialTab}
          onClose={() => setSettingsOpen(false)}
          onOpenMessage={(message) => void openMessage(message)}
          loadRemoteImages={loadRemoteImages}
          onLoadRemoteImagesChange={updateRemoteImagePreference}
          onChanged={() => {
            void loadMeta();
          }}
        />
      )}

      {shortcutsModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={() => setShortcutsModalOpen(false)}>
          <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mail-ribbon-modal-header">
              <h3 id="shortcuts-title"><Keyboard size={18} /> Keyboard shortcuts</h3>
              <button className="icon-button" type="button" onClick={() => setShortcutsModalOpen(false)} aria-label="Close dialog"><X size={16} /></button>
            </div>
            <div className="mail-ribbon-modal-body">
              <div className="shortcuts-grid">
                <div className="shortcut-group">
                  <h4>Actions</h4>
                  <div className="shortcut-row"><kbd>C</kbd><span>Compose new email</span></div>
                  <div className="shortcut-row"><kbd>E</kbd><span>Archive selected message</span></div>
                  <div className="shortcut-row"><kbd>#</kbd> / <kbd>Del</kbd><span>Delete message to trash</span></div>
                  <div className="shortcut-row"><kbd>U</kbd><span>Mark as read / unread</span></div>
                  <div className="shortcut-row"><kbd>S</kbd><span>Star / Flag message</span></div>
                  <div className="shortcut-row"><kbd>R</kbd><span>Reply</span></div>
                  <div className="shortcut-row"><kbd>A</kbd><span>Reply All</span></div>
                  <div className="shortcut-row"><kbd>F</kbd><span>Forward message</span></div>
                </div>
                <div className="shortcut-group">
                  <h4>Navigation</h4>
                  <div className="shortcut-row"><kbd>/</kbd><span>Focus search bar</span></div>
                  <div className="shortcut-row"><kbd>J</kbd> / <kbd>↓</kbd><span>Next message in list</span></div>
                  <div className="shortcut-row"><kbd>K</kbd> / <kbd>↑</kbd><span>Previous message</span></div>
                  <div className="shortcut-row"><kbd>Enter</kbd><span>Open message detail</span></div>
                  <div className="shortcut-row"><kbd>G</kbd> then <kbd>I</kbd><span>Go to Inbox</span></div>
                  <div className="shortcut-row"><kbd>G</kbd> then <kbd>S</kbd><span>Go to Sent</span></div>
                  <div className="shortcut-row"><kbd>Esc</kbd><span>Close dialog or pane</span></div>
                </div>
              </div>
            </div>
            <div className="mail-ribbon-modal-footer">
              <button className="primary-button" type="button" onClick={() => setShortcutsModalOpen(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {diagnosticsModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="diag-title" onClick={() => setDiagnosticsModalOpen(false)}>
          <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mail-ribbon-modal-header">
              <h3 id="diag-title"><Activity size={18} /> System Diagnostics & Health</h3>
              <button className="icon-button" type="button" onClick={() => setDiagnosticsModalOpen(false)} aria-label="Close dialog"><X size={16} /></button>
            </div>
            <div className="mail-ribbon-modal-body">
              <div className="diagnostics-list">
                <div className="diag-item">
                  <div className="diag-label">Client Version</div>
                  <div className="diag-val">Postveil v0.1.0 Sovereign Edition</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">Active Session</div>
                  <div className="diag-val">{session.user.email}</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">Edge Inbound Gateway</div>
                  <div className="diag-val diag-status-ok">● AWS SES (ap-southeast-1) via Cloudflare Worker</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">SES Inbound Receipt Rule</div>
                  <div className="diag-val"><code>postveil-inbound-rule</code> (Universal Inbound)</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">Database Subsystem</div>
                  <div className="diag-val diag-status-ok">● Cloudflare D1 (postveil-prod, sub-4ms read latency)</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">Security & Screening</div>
                  <div className="diag-val">SPF / DKIM / DMARC Strict · Zero Security Bans</div>
                </div>
                <div className="diag-item">
                  <div className="diag-label">Storage Lake</div>
                  <div className="diag-val">S3 Mailbox Object Lake (Multi-tenant partition)</div>
                </div>
              </div>
            </div>
            <div className="mail-ribbon-modal-footer">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if ("caches" in window) {
                    void caches.keys().then((names) => {
                      for (const name of names) void caches.delete(name);
                    });
                  }
                  window.location.reload();
                }}
              >
                Clear Cache & Reload
              </button>
              <button className="primary-button" type="button" onClick={() => setDiagnosticsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {whatsNewModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onClick={() => setWhatsNewModalOpen(false)}>
          <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mail-ribbon-modal-header">
              <h3 id="whats-new-title"><Sparkles size={18} /> What's New in Postveil</h3>
              <button className="icon-button" type="button" onClick={() => setWhatsNewModalOpen(false)} aria-label="Close dialog"><X size={16} /></button>
            </div>
            <div className="mail-ribbon-modal-body">
              <div className="whats-new-items">
                <div className="whats-new-feature">
                  <h4>✨ Microsoft Outlook Simplified Ribbon Toolbar</h4>
                  <p>Authentic, responsive Simplified Ribbon navigation featuring <strong>Home</strong>, <strong>View</strong>, <strong>File</strong>, and <strong>Help</strong> tabs with quick actions, segmented dropdowns, folder routing, density toggles, and reading pane controls.</p>
                </div>
                <div className="whats-new-feature">
                  <h4>🌲 Postveil Signature Green & Schibsted Grotesk</h4>
                  <p>Restored Postveil's iconic brand identity with emerald green (<code>#1f6b57</code>) styling, crisp typography, and uncluttered desktop focus.</p>
                </div>
                <div className="whats-new-feature">
                  <h4>🌐 Universal Inbound Architecture</h4>
                  <p>Zero-configuration universal AWS SES receipt rule (<code>postveil-inbound-rule</code>) routing email for all custom user domains directly to Cloudflare edge workers.</p>
                </div>
                <div className="whats-new-feature">
                  <h4>⚡ Sub-4ms Edge Performance</h4>
                  <p>Ultra-lean D1 SQL indexing, optimized PWA service worker caching headers, and lightning-fast full-text search.</p>
                </div>
              </div>
            </div>
            <div className="mail-ribbon-modal-footer">
              <button className="primary-button" type="button" onClick={() => setWhatsNewModalOpen(false)}>Explore Ribbon</button>
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [showPublicHome, setShowPublicHome] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [emailVerificationNotice, setEmailVerificationNotice] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    const initialize = async () => {
      const currentUrl = new URL(window.location.href);
      const oauthAttempt = currentUrl.searchParams.has("oauth_code") || currentUrl.searchParams.has("oauth_error");
      if (oauthAttempt) {
        // OAuth callbacks must never fall through to the marketing page. Keep
        // the user in the sign-in surface while the one-time handoff resolves.
        setAuthMode("signin");
        setShowPublicHome(false);
      }
      const verificationToken = currentUrl.searchParams.get("verify_email");
      if (verificationToken) {
        try {
          const result = await publicApiFetch<{ message?: string }>(`/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`);
          setEmailVerificationNotice(result.message || "Email address verified. You can now sign in.");
        } catch (verificationError) {
          setEmailVerificationNotice(verificationError instanceof Error ? verificationError.message : "This verification link is invalid or expired");
        }
        currentUrl.searchParams.delete("verify_email");
        window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        setAuthMode("signin");
        setShowPublicHome(false);
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) setShowPublicHome(false);
      if (oauthAttempt && (sessionError || !data.session)) {
        setAuthMode("signin");
        setEmailVerificationNotice("Google sign-in could not be completed. Please try again.");
        setShowPublicHome(false);
      }
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = currentUrl.searchParams.get("recovery");
      setRecoveryToken(token);
      setRecovering(Boolean(token) || hashParams.get("type") === "recovery");
      setReady(true);
    };
    void initialize();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        if (event === "SIGNED_IN") setShowPublicHome(false);
        if (event === "SIGNED_OUT") {
          setRecovering(false);
          setMfaRequired(false);
          setMfaSetupRequired(false);
          setShowPublicHome(true);
        }
        setSession(nextSession);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || recovering || !supabase) {
      setMfaRequired(false);
      setMfaSetupRequired(false);
      return;
    }
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (active && !error) {
        setMfaRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
        setMfaSetupRequired(data.setupRequired === true);
      }
    });
    return () => { active = false; };
  }, [session, recovering]);
  useEffect(() => {
    if (!session) {
      setOnboardingChecked(false);
      setOnboardingRequired(false);
      return;
    }
    let active = true;
    setOnboardingChecked(false);
    void Promise.all([
      apiFetch<JsonRecord>("/api/settings"),
      apiFetch<Mailbox[]>("/api/mailboxes"),
    ]).then(([settings, mailboxes]) => {
      if (!active) return;
      const state = settings.onboarding_state && typeof settings.onboarding_state === "object" ? settings.onboarding_state as OnboardingState : null;
      // A completed flag alone is not enough: an account without a mailbox
      // must always return to the domain onboarding wizard. This also repairs
      // sessions created before the first mailbox is provisioned.
      setOnboardingRequired(state?.completed !== true || mailboxes.length === 0);
    }).catch(() => {
      // Fail closed for a signed-in account: if readiness cannot be checked,
      // keep the user in onboarding instead of exposing an unusable mailbox.
      if (active) setOnboardingRequired(true);
    }).finally(() => {
      if (active) setOnboardingChecked(true);
    });
    return () => { active = false; };
  }, [session]);
  if (!ready)
    return (
      <div className="loading-screen">
        <BrandMark />
        <p>Loading Postveil…</p>
      </div>
    );
  if (recovering) return <PasswordResetScreen token={recoveryToken} onComplete={() => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("recovery");
    window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    setRecoveryToken(null);
    setRecovering(false);
    setShowPublicHome(false);
    setAuthMode("signin");
  }} />;
  if (!session) return showPublicHome
    ? <PublicHome onSignIn={() => { setAuthMode("signin"); setShowPublicHome(false); }} onSignUp={() => { setAuthMode("signup"); setShowPublicHome(false); }} />
    : <AuthScreen initialMode={authMode} initialNotice={emailVerificationNotice} onBack={() => setShowPublicHome(true)} />;
  if (mfaSetupRequired) return <MfaSetupRequiredScreen onVerified={() => { setMfaSetupRequired(false); setMfaRequired(false); }} />;
  if (mfaRequired) return <MfaChallengeScreen onVerified={() => setMfaRequired(false)} />;
  if (!onboardingChecked) return <div className="loading-screen"><BrandMark /><p>Preparing your private desk…</p></div>;
  if (onboardingRequired) return <OnboardingWizard session={session} onComplete={() => setOnboardingRequired(false)} />;
  return <MailboxApp session={session} />;
}

export default function App() {
  return (
    <AppDialogProvider>
      <AppContent />
    </AppDialogProvider>
  );
}
