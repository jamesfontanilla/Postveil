import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FolderPlus,
  Globe2,
  History,
  Mail,
  PenLine,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { requireSupabase, type Session } from "../../lib/supabase";
import { qrImageSource } from "../../lib/qr";
import { apiFetch, apiUpload, ApiError } from "../../lib/api";
import {
  displayName,
  initials,
  avatarGradient,
  formatDate,
  formatBytes,
} from "../../lib/format";
import { useAppDialog } from "../../context/AppDialogContext";
import type {
  AppSettings,
  CustomFolder,
  Label,
  Mailbox,
  Rule,
  SenderPolicy,
  RetentionPolicy,
  Message,
  AdminOverview,
  DeliveryOpsView,
  RuleConditionType,
  RuleCondition,
  RuleLabMatch,
  RuleLabResult,
  AutoReply,
  AdminMailbox,
  AdminMember,
  AdminOrganization,
  AdminActivity,
  AdminGroupMember,
  AdminGroup,
  Contact,
  MfaFactor,
  RecoveryMethod,
  Passkey,
  DomainRecord,
  DomainStatusResponse,
  JsonSettings,
} from "../../types/mail";

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

export default function SettingsPanel({
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
