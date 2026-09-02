import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";
import {
  buildWorkStatePatch,
  evaluateRule,
  normalizeRuleRecord,
  normalizeWorkState,
  ruleConflicts,
  ruleContextFromMessage,
  validateRuleInput,
  workQueueSummary,
  type RuleContext as PureRuleContext,
  type RuleDefinition,
} from "./rules.ts";
import {
  buildAttachmentSafety,
  buildSendWarnings,
  buildZip,
  canClaimOutbox,
  canManageOutbox,
  detectAttachmentContentType,
  normalizeUndoSeconds,
  normalizedSendFingerprint,
  type SendWarning,
} from "./phase3.ts";
import {
  isRecent,
  isValidRecoveryEmail,
  maskRecoveryEmail,
  normalizeRecoveryEmail,
} from "./security.ts";
import {
  extractTrustEvidence,
  authenticationAlignmentMismatches,
  normalizeAuthenticationResults,
  screeningDecisionPatch,
  selectSenderPolicy,
  type TrustAuthResults,
  type TrustPolicy,
} from "./trust.ts";
import {
  computeExponentialBackoff,
  ProviderDeliveryError,
  sendThroughProvider,
  type DeliveryAttachment,
  type DeliveryInput,
  type ProviderName,
} from "./delivery.ts";

interface Env {
  ASSETS: Fetcher;
  APP_DOMAIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BREVO_API_KEY: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_BUCKET: string;
  OWNER_USER_ID?: string;
  BREVO_WEBHOOK_SECRET?: string;
  INTERNAL_TEST_TOKEN?: string;
  OUTLOOK_FORWARD_TO?: string;
  DEFAULT_FROM_EMAIL?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SES_REGION?: string;
  AWS_REGION?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_BASE_URL?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_MESSAGE_STREAM?: string;
  SENDGRID_API_KEY?: string;
  SMTP_RELAY_URL?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  MAX_EMAIL_BYTES?: string;
  MAX_RECIPIENTS?: string;
  MAX_RETRY_ATTEMPTS?: string;
  PROVIDER_FAILOVER_ENABLED?: string;
  MAILGUN_WEBHOOK_SIGNING_KEY?: string;
  POSTMARK_WEBHOOK_SECRET?: string;
  SENDGRID_WEBHOOK_SECRET?: string;
  SES_WEBHOOK_SECRET?: string;
  SMTP_WEBHOOK_SECRET?: string;
}

type JsonRecord = Record<string, unknown>;
type User = { id: string; email?: string; accessToken?: string; mfaRequired?: boolean };
type Mailbox = { id: string; owner_id: string; address: string; display_name: string; is_default: boolean; can_send: boolean; can_receive: boolean; settings?: JsonRecord; created_at?: string };
type Organization = { id: string; owner_id: string; name: string; slug: string; settings: JsonRecord; created_at: string; updated_at: string };
type OrganizationMember = { organization_id: string; user_id: string; role: "owner" | "admin" | "member"; status: "active" | "suspended"; require_mfa: boolean; last_seen_at: string | null; created_at: string; updated_at: string };
type MailboxAdminSettings = { mailbox_id: string; organization_id: string; status: "active" | "suspended" | "archived"; quota_bytes: number; storage_used_bytes: number; sending_limit_daily: number; sending_used_today: number; sending_window_started_at: string; inactivity_days: number; last_activity_at: string | null };
type AdminAuthUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string | null; banned_until?: string | null; user_metadata?: JsonRecord };
type SecurityEvent = { id: string; organization_id: string | null; actor_id: string | null; subject_user_id: string; event_type: string; event_key: string; session_id: string | null; ip_hash: string | null; user_agent: string | null; is_suspicious: boolean; details: JsonRecord; created_at: string };
type Rule = RuleDefinition & { id: string; owner_id: string; conditions: JsonRecord; actions: JsonRecord; enabled: boolean; priority: number };
type StoredAttachment = { object_key: string; filename: string; content_type: string; detected_content_type: string; byte_size: number; sha256: string; preview_state: "ready" | "not_available"; safety_status: "unknown" | "suspicious" | "blocked"; safety_reasons: string[]; content_id?: string; disposition?: string | null };
type ProviderConfig = { id?: string; organization_id?: string; provider: ProviderName; enabled: boolean; priority: number; config: JsonRecord; daily_limit?: number };
type ProviderHealth = { id?: string; organization_id?: string; provider: ProviderName; status: string; last_success_at?: string | null; last_failure_at?: string | null; last_latency_ms?: number | null; consecutive_failures?: number; circuit_open_until?: string | null; sent_24h?: number; delivered_24h?: number; bounced_24h?: number; complained_24h?: number; updated_at?: string };
type DeliveryEvent = { provider: string; eventType: string; providerMessageId?: string; eventId?: string; recipient?: string; reason?: string; occurredAt?: string; payload: JsonRecord };

const SYSTEM_FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam"] as const;
const SPAM_THRESHOLD = 0.70;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const error = (message: string, status = 400) => json({ error: message }, status);

function cleanAddress(value: string): string {
  return value.trim().replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

function splitAddresses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(cleanAddress).filter(Boolean);
  return String(value ?? "").split(/[\n,;]+/).map(cleanAddress).filter(Boolean);
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi, "").trim().toLowerCase() || "(no subject)";
}

function snippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function headerValue(parsed: { headers?: Array<{ key: string; value: string }> }, key: string): string | undefined {
  return parsed.headers?.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;
}

function senderIdentity(parsed: { from?: { name?: string; address?: string; group?: unknown[] }; headers?: Array<{ key: string; value: string }> }, fallback: string): { address: string; name: string } {
  const parsedFrom = parsed.from && "address" in parsed.from ? parsed.from : undefined;
  const address = cleanAddress(String(parsedFrom?.address || headerValue(parsed, "from") || fallback));
  const name = String(parsedFrom?.name || "").trim().replace(/\s+/g, " ").slice(0, 200);
  return { address, name: name && name.toLowerCase() !== address ? name : "" };
}

function mimePartSummary(parsed: { text?: string; html?: string; attachments?: Array<{ filename?: string | null; mimeType?: string; content?: Uint8Array | ArrayBuffer | string; contentId?: string | null; disposition?: string | null }> }): JsonRecord[] {
  const parts: JsonRecord[] = [];
  if (parsed.text) parts.push({ part: "text/plain", content_type: "text/plain", byte_size: new TextEncoder().encode(parsed.text).byteLength });
  if (parsed.html) parts.push({ part: "text/html", content_type: "text/html", byte_size: new TextEncoder().encode(parsed.html).byteLength });
  for (const attachment of parsed.attachments || []) {
    const content = attachment.content;
    const byteSize = content instanceof Uint8Array ? content.byteLength : content instanceof ArrayBuffer ? content.byteLength : typeof content === "string" ? content.length : 0;
    parts.push({ part: "attachment", filename: String(attachment.filename || "attachment"), content_type: String(attachment.mimeType || "application/octet-stream"), content_id: attachment.contentId || null, disposition: attachment.disposition || null, byte_size: byteSize });
  }
  return parts;
}

function rawMessageSource(input: { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string; replyTo?: string; messageId: string }): string {
  const safeHeader = (value: string): string => value.replace(/[\r\n]+/g, " ").slice(0, 2000);
  const headers = [
    `From: ${safeHeader(input.from)}`,
    `To: ${safeHeader(input.to.join(", "))}`,
    ...(input.cc?.length ? [`Cc: ${safeHeader(input.cc.join(", "))}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${safeHeader(input.bcc.join(", "))}`] : []),
    `Subject: ${safeHeader(input.subject || "(no subject)")}`,
    ...(input.replyTo ? [`Reply-To: ${safeHeader(input.replyTo)}`] : []),
    `Message-ID: ${safeHeader(input.messageId)}`,
    "MIME-Version: 1.0",
    input.html ? "Content-Type: multipart/alternative; boundary=postveil-boundary" : "Content-Type: text/plain; charset=utf-8",
  ];
  if (!input.html) return `${headers.join("\r\n")}\r\n\r\n${input.text || ""}\r\n`;
  return `${headers.join("\r\n")}\r\n\r\n--postveil-boundary\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.text || ""}\r\n--postveil-boundary\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${input.html}\r\n--postveil-boundary--\r\n`;
}

function supabaseHeaders(env: Env, token?: string): HeadersInit {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token ?? env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
}

async function dbRequest<T = unknown>(env: Env, path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...supabaseHeaders(env, token), ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

const PROVIDER_NAMES: ProviderName[] = ["brevo", "ses", "mailgun", "postmark", "sendgrid", "smtp"];

function providerReady(env: Env, provider: ProviderName): boolean {
  if (provider === "brevo") return Boolean(env.BREVO_API_KEY);
  if (provider === "ses") return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  if (provider === "mailgun") return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
  if (provider === "postmark") return Boolean(env.POSTMARK_SERVER_TOKEN);
  if (provider === "sendgrid") return Boolean(env.SENDGRID_API_KEY);
  return Boolean(env.SMTP_RELAY_URL);
}

function providerLabel(provider: ProviderName): string {
  return provider === "ses" ? "Amazon SES" : provider === "smtp" ? "Generic SMTP relay" : provider[0].toUpperCase() + provider.slice(1);
}

async function providerConfigs(env: Env, organizationId?: string): Promise<ProviderConfig[]> {
  const configured = organizationId
    ? await dbRequest<ProviderConfig[]>(env, `email_provider_configs?organization_id=eq.${encodeURIComponent(organizationId)}&order=priority.asc,provider.asc`).catch(() => [])
    : [];
  const configuredMap = new Map(configured.map((item) => [item.provider, item]));
  const rows = PROVIDER_NAMES.map((provider, index) => configuredMap.get(provider) || { provider, enabled: true, priority: 100 + index, config: {} });
  const ready = rows.filter((item) => item.enabled && providerReady(env, item.provider)).sort((a, b) => a.priority - b.priority);
  return env.PROVIDER_FAILOVER_ENABLED === "false" ? ready.slice(0, 1) : ready;
}

function providerFailure(errorValue: unknown, fallbackProvider: ProviderName): { provider: ProviderName; status: number; code: string; message: string; retryable: boolean } {
  if (errorValue instanceof ProviderDeliveryError) return { provider: errorValue.provider, status: errorValue.responseStatus, code: errorValue.errorCode, message: errorValue.message, retryable: errorValue.retryable };
  const message = errorValue instanceof Error ? errorValue.message : "Provider delivery failed";
  return { provider: fallbackProvider, status: 500, code: "provider_error", message: message.slice(0, 500), retryable: true };
}

async function deliveryAttempt(env: Env, message: JsonRecord, provider: ProviderName, attemptNumber: number, status: string, details: JsonRecord = {}): Promise<void> {
  const query = `delivery_attempts?message_id=eq.${encodeURIComponent(String(message.id))}&provider=eq.${encodeURIComponent(provider)}&attempt_number=eq.${attemptNumber}`;
  if (status === "started") {
    await dbRequest(env, "delivery_attempts", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: message.id, owner_id: message.owner_id, provider, attempt_number: attemptNumber, status, ...details }) }).catch(() => undefined);
    return;
  }
  const updated = await dbRequest(env, query, { method: "PATCH", body: JSON.stringify({ status, ...details }) }).catch(() => undefined);
  if (updated === undefined) await dbRequest(env, "delivery_attempts", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: message.id, owner_id: message.owner_id, provider, attempt_number: attemptNumber, status, ...details }) }).catch(() => undefined);
}

async function updateProviderHealth(env: Env, organizationId: string | undefined, provider: ProviderName, result: { success: boolean; latencyMs?: number; status?: number; error?: string }): Promise<void> {
  if (!organizationId) return;
  const existing = (await dbRequest<ProviderHealth[]>(env, `provider_health?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.${provider}&limit=1`).catch(() => []))[0];
  const failures = result.success ? 0 : Number(existing?.consecutive_failures || 0) + 1;
  const circuitOpenUntil = !result.success && failures >= 3 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : result.success ? null : existing?.circuit_open_until || null;
  const status = result.success ? "healthy" : circuitOpenUntil ? "circuit_open" : failures > 1 ? "degraded" : "failed";
  const patch: JsonRecord = { status, last_latency_ms: result.latencyMs ?? existing?.last_latency_ms ?? null, consecutive_failures: failures, circuit_open_until: circuitOpenUntil, updated_at: new Date().toISOString() };
  if (result.success) patch.last_success_at = new Date().toISOString(); else patch.last_failure_at = new Date().toISOString();
  if (existing?.id) await dbRequest(env, `provider_health?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => undefined);
  else await dbRequest(env, "provider_health", { method: "POST", body: JSON.stringify({ organization_id: organizationId, provider, ...patch }) }).catch(() => undefined);
}

async function providerIsCircuitOpen(env: Env, organizationId: string | undefined, provider: ProviderName): Promise<boolean> {
  if (!organizationId) return false;
  const rows = await dbRequest<ProviderHealth[]>(env, `provider_health?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.${provider}&limit=1`).catch(() => []);
  return Boolean(rows[0]?.circuit_open_until && Date.parse(String(rows[0].circuit_open_until)) > Date.now());
}

function domainOf(address: string): string {
  return cleanAddress(address).split("@")[1] || "unknown";
}

async function suppressedRecipients(env: Env, organizationId: string | undefined, recipients: string[]): Promise<Set<string>> {
  if (!organizationId || !recipients.length) return new Set();
  const encoded = recipients.map((email) => encodeURIComponent(cleanAddress(email))).join(",");
  const rows = await dbRequest<Array<{ email: string }>>(env, `suppression_entries?organization_id=eq.${encodeURIComponent(organizationId)}&email=in.(${encoded})&active=eq.true&select=email`).catch(() => []);
  return new Set(rows.map((row) => cleanAddress(row.email)));
}

function messageSizeBytes(input: { subject: string; text: string; html?: string; to: string[]; cc: string[]; bcc: string[]; attachments?: Array<{ byte_size?: number; bytes?: Uint8Array }> }): number {
  const bodyBytes = new TextEncoder().encode(`${input.subject}\r\n${input.text}\r\n${input.html || ""}\r\n${input.to.join(",")}\r\n${input.cc.join(",")}\r\n${input.bcc.join(",")}`).byteLength;
  return bodyBytes + (input.attachments || []).reduce((total, item) => total + Number(item.byte_size || item.bytes?.byteLength || 0), 0);
}

function maxEmailBytes(env: Env): number {
  const value = Number(env.MAX_EMAIL_BYTES || 10 * 1024 * 1024);
  return Number.isFinite(value) ? Math.max(256 * 1024, Math.min(50 * 1024 * 1024, value)) : 10 * 1024 * 1024;
}

function maxRecipients(env: Env): number {
  const value = Number(env.MAX_RECIPIENTS || 50);
  return Number.isFinite(value) ? Math.max(1, Math.min(500, value)) : 50;
}

function maxRetryAttempts(env: Env): number {
  const value = Number(env.MAX_RETRY_ATTEMPTS || 5);
  return Number.isFinite(value) ? Math.max(1, Math.min(10, value)) : 5;
}

function jwtPayload(token: string): JsonRecord {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(normalized)) as JsonRecord;
  } catch {
    return {};
  }
}

async function verifiedFactorCount(env: Env, userId: string, token: string): Promise<number> {
  void token;
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const result = await client.auth.admin.mfa.listFactors({ userId });
  if (result.error) throw result.error;
  return (result.data?.factors || []).filter((factor) => factor.status === "verified").length;
}

async function probeSupabase(env: Env): Promise<{ ok: boolean; status: number; detail?: string }> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, { headers: supabaseHeaders(env) });
    return { ok: response.ok, status: response.status, ...(response.ok ? {} : { detail: (await response.text()).slice(0, 180) }) };
  } catch (probeError) {
    return { ok: false, status: 0, detail: probeError instanceof Error ? probeError.message.slice(0, 180) : "Probe failed" };
  }
}

async function getUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } });
  if (!response.ok) return null;
  const token = authorization.slice(7).trim();
  const user = (await response.json()) as User;
  const aal = jwtPayload(token).aal;
  const mfaRequired = aal !== "aal2" && (await verifiedFactorCount(env, user.id, token)) > 0;
  return { ...user, accessToken: token, mfaRequired };
}

function storageClient(env: Env): S3Client {
  return new S3Client({ region: env.B2_REGION, endpoint: env.B2_ENDPOINT, forcePathStyle: false, credentials: { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY } });
}

async function putObject(env: Env, key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await storageClient(env).send(new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readObject(env: Env, key: string): Promise<Uint8Array> {
  const result = await storageClient(env).send(new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: key }));
  const body = result.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body) throw new Error("Attachment content is unavailable");
  if (typeof body.transformToByteArray === "function") return new Uint8Array(await body.transformToByteArray());
  return new Uint8Array(await new Response(body as unknown as BodyInit).arrayBuffer());
}

async function deleteObject(env: Env, key: string): Promise<void> {
  await storageClient(env).send(new DeleteObjectCommand({ Bucket: env.B2_BUCKET, Key: key }));
}

async function signedObjectUrl(env: Env, key: string): Promise<string> {
  return getSignedUrl(storageClient(env), new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: key }), { expiresIn: 600 });
}

function trashRestoreTarget(message: JsonRecord): { folder: string; custom_folder_id: string | null } {
  const previous = typeof message.previous_folder === "string" ? message.previous_folder : "";
  if (previous.startsWith("custom:")) {
    const customFolderId = previous.slice("custom:".length);
    if (customFolderId) return { folder: "custom", custom_folder_id: customFolderId };
  }
  if (SYSTEM_FOLDERS.includes(previous as typeof SYSTEM_FOLDERS[number]) && previous !== "trash") {
    return { folder: previous, custom_folder_id: null };
  }
  return { folder: "inbox", custom_folder_id: null };
}

async function permanentlyDeleteMessage(env: Env, ownerId: string, messageId: string): Promise<void> {
  const rows = await dbRequest<Array<{ id: string; raw_object_key?: string | null }>>(
    env,
    `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&folder=eq.trash&select=id,raw_object_key&limit=1`,
  );
  if (!rows[0]) throw new Error("Only messages in Trash can be deleted permanently");
  const attachments = await dbRequest<Array<{ object_key?: string | null }>>(
    env,
    `attachments?message_id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=object_key`,
  );
  const objectKeys = [rows[0].raw_object_key, ...attachments.map((attachment) => attachment.object_key)]
    .filter((key): key is string => typeof key === "string" && Boolean(key));
  await dbRequest(
    env,
    `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&folder=eq.trash`,
    { method: "DELETE" },
  );
  await Promise.allSettled(objectKeys.map((key) => deleteObject(env, key)));
}

async function ensureProfileAndMailbox(env: Env, user: User): Promise<Mailbox> {
  await dbRequest(env, "profiles", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: user.id, display_name: user.email?.split("@")[0] ?? "Mailbox owner" }) });
  await dbRequest(env, "user_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: user.id }) });
  const existing = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc&limit=1`);
  if (existing[0]) return existing[0];
  const created = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address: `james@${env.APP_DOMAIN}`, display_name: "James", is_default: true }) });
  return created[0];
}

function adminAuthClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function organizationSettings(value: unknown): JsonRecord {
  return objectValue(value);
}

async function ensureOrganization(env: Env, user: User): Promise<Organization> {
  const memberships = await dbRequest<Array<{ organization_id: string }>>(env, `organization_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&order=created_at.asc&limit=1`).catch(() => []);
  let rows = memberships[0]
    ? await dbRequest<Organization[]>(env, `organizations?id=eq.${encodeURIComponent(memberships[0].organization_id)}&limit=1`)
    : await dbRequest<Organization[]>(env, `organizations?owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  if (!rows[0]) {
    const slug = `workspace-${user.id.replace(/-/g, "").slice(0, 18)}`;
    await dbRequest(env, "organizations", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        owner_id: user.id,
        name: `${String(user.email || "Postveil").split("@")[0]} workspace`,
        slug,
      }),
    });
    rows = await dbRequest<Organization[]>(env, `organizations?owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  }
  const organization = rows[0];
  if (!organization) throw new Error("Organization could not be initialized");
  if (organization.owner_id === user.id) {
    await dbRequest(env, "organization_members", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ organization_id: organization.id, user_id: user.id, role: "owner", status: "active" }),
    });
  }
  const mailboxes = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&select=id,owner_id,address,display_name,is_default,can_send,can_receive,settings,created_at`);
  const settings = organizationSettings(organization.settings);
  const defaultQuota = Math.max(0, Number(settings.default_quota_bytes || 5 * 1024 * 1024 * 1024));
  const defaultSendingLimit = Math.max(0, Number(settings.default_sending_limit_daily || 100));
  await Promise.all(mailboxes.map((mailbox) => dbRequest(env, "mailbox_admin_settings", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      mailbox_id: mailbox.id,
      organization_id: organization.id,
      quota_bytes: defaultQuota,
      sending_limit_daily: defaultSendingLimit,
      inactivity_days: Math.max(0, Number(settings.inactivity_days || 90)),
      last_activity_at: mailbox.created_at,
    }),
  }).catch(() => undefined)));
  return organization;
}

async function organizationMember(env: Env, organizationId: string, userId: string): Promise<OrganizationMember | null> {
  const rows = await dbRequest<OrganizationMember[]>(env, `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows[0] || null;
}

async function organizationAdmin(env: Env, user: User): Promise<{ organization: Organization; member: OrganizationMember } | null> {
  const organization = await ensureOrganization(env, user);
  const member = await organizationMember(env, organization.id, user.id);
  if (!member || member.status !== "active" || !["owner", "admin"].includes(member.role)) return null;
  return { organization, member };
}

async function organizationMfaBlocked(env: Env, user: User, organization: Organization): Promise<boolean> {
  const member = await organizationMember(env, organization.id, user.id);
  const required = Boolean(member?.require_mfa || organizationSettings(organization.settings).require_mfa === true);
  if (!required) return false;
  return (await verifiedFactorCount(env, user.id, user.accessToken || "")) === 0;
}

async function getMailboxAdminSettings(env: Env, mailbox: Mailbox, organizationId?: string): Promise<MailboxAdminSettings | null> {
  const query = `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}&limit=1${organizationId ? `&organization_id=eq.${encodeURIComponent(organizationId)}` : ""}`;
  const rows = await dbRequest<MailboxAdminSettings[]>(env, query).catch(() => []);
  return rows[0] || null;
}

async function authUsers(env: Env): Promise<AdminAuthUser[]> {
  const result = await adminAuthClient(env).auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw result.error;
  return (result.data?.users || []) as unknown as AdminAuthUser[];
}

function authUserDisplayName(user: AdminAuthUser): string {
  return String(organizationSettings(user.user_metadata).display_name || user.email?.split("@")[0] || "Mailbox user");
}

async function attachmentBytesForMailbox(env: Env, mailbox: Mailbox): Promise<number> {
  const messages = await dbRequest<Array<{ id: string }>>(env, `messages?mailbox_id=eq.${encodeURIComponent(mailbox.id)}&owner_id=eq.${encodeURIComponent(mailbox.owner_id)}&select=id&limit=10000`).catch(() => []);
  if (!messages.length) return 0;
  const ids = messages.map((message) => message.id).join(",");
  const rows = await dbRequest<Array<{ byte_size?: number }>>(env, `attachments?owner_id=eq.${encodeURIComponent(mailbox.owner_id)}&message_id=in.(${ids})&select=byte_size`).catch(() => []);
  return rows.reduce((total, row) => total + Math.max(0, Number(row.byte_size || 0)), 0);
}

async function listAdminUsers(env: Env, organization: Organization): Promise<JsonRecord[]> {
  const members = await dbRequest<OrganizationMember[]>(env, `organization_members?organization_id=eq.${encodeURIComponent(organization.id)}&order=created_at.asc`);
  const users = await authUsers(env);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const ids = members.map((member) => member.user_id);
  const mailboxes = ids.length
    ? await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=in.(${ids.join(",")})&order=owner_id.asc,is_default.desc,created_at.asc`)
    : [];
  const mailboxSettings = mailboxes.length
    ? await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=in.(${mailboxes.map((mailbox) => mailbox.id).join(",")})`)
    : [];
  const settingsMap = new Map(mailboxSettings.map((setting) => [setting.mailbox_id, setting]));
  const result: JsonRecord[] = [];
  for (const member of members) {
    const user = userMap.get(member.user_id);
    if (!user) continue;
    const ownedMailboxes = mailboxes.filter((mailbox) => mailbox.owner_id === member.user_id);
    const mailboxUsage = new Map(await Promise.all(ownedMailboxes.map(async (mailbox) => [mailbox.id, await attachmentBytesForMailbox(env, mailbox)] as const)));
    const usedBytes = [...mailboxUsage.values()].reduce((total, value) => total + value, 0);
    const userMailboxes = ownedMailboxes.map((mailbox) => {
      const settings = settingsMap.get(mailbox.id);
      return {
        ...mailbox,
        status: settings?.status || "active",
        quota_bytes: settings?.quota_bytes || 0,
        storage_used_bytes: mailboxUsage.get(mailbox.id) || 0,
        sending_limit_daily: settings?.sending_limit_daily || 0,
        sending_used_today: settings?.sending_used_today || 0,
        inactivity_days: settings?.inactivity_days || 90,
      };
    });
    result.push({
      user_id: member.user_id,
      email: user.email || "",
      display_name: authUserDisplayName(user),
      role: member.role,
      status: member.status,
      require_mfa: member.require_mfa,
      last_seen_at: member.last_seen_at,
      last_sign_in_at: user.last_sign_in_at || null,
      created_at: member.created_at || user.created_at || null,
      banned_until: user.banned_until || null,
      storage_used_bytes: usedBytes,
      mailboxes: userMailboxes,
    });
    await Promise.all(userMailboxes.map((mailbox) => dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(String(mailbox.id))}`, { method: "PATCH", body: JSON.stringify({ storage_used_bytes: Number(mailbox.storage_used_bytes || 0), updated_at: new Date().toISOString() }) }).catch(() => undefined)));
  }
  return result;
}

async function enforceInactivity(env: Env, organization: Organization, actorId: string): Promise<void> {
  const settings = organizationSettings(organization.settings);
  if (settings.inactivity_action !== "suspend") return;
  const inactivityDays = Math.max(0, Number(settings.inactivity_days || 0));
  if (!inactivityDays) return;
  const cutoff = Date.now() - inactivityDays * 24 * 60 * 60 * 1000;
  const members = await dbRequest<OrganizationMember[]>(env, `organization_members?organization_id=eq.${encodeURIComponent(organization.id)}&status=eq.active&role=neq.owner`);
  const users = await authUsers(env);
  for (const member of members) {
    const authUser = users.find((candidate) => candidate.id === member.user_id);
    const lastActivity = member.last_seen_at || authUser?.last_sign_in_at || null;
    if (!lastActivity || new Date(lastActivity).getTime() > cutoff) continue;
    const authUpdate = await adminAuthClient(env).auth.admin.updateUserById(member.user_id, { ban_duration: "876000h" });
    if (authUpdate.error) continue;
    await dbRequest(env, `organization_members?organization_id=eq.${encodeURIComponent(organization.id)}&user_id=eq.${encodeURIComponent(member.user_id)}`, { method: "PATCH", body: JSON.stringify({ status: "suspended", updated_at: new Date().toISOString() }) });
    const mailboxes = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(member.user_id)}&select=id`);
    await Promise.all(mailboxes.map((mailbox) => dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}`, { method: "PATCH", body: JSON.stringify({ status: "suspended", updated_at: new Date().toISOString() }) }).catch(() => undefined)));
    await auditAdminEvent(env, organization.id, actorId, member.user_id, "account_suspended", { reason: "inactivity", inactivity_days: inactivityDays, last_activity_at: lastActivity });
  }
}

async function enforceAllOrganizationInactivity(env: Env): Promise<void> {
  const organizations = await dbRequest<Organization[]>(env, "organizations?select=id,owner_id,name,slug,settings,created_at,updated_at&limit=1000").catch(() => []);
  for (const organization of organizations) await enforceInactivity(env, organization, organization.owner_id).catch(() => undefined);
}

async function recordSecurityEvent(env: Env, organization: Organization, user: User, request: Request, ctx: ExecutionContext): Promise<void> {
  const payload = jwtPayload(user.accessToken || "");
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : typeof payload.jti === "string" ? payload.jti : String(payload.iat || "");
  if (!sessionId) return;
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 240);
  const ipHash = await sha256Hex(new TextEncoder().encode(ip));
  const recent = await dbRequest<SecurityEvent[]>(env, `account_security_events?organization_id=eq.${encodeURIComponent(organization.id)}&subject_user_id=eq.${encodeURIComponent(user.id)}&event_type=eq.login&order=created_at.desc&limit=20`).catch(() => []);
  const eventKey = `${user.id}:${sessionId}:${ipHash}`;
  const suspicious = recent.length > 0 && !recent.some((event) => event.ip_hash === ipHash && event.user_agent === userAgent);
  await dbRequest(env, "account_security_events", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ organization_id: organization.id, actor_id: user.id, subject_user_id: user.id, event_type: "login", event_key: eventKey, session_id: sessionId, ip_hash: ipHash, user_agent: userAgent, is_suspicious: suspicious, details: { method: request.method, path: new URL(request.url).pathname } }),
  }).catch(() => undefined);
  await dbRequest(env, `organization_members?organization_id=eq.${encodeURIComponent(organization.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
  if (suspicious && user.email) {
    ctx.waitUntil(sendViaBrevo(env, {
      fromAddress: await defaultFromAddress(env, user.id),
      to: [user.email],
      subject: "New Postveil sign-in detected",
      text: `A new sign-in to your Postveil account was detected. If this was not you, reset your password and revoke other sessions.\n\nBrowser: ${userAgent}`,
    }).catch(() => undefined));
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(value: string): string[][] {
  return value.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
      else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  });
}

async function adminMailbox(env: Env, organizationId: string, mailboxId: string): Promise<Mailbox | null> {
  const rows = await dbRequest<Mailbox[]>(env, `mailboxes?id=eq.${encodeURIComponent(mailboxId)}&select=id,owner_id,address,display_name,is_default,can_send,can_receive,settings&limit=1`);
  const mailbox = rows[0];
  if (!mailbox) return null;
  const members = await dbRequest<OrganizationMember[]>(env, `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(mailbox.owner_id)}&limit=1`);
  return members[0] ? mailbox : null;
}

async function mailboxObjectKeys(env: Env, mailboxId: string, ownerId: string): Promise<string[]> {
  const messages = await dbRequest<Array<{ id: string; raw_object_key?: string | null }>>(env, `messages?mailbox_id=eq.${encodeURIComponent(mailboxId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,raw_object_key&limit=10000`).catch(() => []);
  const messageIds = messages.map((message) => message.id).filter(Boolean);
  const attachments = messageIds.length
    ? await dbRequest<Array<{ object_key: string }>>(env, `attachments?owner_id=eq.${encodeURIComponent(ownerId)}&message_id=in.(${messageIds.join(",")})&select=object_key&limit=10000`).catch(() => [])
    : [];
  const keys = [...new Set([...messages.map((message) => message.raw_object_key || ""), ...attachments.map((attachment) => attachment.object_key)].filter(Boolean))];
  return keys;
}

async function purgeOwnerObjects(env: Env, ownerId: string): Promise<void> {
  const messages = await dbRequest<Array<{ id: string; raw_object_key?: string | null }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,raw_object_key&limit=10000`).catch(() => []);
  const attachments = await dbRequest<Array<{ object_key: string }>>(env, `attachments?owner_id=eq.${encodeURIComponent(ownerId)}&select=object_key&limit=10000`).catch(() => []);
  const keys = [...new Set([...messages.map((message) => message.raw_object_key || ""), ...attachments.map((attachment) => attachment.object_key)].filter(Boolean))];
  await Promise.allSettled(keys.map((key) => deleteObject(env, key)));
}

async function auditAdminEvent(env: Env, organizationId: string, actorId: string, subjectUserId: string, eventType: string, details: JsonRecord = {}): Promise<void> {
  await dbRequest(env, "account_security_events", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      organization_id: organizationId,
      actor_id: actorId,
      subject_user_id: subjectUserId,
      event_type: eventType,
      event_key: `${eventType}:${actorId}:${subjectUserId}:${crypto.randomUUID()}`,
      is_suspicious: false,
      details,
    }),
  }).catch(() => undefined);
}

async function managedUser(env: Env, organizationId: string, userId: string): Promise<OrganizationMember | null> {
  return organizationMember(env, organizationId, userId);
}

async function createManagedUser(env: Env, organization: Organization, actor: OrganizationMember, body: JsonRecord): Promise<JsonRecord> {
  const email = cleanAddress(String(body.email || ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid account email");
  const role = String(body.role || "member") as "admin" | "member";
  if (!["admin", "member"].includes(role)) throw new Error("Choose admin or member");
  if (role === "admin" && actor.role !== "owner") throw new Error("Only the workspace owner can create administrators");
  const displayName = String(body.displayName || email.split("@")[0]).trim().slice(0, 120);
  const mailboxAddress = cleanAddress(String(body.mailboxAddress || email));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailboxAddress)) throw new Error("Enter a valid mailbox address");
  const auth = adminAuthClient(env);
  const invited = await auth.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName }, redirectTo: new URL("/", `https://${env.APP_DOMAIN}`).toString() });
  if (invited.error || !invited.data.user) throw invited.error || new Error("The invitation could not be created");
  const createdUser = invited.data.user as unknown as AdminAuthUser;
  try {
    await dbRequest(env, "profiles", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: createdUser.id, display_name: displayName }) });
    await dbRequest(env, "user_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: createdUser.id }) });
    await dbRequest(env, "organization_members", { method: "POST", body: JSON.stringify({ organization_id: organization.id, user_id: createdUser.id, role, status: "active", require_mfa: body.requireMfa === true }) });
    const mailboxRows = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: createdUser.id, address: mailboxAddress, display_name: displayName, is_default: true, can_send: body.canSend !== false, can_receive: body.canReceive !== false }) });
    const mailbox = mailboxRows[0];
    if (!mailbox) throw new Error("Mailbox creation returned no row");
    const orgSettings = organizationSettings(organization.settings);
    await dbRequest(env, "mailbox_admin_settings", { method: "POST", body: JSON.stringify({ mailbox_id: mailbox.id, organization_id: organization.id, quota_bytes: Math.max(0, Number(body.quotaBytes || orgSettings.default_quota_bytes || 5 * 1024 * 1024 * 1024)), sending_limit_daily: Math.max(0, Number(body.sendingLimitDaily ?? orgSettings.default_sending_limit_daily ?? 100)), inactivity_days: Math.max(0, Number(body.inactivityDays ?? orgSettings.inactivity_days ?? 90)), last_activity_at: new Date().toISOString() }) });
    await auditAdminEvent(env, organization.id, actor.user_id, createdUser.id, "account_reactivated", { action: "created", email });
  } catch (creationError) {
    await auth.auth.admin.deleteUser(createdUser.id, true).catch(() => undefined);
    throw creationError;
  }
  return { user_id: createdUser.id, email, display_name: displayName, role, status: "active", invited: true };
}

async function adminApi(request: Request, env: Env, ctx: ExecutionContext, actor: User): Promise<Response> {
  const access = await organizationAdmin(env, actor);
  if (!access) return error("Workspace administrator access is required", 403);
  const { organization, member: actorMember } = access;
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/admin/delivery-ops") return json(await deliveryOperations(env, organization.id));
  if (request.method === "GET" && url.pathname === "/api/admin/providers") {
    const configs = await dbRequest<ProviderConfig[]>(env, `email_provider_configs?organization_id=eq.${encodeURIComponent(organization.id)}&order=priority.asc,provider.asc`).catch(() => []);
    return json(PROVIDER_NAMES.map((provider) => ({ ...(configs.find((item) => item.provider === provider) || { enabled: true, priority: 100, config: {}, daily_limit: 0 }), provider, label: providerLabel(provider), configured: providerReady(env, provider) })));
  }
  const providerAdminMatch = url.pathname.match(/^\/api\/admin\/providers\/(brevo|ses|mailgun|postmark|sendgrid|smtp)$/);
  if (providerAdminMatch && request.method === "PATCH") {
    const provider = providerAdminMatch[1] as ProviderName;
    const body = (await request.json()) as JsonRecord;
    const safeConfig: JsonRecord = {};
    for (const key of ["endpoint", "domain", "baseUrl", "relayUrl", "region", "configurationSetName", "messageStream"]) if (typeof body[key] === "string") safeConfig[key] = String(body[key]).slice(0, 500);
    const rows = await dbRequest<ProviderConfig[]>(env, "email_provider_configs?on_conflict=organization_id,provider", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ organization_id: organization.id, provider, enabled: body.enabled !== false, priority: Math.max(0, Math.min(10000, Number(body.priority ?? 100))), config: safeConfig, daily_limit: Math.max(0, Math.min(10_000_000, Number(body.dailyLimit || 0))), updated_at: new Date().toISOString() }) });
    return json({ ...(rows[0] || {}), provider, configured: providerReady(env, provider) });
  }
  const domainAdminMatch = url.pathname.match(/^\/api\/admin\/domains\/([^/]+)$/);
  if (domainAdminMatch && (request.method === "GET" || request.method === "PATCH")) {
    const domain = decodeURIComponent(domainAdminMatch[1]).toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 253);
    if (!domain) return error("A valid domain is required");
    if (request.method === "GET") return json(await domainReputation(env, organization.id, domain) || { organization_id: organization.id, domain, daily_limit: 0, sent_used_today: 0, status: "healthy", score: 1 });
    const body = (await request.json()) as JsonRecord;
    const current = await domainReputation(env, organization.id, domain);
    const dailyLimit = Math.max(0, Math.min(10_000_000, Number(body.dailyLimit || 0)));
    const record = { organization_id: organization.id, domain, daily_limit: dailyLimit, sent_window_started_at: current?.sent_window_started_at || new Date().toISOString().slice(0, 10), sent_used_today: Number(current?.sent_used_today || 0), updated_at: new Date().toISOString() };
    if (current?.id) await dbRequest(env, `domain_reputation?id=eq.${encodeURIComponent(String(current.id))}`, { method: "PATCH", body: JSON.stringify(record) });
    else await dbRequest(env, "domain_reputation?on_conflict=organization_id,domain", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(record) });
    return json({ ...current, ...record });
  }
  if (request.method === "GET" && url.pathname === "/api/admin/overview") {
    await enforceInactivity(env, organization, actor.id);
    const members = await listAdminUsers(env, organization);
    const activity = await dbRequest<SecurityEvent[]>(env, `account_security_events?organization_id=eq.${encodeURIComponent(organization.id)}&order=created_at.desc&limit=50`).catch(() => []);
    const groups = await groupList(env, organization.id).catch(() => []);
    const mailboxList = members.flatMap((member) => Array.isArray(member.mailboxes) ? member.mailboxes as JsonRecord[] : []);
    return json({
      organization: { ...organization, settings: organizationSettings(organization.settings) },
      members,
      groups,
      activity: activity.map((event) => ({ ...event, email: members.find((candidate) => candidate.user_id === event.subject_user_id)?.email || "" })),
      stats: {
        users: members.length,
        active_users: members.filter((candidate) => candidate.status === "active").length,
        suspended_users: members.filter((candidate) => candidate.status === "suspended").length,
        mailboxes: mailboxList.length,
        storage_used_bytes: members.reduce((total, candidate) => total + Number(candidate.storage_used_bytes || 0), 0),
      },
    });
  }
  if (request.method === "GET" && url.pathname === "/api/admin/activity") {
    const events = await dbRequest<SecurityEvent[]>(env, `account_security_events?organization_id=eq.${encodeURIComponent(organization.id)}&order=created_at.desc&limit=100`);
    const users = await authUsers(env);
    return json(events.map((event) => ({ ...event, email: users.find((user) => user.id === event.subject_user_id)?.email || "" })));
  }
  if (request.method === "PATCH" && url.pathname === "/api/admin/organization") {
    const body = (await request.json()) as JsonRecord;
    const current = organizationSettings(organization.settings);
    const nextSettings: JsonRecord = { ...current };
    for (const key of ["inactivity_days", "inactivity_action", "require_mfa", "default_quota_bytes", "default_sending_limit_daily"]) {
      if (key in body) nextSettings[key] = body[key];
    }
    if ("inactivity_days" in nextSettings) nextSettings.inactivity_days = Math.max(0, Math.min(3650, Number(nextSettings.inactivity_days || 90)));
    if (!["notify", "suspend"].includes(String(nextSettings.inactivity_action || "notify"))) return error("Choose a valid inactivity action");
    const name = String(body.name || organization.name).trim().slice(0, 120) || "Postveil workspace";
    const rows = await dbRequest<Organization[]>(env, `organizations?id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name, settings: nextSettings, updated_at: new Date().toISOString() }) });
    return json(rows[0] || { ...organization, name, settings: nextSettings });
  }
  if (request.method === "GET" && url.pathname === "/api/admin/groups") return json(await groupList(env, organization.id));
  if (request.method === "POST" && url.pathname === "/api/admin/groups") {
    const body = (await request.json()) as JsonRecord;
    const name = String(body.name || "").trim().slice(0, 120);
    const address = cleanAddress(String(body.address || ""));
    if (!name) return error("Group name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return error("Enter a valid group address");
    if (await organizationHasMailboxAddress(env, organization.id, address)) return error("That address is already assigned to a mailbox");
    const rows = await dbRequest<JsonRecord[]>(env, "organization_groups", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: organization.id, name, address, description: String(body.description || "").trim().slice(0, 500), delivery_mode: body.deliveryMode === "group" ? "group" : "distribution", enabled: body.enabled !== false }) });
    await auditAdminEvent(env, organization.id, actor.id, actor.id, "group_created", { group_id: rows[0]?.id || null, address });
    return json({ ...(rows[0] || {}), members: [] }, 201);
  }
  const groupMatch = url.pathname.match(/^\/api\/admin\/groups\/([^/]+)(?:\/members(?:\/([^/]+))?)?$/);
  if (groupMatch) {
    const groupId = decodeURIComponent(groupMatch[1]);
    const group = await adminGroup(env, organization.id, groupId);
    if (!group) return error("Group address not found in this workspace", 404);
    const memberId = groupMatch[2] ? decodeURIComponent(groupMatch[2]) : "";
    if (url.pathname.includes("/members")) {
      if (request.method === "POST" && !memberId) {
        const body = (await request.json()) as JsonRecord;
        const email = cleanAddress(String(body.email || ""));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid recipient email");
        const member = (await authUsers(env)).find((candidate) => cleanAddress(String(candidate.email || "")) === email);
        const workspaceMember = member ? await organizationMember(env, organization.id, member.id) : null;
        const rows = await dbRequest<JsonRecord[]>(env, "organization_group_members", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ group_id: groupId, member_email: email, member_user_id: workspaceMember?.user_id || null }) });
        return json(rows[0] || { group_id: groupId, member_email: email }, 201);
      }
      if (request.method === "DELETE" && memberId) {
        await dbRequest(env, `organization_group_members?id=eq.${encodeURIComponent(memberId)}&group_id=eq.${encodeURIComponent(groupId)}`, { method: "DELETE" });
        return json({ ok: true });
      }
      return error("Group member route not found", 404);
    }
    if (request.method === "PATCH") {
      const body = (await request.json()) as JsonRecord;
      const patch: JsonRecord = { updated_at: new Date().toISOString() };
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
      if (typeof body.address === "string") {
        const address = cleanAddress(body.address);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return error("Enter a valid group address");
        if (address !== cleanAddress(String(group.address || "")) && await organizationHasMailboxAddress(env, organization.id, address)) return error("That address is already assigned to a mailbox");
        patch.address = address;
      }
      if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500);
      if (body.deliveryMode === "distribution" || body.deliveryMode === "group") patch.delivery_mode = body.deliveryMode;
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      const rows = await dbRequest<JsonRecord[]>(env, `organization_groups?id=eq.${encodeURIComponent(groupId)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      await auditAdminEvent(env, organization.id, actor.id, actor.id, "group_updated", { group_id: groupId });
      return json(rows[0] || { ...group, ...patch });
    }
    if (request.method === "DELETE") {
      await dbRequest(env, `organization_groups?id=eq.${encodeURIComponent(groupId)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "DELETE" });
      await auditAdminEvent(env, organization.id, actor.id, actor.id, "group_deleted", { group_id: groupId });
      return json({ ok: true });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/admin/users") return json(await listAdminUsers(env, organization));
  if (request.method === "GET" && url.pathname === "/api/admin/users/export") {
    const members = await listAdminUsers(env, organization);
    const lines = ["email,display_name,role,status,require_mfa,mailboxes,storage_used_bytes,quota_bytes,sending_limit_daily"];
    for (const candidate of members) {
      const boxes = Array.isArray(candidate.mailboxes) ? candidate.mailboxes as JsonRecord[] : [];
      const quota = boxes.reduce((total, mailbox) => total + Number(mailbox.quota_bytes || 0), 0);
      const limit = boxes.reduce((total, mailbox) => total + Number(mailbox.sending_limit_daily || 0), 0);
      lines.push([candidate.email, candidate.display_name, candidate.role, candidate.status, candidate.require_mfa, boxes.map((mailbox) => mailbox.address).join(";"), candidate.storage_used_bytes, quota, limit].map(csvCell).join(","));
    }
    return new Response(`${lines.join("\n")}\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="postveil-users.csv"', "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    try { return json(await createManagedUser(env, organization, actorMember, (await request.json()) as JsonRecord), 201); }
    catch (createError) { return error(createError instanceof Error ? createError.message : "Account could not be created", 400); }
  }
  if (request.method === "POST" && url.pathname === "/api/admin/users/import") {
    const body = (await request.json()) as JsonRecord;
    const rawUsers = Array.isArray(body.users) ? body.users : [];
    if (!rawUsers.length || rawUsers.length > 100) return error("Import between 1 and 100 users at a time");
    const results: JsonRecord[] = [];
    for (const rawUser of rawUsers) {
      try { results.push({ ok: true, ...(await createManagedUser(env, organization, actorMember, objectValue(rawUser))) }); }
      catch (importError) { results.push({ ok: false, email: String(objectValue(rawUser).email || ""), error: importError instanceof Error ? importError.message : "Import failed" }); }
    }
    return json({ results, created: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length });
  }
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/(reset-password|revoke-sessions))?$/);
  if (userMatch) {
    const targetId = decodeURIComponent(userMatch[1]);
    const target = await managedUser(env, organization.id, targetId);
    if (!target) return error("Account not found in this workspace", 404);
    const targetAuth = (await authUsers(env)).find((candidate) => candidate.id === targetId);
    if (!targetAuth) return error("Authentication account not found", 404);
    if (request.method === "POST" && userMatch[2] === "reset-password") {
      if (!targetAuth.email) return error("This account has no reset email", 400);
      const link = await generateRecoveryLink(env, targetAuth.email, new URL("/", request.url).toString());
      await sendViaBrevo(env, { fromAddress: await defaultFromAddress(env, actor.id), to: [targetAuth.email], subject: "Reset your Postveil password", text: `An administrator requested a password reset for your Postveil account. Use this one-time link:\n\n${link}\n\nIf you did not expect this, contact your workspace administrator.` });
      await auditAdminEvent(env, organization.id, actor.id, targetId, "password_reset", { email: targetAuth.email });
      return json({ ok: true });
    }
    if (request.method === "POST" && userMatch[2] === "revoke-sessions") {
      const result = await adminAuthClient(env).auth.admin.signOut(targetId, "global");
      if (result.error) return error(result.error.message, 400);
      await auditAdminEvent(env, organization.id, actor.id, targetId, "session_revoked");
      return json({ ok: true });
    }
    if (request.method === "PATCH" && !userMatch[2]) {
      if (targetId === actor.id) return error("Use your own security settings to change your account");
      const body = (await request.json()) as JsonRecord;
      const nextRole = body.role === "admin" || body.role === "member" ? body.role : undefined;
      if (nextRole === "admin" && actorMember.role !== "owner") return error("Only the workspace owner can grant administrator access", 403);
      if (target.role === "owner") return error("The workspace owner cannot be changed here", 400);
      const nextStatus = body.status === "suspended" ? "suspended" : body.status === "active" ? "active" : undefined;
      if (nextStatus) {
        const authUpdate = await adminAuthClient(env).auth.admin.updateUserById(targetId, { ban_duration: nextStatus === "suspended" ? "876000h" : "none" });
        if (authUpdate.error) return error(authUpdate.error.message, 400);
        if (nextStatus === "suspended") {
          const targetMailboxes = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(targetId)}&select=id`);
          await Promise.all(targetMailboxes.map((targetMailbox) => dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(targetMailbox.id)}`, { method: "PATCH", body: JSON.stringify({ status: "suspended", updated_at: new Date().toISOString() }) }).catch(() => undefined)));
        }
      }
      if (typeof body.displayName === "string" && body.displayName.trim()) {
        const displayName = body.displayName.trim().slice(0, 120);
        await dbRequest(env, `profiles?id=eq.${encodeURIComponent(targetId)}`, { method: "PATCH", body: JSON.stringify({ display_name: displayName, updated_at: new Date().toISOString() }) });
        const metadata = { ...organizationSettings(targetAuth.user_metadata), display_name: displayName };
        const authUpdate = await adminAuthClient(env).auth.admin.updateUserById(targetId, { user_metadata: metadata });
        if (authUpdate.error) return error(authUpdate.error.message, 400);
      }
      const patch: JsonRecord = { updated_at: new Date().toISOString() };
      if (nextRole) patch.role = nextRole;
      if (nextStatus) patch.status = nextStatus;
      if (typeof body.requireMfa === "boolean") patch.require_mfa = body.requireMfa;
      if (Object.keys(patch).length > 1) await dbRequest(env, `organization_members?organization_id=eq.${encodeURIComponent(organization.id)}&user_id=eq.${encodeURIComponent(targetId)}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (nextStatus) await auditAdminEvent(env, organization.id, actor.id, targetId, nextStatus === "suspended" ? "account_suspended" : "account_reactivated");
      return json({ ok: true });
    }
    if (request.method === "DELETE" && !userMatch[2]) {
      if (targetId === actor.id || target.role === "owner") return error("The workspace owner cannot be deleted", 400);
      const result = await adminAuthClient(env).auth.admin.deleteUser(targetId, false);
      if (result.error) return error(result.error.message, 400);
      await purgeOwnerObjects(env, targetId);
      return json({ ok: true });
    }
  }
  const mailboxMatch = url.pathname.match(/^\/api\/admin\/mailboxes\/([^/]+)(?:\/delegates(?:\/([^/]+))?)?$/);
  if (mailboxMatch) {
    const mailboxId = decodeURIComponent(mailboxMatch[1]);
    const mailbox = await adminMailbox(env, organization.id, mailboxId);
    if (!mailbox) return error("Mailbox not found in this workspace", 404);
    const delegateUserId = mailboxMatch[2] ? decodeURIComponent(mailboxMatch[2]) : "";
    if (mailboxMatch[2]) {
      const delegate = await organizationMember(env, organization.id, delegateUserId);
      if (!delegate) return error("Delegate must belong to this workspace", 400);
      if (request.method === "GET") {
        const rows = await dbRequest<JsonRecord[]>(env, `mailbox_delegations?mailbox_id=eq.${encodeURIComponent(mailboxId)}&member_id=eq.${encodeURIComponent(delegateUserId)}&limit=1`);
        return json(rows[0] || null);
      }
      if (request.method === "PATCH" || request.method === "POST") {
        const body = (await request.json()) as JsonRecord;
        const permissionPatch = { mailbox_id: mailboxId, member_id: delegateUserId, can_read: body.canRead !== false, can_send_as: body.canSendAs === true, can_send_on_behalf: body.canSendOnBehalf === true, can_manage: body.canManage === true, status: body.status === "revoked" ? "revoked" : "active", updated_at: new Date().toISOString() };
        const rows = await dbRequest<JsonRecord[]>(env, "mailbox_delegations", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(permissionPatch) });
        return json(rows[0] || permissionPatch);
      }
      if (request.method === "DELETE") {
        await dbRequest(env, `mailbox_delegations?mailbox_id=eq.${encodeURIComponent(mailboxId)}&member_id=eq.${encodeURIComponent(delegateUserId)}`, { method: "DELETE" });
        return json({ ok: true });
      }
    }
    if (url.pathname.endsWith("/delegates") && request.method === "GET") {
      const rows = await dbRequest<JsonRecord[]>(env, `mailbox_delegations?mailbox_id=eq.${encodeURIComponent(mailboxId)}&order=created_at.asc`);
      const users = await authUsers(env);
      return json(rows.map((row) => ({ ...row, email: users.find((user) => user.id === row.member_id)?.email || "", display_name: authUserDisplayName(users.find((user) => user.id === row.member_id) || { id: String(row.member_id) }) })));
    }
    if (request.method === "PATCH") {
      const body = (await request.json()) as JsonRecord;
      const mailboxPatch: JsonRecord = {};
      for (const [input, column] of [["displayName", "display_name"], ["canSend", "can_send"], ["canReceive", "can_receive"]] as const) if (input in body) mailboxPatch[column] = body[input];
      if (Object.keys(mailboxPatch).length) await dbRequest(env, `mailboxes?id=eq.${encodeURIComponent(mailboxId)}`, { method: "PATCH", body: JSON.stringify(mailboxPatch) });
      const existing = await getMailboxAdminSettings(env, mailbox);
      const settingsPatch: JsonRecord = { updated_at: new Date().toISOString() };
      for (const [input, column] of [["status", "status"], ["quotaBytes", "quota_bytes"], ["sendingLimitDaily", "sending_limit_daily"], ["inactivityDays", "inactivity_days"]] as const) if (input in body) settingsPatch[column] = input === "status" ? body[input] : Math.max(0, Number(body[input]));
      if (String(settingsPatch.status || "") === "archived") { mailboxPatch.can_send = false; mailboxPatch.can_receive = false; await dbRequest(env, `mailboxes?id=eq.${encodeURIComponent(mailboxId)}`, { method: "PATCH", body: JSON.stringify(mailboxPatch) }); }
      const rows = existing
        ? await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailboxId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(settingsPatch) })
        : await dbRequest<MailboxAdminSettings[]>(env, "mailbox_admin_settings", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ mailbox_id: mailboxId, organization_id: organization.id, ...settingsPatch }) });
      return json(rows[0] || settingsPatch);
    }
    if (request.method === "DELETE") {
      if (mailbox.is_default) return error("The default mailbox cannot be deleted; set another default first", 400);
      const objectKeys = await mailboxObjectKeys(env, mailboxId, mailbox.owner_id);
      await dbRequest(env, `mailboxes?id=eq.${encodeURIComponent(mailboxId)}`, { method: "DELETE" });
      await Promise.allSettled(objectKeys.map((key) => deleteObject(env, key)));
      return json({ ok: true });
    }
  }
  return error("Admin route not found", 404);
}

async function getMailbox(env: Env, ownerId: string, address: string): Promise<Mailbox | null> {
  const rows = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(ownerId)}&address=eq.${encodeURIComponent(cleanAddress(address))}&limit=1`);
  return rows[0] ?? null;
}

type MailboxDelegation = { mailbox_id: string; member_id: string; can_read: boolean; can_send_as: boolean; can_send_on_behalf: boolean; can_manage: boolean; status: "active" | "revoked" };

async function delegatedMailboxIds(env: Env, memberId: string, capability: "read" | "send" = "read"): Promise<string[]> {
  const capabilityFilter = capability === "read" ? "&can_read=eq.true" : "&or=(can_send_as.eq.true,can_send_on_behalf.eq.true)";
  const rows = await dbRequest<MailboxDelegation[]>(env, `mailbox_delegations?member_id=eq.${encodeURIComponent(memberId)}&status=eq.active${capabilityFilter}&select=mailbox_id`);
  return [...new Set(rows.map((row) => String(row.mailbox_id)).filter(Boolean))];
}

async function accessibleMailboxes(env: Env, userId: string): Promise<Array<Mailbox & { is_shared?: boolean; can_send_as?: boolean; can_send_on_behalf?: boolean }>> {
  const own = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(userId)}&order=is_default.desc,created_at.asc`);
  const delegated = await dbRequest<MailboxDelegation[]>(env, `mailbox_delegations?member_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=mailbox_id,can_read,can_send_as,can_send_on_behalf`);
  if (!delegated.length) return own;
  const mailboxIds = [...new Set(delegated.map((row) => String(row.mailbox_id)).filter(Boolean))];
  const shared = await dbRequest<Mailbox[]>(env, `mailboxes?id=in.(${mailboxIds.join(",")})&order=created_at.asc`);
  const grants = new Map(delegated.map((row) => [String(row.mailbox_id), row]));
  return [...own, ...shared.filter((mailbox) => mailbox.owner_id !== userId).map((mailbox) => {
    const grant = grants.get(mailbox.id);
    return {
      ...mailbox,
      is_shared: true,
      can_send: mailbox.can_send && Boolean(grant?.can_send_as || grant?.can_send_on_behalf),
      can_receive: mailbox.can_receive && grant?.can_read === true,
      can_send_as: grant?.can_send_as === true,
      can_send_on_behalf: grant?.can_send_on_behalf === true,
      is_default: false,
    };
  })];
}

async function delegatedMailboxForSend(env: Env, actorId: string, address: string): Promise<{ mailbox: Mailbox; delegation: MailboxDelegation | null } | null> {
  const normalized = cleanAddress(address);
  const owned = await getMailbox(env, actorId, normalized);
  if (owned) return { mailbox: owned, delegation: null };
  const candidates = await dbRequest<Mailbox[]>(env, `mailboxes?address=eq.${encodeURIComponent(normalized)}&can_send=eq.true&limit=20`);
  for (const mailbox of candidates) {
    const grants = await dbRequest<MailboxDelegation[]>(env, `mailbox_delegations?mailbox_id=eq.${encodeURIComponent(mailbox.id)}&member_id=eq.${encodeURIComponent(actorId)}&status=eq.active&limit=1`);
    const grant = grants[0];
    if (grant?.can_send_as || grant?.can_send_on_behalf) return { mailbox, delegation: grant };
  }
  return null;
}

function messageScopeFilter(ownerId: string, mailboxIds: string[]): string {
  if (!mailboxIds.length) return `owner_id=eq.${encodeURIComponent(ownerId)}`;
  const ids = mailboxIds.map((id) => id.replace(/[^a-f0-9-]/gi, "")).filter(Boolean).join(",");
  return ids ? `or=${encodeURIComponent(`owner_id.eq.${ownerId},mailbox_id.in.(${ids})`)}` : `owner_id=eq.${encodeURIComponent(ownerId)}`;
}

async function expandGroupRecipients(env: Env, organizationId: string | undefined, recipients: string[]): Promise<string[]> {
  if (!organizationId || !recipients.length) return recipients;
  const groups = await dbRequest<Array<{ id: string; address: string; enabled: boolean }>>(env, `organization_groups?organization_id=eq.${encodeURIComponent(organizationId)}&enabled=eq.true&select=id,address,enabled`).catch(() => []);
  if (!groups.length) return recipients;
  const groupsByAddress = new Map(groups.map((group) => [cleanAddress(group.address), group]));
  const expanded: string[] = [];
  for (const recipient of recipients) {
    const group = groupsByAddress.get(cleanAddress(recipient));
    if (!group) { expanded.push(recipient); continue; }
    const members = await dbRequest<Array<{ member_email: string }>>(env, `organization_group_members?group_id=eq.${encodeURIComponent(group.id)}&select=member_email&order=created_at.asc`).catch(() => []);
    expanded.push(...members.map((member) => cleanAddress(member.member_email)).filter(Boolean));
  }
  return [...new Set(expanded)];
}

async function groupList(env: Env, organizationId: string): Promise<JsonRecord[]> {
  const groups = await dbRequest<JsonRecord[]>(env, `organization_groups?organization_id=eq.${encodeURIComponent(organizationId)}&order=name.asc`);
  return Promise.all(groups.map(async (group) => ({
    ...group,
    members: await dbRequest<JsonRecord[]>(env, `organization_group_members?group_id=eq.${encodeURIComponent(String(group.id))}&order=created_at.asc`),
  })));
}

async function adminGroup(env: Env, organizationId: string, groupId: string): Promise<JsonRecord | null> {
  const rows = await dbRequest<JsonRecord[]>(env, `organization_groups?id=eq.${encodeURIComponent(groupId)}&organization_id=eq.${encodeURIComponent(organizationId)}&limit=1`);
  return rows[0] || null;
}

async function organizationHasMailboxAddress(env: Env, organizationId: string, address: string): Promise<boolean> {
  const members = await dbRequest<Array<{ user_id: string }>>(env, `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&select=user_id&limit=1000`).catch(() => []);
  if (!members.length) return false;
  const rows = await dbRequest<Array<{ id: string }>>(env, `mailboxes?owner_id=in.(${members.map((member) => member.user_id).join(",")})&address=eq.${encodeURIComponent(cleanAddress(address))}&limit=1`).catch(() => []);
  return Boolean(rows[0]);
}

async function findOrCreateThread(env: Env, ownerId: string, subject: string, inReplyTo?: string, references?: string): Promise<string> {
  const referencesList = [inReplyTo, ...(references || "").split(/\s+/)].filter((value): value is string => Boolean(value)).reverse();
  for (const reference of referencesList) {
    const rows = await dbRequest<Array<{ thread_id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&message_id_header=eq.${encodeURIComponent(reference)}&select=thread_id&limit=1`);
    if (rows[0]?.thread_id) return rows[0].thread_id;
  }
  const normalized = normalizeSubject(subject);
  const existing = await dbRequest<Array<{ id: string }>>(env, `threads?owner_id=eq.${encodeURIComponent(ownerId)}&subject_normalized=eq.${encodeURIComponent(normalized)}&order=last_message_at.desc&limit=1`);
  if (existing[0]) return existing[0].id;
  const created = await dbRequest<Array<{ id: string }>>(env, "threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, subject: subject || "(no subject)", subject_normalized: normalized }) });
  return created[0].id;
}

function isDangerousAttachment(filename: string, mimeType: string): boolean {
  return /\.(exe|dll|scr|js|vbs|cmd|bat|ps1|msi|jar|hta|iso|lnk)$/i.test(filename) || /application\/x-msdownload|application\/x-sh|application\/javascript/i.test(mimeType);
}

function isSuspiciousAttachment(filename: string, mimeType: string): boolean {
  return /\.(docm|dotm|xlsm|xltm|pptm|ppsm|zip|rar|7z)$/i.test(filename) || /application\/vnd\.ms-.*macroEnabled|application\/x-7z-compressed|application\/x-rar-compressed/i.test(mimeType);
}

function addressDomain(address: string): string {
  const normalized = cleanAddress(address);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
  return normalized.split("@").pop() || "";
}

function authStatus(header: string, mechanism: "spf" | "dkim" | "dmarc"): string | null {
  const match = header.match(new RegExp(`\\b${mechanism}=(pass|fail|softfail|neutral|none|temperror|permerror)\\b`, "i"));
  return match?.[1]?.toLowerCase() || null;
}

function authDomain(header: string, mechanism: "spf" | "dkim" | "dmarc", parameter: string): string | null {
  const result = header.match(new RegExp(`\\b${mechanism}=[^;]+`, "i"))?.[0] || "";
  const match = result.match(new RegExp(`\\b${parameter}=([^\\s;]+)`, "i"));
  return match?.[1]?.replace(/[<>]/g, "").toLowerCase() || null;
}

function domainsAlign(left: string | null, right: string): boolean {
  return Boolean(left && right && (left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)));
}

function urlHost(value: string): string {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ");
}

function hasDeceptiveLink(html: string): boolean {
  const anchorPattern = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const displayed = stripHtml(match[2]).trim();
    if (!displayed || !/^[a-z][a-z0-9+.-]*:\/\//i.test(displayed)) continue;
    const displayedDomain = displayed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
    if (!domainsAlign(displayedDomain.toLowerCase().replace(/[.,;:!?]+$/, ""), urlHost(match[1]))) return true;
  }
  return false;
}

type SenderPolicy = TrustPolicy;

const SENDER_POLICY_ACTIONS = new Set(["inbox", "spam", "screen", "archive", "folder"]);

function normalizeSenderPolicyValue(matchType: "address" | "domain", value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  if (matchType === "address") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter a complete email address");
  } else if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(normalized)) {
    throw new Error("Enter a domain such as example.com");
  }
  return normalized;
}

async function ensurePolicyMailbox(env: Env, ownerId: string, mailboxId: unknown): Promise<string | null> {
  const value = typeof mailboxId === "string" && mailboxId ? mailboxId : null;
  if (!value) return null;
  const rows = await dbRequest<Array<{ id: string }>>(env, `mailboxes?id=eq.${encodeURIComponent(value)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  if (!rows[0]) throw new Error("Mailbox not found");
  return value;
}

function policyMatchesMessage(policy: SenderPolicy, message: JsonRecord): boolean {
  if (policy.enabled === false) return false;
  if (policy.mailbox_id && policy.mailbox_id !== message.mailbox_id) return false;
  const address = cleanAddress(String(message.from_address || ""));
  const domain = addressDomain(address);
  return policy.match_type === "address" ? policy.match_value.toLowerCase() === address : policy.match_value.toLowerCase().replace(/^@/, "").replace(/\.$/, "") === domain;
}

async function recordScreeningFeedback(env: Env, ownerId: string, message: JsonRecord, feedback: "spam" | "not_spam"): Promise<void> {
  const id = String(message.id || "");
  const previousFolder = String(message.folder || "inbox");
  await dbRequest(env, "spam_feedback", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: id, feedback }) }).catch(() => undefined);
  await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: id, decision: feedback === "spam" ? "blocked" : "allowed", previous_folder: previousFolder }) }).catch(() => undefined);
  await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify({ folder: feedback === "spam" ? "spam" : "inbox", custom_folder_id: null, screening_status: feedback === "spam" ? "blocked" : "approved", updated_at: new Date().toISOString() }) });
}

async function applyPolicyToMessage(env: Env, ownerId: string, message: JsonRecord, policy: SenderPolicy): Promise<void> {
  const id = String(message.id || "");
  const previousFolder = String(message.folder || "inbox");
  const patch: JsonRecord = { screening_policy_id: policy.id, updated_at: new Date().toISOString() };
  let decision: "allowed" | "blocked" | "rerouted" | "screened" = "screened";
  if (policy.action === "spam") { patch.folder = "spam"; patch.custom_folder_id = null; patch.screening_status = "blocked"; decision = "blocked"; }
  else if (policy.action === "inbox") { patch.folder = "inbox"; patch.custom_folder_id = null; patch.screening_status = "approved"; decision = "allowed"; }
  else if (policy.action === "archive") { patch.folder = "archive"; patch.custom_folder_id = null; patch.screening_status = "rerouted"; decision = "rerouted"; }
  else if (policy.action === "folder") {
    if (!policy.target_folder_id) throw new Error("This folder policy has no destination");
    const folders = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(policy.target_folder_id)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
    if (!folders[0]) throw new Error("This folder policy points to a missing folder");
    patch.folder = "custom"; patch.custom_folder_id = policy.target_folder_id; patch.screening_status = "rerouted"; decision = "rerouted";
  } else if (policy.action === "screen") {
    patch.screening_status = "review";
    decision = "screened";
  }
  await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: id, policy_id: policy.id, decision, previous_folder: previousFolder }) }).catch(() => undefined);
}

async function saveAttachments(env: Env, ownerId: string, messageId: string, attachments: Array<{ filename?: string | null; mimeType?: string; content?: Uint8Array | ArrayBuffer | string; contentId?: string | null; disposition?: string | null }>): Promise<{ stored: StoredAttachment[]; blocked: string[] }> {
  const stored: StoredAttachment[] = [];
  const blocked: string[] = [];
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment.content) continue;
    const filename = (attachment.filename || `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const declaredContentType = attachment.mimeType || "application/octet-stream";
    const content = attachment.content instanceof Uint8Array ? attachment.content : attachment.content instanceof ArrayBuffer ? new Uint8Array(attachment.content) : new TextEncoder().encode(attachment.content);
    const detectedContentType = detectAttachmentContentType(filename, declaredContentType, content);
    const safety = buildAttachmentSafety(filename, declaredContentType, detectedContentType, content.byteLength);
    if (content.byteLength > 15 * 1024 * 1024 || safety.safetyStatus === "blocked") { blocked.push(filename); continue; }
    const objectKey = `attachments/${ownerId}/${messageId}/${crypto.randomUUID()}-${filename}`;
    await putObject(env, objectKey, content, detectedContentType);
    stored.push({ object_key: objectKey, filename, content_type: declaredContentType, detected_content_type: detectedContentType, byte_size: content.byteLength, sha256: await sha256Hex(content), preview_state: safety.previewState, safety_status: safety.safetyStatus, safety_reasons: safety.safetyReasons, content_id: attachment.contentId || undefined, disposition: attachment.disposition });
  }
  return { stored, blocked };
}

async function assessInbound(env: Env, ownerId: string, mailboxId: string, envelopeFrom: string, headerFrom: string, subject: string, textBody: string, htmlBody: string, parsed: { headers?: Array<{ key: string; value: string }>; attachments?: Array<{ filename?: string | null; mimeType?: string }> }): Promise<{ score: number; reasons: string[]; focusedScore: number; focusedCategory: string; authResults: TrustAuthResults; trustScore: number; trustReasons: string[]; trustEvidence: JsonRecord; receivedAuthAt: string | null; senderFirstSeen: boolean; knownContact: boolean; replyToMismatch: boolean; linkCount: number; trackingPixelCount: number; policyId: string | null; policyAction: string | null; policyTargetFolderId: string | null }> {
  let score = 0;
  let focusedScore = 0.5;
  const reasons: string[] = [];
  const authResults = normalizeAuthenticationResults(parsed.headers || []);
  const authHeader = authResults.header;
  const spf = authResults.spf;
  const dkim = authResults.dkim;
  const dmarc = authResults.dmarc;
  const authFailures = [spf, dkim, dmarc].filter((status) => status === "fail" || status === "softfail" || status === "permerror" || status === "temperror");
  if (dmarc === "fail") { score += 0.18; reasons.push("DMARC failure"); }
  if (authFailures.length) { score += 0.18 + Math.min(0.12, (authFailures.length - 1) * 0.06); reasons.push("authentication failure"); }
  if ([spf, dkim, dmarc].filter(Boolean).length >= 2 && authFailures.length === 0 && [spf, dkim, dmarc].every((status) => !status || status === "pass")) { score -= 0.08; reasons.push("authentication passed"); }
  if (envelopeFrom && headerFrom && cleanAddress(envelopeFrom) !== cleanAddress(headerFrom)) { score += 0.12; reasons.push("envelope/header sender mismatch"); }
  const visibleDomain = addressDomain(headerFrom);
  authenticationAlignmentMismatches(authResults, visibleDomain).forEach((mechanism) => {
    score += mechanism === "DMARC" ? 0.12 : 0.08;
    reasons.push(`${mechanism} alignment mismatch`);
  });
  const sender = cleanAddress(headerFrom || envelopeFrom);
  const replyTo = cleanAddress(headerValue(parsed, "reply-to") || headerFrom);
  const linkEvidence = extractTrustEvidence({ sender, replyTo, subject, textBody, htmlBody, authentication: authResults });
  if (linkEvidence.reply_to_mismatch) { score += 0.10; reasons.push("reply-to mismatch"); }
  const content = `${subject} ${textBody} ${stripHtml(htmlBody)}`;
  const urls = content.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  if (urls.length >= 5) { score += 0.10; reasons.push("many links"); }
  if (urls.some((url) => /(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly)\//i.test(url))) { score += 0.08; reasons.push("shortened link"); }
  if (urls.some((url) => /^(?:https?:\/\/)?(?:[^/]+@)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)/i.test(url) || urlHost(url).startsWith("xn--"))) { score += 0.08; reasons.push("suspicious link host"); }
  if (hasDeceptiveLink(htmlBody)) { score += 0.16; reasons.push("deceptive link text"); }
  if (linkEvidence.tracking_pixel_count) { score += Math.min(0.10, 0.04 + linkEvidence.tracking_pixel_count * 0.02); reasons.push("tracking pixel"); }
  const credentialRequest = /(?:verify|confirm|unlock|suspend|password|login|sign[ -]?in|security code|one[- ]?time code|account)/i.test(content);
  const urgency = /(?:urgent|immediately|action required|within \d+ hours?|expires?|final notice)/i.test(content);
  const paymentRequest = /(?:wire transfer|gift card|invoice|payment due|bank account|crypto(?:currency)?|wallet)/i.test(content);
  if ((credentialRequest && urgency) || (paymentRequest && urgency) || /(?:claim your prize|password expires|wire transfer|gift card)/i.test(content)) { score += 0.18; reasons.push("high-risk request"); }
  const blocked = (parsed.attachments || []).filter((item) => isDangerousAttachment(String(item.filename || ""), String(item.mimeType || "")));
  const suspicious = (parsed.attachments || []).filter((item) => isSuspiciousAttachment(String(item.filename || ""), String(item.mimeType || "")));
  if (blocked.length) { score = Math.max(score, 0.90); reasons.push("dangerous attachment"); }
  if (suspicious.length && !blocked.length) { score += 0.16; reasons.push("suspicious attachment type"); }
  if (!textBody.trim() && htmlBody) { score += 0.04; reasons.push("HTML-only message"); }
  const knownContact = await dbRequest<Array<{ id: string }>>(env, `contacts?owner_id=eq.${encodeURIComponent(ownerId)}&email=eq.${encodeURIComponent(sender)}&limit=1`).catch(() => []);
  const previous = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&from_address=eq.${encodeURIComponent(sender)}&select=id&order=created_at.desc&limit=25`).catch(() => []);
  if (knownContact[0]) { score -= 0.25; focusedScore += 0.35; reasons.push("known contact"); }
  if (previous[0]) { score -= 0.10; focusedScore += 0.10; } else { score += 0.03; reasons.push("new sender"); }
  if (previous.length) {
    const ids = previous.map((row) => row.id).join(",");
    const feedback = await dbRequest<Array<{ feedback: "spam" | "not_spam" }>>(env, `spam_feedback?owner_id=eq.${encodeURIComponent(ownerId)}&message_id=${encodeURIComponent(`in.(${ids})`)}&select=feedback`).catch(() => []);
    const spamReports = feedback.filter((row) => row.feedback === "spam").length;
    const notSpamReports = feedback.filter((row) => row.feedback === "not_spam").length;
    if (spamReports) { score += Math.min(0.24, spamReports * 0.08); reasons.push("sender reported as spam"); }
    if (notSpamReports) { score -= Math.min(0.36, notSpamReports * 0.12); reasons.push("sender restored as not spam"); }
  }
  const policies = await dbRequest<SenderPolicy[]>(env, `sender_policies?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&select=id,mailbox_id,match_type,match_value,action,target_folder_id,target_label_id`).catch(() => []);
  const senderPolicy = selectSenderPolicy(policies, mailboxId, sender);
  const explicitlyBlocked = senderPolicy?.action === "spam";
  const explicitlyAllowed = senderPolicy?.action === "inbox";
  if (explicitlyBlocked) reasons.push("blocked sender policy");
  if (explicitlyAllowed) reasons.push("safe sender policy");
  if (explicitlyAllowed && !blocked.length) score = Math.min(score - 0.35, 0.24);
  if (explicitlyBlocked || blocked.length) score = 1;
  if (/^no[-_]?reply@/i.test(sender)) focusedScore -= 0.2;
  score = Math.max(0, Math.min(1, score));
  focusedScore = Math.max(0, Math.min(1, focusedScore - score * 0.35));
  const trustScore = Math.max(0, Math.min(1, 1 - score));
  const trustEvidence = extractTrustEvidence({ sender, replyTo, subject, textBody, htmlBody, authentication: authResults, firstSeenSender: !previous[0], knownContact: Boolean(knownContact[0]), policyAction: senderPolicy?.action || null, policyId: senderPolicy?.id || null });
  return {
    score,
    reasons,
    focusedScore,
    focusedCategory: focusedScore >= 0.5 ? "focused" : "other",
    authResults,
    trustScore,
    trustReasons: reasons,
    trustEvidence,
    receivedAuthAt: authHeader ? new Date().toISOString() : null,
    senderFirstSeen: !previous[0],
    knownContact: Boolean(knownContact[0]),
    replyToMismatch: linkEvidence.reply_to_mismatch,
    linkCount: linkEvidence.link_count,
    trackingPixelCount: linkEvidence.tracking_pixel_count,
    policyId: senderPolicy?.id || null,
    policyAction: senderPolicy?.action || null,
    policyTargetFolderId: senderPolicy?.target_folder_id || null,
  };
}

type RuleContext = PureRuleContext;

function ruleMatches(rule: Rule, context: RuleContext): boolean {
  return evaluateRule(rule, context).matched;
}

async function applyRuleActions(env: Env, ownerId: string, messageId: string, actions: JsonRecord, forwardInbound?: (address: string) => Promise<void>): Promise<JsonRecord> {
  const patch: JsonRecord = {};
  if (typeof actions.folder === "string" && SYSTEM_FOLDERS.includes(actions.folder as typeof SYSTEM_FOLDERS[number])) {
    patch.folder = actions.folder;
    patch.custom_folder_id = null;
  }
  if (typeof actions.customFolderId === "string") {
    const folders = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(actions.customFolderId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
    if (folders[0]) {
      patch.folder = "custom";
      patch.custom_folder_id = actions.customFolderId;
    }
  }
  if (typeof actions.markRead === "boolean") patch.is_read = actions.markRead;
  if (typeof actions.star === "boolean") patch.is_starred = actions.star;
  if (typeof actions.pin === "boolean") patch.is_pinned = actions.pin;
  if (typeof actions.flag === "boolean") patch.is_flagged = actions.flag;
  if (typeof actions.priority === "number") patch.priority = Math.max(0, Math.min(2, actions.priority));
  if (Object.keys(patch).length) await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (typeof actions.label === "string" && actions.label.trim()) {
    const name = actions.label.trim();
    const labels = await dbRequest<Array<{ id: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&name=eq.${encodeURIComponent(name)}&limit=1`);
    const label = labels[0] || (await dbRequest<Array<{ id: string }>>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, name }) }))[0];
    if (label) await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: label.id }) });
  }
  if (typeof actions.forwardTo === "string" && forwardInbound) await forwardInbound(cleanAddress(actions.forwardTo));
  return patch;
}

async function applyInboundRules(env: Env, ownerId: string, messageId: string, context: RuleContext, forwardInbound?: (address: string) => Promise<void>): Promise<void> {
  const rules = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&order=priority.asc`);
  for (const rule of rules) {
    if (!ruleMatches(rule, context)) continue;
    const actions = rule.actions || {};
    await applyRuleActions(env, ownerId, messageId, actions, forwardInbound);
    if (actions.stopProcessing === true) break;
  }
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function buildRuleConditions(conditions: unknown, exceptions: unknown): JsonRecord {
  const next = { ...objectValue(conditions) };
  const exceptionObject = objectValue(exceptions);
  if (Object.keys(exceptionObject).length) next.exceptions = exceptionObject;
  else delete next.exceptions;
  return next;
}

type RuleMatch = { id: string; subject: string; fromAddress: string; snippet: string; folder: string; reasons: string[]; plannedActions: JsonRecord };
type RuleImpact = { folders: Record<string, number>; labels: number; markRead: number; forwardCount: number; total: number };

async function existingRuleMessages(env: Env, ownerId: string): Promise<JsonRecord[]> {
  return dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc,id.desc&limit=100&select=id,thread_id,mailbox_id,folder,custom_folder_id,previous_folder,from_address,to_addresses,cc_addresses,subject,snippet,text_body,is_read,is_starred,is_pinned,is_flagged,priority,has_attachment,work_state,follow_up_at,snoozed_until`);
}

function matchRuleMessages(rows: JsonRecord[], rule: Rule): { matches: RuleMatch[]; impact: RuleImpact } {
  const matches: RuleMatch[] = [];
  const impact: RuleImpact = { folders: {}, labels: 0, markRead: 0, forwardCount: 0, total: 0 };
  for (const message of rows) {
    const result = evaluateRule(rule, ruleContextFromMessage(message));
    if (!result.matched) continue;
    const match: RuleMatch = {
      id: String(message.id),
      subject: String(message.subject || "(no subject)"),
      fromAddress: String(message.from_address || "Unknown sender"),
      snippet: String(message.snippet || message.text_body || "").slice(0, 180),
      folder: String(message.folder || "inbox"),
      reasons: result.reasons,
      plannedActions: result.plannedActions,
    };
    matches.push(match);
    impact.total += 1;
    if (typeof result.plannedActions.folder === "string") impact.folders[String(result.plannedActions.folder)] = (impact.folders[String(result.plannedActions.folder)] || 0) + 1;
    if (typeof result.plannedActions.customFolderId === "string") impact.folders.custom = (impact.folders.custom || 0) + 1;
    if (typeof result.plannedActions.label === "string" && result.plannedActions.label.trim()) impact.labels += 1;
    if (typeof result.plannedActions.markRead === "boolean") impact.markRead += 1;
    if (typeof result.plannedActions.forwardTo === "string" && result.plannedActions.forwardTo.trim()) impact.forwardCount += 1;
  }
  return { matches, impact };
}

async function createRuleRun(env: Env, ownerId: string, ruleId: string, mode: "preview" | "dry_run" | "apply" | "replay", sample: unknown[] = []): Promise<string> {
  const rows = await dbRequest<Array<{ id: string }>>(env, "mail_rule_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, rule_id: ruleId, initiated_by: ownerId, mode, status: "started", sample: sample.slice(0, 20) }) });
  if (!rows[0]?.id) throw new Error("Could not create rule execution record");
  return rows[0].id;
}

async function finishRuleRun(env: Env, ownerId: string, runId: string, patch: JsonRecord): Promise<void> {
  await dbRequest(env, `mail_rule_runs?id=eq.${encodeURIComponent(runId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify({ ...patch, completed_at: new Date().toISOString() }) });
}

function ruleImpactText(impact: RuleImpact): JsonRecord {
  return { ...impact, folders: impact.folders };
}

async function applyExistingRuleMatches(env: Env, ownerId: string, rule: Rule, runId: string, matches: RuleMatch[], rows: JsonRecord[]): Promise<{ changedCount: number; failures: Array<{ id: string; error: string }> }> {
  const rowsById = new Map(rows.map((row) => [String(row.id), row]));
  const failures: Array<{ id: string; error: string }> = [];
  let changedCount = 0;
  for (const match of matches) {
    const row = rowsById.get(match.id);
    if (!row) continue;
    try {
      const before = bulkBeforeState(row);
      const beforeLabels = await dbRequest<Array<{ label_id: string }>>(env, `message_labels?message_id=eq.${encodeURIComponent(match.id)}&select=label_id`).catch(() => []);
      const patch = await applyRuleActions(env, ownerId, match.id, rule.actions || {});
      const afterLabels = await dbRequest<Array<{ label_id: string }>>(env, `message_labels?message_id=eq.${encodeURIComponent(match.id)}&select=label_id`).catch(() => []);
      const beforeIds = new Set(beforeLabels.map((label) => label.label_id));
      const addedLabelIds = afterLabels.map((label) => label.label_id).filter((id) => !beforeIds.has(id));
      const after = { ...before, ...patch, added_label_ids: addedLabelIds };
      await writeMessageAudit(env, ownerId, `rule-run:${runId}`, "rule_apply", row, before, after);
      changedCount += 1;
    } catch (applyError) {
      failures.push({ id: match.id, error: applyError instanceof Error ? applyError.message : "Rule action failed" });
    }
  }
  return { changedCount, failures };
}

async function sendViaBrevo(env: Env, input: { fromAddress: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string; replyTo?: string; idempotencyKey?: string; attachments?: Array<{ filename: string; object_key: string }> }): Promise<{ messageId?: string }> {
  const payload: JsonRecord = { sender: { email: input.fromAddress }, to: input.to.map((email) => ({ email })), subject: input.subject || "(no subject)", textContent: input.text || "", htmlContent: input.html || undefined, replyTo: { email: input.replyTo || input.fromAddress } };
  if (input.cc?.length) payload.cc = input.cc.map((email) => ({ email }));
  if (input.bcc?.length) payload.bcc = input.bcc.map((email) => ({ email }));
  if (input.attachments?.length) payload.attachment = await Promise.all(input.attachments.map(async (attachment) => ({ url: await signedObjectUrl(env, attachment.object_key), name: attachment.filename })));
  const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { accept: "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json", ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {}) }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  return result as { messageId?: string };
}

type RecoveryMethodRow = {
  id: string;
  owner_id: string;
  email: string;
  verified_at: string | null;
  verification_code_hash: string | null;
  verification_expires_at: string | null;
  verification_attempts: number;
  last_sent_at: string | null;
};

type RecoveryRateLimitRow = {
  email_hash: string;
  window_started_at: string;
  sent_count: number;
  last_sent_at: string | null;
};

function recoveryMethodView(row: RecoveryMethodRow): JsonRecord {
  return {
    id: row.id,
    email_masked: maskRecoveryEmail(row.email),
    verified_at: row.verified_at,
    pending: !row.verified_at,
    last_sent_at: row.last_sent_at,
  };
}

function recoveryCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function mfaRecoveryCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

async function handleMfaRecoveryRequest(request: Request, env: Env): Promise<Response> {
  const generic = json({ ok: true, message: "If the details are valid, a recovery link will arrive shortly." }, 202);
  let body: JsonRecord;
  try { body = (await request.json()) as JsonRecord; } catch { return generic; }
  const email = normalizeRecoveryEmail(String(body.email || ""));
  const code = String(body.code || "").trim().toUpperCase();
  if (!isValidRecoveryEmail(email) || !/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/.test(code)) return generic;
  try {
    const codeHash = await sha256Hex(new TextEncoder().encode(code));
    const rows = await dbRequest<Array<{ id: string; owner_id: string }>>(env, `account_mfa_recovery_codes?code_hash=eq.${encodeURIComponent(codeHash)}&used_at=is.null&limit=1`);
    const row = rows[0];
    if (!row) return generic;
    const users = await authUsers(env);
    const authUser = users.find((candidate) => candidate.id === row.owner_id);
    if (!authUser?.email || normalizeRecoveryEmail(authUser.email) !== email) return generic;
    await dbRequest(env, `account_mfa_recovery_codes?id=eq.${encodeURIComponent(row.id)}&owner_id=eq.${encodeURIComponent(row.owner_id)}&used_at=is.null`, { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) });
    const link = await generateRecoveryLink(env, authUser.email, new URL("/", request.url).toString());
    await sendViaBrevo(env, { fromAddress: await defaultFromAddress(env, row.owner_id), to: [authUser.email], subject: "Your Postveil recovery link", text: `Use this one-time link to regain access to Postveil and set a new password:\n\n${link}\n\nThis recovery code has now been consumed.` });
  } catch {
    // Keep recovery attempts indistinguishable from unknown or invalid details.
  }
  return generic;
}

async function defaultFromAddress(env: Env, ownerId?: string): Promise<string> {
  if (ownerId) {
    const rows = await dbRequest<Array<{ address: string }>>(
      env,
      `mailboxes?owner_id=eq.${encodeURIComponent(ownerId)}&is_default=eq.true&select=address&limit=1`,
    );
    if (rows[0]?.address) return rows[0].address;
  }
  return env.DEFAULT_FROM_EMAIL || "james@jamesfontanilla.com";
}

async function generateRecoveryLink(env: Env, email: string, redirectTo: string): Promise<string> {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const result = await client.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (result.error) throw result.error;
  const data = result.data as unknown as JsonRecord;
  const properties = data.properties as JsonRecord | undefined;
  const actionLink = String(properties?.action_link || data.action_link || "");
  if (!actionLink) throw new Error("Supabase did not return a recovery link");
  return actionLink;
}

async function recoveryRateLimit(env: Env, email: string): Promise<{ allowed: boolean; row: RecoveryRateLimitRow | null }> {
  const emailHash = await sha256Hex(new TextEncoder().encode(email));
  const rows = await dbRequest<RecoveryRateLimitRow[]>(
    env,
    `account_recovery_rate_limits?email_hash=eq.${encodeURIComponent(emailHash)}&limit=1`,
  );
  const row = rows[0] || null;
  if (!row) return { allowed: true, row: null };
  const windowActive = isRecent(row.window_started_at, 60 * 60 * 1000);
  if (!windowActive) return { allowed: true, row };
  return { allowed: row.sent_count < 5 && !isRecent(row.last_sent_at, 60 * 1000), row };
}

async function recordRecoverySend(env: Env, email: string, previous: RecoveryRateLimitRow | null): Promise<void> {
  const emailHash = await sha256Hex(new TextEncoder().encode(email));
  const activeWindow = previous && isRecent(previous.window_started_at, 60 * 60 * 1000);
  await dbRequest(env, "account_recovery_rate_limits", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      email_hash: emailHash,
      window_started_at: activeWindow ? previous.window_started_at : new Date().toISOString(),
      sent_count: activeWindow ? previous.sent_count + 1 : 1,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function handleRecoveryRequest(request: Request, env: Env): Promise<Response> {
  const generic = json({ ok: true, message: "If that address is registered, a recovery link will arrive shortly." }, 202);
  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return generic;
  }
  const email = normalizeRecoveryEmail(String(body.email || ""));
  if (!isValidRecoveryEmail(email)) return generic;
  try {
    const methods = await dbRequest<RecoveryMethodRow[]>(
      env,
      `account_recovery_methods?email=eq.${encodeURIComponent(email)}&verified_at=not.is.null&select=id,owner_id,email,verified_at,verification_code_hash,verification_expires_at,verification_attempts,last_sent_at&limit=1`,
    );
    const method = methods[0];
    if (!method) return generic;
    const rate = await recoveryRateLimit(env, email);
    if (!rate.allowed) return generic;
    const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(method.owner_id)}`, {
      headers: supabaseHeaders(env),
    });
    if (!userResponse.ok) return generic;
    const authUser = await userResponse.json() as { email?: string };
    const primaryEmail = normalizeRecoveryEmail(String(authUser.email || ""));
    if (!isValidRecoveryEmail(primaryEmail)) return generic;
    const redirectTo = new URL("/", request.url).toString();
    const link = await generateRecoveryLink(env, primaryEmail, redirectTo);
    const fromAddress = await defaultFromAddress(env, method.owner_id);
    await sendViaBrevo(env, {
      fromAddress,
      to: [email],
      subject: "Your Postveil password recovery link",
      text: `Use this one-time link to reset your Postveil password:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this one-time link to reset your Postveil password:</p><p><a href="${link}">Reset your Postveil password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
    await recordRecoverySend(env, email, rate.row);
  } catch {
    // Keep this response indistinguishable from an unknown address.
  }
  return generic;
}

async function ingestRawEmail(env: Env, raw: ArrayBuffer, envelopeFrom: string, envelopeTo: string, forwardInbound?: (address: string) => Promise<void>, ctx?: ExecutionContext): Promise<void> {
  if (raw.byteLength > maxEmailBytes(env)) throw new Error(`Inbound message exceeds the ${Math.round(maxEmailBytes(env) / 1024 / 1024)} MB limit`);
  const destination = cleanAddress(envelopeTo);
  const ownerId = env.OWNER_USER_ID;
  if (!ownerId) throw new Error("OWNER_USER_ID is not configured");
  const mailbox = await getMailbox(env, ownerId, destination);
  if (!mailbox) {
    const organizations = await dbRequest<Array<{ id: string }>>(env, `organizations?owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`).catch(() => []);
    const groups = organizations[0]
      ? await dbRequest<Array<{ id: string }>>(env, `organization_groups?organization_id=eq.${encodeURIComponent(organizations[0].id)}&address=eq.${encodeURIComponent(destination)}&enabled=eq.true&limit=1`).catch(() => [])
      : [];
    if (groups[0] && forwardInbound) {
      const members = await dbRequest<Array<{ member_email: string }>>(env, `organization_group_members?group_id=eq.${encodeURIComponent(groups[0].id)}&select=member_email&order=created_at.asc`).catch(() => []);
      const recipients = [...new Set(members.map((member) => cleanAddress(member.member_email)).filter(Boolean))];
      if (!recipients.length) throw new Error(`Group address ${destination} has no recipients`);
      await Promise.all(recipients.map((recipient) => forwardInbound(recipient)));
      return;
    }
    throw new Error(`No receiving mailbox configured for ${destination}`);
  }
  const parsed = await new PostalMime().parse(raw);
  const subject = String(parsed.subject || "(no subject)");
  const textBody = String(parsed.text || "");
  const htmlBody = String(parsed.html || "");
  const messageIdHeader = headerValue(parsed, "message-id") || `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  const duplicate = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&message_id_header=eq.${encodeURIComponent(messageIdHeader)}&limit=1`);
  if (duplicate[0]) return;
  const sender = senderIdentity(parsed, envelopeFrom);
  const headerFrom = sender.address;
  const fromName = sender.name;
  const inReplyTo = headerValue(parsed, "in-reply-to") || null;
  const references = headerValue(parsed, "references") || null;
  const messageId = crypto.randomUUID();
  const threadId = await findOrCreateThread(env, ownerId, subject, inReplyTo || undefined, references || undefined);
  const toAddresses = splitAddresses(headerValue(parsed, "to") || destination);
  const ccAddresses = splitAddresses(headerValue(parsed, "cc") || "");
  const rawHeaders = (parsed.headers || []).slice(0, 200).map((header) => ({ key: String(header.key || "").slice(0, 200), value: String(header.value || "").slice(0, 4000) }));
  const mimeParts = mimePartSummary(parsed);
  const threadFingerprint = await sha256Hex(new TextEncoder().encode(`${ownerId}\n${normalizeSubject(subject)}\n${headerFrom}\n${toAddresses.join(",")}`));
  const receivedAt = new Date().toISOString();
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: messageId, owner_id: ownerId, thread_id: threadId, mailbox_id: mailbox.id, direction: "inbound", folder: "inbox", status: "queued", delivery_status: "received", screening_status: "none", from_name: fromName, from_address: headerFrom, to_addresses: toAddresses, cc_addresses: ccAddresses, reply_to: cleanAddress(headerValue(parsed, "reply-to") || headerFrom), subject, text_body: textBody, html_body: htmlBody || null, snippet: snippet(textBody || htmlBody.replace(/<[^>]+>/g, " ")), message_id_header: messageIdHeader, in_reply_to: inReplyTo, references_header: references, raw_object_key: null, has_attachment: Boolean(parsed.attachments?.length), spam_score: 0, spam_reasons: [], focused_score: 0.5, focused_category: "focused", auth_results: {}, message_size_bytes: raw.byteLength, max_size_bytes: maxEmailBytes(env), raw_headers: rawHeaders, mime_parts: mimeParts, thread_fingerprint: threadFingerprint, inbound_event_id: messageIdHeader, received_at: receivedAt }) });
  if (!inserted[0]) throw new Error("Message insert returned no row");

  const finishInbound = async (): Promise<void> => {
    try {
      const assessment = await assessInbound(env, ownerId, mailbox.id, envelopeFrom, headerFrom, subject, textBody, htmlBody, parsed);
      const rawKey = `raw/${ownerId}/${messageId}.eml`;
      await putObject(env, rawKey, new Uint8Array(raw), "message/rfc822");
      const attachmentResult = await saveAttachments(env, ownerId, messageId, parsed.attachments ?? []);
      const reasons = [...assessment.reasons, ...(attachmentResult.blocked.length ? [`blocked attachments: ${attachmentResult.blocked.join(", ")}`] : [])];
      const explicitPolicy = assessment.policyAction;
      const customFolderId = explicitPolicy === "folder" ? assessment.policyTargetFolderId : null;
      const folder = explicitPolicy === "screen" ? "inbox" : explicitPolicy === "archive" && assessment.score < SPAM_THRESHOLD ? "archive" : explicitPolicy === "folder" && customFolderId && assessment.score < SPAM_THRESHOLD ? "custom" : assessment.score >= SPAM_THRESHOLD || explicitPolicy === "spam" ? "spam" : "inbox";
      const screeningStatus = explicitPolicy === "screen" || (assessment.score >= 0.35 && assessment.score < SPAM_THRESHOLD) ? "review" : folder === "spam" ? "blocked" : "none";
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify({ folder, custom_folder_id: folder === "custom" ? customFolderId : null, status: "received", delivery_status: "received", screening_status: screeningStatus, screening_policy_id: assessment.policyId, raw_object_key: rawKey, has_attachment: Boolean(parsed.attachments?.length), spam_score: assessment.score, spam_reasons: reasons, focused_score: assessment.focusedScore, focused_category: assessment.focusedCategory, auth_results: assessment.authResults, auth_spf: assessment.authResults.spf, auth_dkim: assessment.authResults.dkim, auth_dmarc: assessment.authResults.dmarc, auth_arc: assessment.authResults.arc, auth_tls: assessment.authResults.tls, trust_score: assessment.trustScore, trust_reasons: reasons, trust_evidence: { ...assessment.trustEvidence, blocked_attachments: attachmentResult.blocked }, received_auth_at: assessment.receivedAuthAt, sender_first_seen: assessment.senderFirstSeen, known_contact: assessment.knownContact, reply_to_mismatch: assessment.replyToMismatch, link_count: assessment.linkCount, tracking_pixel_count: assessment.trackingPixelCount, updated_at: new Date().toISOString() }) });
      await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: messageId, policy_id: assessment.policyId, decision: screeningStatus === "blocked" ? "blocked" : screeningStatus === "review" ? "screened" : "allowed", previous_folder: "inbox" }) }).catch(() => undefined);
      if (attachmentResult.stored.length) await dbRequest(env, "attachments", { method: "POST", body: JSON.stringify(attachmentResult.stored.map((attachment) => ({ ...attachment, owner_id: ownerId, message_id: messageId }))) });
      const mailboxSettings = await getMailboxAdminSettings(env, mailbox);
      if (mailboxSettings && attachmentResult.stored.length) {
        const storedBytes = attachmentResult.stored.reduce((total, attachment) => total + Math.max(0, Number(attachment.byte_size || 0)), 0);
        await dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}`, { method: "PATCH", body: JSON.stringify({ storage_used_bytes: mailboxSettings.storage_used_bytes + storedBytes, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
      }
      await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}`, { method: "PATCH", body: JSON.stringify({ last_message_at: new Date().toISOString() }) });
      await applyInboundRules(env, ownerId, messageId, {
        from: headerFrom,
        to: toAddresses,
        cc: ccAddresses,
        subject,
        body: textBody,
        hasAttachment: Boolean(parsed.attachments?.length),
        isRead: false,
        isFlagged: false,
        isPinned: false,
        priority: 0,
        folder,
      }, forwardInbound);
      const autoReplies = await dbRequest<Array<{ enabled: boolean; subject: string; body: string; starts_at: string | null; ends_at: string | null }>>(env, `auto_replies?owner_id=eq.${encodeURIComponent(ownerId)}&mailbox_id=eq.${encodeURIComponent(mailbox.id)}&enabled=eq.true&limit=1`);
      const autoReply = autoReplies[0];
      const now = Date.now();
      if (autoReply && (!autoReply.starts_at || now >= Date.parse(autoReply.starts_at)) && (!autoReply.ends_at || now <= Date.parse(autoReply.ends_at)) && headerFrom !== destination && !/auto-submitted|list-/i.test(headerValue(parsed, "auto-submitted") || "")) await sendViaBrevo(env, { fromAddress: destination, to: [headerFrom], subject: autoReply.subject, text: autoReply.body, replyTo: destination });
    } catch (processingError) {
      const note = processingError instanceof Error ? processingError.message.slice(0, 500) : "Inbound processing failed";
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed", delivery_status: "failed", delivery_error_code: "inbound_processing_failed", delivery_error: note, work_note: note, updated_at: new Date().toISOString() }) }).catch(() => undefined);
      console.error("Inbound processing failed", processingError);
    }
  };
  if (ctx) ctx.waitUntil(finishInbound());
  else await finishInbound();
}

type OutboundAttachment = { filename: string; object_key: string; byte_size?: number; content_type?: string; detected_content_type?: string; sha256?: string; preview_state?: string; safety_status?: string; safety_reasons?: string[] };

async function domainReputation(env: Env, organizationId: string | undefined, domain: string): Promise<JsonRecord | null> {
  if (!organizationId || !domain || domain === "unknown") return null;
  const rows = await dbRequest<JsonRecord[]>(env, `domain_reputation?organization_id=eq.${encodeURIComponent(organizationId)}&domain=eq.${encodeURIComponent(domain)}&limit=1`).catch(() => []);
  return rows[0] || null;
}

async function enforceDomainQuota(env: Env, organizationId: string | undefined, fromAddress: string): Promise<void> {
  const row = await domainReputation(env, organizationId, domainOf(fromAddress));
  if (!row) return;
  if (String(row.status) === "suspended" && (!row.suspended_until || Date.parse(String(row.suspended_until)) > Date.now())) throw new Error("Sending is temporarily suspended for this domain because of reputation risk");
  const today = new Date().toISOString().slice(0, 10);
  const used = String(row.sent_window_started_at || "") === today ? Number(row.sent_used_today || 0) : 0;
  const limit = Number(row.daily_limit || 0);
  if (limit > 0 && used >= limit) throw new Error("This sending domain has reached its daily quota");
}

async function recordDomainOutcome(env: Env, organizationId: string | undefined, domain: string, kind: "sent" | "delivered" | "bounced" | "complaint"): Promise<void> {
  if (!organizationId || !domain || domain === "unknown") return;
  const current = await domainReputation(env, organizationId, domain);
  const today = new Date().toISOString().slice(0, 10);
  const sentCount = Number(current?.sent_count || 0) + (kind === "sent" ? 1 : 0);
  const deliveredCount = Number(current?.delivered_count || 0) + (kind === "delivered" ? 1 : 0);
  const bouncedCount = Number(current?.bounced_count || 0) + (kind === "bounced" ? 1 : 0);
  const complaintCount = Number(current?.complaint_count || 0) + (kind === "complaint" ? 1 : 0);
  const bounceRate = sentCount ? bouncedCount / sentCount : 0;
  const complaintRate = sentCount ? complaintCount / sentCount : 0;
  const score = Math.max(0, Math.min(1, 1 - bounceRate * 1.5 - complaintRate * 8));
  const status = complaintRate >= 0.01 || (sentCount >= 20 && bounceRate >= 0.25) ? "suspended" : complaintRate >= 0.005 || (sentCount >= 20 && bounceRate >= 0.1) ? "restricted" : score < 0.9 ? "watch" : "healthy";
  const suspendedUntil = status === "suspended" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : current?.suspended_until || null;
  const patch: JsonRecord = { organization_id: organizationId, domain, sent_count: sentCount, delivered_count: deliveredCount, bounced_count: bouncedCount, complaint_count: complaintCount, score: Number(score.toFixed(4)), status, suspended_until: suspendedUntil, sent_window_started_at: today, sent_used_today: String(current?.sent_window_started_at || "") === today ? Number(current?.sent_used_today || 0) + (kind === "sent" ? 1 : 0) : kind === "sent" ? 1 : 0, updated_at: new Date().toISOString() };
  if (current?.id) await dbRequest(env, `domain_reputation?id=eq.${encodeURIComponent(String(current.id))}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => undefined);
  else await dbRequest(env, "domain_reputation?on_conflict=organization_id,domain", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(patch) }).catch(() => undefined);
  if (status === "suspended" && (!current || current.status !== "suspended")) await dbRequest(env, "abuse_actions", { method: "POST", body: JSON.stringify({ organization_id: organizationId, action: "suspended", reason: `Domain reputation crossed the automatic safety threshold (${Math.round(bounceRate * 100)}% bounce, ${Math.round(complaintRate * 100)}% complaint)`, metadata: { domain, sentCount, bounceRate, complaintRate } }) }).catch(() => undefined);
}

async function sendOutboxMessage(env: Env, message: JsonRecord): Promise<{ messageId?: string; provider?: ProviderName }> {
  const attachmentRows = await dbRequest<Array<{ filename: string; object_key: string; content_type?: string; byte_size?: number }>>(env, `attachments?message_id=eq.${encodeURIComponent(String(message.id))}&select=filename,object_key,content_type,byte_size&order=created_at.asc`);
  const attachments: DeliveryAttachment[] = await Promise.all(attachmentRows.map(async (attachment) => ({ filename: attachment.filename, contentType: attachment.content_type || "application/octet-stream", byteSize: Number(attachment.byte_size || 0), bytes: await readObject(env, attachment.object_key), url: await signedObjectUrl(env, attachment.object_key) })));
  const mailboxSettings = message.mailbox_id ? (await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(String(message.mailbox_id))}&limit=1`).catch(() => []))[0] : undefined;
  const organizationId = mailboxSettings?.organization_id;
  const input: DeliveryInput = { fromAddress: String(message.from_address), to: Array.isArray(message.to_addresses) ? message.to_addresses.map(String) : [], cc: Array.isArray(message.cc_addresses) ? message.cc_addresses.map(String) : [], bcc: Array.isArray(message.bcc_addresses) ? message.bcc_addresses.map(String) : [], subject: String(message.subject || "(no subject)"), text: String(message.text_body || ""), html: typeof message.html_body === "string" ? message.html_body : undefined, replyTo: String(message.reply_to || message.from_address), idempotencyKey: typeof message.send_idempotency_key === "string" ? message.send_idempotency_key : undefined, messageIdHeader: typeof message.message_id_header === "string" ? message.message_id_header : undefined, openTrackingEnabled: message.open_tracking_enabled === true, clickTrackingEnabled: message.click_tracking_enabled === true, attachments };
  const configs = await providerConfigs(env, organizationId);
  let lastFailure: ReturnType<typeof providerFailure> | null = null;
  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index];
    if (await providerIsCircuitOpen(env, organizationId, config.provider)) continue;
    const attemptNumber = Math.max(1, Number(message.send_attempts || 1) + index);
    const startedAt = new Date().toISOString();
    await deliveryAttempt(env, message, config.provider, attemptNumber, "started", { started_at: startedAt });
    try {
      const result = await sendThroughProvider(config.provider, env, input, config.config || {});
      await deliveryAttempt(env, message, config.provider, attemptNumber, "accepted", { provider_message_id: result.providerMessageId || null, response_status: result.responseStatus, completed_at: new Date().toISOString(), metadata: { latency_ms: result.latencyMs } });
      await updateProviderHealth(env, organizationId, config.provider, { success: true, latencyMs: result.latencyMs, status: result.responseStatus });
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ status: "sent", delivery_status: "accepted", folder: "sent", sent_at: new Date().toISOString(), provider: config.provider, provider_message_id: result.providerMessageId || null, delivery_error_code: null, delivery_error: null, next_delivery_at: null, scheduled_at: null, send_after: null, send_lease_until: null, work_note: "", updated_at: new Date().toISOString() }) });
      await dbRequest(env, `delivery_queue?message_id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ status: "succeeded", last_provider: config.provider, last_error_code: null, last_error: null, locked_until: null, updated_at: new Date().toISOString() }) }).catch(() => undefined);
      await recordDomainOutcome(env, organizationId, domainOf(input.fromAddress), "sent");
      await updateProviderHealth(env, organizationId, config.provider, { success: true, latencyMs: result.latencyMs, status: result.responseStatus });
      return { messageId: result.providerMessageId, provider: config.provider };
    } catch (sendError) {
      lastFailure = providerFailure(sendError, config.provider);
      await deliveryAttempt(env, message, config.provider, attemptNumber, "failed", { response_status: lastFailure.status, error_code: lastFailure.code, error_message: lastFailure.message, retryable: lastFailure.retryable, completed_at: new Date().toISOString() });
      await updateProviderHealth(env, organizationId, config.provider, { success: false, status: lastFailure.status, error: lastFailure.message });
    }
  }
  const exhausted = lastFailure || { provider: "smtp" as ProviderName, status: 503, code: "no_provider", message: "No configured delivery provider is available", retryable: true };
  const failure = new Error(`${providerLabel(exhausted.provider)}: ${exhausted.message}`) as Error & { delivery?: ReturnType<typeof providerFailure> };
  failure.delivery = exhausted;
  throw failure;
}

async function processOutbox(env: Env, limit = 25): Promise<void> {
  const now = new Date().toISOString();
  const leaseFilter = encodeURIComponent(`(send_lease_until.is.null,send_lease_until.lt.${now})`);
  const candidates = await dbRequest<JsonRecord[]>(env, `messages?status=in.(queued,scheduled)&send_after=lte.${encodeURIComponent(now)}&cancelled_at=is.null&or=${leaseFilter}&order=send_after.asc&limit=${limit}`);
  for (const candidate of candidates) {
    const id = String(candidate.id || "");
    if (!id || !canClaimOutbox(candidate)) continue;
    const leaseUntil = new Date(Date.now() + 60_000).toISOString();
    const claimed = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&status=in.(queued,scheduled)&cancelled_at=is.null&or=${leaseFilter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ send_lease_until: leaseUntil, send_attempts: Number(candidate.send_attempts || 0) + 1, updated_at: new Date().toISOString() }) }).catch(() => []);
    if (!claimed[0]) continue;
    await dbRequest(env, `delivery_queue?message_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: "running", locked_until: leaseUntil, attempt_count: Number(claimed[0].send_attempts || 1), updated_at: new Date().toISOString() }) }).catch(() => undefined);
    try {
      await sendOutboxMessage(env, claimed[0]);
    } catch (sendError) {
      const delivery = sendError && typeof sendError === "object" && "delivery" in sendError ? (sendError as { delivery?: ReturnType<typeof providerFailure> }).delivery : undefined;
      const attempt = Number(claimed[0].send_attempts || 1);
      const retryable = delivery?.retryable !== false;
      const retryAt = new Date(Date.now() + computeExponentialBackoff(attempt)).toISOString();
      const shouldRetry = retryable && attempt < maxRetryAttempts(env);
      const messagePatch: JsonRecord = { status: shouldRetry ? "queued" : "failed", delivery_status: shouldRetry ? "delayed" : "failed", send_lease_until: null, send_after: shouldRetry ? retryAt : null, next_delivery_at: shouldRetry ? retryAt : null, delayed_at: shouldRetry ? new Date().toISOString() : null, delivery_error_code: delivery?.code || "delivery_failed", delivery_error: delivery?.message || (sendError instanceof Error ? sendError.message : "Send failed"), work_note: delivery?.message || (sendError instanceof Error ? sendError.message.slice(0, 500) : "Send failed"), updated_at: new Date().toISOString() };
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(messagePatch) }).catch(() => undefined);
      await dbRequest(env, `delivery_queue?message_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: shouldRetry ? "retrying" : "dead", available_at: shouldRetry ? retryAt : new Date().toISOString(), locked_until: null, attempt_count: attempt, last_provider: delivery?.provider || null, last_error_code: delivery?.code || "delivery_failed", last_error: delivery?.message || "Send failed", updated_at: new Date().toISOString() }) }).catch(() => undefined);
    }
  }
}

async function handleSend(env: Env, ownerId: string | null, body: JsonRecord, ctx?: ExecutionContext): Promise<Response> {
  const fromAddress = cleanAddress(String(body.fromAddress || `james@${env.APP_DOMAIN}`));
  const toInput = splitAddresses(body.to);
  const ccInput = splitAddresses(body.cc);
  const bccInput = splitAddresses(body.bcc);
  const access = ownerId ? await delegatedMailboxForSend(env, ownerId, fromAddress) : null;
  const mailbox = access?.mailbox || null;
  const sendMode = access?.delegation
    ? body.sendMode === "send_on_behalf" && access.delegation.can_send_on_behalf
      ? "send_on_behalf"
      : access.delegation.can_send_as
        ? "send_as"
        : access.delegation.can_send_on_behalf
          ? "send_on_behalf"
          : "own"
    : "own";
  const mailboxAdminSettings = ownerId && mailbox ? await getMailboxAdminSettings(env, mailbox) : null;
  const to = mailboxAdminSettings ? await expandGroupRecipients(env, mailboxAdminSettings.organization_id, toInput) : toInput;
  const cc = mailboxAdminSettings ? await expandGroupRecipients(env, mailboxAdminSettings.organization_id, ccInput) : ccInput;
  const bcc = mailboxAdminSettings ? await expandGroupRecipients(env, mailboxAdminSettings.organization_id, bccInput) : bccInput;
  if (!fromAddress || !to.length) return error("A sender and at least one recipient are required");
  const recipientCount = to.length + cc.length + bcc.length;
  if (recipientCount > maxRecipients(env)) return error(`This message has too many recipients (maximum ${maxRecipients(env)})`, 413);
  if (ownerId && !mailbox?.can_send) return error("This sender address is not enabled for sending", 403);
  if (ownerId && mailboxAdminSettings && mailboxAdminSettings.status !== "active") return error("This mailbox is currently suspended", 403);
  if (ownerId && mailboxAdminSettings && mailboxAdminSettings.sending_limit_daily > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = mailboxAdminSettings.sending_window_started_at === today ? mailboxAdminSettings.sending_used_today : 0;
    if (usedToday >= mailboxAdminSettings.sending_limit_daily) return error("This mailbox has reached its daily sending limit", 429);
  }
  const subject = String(body.subject || "(no subject)");
  const text = String(body.text || "");
  const html = typeof body.html === "string" ? body.html : undefined;
  const replyTo = cleanAddress(String(body.replyTo || fromAddress));
  await enforceDomainQuota(env, mailboxAdminSettings?.organization_id, fromAddress);
  const attachments: OutboundAttachment[] = Array.isArray(body.attachments) ? body.attachments.filter((item): item is OutboundAttachment => Boolean(item && typeof item.filename === "string" && typeof item.object_key === "string")).map((item) => ({ filename: item.filename.slice(0, 180), object_key: item.object_key, byte_size: Number(item.byte_size || 0), content_type: item.content_type, detected_content_type: item.detected_content_type, sha256: item.sha256, preview_state: item.preview_state, safety_status: item.safety_status, safety_reasons: item.safety_reasons })) : [];
  const suppressed = await suppressedRecipients(env, mailboxAdminSettings?.organization_id, [...to, ...cc, ...bcc]);
  if (suppressed.size) return error(`Delivery blocked for suppressed recipient${suppressed.size === 1 ? "" : "s"}: ${[...suppressed].join(", ")}`, 422);
  const messageBytes = messageSizeBytes({ subject, text, html, to, cc, bcc, attachments });
  if (messageBytes > maxEmailBytes(env)) return error(`This message exceeds the ${Math.round(maxEmailBytes(env) / 1024 / 1024)} MB limit`, 413);
  const openTrackingEnabled = body.openTrackingEnabled === true;
  const clickTrackingEnabled = body.clickTrackingEnabled === true;
  const warnings = ownerId ? buildSendWarnings({ fromAddress, mailboxAddress: mailbox?.address, mailboxCanSend: mailbox?.can_send, to, cc, bcc, replyTo, subject, text, attachmentCount: attachments.length }) : [];
  const acknowledged = new Set(Array.isArray(body.warningsAcknowledged) ? body.warningsAcknowledged.map(String) : []);
  const unacknowledgedWarnings = warnings.filter((warning) => !acknowledged.has(warning.code));
  if (unacknowledgedWarnings.length) return json({ ok: false, requiresConfirmation: true, warnings: unacknowledgedWarnings }, 409);
  const messageIdHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  if (!ownerId) {
    const result = await sendViaBrevo(env, { fromAddress, to, cc, bcc, subject, text, html, replyTo, attachments });
    return json({ ok: true, providerMessageId: result.messageId });
  }
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 200) : crypto.randomUUID();
  const mailboxOwnerId = mailbox?.owner_id || ownerId;
  const duplicate = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&send_idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,folder,send_after,scheduled_at&limit=1`);
  if (duplicate[0]) return json({ ok: true, replayed: true, id: duplicate[0].id, status: duplicate[0].status, scheduled: duplicate[0].status === "scheduled" });
  for (const attachment of attachments) if (!attachment.object_key.startsWith(`drafts/${ownerId}/`) && !attachment.object_key.startsWith(`attachments/${ownerId}/`)) return error("Attachment ownership could not be verified", 403);
  let threadId = typeof body.threadId === "string" && body.threadId ? body.threadId : "";
  if (threadId) {
    const threadRows = await dbRequest<Array<{ id: string }>>(env, `threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&limit=1`);
    if (!threadRows[0]) return error("The selected conversation is not available to this mailbox", 403);
  } else {
    threadId = await findOrCreateThread(env, mailboxOwnerId, subject, typeof body.inReplyTo === "string" ? body.inReplyTo : undefined, typeof body.references === "string" ? body.references : undefined);
  }
  const scheduledInput = typeof body.scheduledAt === "string" && body.scheduledAt ? body.scheduledAt : null;
  const scheduledDate = scheduledInput ? new Date(scheduledInput) : null;
  if (scheduledInput && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) return error("Scheduled send time must be in the future");
  const configuredUndo = normalizeUndoSeconds(objectValue(mailbox?.settings).send_undo_seconds, 0);
  const undoSeconds = scheduledDate ? 0 : normalizeUndoSeconds(body.undoSendSeconds, configuredUndo);
  const sendAfter = scheduledDate ? scheduledDate.toISOString() : new Date(Date.now() + undoSeconds * 1000).toISOString();
  const threadFingerprint = await sha256Hex(new TextEncoder().encode(`${mailboxOwnerId}\n${normalizeSubject(subject)}\n${fromAddress}\n${to.join(",")}`));
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: mailboxOwnerId, sent_by: ownerId, send_mode: sendMode, thread_id: threadId, mailbox_id: mailbox?.id, direction: "outbound", folder: scheduledDate ? "drafts" : "sent", status: scheduledDate ? "scheduled" : "queued", delivery_status: "queued", from_name: mailbox?.display_name || "", from_address: fromAddress, to_addresses: to, cc_addresses: cc, bcc_addresses: bcc, reply_to: replyTo, subject, text_body: text, html_body: html || null, snippet: snippet(text), message_id_header: messageIdHeader, in_reply_to: typeof body.inReplyTo === "string" ? body.inReplyTo : null, references_header: typeof body.references === "string" ? body.references : null, has_attachment: attachments.length > 0, message_size_bytes: messageBytes, max_size_bytes: maxEmailBytes(env), open_tracking_enabled: openTrackingEnabled, click_tracking_enabled: clickTrackingEnabled, thread_fingerprint: threadFingerprint, scheduled_at: scheduledDate?.toISOString() || null, send_after: sendAfter, next_delivery_at: sendAfter, send_idempotency_key: idempotencyKey, send_warning_acknowledged: Object.fromEntries(warnings.map((warning) => [warning.code, true])), sent_at: null }) });
  const messageId = inserted[0]?.id;
  if (!messageId) return error("The message could not be queued", 502);
  await dbRequest(env, "delivery_queue", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, owner_id: mailboxOwnerId, status: "queued", available_at: sendAfter, attempt_count: 0 }) });
  await putObject(env, `raw/${mailboxOwnerId}/${messageId}.eml`, rawMessageSource({ from: fromAddress, to, cc, bcc, subject, text, html, replyTo, messageId: messageIdHeader }), "message/rfc822").then(() => dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, { method: "PATCH", body: JSON.stringify({ raw_object_key: `raw/${mailboxOwnerId}/${messageId}.eml`, updated_at: new Date().toISOString() }) })).catch(() => undefined);
  if (mailboxAdminSettings && mailbox) {
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = mailboxAdminSettings.sending_window_started_at === today ? mailboxAdminSettings.sending_used_today : 0;
    await dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}`, { method: "PATCH", body: JSON.stringify({ sending_used_today: usedToday + 1, sending_window_started_at: today, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
  }
  if (attachments.length) {
    await dbRequest(env, "attachments", {
      method: "POST",
      body: JSON.stringify(attachments.map((attachment) => ({
        owner_id: ownerId,
        message_id: messageId,
        object_key: attachment.object_key,
        filename: attachment.filename,
        content_type: attachment.content_type || "application/octet-stream",
        detected_content_type: attachment.detected_content_type || attachment.content_type || "application/octet-stream",
        byte_size: attachment.byte_size || 0,
        sha256: attachment.sha256 || null,
        preview_state: attachment.preview_state === "ready" ? "ready" : "not_available",
        safety_status: ["unknown", "suspicious", "blocked", "infected"].includes(String(attachment.safety_status)) ? attachment.safety_status : "unknown",
        safety_reasons: Array.isArray(attachment.safety_reasons) ? attachment.safety_reasons : ["No malware scanner is configured"],
      }))),
    });
  }
  const run = async () => { if (undoSeconds) await new Promise<void>((resolve) => setTimeout(resolve, undoSeconds * 1000)); await processOutbox(env); };
  if (ctx) { if (scheduledDate) return json({ ok: true, id: messageId, scheduled: true, sendAfter }); ctx.waitUntil(run()); return json({ ok: true, id: messageId, status: "queued", sendAfter, undoSeconds }); }
  await run();
  return json({ ok: true, id: messageId, status: "queued", sendAfter, undoSeconds });
}

async function processScheduled(env: Env): Promise<void> {
  await enforceAllOrganizationInactivity(env);
  await processOutbox(env);
  await detectDelayedMessages(env);
  const now = new Date().toISOString();
  const snoozed = await dbRequest<JsonRecord[]>(env, `messages?snoozed_until=lte.${encodeURIComponent(now)}&limit=50`);
  for (const message of snoozed) await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ folder: message.previous_folder || "inbox", previous_folder: null, snoozed_until: null }) }).catch(() => undefined);
  await processDueFollowUps(env, now);
}

async function processDueFollowUps(env: Env, now = new Date().toISOString()): Promise<void> {
  const due = await dbRequest<JsonRecord[]>(env, `messages?work_state=neq.none&follow_up_at=not.is.null&follow_up_at=lte.${encodeURIComponent(now)}&order=follow_up_at.asc&limit=100&select=id,owner_id,work_state,follow_up_at,subject`);
  for (const message of due) {
    const messageId = String(message.id);
    const ownerId = String(message.owner_id);
    const followUpAt = String(message.follow_up_at || "");
    const previous = await dbRequest<JsonRecord[]>(env, `mail_events?message_id=eq.${encodeURIComponent(messageId)}&event_type=eq.work_follow_up_due&order=created_at.desc&limit=1&select=payload`).catch(() => []);
    const previousAt = previous[0] && objectValue(previous[0].payload).followUpAt;
    if (previousAt && String(previousAt) === followUpAt) continue;
    await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: messageId, provider: "postveil", event_type: "work_follow_up_due", payload: { messageId, workState: message.work_state, followUpAt, subject: message.subject || "(no subject)" } }) }).catch(() => undefined);
  }
}

async function handleDraft(env: Env, user: User, body: JsonRecord): Promise<Response> {
  const fromAddress = cleanAddress(String(body.fromAddress || `james@${env.APP_DOMAIN}`));
  const access = await delegatedMailboxForSend(env, user.id, fromAddress);
  const mailbox = access?.mailbox || null;
  if (!mailbox) return error("Sender mailbox not found", 404);
  const mailboxOwnerId = mailbox.owner_id;
  const id = typeof body.id === "string" ? body.id : "";
   const patch = { subject: String(body.subject || ""), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, to_addresses: splitAddresses(body.to), cc_addresses: splitAddresses(body.cc), bcc_addresses: splitAddresses(body.bcc), from_name: mailbox.display_name || "", from_address: fromAddress, snippet: snippet(String(body.text || "")), updated_at: new Date().toISOString() };
  if (id) { const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&folder=eq.drafts`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows?.[0] || null); }
  const threadId = await findOrCreateThread(env, mailboxOwnerId, patch.subject);
  const rows = await dbRequest<JsonRecord[]>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: mailboxOwnerId, sent_by: user.id, send_mode: access?.delegation?.can_send_as ? "send_as" : access?.delegation?.can_send_on_behalf ? "send_on_behalf" : "own", thread_id: threadId, mailbox_id: mailbox.id, direction: "outbound", folder: "drafts", status: "draft", message_id_header: `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`, ...patch }) });
  return json(rows?.[0] || null, 201);
}

type SearchToken = { value: string; quoted: boolean; negated: boolean };
type SearchTextPart = { value: string; negated: boolean };
type SearchField = "from" | "to" | "cc" | "subject" | "filename" | "rfc822msgid";
type SearchStateField = "is_read" | "is_starred" | "is_flagged" | "is_pinned" | "has_attachment";
type SearchFilter =
  | { kind: "field"; field: SearchField; value: string; negated: boolean }
  | { kind: "state"; field: SearchStateField; value: boolean; negated: boolean }
  | { kind: "folder"; value: string; negated: boolean }
  | { kind: "date"; operator: "after" | "before"; value: string; negated: boolean }
  | { kind: "size"; operator: "larger" | "smaller"; bytes: number; negated: boolean };
type ParsedSearch = { normalized: string; terms: SearchTextPart[]; phrases: SearchTextPart[]; filters: SearchFilter[] };

function tokenizeSearch(value: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (index >= value.length) break;
    let negated = false;
    if (value[index] === "-") { negated = true; index += 1; }
    let token = "";
    let quoted = false;
    while (index < value.length && !/\s/.test(value[index])) {
      if (value[index] === '"') {
        quoted = true;
        index += 1;
        const start = index;
        while (index < value.length && value[index] !== '"') index += 1;
        if (index >= value.length) throw new Error("Unclosed quoted phrase");
        token += value.slice(start, index);
        index += 1;
      } else {
        token += value[index];
        index += 1;
      }
    }
    if (!token.trim()) throw new Error("A negation must be followed by a search term");
    tokens.push({ value: token.trim(), quoted, negated });
  }
  return tokens;
}

function parseSearchDate(value: string, operator: string): string {
  const now = new Date();
  const lower = value.toLowerCase();
  let date: Date;
  if (lower === "today") date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  else if (lower === "yesterday") date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  else {
    const relative = lower.match(/^(\d+)([dwmy])$/);
    if (relative) {
      date = new Date(now);
      const amount = Number(relative[1]);
      if (relative[2] === "d") date.setUTCDate(date.getUTCDate() - amount);
      if (relative[2] === "w") date.setUTCDate(date.getUTCDate() - amount * 7);
      if (relative[2] === "m") date.setUTCMonth(date.getUTCMonth() - amount);
      if (relative[2] === "y") date.setUTCFullYear(date.getUTCFullYear() - amount);
    } else {
      date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
    }
  }
  if (Number.isNaN(date.getTime())) throw new Error(`${operator}: invalid date "${value}"; use YYYY-MM-DD, today, or a relative value such as 7d`);
  return date.toISOString();
}

function parseSearchBytes(value: string, operator: string): number {
  const match = value.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|kib|mb|mib|gb|gib)?$/);
  if (!match) throw new Error(`${operator}: invalid size "${value}"; use values such as 500KB or 5MB`);
  const multipliers: Record<string, number> = { b: 1, kb: 1000, kib: 1024, mb: 1000 ** 2, mib: 1024 ** 2, gb: 1000 ** 3, gib: 1024 ** 3 };
  return Math.round(Number(match[1]) * (multipliers[match[2] || "b"] || 1));
}

function parseSearchQuery(input: string): ParsedSearch {
  const query = input.trim();
  if (query.length > 1000) throw new Error("Search query is too long; keep it under 1,000 characters");
  const terms: SearchTextPart[] = [];
  const phrases: SearchTextPart[] = [];
  const filters: SearchFilter[] = [];
  const normalized: string[] = [];
  for (const token of tokenizeSearch(query)) {
    const colon = token.value.indexOf(":");
    if (colon <= 0) {
      const target = token.quoted ? phrases : terms;
      target.push({ value: token.value, negated: token.negated });
      normalized.push(`${token.negated ? "-" : ""}${token.quoted ? `"${token.value}"` : token.value}`);
      continue;
    }
    const operator = token.value.slice(0, colon).toLowerCase();
    const operand = token.value.slice(colon + 1).trim();
    if (!operand) throw new Error(`${operator}: needs a value`);
    normalized.push(`${token.negated ? "-" : ""}${operator}:${token.quoted ? `"${operand}"` : operand}`);
    if (["from", "to", "cc", "subject", "filename", "rfc822msgid"].includes(operator)) {
      filters.push({ kind: "field", field: operator as SearchField, value: operand, negated: token.negated });
      continue;
    }
    if (operator === "has") {
      if (operand.toLowerCase() !== "attachment") throw new Error(`has: unsupported value "${operand}"; use has:attachment`);
      filters.push({ kind: "state", field: "has_attachment", value: true, negated: token.negated });
      continue;
    }
    if (operator === "is") {
      const states: Record<string, { field: SearchStateField; value: boolean }> = {
        unread: { field: "is_read", value: false }, read: { field: "is_read", value: true },
        starred: { field: "is_starred", value: true }, unstarred: { field: "is_starred", value: false },
        flagged: { field: "is_flagged", value: true }, unflagged: { field: "is_flagged", value: false },
        pinned: { field: "is_pinned", value: true }, unpinned: { field: "is_pinned", value: false },
      };
      const state = states[operand.toLowerCase()];
      if (!state) throw new Error(`is: unsupported value "${operand}"; use unread, read, starred, flagged, or pinned`);
      filters.push({ kind: "state", ...state, negated: token.negated });
      continue;
    }
    if (operator === "in") {
      const folder = operand.toLowerCase();
      const validFolder = folder === "all" || SYSTEM_FOLDERS.includes(folder as typeof SYSTEM_FOLDERS[number]) || (folder.startsWith("custom:") && /^[0-9a-f-]{36}$/i.test(folder.slice(7)));
      if (!validFolder) throw new Error(`in: unknown folder "${operand}"`);
      filters.push({ kind: "folder", value: folder, negated: token.negated });
      continue;
    }
    if (["after", "before", "older", "newer"].includes(operator)) {
      const dateOperator = operator === "after" || operator === "newer" ? "after" : "before";
      filters.push({ kind: "date", operator: dateOperator, value: parseSearchDate(operand, operator), negated: token.negated });
      continue;
    }
    if (operator === "larger" || operator === "smaller") {
      filters.push({ kind: "size", operator, bytes: parseSearchBytes(operand, operator), negated: token.negated });
      continue;
    }
    throw new Error(`Unknown search operator "${operator}:"`);
  }
  return { normalized: normalized.join(" "), terms, phrases, filters };
}

function safeLike(value: string): string {
  return value.replace(/[*,()%_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function safeFts(value: string): string {
  return value.replace(/[^\p{L}\p{N}@._-]+/gu, " ").trim().slice(0, 200);
}

function webSearchValue(parsed: ParsedSearch): string {
  return [...parsed.terms, ...parsed.phrases].map((part) => {
    const value = safeFts(part.value);
    if (!value) return "";
    const text = parsed.phrases.includes(part) ? `"${value}"` : value;
    return `${part.negated ? "-" : ""}${text}`;
  }).filter(Boolean).join(" ");
}

async function attachmentSearchIds(env: Env, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  for (const filter of filters) {
    if (filter.kind !== "field" && filter.kind !== "size") continue;
    const condition = filter.kind === "field"
      ? `filename=ilike.*${encodeURIComponent(safeLike(filter.value))}*`
      : `${filter.operator === "larger" ? (filter.negated ? "byte_size=lte." : "byte_size=gt.") : (filter.negated ? "byte_size=gte." : "byte_size=lt.")}${filter.bytes}`;
    if (filter.kind === "field" && filter.field !== "filename") continue;
    const rows = await dbRequest<Array<{ message_id: string }>>(env, `attachments?owner_id=eq.${encodeURIComponent(ownerId)}&${condition}&select=message_id&limit=10000`);
    const ids = new Set(rows.map((row) => row.message_id));
    if (filter.negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else {
      const currentInclude = include as Set<string>;
      include = new Set<string>([...currentInclude].filter((id) => ids.has(id)));
    }
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

type MailQueryOptions = { folder: string; query?: string; filter?: string; sort?: string; page?: number; pageSize?: number; mailboxIds?: string[] };

async function buildMailQuery(env: Env, ownerId: string, options: MailQueryOptions): Promise<{ path: string; parsed?: ParsedSearch; page: number; pageSize: number; searchActive: boolean }> {
  const query = options.query?.trim() || "";
  const parsed = query ? parseSearchQuery(query) : undefined;
  const page = Math.max(1, Math.min(100, Number(options.page || 1)));
  const pageSize = Math.max(10, Math.min(100, Number(options.pageSize || 80)));
  const parts = [messageScopeFilter(ownerId, options.mailboxIds || []), "select=id,thread_id,mailbox_id,owner_id,direction,folder,status,custom_folder_id,previous_folder,from_name,from_address,to_addresses,cc_addresses,subject,snippet,is_read,is_starred,is_pinned,is_flagged,priority,has_attachment,spam_score,spam_reasons,trust_score,trust_reasons,screening_status,focused_score,focused_category,delivery_status,delivery_error_code,delivery_error,provider,provider_message_id,open_tracking_enabled,click_tracking_enabled,message_size_bytes,scheduled_at,next_delivery_at,snoozed_until,work_state,follow_up_at,work_note,received_at,sent_at,created_at"];
  const explicitFolders = parsed?.filters.filter((filter): filter is Extract<SearchFilter, { kind: "folder" }> => filter.kind === "folder") || [];
  if (!parsed) {
    if (options.folder.startsWith("custom:")) { parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(options.folder.slice(7))}`); }
    else if (options.folder === "focused") parts.push("folder=eq.inbox", "focused_category=eq.focused");
    else if (options.folder === "other") parts.push("folder=eq.inbox", "focused_category=eq.other");
    else if (options.folder !== "all") parts.push(`folder=eq.${encodeURIComponent(options.folder)}`);
  } else {
    for (const folder of explicitFolders) {
      if (folder.value === "all") continue;
      if (folder.value.startsWith("custom:")) {
        if (folder.negated) throw new Error("Negating a custom folder is not supported; use a positive in: folder filter");
        parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(folder.value.slice(7))}`);
      } else parts.push(`folder=${folder.negated ? "not.eq" : "eq"}.${encodeURIComponent(folder.value)}`);
    }
    const fts = webSearchValue(parsed);
    if (fts) parts.push(`search_vector=wfts.${encodeURIComponent(fts)}`);
    for (const filter of parsed.filters) {
      if (filter.kind === "field") {
        if (filter.field === "filename") continue;
        if (filter.field === "rfc822msgid") { parts.push(`message_id_header=${filter.negated ? "not.eq" : "eq"}.${encodeURIComponent(filter.value)}`); continue; }
        if (filter.field === "to" || filter.field === "cc") {
          const values = `{${safeLike(filter.value).replace(/[{}]/g, "")}}`;
          parts.push(`${filter.field}_addresses=${filter.negated ? "not.cs" : "cs"}.${encodeURIComponent(values)}`);
          continue;
        }
        const column = filter.field === "from" ? "from_address" : filter.field;
        parts.push(`${column}=${filter.negated ? "not.ilike" : "ilike"}.*${encodeURIComponent(safeLike(filter.value))}*`);
      }
      if (filter.kind === "state") {
        const value = filter.negated ? !filter.value : filter.value;
        parts.push(`${filter.field}=eq.${value}`);
      }
      if (filter.kind === "date") {
        const after = filter.operator === "after";
        const operator = filter.negated ? (after ? "lt" : "gte") : (after ? "gte" : "lt");
        parts.push(`created_at=${operator}.${encodeURIComponent(filter.value)}`);
      }
    }
    const attachmentIds = await attachmentSearchIds(env, ownerId, parsed.filters);
    if (attachmentIds.include) parts.push(`id=${encodeURIComponent(`in.(${attachmentIds.include.join(",")})`)}`);
    if (attachmentIds.exclude.length) parts.push(`id=${encodeURIComponent(`not.in.(${attachmentIds.exclude.join(",")})`)}`);
  }
  const listFilter = options.filter || "all";
  if (listFilter === "unread") parts.push("is_read=eq.false");
  if (listFilter === "starred") parts.push("is_starred=eq.true");
  if (listFilter === "attachments") parts.push("has_attachment=eq.true");
  parts.push(`order=${options.sort === "oldest" ? "created_at.asc,id.asc" : "created_at.desc,id.desc"}`, `offset=${(page - 1) * pageSize}`, `limit=${pageSize + 1}`);
  return { path: `messages?${parts.join("&")}`, parsed, page, pageSize, searchActive: Boolean(parsed) };
}

async function dbRequestCount(env: Env, path: string, token?: string): Promise<number | null> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { ...supabaseHeaders(env, token), Prefer: "count=exact" } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const range = response.headers.get("content-range") || "";
  const total = range.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : null;
}

async function writeMessageAudit(env: Env, ownerId: string, requestId: string, actionType: string, message: JsonRecord, beforeState: JsonRecord, afterState: JsonRecord): Promise<void> {
  await dbRequest(env, "message_audit_log", { method: "POST", body: JSON.stringify({ owner_id: ownerId, actor_id: ownerId, mailbox_id: message.mailbox_id || null, message_id: message.id, thread_id: message.thread_id || null, action_type: actionType, target_type: "message", target_id: message.id, before_state: beforeState, after_state: afterState, request_id: requestId }) });
}

function bulkBeforeState(message: JsonRecord): JsonRecord {
  return {
    folder: message.folder, custom_folder_id: message.custom_folder_id || null, previous_folder: message.previous_folder || null,
    is_read: message.is_read === true, is_starred: message.is_starred === true, is_pinned: message.is_pinned === true,
    is_flagged: message.is_flagged === true, priority: typeof message.priority === "number" ? message.priority : 0,
    work_state: message.work_state || "none", follow_up_at: message.follow_up_at || null, snoozed_until: message.snoozed_until || null,
  };
}

async function applyBulkMessageAction(env: Env, ownerId: string, message: JsonRecord, action: JsonRecord, requestId: string): Promise<{ changed: boolean; exportRow?: JsonRecord }> {
  const type = String(action.type || "");
  const before = bulkBeforeState(message);
  if (type === "export") return { changed: false, exportRow: { id: message.id, subject: message.subject || "", from_address: message.from_address || "", to_addresses: message.to_addresses || [], text_body: message.text_body || message.snippet || "" } };
  if (type === "create_task") {
    await dbRequest(env, "tasks", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_id: ownerId, title: String(message.subject || "(no subject)"), notes: String(message.snippet || ""), source_message_id: message.id }) });
    await writeMessageAudit(env, ownerId, requestId, `bulk_${type}`, message, before, before);
    return { changed: true };
  }
  if (type === "label") {
    const labelId = String(action.labelId || "");
    const labels = await dbRequest<Array<{ id: string }>>(env, `labels?id=eq.${encodeURIComponent(labelId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
    if (!labels[0]) throw new Error("Label not found");
    await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: message.id, label_id: labelId }) });
    await writeMessageAudit(env, ownerId, requestId, `bulk_${type}`, message, before, { label_id: labelId });
    return { changed: true };
  }
  if (type === "restore") {
    if (message.folder !== "trash") throw new Error("Only messages in Trash can be restored");
    const target = trashRestoreTarget(message);
    const rows = target.folder === "custom" ? await dbRequest<JsonRecord[]>(env, `mail_folders?id=eq.${encodeURIComponent(target.custom_folder_id || "")}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`) : [{ id: "system" }];
    const restore = rows[0] ? target : { folder: "inbox", custom_folder_id: null };
    const patch = { folder: restore.folder, custom_folder_id: restore.custom_folder_id, previous_folder: null };
    await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}&owner_id=eq.${encodeURIComponent(ownerId)}&folder=eq.trash`, { method: "PATCH", body: JSON.stringify(patch) });
    await writeMessageAudit(env, ownerId, requestId, `bulk_${type}`, message, before, patch);
    return { changed: true };
  }
  const patch: JsonRecord = {};
  if (type === "archive") { patch.folder = "archive"; patch.custom_folder_id = null; }
  else if (type === "trash") {
    patch.folder = "trash";
    patch.custom_folder_id = null;
    patch.previous_folder = message.folder === "trash"
      ? (message.previous_folder || "inbox")
      : (message.folder === "custom" && message.custom_folder_id ? `custom:${message.custom_folder_id}` : (message.folder || "inbox"));
  }
  else if (type === "spam") { patch.folder = "spam"; patch.custom_folder_id = null; }
  else if (type === "move") {
    const folder = String(action.folder || "");
    if (folder === "custom") {
      const customFolderId = String(action.customFolderId || "");
      const customFolders = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(customFolderId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
      if (!customFolders[0]) throw new Error("Choose a valid destination folder");
      patch.folder = "custom";
      patch.custom_folder_id = customFolderId;
    } else {
      if (!SYSTEM_FOLDERS.includes(folder as typeof SYSTEM_FOLDERS[number])) throw new Error("Choose a valid destination folder");
      patch.folder = folder;
      patch.custom_folder_id = null;
    }
    patch.previous_folder = null;
  } else if (type === "mark_read" || type === "mark_unread") patch.is_read = type === "mark_read";
  else if (type === "star" || type === "unstar") patch.is_starred = type === "star";
  else if (type === "pin" || type === "unpin") patch.is_pinned = type === "pin";
  else if (type === "flag" || type === "unflag") patch.is_flagged = type === "flag";
  else if (type === "priority") patch.priority = Math.max(0, Math.min(2, Number(action.priority || 0)));
  else if (type === "snooze") { patch.previous_folder = message.folder; patch.snoozed_until = String(action.snoozedUntil || new Date(Date.now() + 60 * 60 * 1000).toISOString()); patch.folder = "archive"; }
  else if (["reply_later", "waiting_on", "i_owe"].includes(type)) { patch.work_state = type; patch.follow_up_at = String(action.followUpAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()); }
  else throw new Error(`Unsupported bulk action "${type}"`);
  await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  await writeMessageAudit(env, ownerId, requestId, `bulk_${type}`, message, before, patch);
  return { changed: true };
}

async function detectDelayedMessages(env: Env): Promise<void> {
  const threshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const accepted = await dbRequest<JsonRecord[]>(env, `messages?direction=eq.outbound&delivery_status=eq.accepted&sent_at=lt.${encodeURIComponent(threshold)}&delivered_at=is.null&bounced_at=is.null&complained_at=is.null&limit=100&select=id,delayed_count`).catch(() => []);
  for (const message of accepted) await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}&delivery_status=eq.accepted`, { method: "PATCH", body: JSON.stringify({ status: "delayed", delivery_status: "delayed", delayed_at: new Date().toISOString(), delayed_count: Number(message.delayed_count || 0) + 1, delivery_error_code: "delivery_confirmation_delayed", delivery_error: "The provider accepted this message, but no delivery confirmation arrived within 15 minutes", updated_at: new Date().toISOString() }) }).catch(() => undefined);
}

function providerWebhookSecret(env: Env, provider: ProviderName): string | undefined {
  if (provider === "brevo") return env.BREVO_WEBHOOK_SECRET;
  if (provider === "ses") return env.SES_WEBHOOK_SECRET;
  if (provider === "mailgun") return env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (provider === "postmark") return env.POSTMARK_WEBHOOK_SECRET;
  if (provider === "sendgrid") return env.SENDGRID_WEBHOOK_SECRET;
  return env.SMTP_WEBHOOK_SECRET;
}

function webhookEventId(provider: ProviderName, event: JsonRecord): string {
  return String(event.eventId || event.event_id || event.sg_event_id || event.id || event.MessageID || event.messageId || event["message-id"] || `${provider}:${event.eventType || event.event || event.Type || "event"}:${event.timestamp || event.occurredAt || ""}`);
}

function normalizeDeliveryEvents(provider: ProviderName, input: unknown): DeliveryEvent[] {
  let payload = input as JsonRecord;
  if (provider === "ses" && typeof payload.Message === "string") {
    try { payload = JSON.parse(payload.Message) as JsonRecord; } catch { /* keep the envelope for the failure explanation */ }
  }
  const values = Array.isArray(input) ? input : Array.isArray(payload?.events) ? payload.events : [payload];
  return values.filter((value): value is JsonRecord => Boolean(value && typeof value === "object")).map((raw) => {
    const nested = objectValue(raw["event-data"] || raw.eventData || raw.mail || raw);
    const eventType = String(raw.event || raw.eventType || raw.Type || nested.event || nested.eventType || raw.RecordType || "unknown").toLowerCase();
    const providerMessageId = String(raw["message-id"] || raw.messageId || raw.sg_message_id || raw.MessageID || nested.id || nested.messageId || raw.id || "");
    const recipient = cleanAddress(String(raw.email || raw.recipient || nested.recipient || nested.destination || ""));
    const reason = String(raw.reason || raw.description || raw.error || nested.message || nested.reason || nested.description || "").slice(0, 500);
    const timestamp = Number(raw.timestamp || nested.timestamp || 0);
    return { provider, eventType, providerMessageId: providerMessageId || undefined, eventId: webhookEventId(provider, raw), recipient: recipient || undefined, reason: reason || undefined, occurredAt: timestamp ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString() : typeof raw.occurredAt === "string" ? raw.occurredAt : undefined, payload: raw };
  });
}

function deliveryState(eventType: string): { status: string; deliveryStatus: string; attemptStatus: string } | null {
  const value = eventType.toLowerCase().replace(/[ -]/g, "_");
  if (["delivered", "delivery", "delivery_success"].includes(value)) return { status: "delivered", deliveryStatus: "delivered", attemptStatus: "delivered" };
  if (["open", "opened"].includes(value)) return { status: "sent", deliveryStatus: "accepted", attemptStatus: "accepted" };
  if (["click", "clicked", "clicks"].includes(value)) return { status: "sent", deliveryStatus: "accepted", attemptStatus: "accepted" };
  if (["deferred", "delayed", "soft_bounce", "temporary_failure"].includes(value)) return { status: "delayed", deliveryStatus: "delayed", attemptStatus: "deferred" };
  if (["hard_bounce", "bounce", "bounced", "invalid", "rejected"].includes(value)) return { status: "bounced", deliveryStatus: "bounced", attemptStatus: "bounced" };
  if (["complaint", "spamcomplaint", "spam_complaint"].includes(value)) return { status: "complained", deliveryStatus: "complained", attemptStatus: "complained" };
  if (["blocked", "error", "failed", "failure"].includes(value)) return { status: "failed", deliveryStatus: "failed", attemptStatus: "failed" };
  if (["sent", "accepted", "queued", "processed"].includes(value)) return { status: "sent", deliveryStatus: "accepted", attemptStatus: "accepted" };
  return null;
}

async function claimWebhookEvent(env: Env, provider: ProviderName, event: DeliveryEvent): Promise<{ accepted: boolean; hash: string }> {
  const serialized = JSON.stringify(event.payload).slice(0, 100_000);
  const hash = await sha256Hex(new TextEncoder().encode(`${provider}:${event.eventId}:${serialized}`));
  const nonce = `${event.eventId || hash}`.slice(0, 240);
  const existing = await dbRequest<JsonRecord[]>(env, `inbound_webhook_nonces?provider=eq.${encodeURIComponent(provider)}&nonce=eq.${encodeURIComponent(nonce)}&limit=1`).catch(() => []);
  if (existing[0]) return { accepted: false, hash };
  try {
    await dbRequest(env, "inbound_webhook_nonces", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider, nonce, payload_hash: hash, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }) });
    return { accepted: true, hash };
  } catch {
    const duplicate = await dbRequest<JsonRecord[]>(env, `inbound_webhook_nonces?provider=eq.${encodeURIComponent(provider)}&nonce=eq.${encodeURIComponent(nonce)}&limit=1`).catch(() => []);
    return { accepted: !duplicate[0], hash };
  }
}

async function processDeliveryEvent(env: Env, event: DeliveryEvent): Promise<{ matched: boolean; replayed: boolean }> {
  const claim = await claimWebhookEvent(env, event.provider as ProviderName, event);
  if (!claim.accepted) return { matched: false, replayed: true };
  const provider = event.provider as ProviderName;
  const query = event.providerMessageId ? `provider=eq.${encodeURIComponent(provider)}&provider_message_id=eq.${encodeURIComponent(event.providerMessageId)}&limit=1` : "limit=0";
  const rows = await dbRequest<JsonRecord[]>(env, `messages?${query}`).catch(() => []);
  const message = rows[0];
  if (!message) return { matched: false, replayed: false };
  const state = deliveryState(event.eventType);
  const now = event.occurredAt || new Date().toISOString();
  const patch: JsonRecord = { provider_event_id: event.eventId || null, delivery_error: event.reason || null, updated_at: new Date().toISOString() };
  if (state) {
    const engagement = event.eventType.toLowerCase().includes("open") || event.eventType.toLowerCase().includes("click");
    if (!engagement) {
      patch.status = state.status;
      patch.delivery_status = state.deliveryStatus;
      if (state.deliveryStatus === "delivered") patch.delivered_at = now;
      if (state.deliveryStatus === "delayed") { patch.delayed_at = now; patch.delayed_count = Number(message.delayed_count || 0) + 1; patch.next_delivery_at = null; }
      if (state.deliveryStatus === "bounced") patch.bounced_at = now;
      if (state.deliveryStatus === "complained") patch.complained_at = now;
      if (["bounced", "complained", "failed"].includes(state.deliveryStatus)) patch.delivery_error_code = event.eventType.slice(0, 80);
    }
    if (event.eventType.toLowerCase().includes("open")) patch.opened_at = now;
    if (event.eventType.toLowerCase().includes("click")) patch.clicked_at = now;
  }
  await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify(patch) });
  await dbRequest(env, "mail_events", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: message.owner_id, message_id: message.id, provider, event_type: event.eventType, raw_event_type: event.eventType, provider_message_id: event.providerMessageId || null, event_id: event.eventId || null, event_hash: claim.hash, occurred_at: now, payload: event.payload }) }).catch(() => undefined);
  const organizationId = message.mailbox_id ? (await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(String(message.mailbox_id))}&limit=1`).catch(() => []))[0]?.organization_id : undefined;
  if (state?.deliveryStatus === "delivered") await recordDomainOutcome(env, organizationId, domainOf(String(message.from_address || "")), "delivered");
  if (state?.deliveryStatus === "bounced" || state?.deliveryStatus === "complained") {
    const recipient = event.recipient || (Array.isArray(message.to_addresses) ? String(message.to_addresses[0] || "") : "");
    if (organizationId && recipient) await dbRequest(env, "suppression_entries?on_conflict=organization_id,email,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ organization_id: organizationId, email: cleanAddress(recipient), kind: state.deliveryStatus === "complained" ? "complaint" : "bounce", reason: event.reason || `Provider reported ${event.eventType}`, provider, source_event_id: event.eventId || null, active: true }) }).catch(() => undefined);
    await recordDomainOutcome(env, organizationId, domainOf(String(message.from_address || "")), state.deliveryStatus === "complained" ? "complaint" : "bounced");
  }
  return { matched: true, replayed: false };
}

async function deliveryOperations(env: Env, organizationId: string): Promise<JsonRecord> {
  const members = await dbRequest<Array<{ user_id: string }>>(env, `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=user_id`).catch(() => []);
  const ownerFilter = members.length ? `owner_id=in.(${members.map((member) => member.user_id).join(",")})` : "limit=0";
  const [health, domains, attempts, queue] = await Promise.all([
    dbRequest<ProviderHealth[]>(env, `provider_health?organization_id=eq.${encodeURIComponent(organizationId)}&order=provider.asc`).catch(() => []),
    dbRequest<JsonRecord[]>(env, `domain_reputation?organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`).catch(() => []),
    dbRequest<JsonRecord[]>(env, `delivery_attempts?${ownerFilter}&order=started_at.desc&limit=40`).catch(() => []),
    dbRequest<JsonRecord[]>(env, `delivery_queue?${ownerFilter}&status=in.(queued,retrying,running,dead)&order=available_at.asc&limit=1000`).catch(() => []),
  ]);
  return { providers: PROVIDER_NAMES.map((provider) => ({ provider, label: providerLabel(provider), configured: providerReady(env, provider), circuit: health.find((item) => item.provider === provider) || null })), domains, recentAttempts: attempts, queue: { queued: queue.filter((item) => item.status === "queued").length, retrying: queue.filter((item) => item.status === "retrying").length, running: queue.filter((item) => item.status === "running").length, dead: queue.filter((item) => item.status === "dead").length } };
}

function protectedHeaders(response: Response, noStore = false): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (noStore || headers.get("content-type")?.includes("text/html")) {
    headers.set("Cache-Control", "no-store");
    headers.set("CDN-Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") return error("Method not allowed", 405);
    return json({ ok: true, service: "postveil", configured: { supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), brevo: Boolean(env.BREVO_API_KEY), b2: Boolean(env.B2_ENDPOINT && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY), inboundOwner: Boolean(env.OWNER_USER_ID) }, supabaseProbe: await probeSupabase(env), timestamp: new Date().toISOString() });
  }
  const deliveryWebhookMatch = url.pathname.match(/^\/api\/webhooks\/(brevo|ses|mailgun|postmark|sendgrid|smtp)$/);
  if (deliveryWebhookMatch) {
    if (request.method !== "POST") return error("Method not allowed", 405);
    const provider = deliveryWebhookMatch[1] as ProviderName;
    const expectedSecret = providerWebhookSecret(env, provider);
    const suppliedSecret = url.searchParams.get("token") || request.headers.get("x-webhook-secret") || request.headers.get("x-webhook-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!expectedSecret) return error("This provider webhook is not configured", 503);
    if (suppliedSecret !== expectedSecret) return error("Unauthorized", 401);
    const payload = (await request.json()) as unknown;
    const events = normalizeDeliveryEvents(provider, payload);
    const results = [];
    for (const event of events) results.push(await processDeliveryEvent(env, event));
    return json({ ok: true, received: events.length, matched: results.filter((result) => result.matched).length, replayed: results.filter((result) => result.replayed).length });
  }
  const inboundWebhookMatch = url.pathname.match(/^\/api\/webhooks\/inbound\/(brevo|ses|mailgun|postmark|sendgrid|smtp)$/);
  if (inboundWebhookMatch) {
    if (request.method !== "POST") return error("Method not allowed", 405);
    const provider = inboundWebhookMatch[1] as ProviderName;
    const expectedSecret = providerWebhookSecret(env, provider);
    const suppliedSecret = url.searchParams.get("token") || request.headers.get("x-webhook-secret") || request.headers.get("x-webhook-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!expectedSecret) return error("This inbound webhook is not configured", 503);
    if (suppliedSecret !== expectedSecret) return error("Unauthorized", 401);
    const payload = (await request.json()) as JsonRecord;
    const inboundEvent: DeliveryEvent = { provider, eventType: "inbound", eventId: webhookEventId(provider, payload), payload };
    const claim = await claimWebhookEvent(env, provider, inboundEvent);
    if (!claim.accepted) return json({ ok: true, replayed: true });
    const rawText = typeof payload.raw === "string" ? payload.raw : typeof payload.raw_message === "string" ? payload.raw_message : typeof payload["body-mime"] === "string" ? String(payload["body-mime"]) : rawMessageSource({ from: String(payload.from || payload.sender || "unknown@example.invalid"), to: splitAddresses(payload.to || payload.recipient || env.DEFAULT_FROM_EMAIL || `james@${env.APP_DOMAIN}`), cc: splitAddresses(payload.cc), bcc: [], subject: String(payload.subject || "(no subject)"), text: String(payload.text || payload.text_body || payload.body || ""), html: typeof payload.html === "string" ? payload.html : undefined, replyTo: typeof payload.reply_to === "string" ? payload.reply_to : undefined, messageId: String(payload.message_id || `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`) });
    const destination = splitAddresses(payload.to || payload.recipient || env.DEFAULT_FROM_EMAIL || `james@${env.APP_DOMAIN}`)[0];
    const rawBytes = new TextEncoder().encode(rawText);
    const rawBuffer = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer;
    try {
      await ingestRawEmail(env, rawBuffer, String(payload.from || payload.sender || ""), destination, undefined, ctx);
    } catch (inboundError) {
      await dbRequest(env, `inbound_webhook_nonces?provider=eq.${encodeURIComponent(provider)}&nonce=eq.${encodeURIComponent(inboundEvent.eventId || claim.hash)}`, { method: "DELETE" }).catch(() => undefined);
      throw inboundError;
    }
    return json({ ok: true, replayed: false, received: true });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/recovery-request") return handleRecoveryRequest(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/mfa-recovery") return handleMfaRecoveryRequest(request, env);
  if (url.pathname === "/api/internal/send-test") { if (!env.INTERNAL_TEST_TOKEN || request.headers.get("x-internal-test-token") !== env.INTERNAL_TEST_TOKEN) return error("Unauthorized", 401); try { return await handleSend(env, null, (await request.json()) as JsonRecord, ctx); } catch (sendError) { return error(sendError instanceof Error ? sendError.message : "Send failed", 502); } }
  const user = await getUser(request, env);
  if (!user) return error("Sign in required", 401);
  if (user.mfaRequired) return error("Complete two-step verification to continue", 401);
  const mailbox = await ensureProfileAndMailbox(env, user);
  let organization: Organization | null = null;
  try {
    organization = await ensureOrganization(env, user);
    const mfaSetupRoute = url.pathname === "/api/recovery-methods" || url.pathname.startsWith("/api/recovery-methods/") || url.pathname === "/api/recovery-codes" || url.pathname === "/api/recovery-codes/status" || url.pathname === "/api/admin/organization" || url.pathname === "/api/admin/overview";
    if (!mfaSetupRoute && await organizationMfaBlocked(env, user, organization)) return error("Your workspace requires two-step verification before continuing", 401);
    ctx.waitUntil(recordSecurityEvent(env, organization, user, request, ctx));
  } catch {
    // The administration migration is optional during staged rollouts. The
    // regular mailbox remains available while it is being applied.
  }
  if (url.pathname.startsWith("/api/admin/")) return adminApi(request, env, ctx, user);
  if (request.method === "GET" && url.pathname === "/api/delivery/overview") {
    if (!organization) return error("Workspace delivery data is unavailable", 503);
    return json(await deliveryOperations(env, organization.id));
  }

  if (request.method === "GET" && url.pathname === "/api/recovery-codes/status") {
    const rows = await dbRequest<Array<{ id: string }>>(env, `account_mfa_recovery_codes?owner_id=eq.${encodeURIComponent(user.id)}&used_at=is.null&select=id`);
    return json({ remaining: rows.length });
  }
  if (request.method === "POST" && url.pathname === "/api/recovery-codes") {
    await dbRequest(env, `account_mfa_recovery_codes?owner_id=eq.${encodeURIComponent(user.id)}&used_at=is.null`, { method: "DELETE" });
    const codes = Array.from({ length: 10 }, () => mfaRecoveryCode());
    const hashed = await Promise.all(codes.map(async (code) => ({ owner_id: user.id, code_hash: await sha256Hex(new TextEncoder().encode(code)) })));
    await dbRequest(env, "account_mfa_recovery_codes", { method: "POST", body: JSON.stringify(hashed) });
    return json({ codes, remaining: codes.length });
  }

  if (request.method === "GET" && url.pathname === "/api/recovery-methods") {
    const rows = await dbRequest<RecoveryMethodRow[]>(
      env,
      `account_recovery_methods?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
    );
    return json(rows.map(recoveryMethodView));
  }
  if (request.method === "POST" && url.pathname === "/api/recovery-methods") {
    const body = (await request.json()) as JsonRecord;
    const email = normalizeRecoveryEmail(String(body.email || ""));
    if (!isValidRecoveryEmail(email)) return error("Enter a valid recovery email address");
    if (email === normalizeRecoveryEmail(String(user.email || ""))) return error("Use an email address different from your sign-in email");
    const existingRows = await dbRequest<RecoveryMethodRow[]>(
      env,
      `account_recovery_methods?owner_id=eq.${encodeURIComponent(user.id)}&email=eq.${encodeURIComponent(email)}&limit=1`,
    );
    const existing = existingRows[0];
    if (existing?.verified_at) return error("That recovery email is already verified");
    if (existing?.last_sent_at && isRecent(existing.last_sent_at, 60 * 1000)) return error("Wait a minute before sending another verification code");
    if (!existing) {
      const countRows = await dbRequest<Array<{ id: string }>>(
        env,
        `account_recovery_methods?owner_id=eq.${encodeURIComponent(user.id)}&select=id&limit=6`,
      );
      if (countRows.length >= 5) return error("You can add up to five recovery emails");
    }
    const code = recoveryCode();
    const now = new Date().toISOString();
    const patch: JsonRecord = {
      email,
      verification_code_hash: await sha256Hex(new TextEncoder().encode(code)),
      verification_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      verification_attempts: 0,
      last_sent_at: now,
      updated_at: now,
    };
    const rows = existing
      ? await dbRequest<RecoveryMethodRow[]>(env, `account_recovery_methods?id=eq.${encodeURIComponent(existing.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) })
      : await dbRequest<RecoveryMethodRow[]>(env, "account_recovery_methods", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, ...patch }) });
    await sendViaBrevo(env, {
      fromAddress: await defaultFromAddress(env, user.id),
      to: [email],
      subject: "Verify your Postveil recovery email",
      text: `Your Postveil recovery email verification code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your Postveil recovery email verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 15 minutes. If you did not request this, you can ignore this email.</p>`,
    });
    return json(recoveryMethodView(rows[0] || { ...(existing || {}), ...patch, id: existing?.id || "", owner_id: user.id } as RecoveryMethodRow), existing ? 200 : 201);
  }
  const recoveryVerifyMatch = url.pathname.match(/^\/api\/recovery-methods\/([^/]+)\/verify$/);
  if (request.method === "POST" && recoveryVerifyMatch) {
    const rows = await dbRequest<RecoveryMethodRow[]>(
      env,
      `account_recovery_methods?id=eq.${encodeURIComponent(recoveryVerifyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    );
    const method = rows[0];
    if (!method) return error("Recovery email not found", 404);
    if (method.verified_at) return json(recoveryMethodView(method));
    if (!method.verification_expires_at || new Date(method.verification_expires_at).getTime() <= Date.now()) return error("That code has expired. Send a new one.");
    if (method.verification_attempts >= 5) return error("Too many attempts. Send a new code.");
    const body = (await request.json()) as JsonRecord;
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) return error("Enter the six-digit code");
    const candidate = await sha256Hex(new TextEncoder().encode(code));
    if (candidate !== method.verification_code_hash) {
      await dbRequest(env, `account_recovery_methods?id=eq.${encodeURIComponent(method.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ verification_attempts: method.verification_attempts + 1, updated_at: new Date().toISOString() }) });
      return error("That code is not correct");
    }
    const verifiedRows = await dbRequest<RecoveryMethodRow[]>(env, `account_recovery_methods?id=eq.${encodeURIComponent(method.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ verified_at: new Date().toISOString(), verification_code_hash: null, verification_expires_at: null, verification_attempts: 0, updated_at: new Date().toISOString() }) });
    return json(recoveryMethodView(verifiedRows[0] || { ...method, verified_at: new Date().toISOString() }));
  }
  const recoveryMethodMatch = url.pathname.match(/^\/api\/recovery-methods\/([^/]+)$/);
  if (request.method === "DELETE" && recoveryMethodMatch) {
    await dbRequest(env, `account_recovery_methods?id=eq.${encodeURIComponent(recoveryMethodMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/mailboxes") return json(await accessibleMailboxes(env, user.id));
  if (request.method === "POST" && url.pathname === "/api/mailboxes") { const body = (await request.json()) as JsonRecord; const address = cleanAddress(String(body.address || "")); if (!address.includes("@")) return error("Enter a valid email address"); const rows = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address, display_name: String(body.displayName || address.split("@")[0]), is_default: false }) }); return json(rows[0], 201); }
  const mailboxMatch = url.pathname.match(/^\/api\/mailboxes\/([^/]+)$/);
  if (request.method === "PATCH" && mailboxMatch) { const body = (await request.json()) as JsonRecord; const patch: JsonRecord = {}; for (const key of ["display_name", "can_send", "can_receive", "is_default", "reply_to", "settings"]) if (key in body) patch[key] = body[key]; const rows = await dbRequest<JsonRecord[]>(env, `mailboxes?id=eq.${encodeURIComponent(mailboxMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || null); }

  if (request.method === "POST" && url.pathname === "/api/trash/empty") {
    let deleted = 0;
    while (true) {
      const rows = await dbRequest<Array<{ id: string }>>(
        env,
        `messages?owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.trash&select=id&limit=100`,
      );
      if (!rows.length) break;
      for (const row of rows) {
        await permanentlyDeleteMessage(env, user.id, row.id);
        deleted += 1;
      }
      if (rows.length < 100) break;
    }
    return json({ ok: true, deleted });
  }

  if (request.method === "GET" && url.pathname === "/api/search/parse") {
    try {
      const parsed = parseSearchQuery(url.searchParams.get("q") || "");
      return json({ ok: true, ...parsed });
    } catch (parseError) {
      return error(parseError instanceof Error ? parseError.message : "Invalid search query", 400);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/saved-searches") {
    const rows = await dbRequest<JsonRecord[]>(env, `saved_searches?owner_id=eq.${encodeURIComponent(user.id)}&order=sort_order.asc,name.asc`);
    if (url.searchParams.get("counts") !== "true") return json(rows);
    const withCounts = await Promise.all(rows.map(async (row) => {
      try {
        const query = await buildMailQuery(env, user.id, { folder: "all", query: String(row.query || ""), page: 1, pageSize: 1 });
        return { ...row, result_count: await dbRequestCount(env, query.path) };
      } catch {
        return { ...row, result_count: null };
      }
    }));
    return json(withCounts);
  }
  if (request.method === "POST" && url.pathname === "/api/saved-searches") {
    const body = (await request.json()) as JsonRecord;
    const name = String(body.name || "").trim().slice(0, 80);
    const queryText = String(body.query || "").trim().slice(0, 1000);
    if (!name) return error("Saved search name is required");
    if (!queryText) return error("Saved search query is required");
    try { parseSearchQuery(queryText); } catch (parseError) { return error(parseError instanceof Error ? parseError.message : "Invalid search query", 400); }
    const color = typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : "#3156d8";
    const rows = await dbRequest<JsonRecord[]>(env, "saved_searches", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name, query: queryText, color, sort_order: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0 }) });
    return json(rows[0] || null, 201);
  }
  const savedSearchMatch = url.pathname.match(/^\/api\/saved-searches\/([^/]+)$/);
  if (savedSearchMatch && request.method === "PATCH") {
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
    if (typeof body.query === "string" && body.query.trim()) {
      const queryText = body.query.trim().slice(0, 1000);
      try { parseSearchQuery(queryText); } catch (parseError) { return error(parseError instanceof Error ? parseError.message : "Invalid search query", 400); }
      patch.query = queryText;
    }
    if (typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color)) patch.color = body.color;
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) patch.sort_order = body.sortOrder;
    const rows = await dbRequest<JsonRecord[]>(env, `saved_searches?id=eq.${encodeURIComponent(savedSearchMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (savedSearchMatch && request.method === "DELETE") {
    await dbRequest(env, `saved_searches?id=eq.${encodeURIComponent(savedSearchMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
    return json({ ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/saved-searches/reorder") {
    const body = (await request.json()) as JsonRecord;
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter(Boolean))].slice(0, 100) : [];
    const existing = await dbRequest<Array<{ id: string }>>(env, `saved_searches?owner_id=eq.${encodeURIComponent(user.id)}&select=id`);
    const allowed = new Set(existing.map((row) => row.id));
    await Promise.all(ids.filter((id) => allowed.has(id)).map((id, index) => dbRequest(env, `saved_searches?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ sort_order: index, updated_at: new Date().toISOString() }) })));
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/mail") {
    try {
      const query = await buildMailQuery(env, user.id, { folder: url.searchParams.get("folder") || "inbox", query: url.searchParams.get("q") || "", filter: url.searchParams.get("filter") || "all", sort: url.searchParams.get("sort") || "newest", page: Number(url.searchParams.get("page") || 1), pageSize: Number(url.searchParams.get("page_size") || url.searchParams.get("limit") || 80), mailboxIds: await delegatedMailboxIds(env, user.id, "read") });
      const rows = await dbRequest<JsonRecord[]>(env, query.path);
      const hasMore = rows.length > query.pageSize;
      const items = hasMore ? rows.slice(0, query.pageSize) : rows;
      if (url.searchParams.get("meta") === "true") {
        const total = await dbRequestCount(env, query.path);
        return json({ items, total, page: query.page, pageSize: query.pageSize, hasMore, normalizedQuery: query.parsed?.normalized || "" });
      }
      return json(items);
    } catch (searchError) {
      return error(searchError instanceof Error ? searchError.message : "Search failed", 400);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/mail/bulk/undo") {
    const body = (await request.json()) as JsonRecord;
    const requestId = String(body.requestId || "").trim();
    if (!requestId || requestId.length > 100) return error("Undo request is invalid");
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const audits = await dbRequest<Array<{ message_id?: string; action_type?: string; before_state?: JsonRecord; created_at?: string }>>(
      env,
      `message_audit_log?owner_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&created_at=gte.${encodeURIComponent(cutoff)}&select=message_id,action_type,before_state,created_at&limit=500`,
    );
    const actionable = audits.filter((audit) => audit.action_type?.startsWith("bulk_") && audit.action_type !== "bulk_undo" && audit.message_id);
    if (!actionable.length) return error("This action can no longer be undone", 410);
    if (actionable.some((audit) => audit.action_type === "bulk_label" || audit.action_type === "bulk_create_task")) return error("This action cannot be undone", 409);
    const undoneIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];
    for (const audit of actionable) {
      const id = String(audit.message_id);
      try {
        const before = objectValue(audit.before_state);
        const patch: JsonRecord = {};
        for (const key of ["folder", "custom_folder_id", "previous_folder", "is_read", "is_starred", "is_pinned", "is_flagged", "priority", "work_state", "follow_up_at", "snoozed_until"]) if (key in before) patch[key] = before[key];
        await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        await dbRequest(env, "message_audit_log", { method: "POST", body: JSON.stringify({ owner_id: user.id, actor_id: user.id, message_id: id, action_type: "bulk_undo", target_type: "message", target_id: id, before_state: {}, after_state: patch, request_id: requestId }) });
        undoneIds.push(id);
      } catch (undoError) {
        failures.push({ id, error: undoError instanceof Error ? undoError.message : "Undo failed" });
      }
    }
    return json({ ok: failures.length === 0, undoneIds, failures });
  }

  if (request.method === "POST" && url.pathname === "/api/mail/bulk") {
    const body = (await request.json()) as JsonRecord;
    const action = objectValue(body.action);
    const actionType = String(action.type || "");
    const allowedActions = new Set(["archive", "move", "label", "mark_read", "mark_unread", "star", "unstar", "pin", "unpin", "flag", "unflag", "priority", "snooze", "reply_later", "waiting_on", "i_owe", "spam", "trash", "restore", "export", "create_task"]);
    if (!allowedActions.has(actionType)) return error(`Unsupported bulk action "${actionType}"`);
    const requestId = String(body.idempotencyKey || crypto.randomUUID()).trim().slice(0, 100);
    const replay = await dbRequest<Array<{ message_id?: string }>>(env, `message_audit_log?owner_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&action_type=like.bulk_*&select=message_id&limit=500`).catch(() => []);
    if (replay.length) return json({ ok: true, replayed: true, requestId, changedIds: [...new Set(replay.map((row) => String(row.message_id || "")).filter(Boolean))], failures: [] });
    const scope = body.scope === "all_results" ? "all_results" : "selected";
    const failures: Array<{ id: string; error: string }> = [];
    let rows: JsonRecord[] = [];
    let truncated = false;
    if (scope === "selected") {
      const requested = Array.isArray(body.messageIds) ? [...new Set(body.messageIds.map(String).filter(Boolean))].slice(0, 100) : [];
      const ids = requested.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      requested.filter((id) => !ids.includes(id)).forEach((id) => failures.push({ id, error: "Invalid message id" }));
      if (!ids.length) return error("Select at least one message");
      rows = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&id=${encodeURIComponent(`in.(${ids.join(",")})`)}&select=id,thread_id,mailbox_id,folder,custom_folder_id,previous_folder,is_read,is_starred,is_pinned,is_flagged,priority,work_state,follow_up_at,snoozed_until,subject,from_address,to_addresses,snippet,text_body&limit=100`);
      const found = new Set(rows.map((row) => String(row.id)));
      ids.filter((id) => !found.has(id)).forEach((id) => failures.push({ id, error: "Message not found or not owned" }));
    } else {
      const query = await buildMailQuery(env, user.id, { folder: String(body.folder || "all"), query: String(body.query || ""), filter: "all", sort: "newest", page: 1, pageSize: 500 });
      const result = await dbRequest<JsonRecord[]>(env, query.path);
      truncated = result.length > 500;
      rows = truncated ? result.slice(0, 500) : result;
    }
    const changedIds: string[] = [];
    const exportRows: JsonRecord[] = [];
    for (const row of rows) {
      try {
        const result = await applyBulkMessageAction(env, user.id, row, action, requestId);
        if (result.changed) changedIds.push(String(row.id));
        if (result.exportRow) exportRows.push(result.exportRow);
      } catch (actionError) {
        failures.push({ id: String(row.id), error: actionError instanceof Error ? actionError.message : "Action failed" });
      }
    }
    return json({ ok: failures.length === 0, requestId, scope, requestedCount: scope === "all_results" ? rows.length : (Array.isArray(body.messageIds) ? body.messageIds.length : 0), changedIds, exported: exportRows, failures, truncated, undoable: ["archive", "move", "mark_read", "mark_unread", "star", "unstar", "pin", "unpin", "flag", "unflag", "priority", "snooze", "reply_later", "waiting_on", "i_owe", "spam", "trash", "restore"].includes(actionType) });
  }

  if (request.method === "GET" && url.pathname === "/api/work") {
    const requestedState = url.searchParams.get("state");
    if (requestedState && !normalizeWorkState(requestedState)) return error("Work state is invalid", 400);
    const stateFilter = requestedState && requestedState !== "none" ? `&work_state=eq.${encodeURIComponent(requestedState)}` : "";
    const rows = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&work_state=neq.none${stateFilter}&order=follow_up_at.asc.nullsfirst,created_at.desc&limit=200&select=id,thread_id,mailbox_id,direction,folder,status,from_name,from_address,to_addresses,subject,snippet,is_read,is_starred,is_pinned,is_flagged,priority,has_attachment,work_state,follow_up_at,work_note,received_at,sent_at,created_at`);
    const now = Date.now();
    return json(rows.map((row) => ({ ...row, overdue: Boolean(row.follow_up_at && new Date(String(row.follow_up_at)).getTime() <= now) })));
  }
  if (request.method === "GET" && url.pathname === "/api/work/summary") {
    const rows = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&work_state=neq.none&limit=200&select=work_state,follow_up_at`);
    return json(workQueueSummary(rows));
  }
  const workMatch = url.pathname.match(/^\/api\/work\/([^/]+)$/);
  if (workMatch && request.method === "PATCH") {
    const body = (await request.json()) as JsonRecord;
    const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(workMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Message not found", 404);
    try {
      const patch = buildWorkStatePatch({ ...body, workState: body.workState ?? existing[0].work_state ?? "none" });
      const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(workMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
      await writeMessageAudit(env, user.id, crypto.randomUUID(), "work_state_change", existing[0], bulkBeforeState(existing[0]), { ...bulkBeforeState(existing[0]), ...patch });
      return json(rows[0] || null);
    } catch (workError) {
      return error(workError instanceof Error ? workError.message : "Work state could not be saved", 400);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/screening/queue") {
    return json(await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&screening_status=eq.review&order=created_at.asc&limit=100&select=id,thread_id,mailbox_id,direction,folder,status,from_name,from_address,to_addresses,subject,snippet,spam_score,spam_reasons,trust_score,screening_status,has_attachment,received_at,created_at`));
  }
  if (request.method === "GET" && url.pathname === "/api/screening/history") {
    const messageId = url.searchParams.get("messageId") || "";
    if (!messageId) return error("Message id is required");
    const owned = await dbRequest<Array<{ id: string }>>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`);
    if (!owned[0]) return error("Message not found", 404);
    return json(await dbRequest<JsonRecord[]>(env, `screening_events?owner_id=eq.${encodeURIComponent(user.id)}&message_id=eq.${encodeURIComponent(messageId)}&order=created_at.desc&limit=100`));
  }
  const screeningDecisionMatch = url.pathname.match(/^\/api\/screening\/([^/]+)\/decision$/);
  if (request.method === "POST" && screeningDecisionMatch) {
    const id = screeningDecisionMatch[1];
    const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Message not found", 404);
    const body = (await request.json()) as JsonRecord;
    const decision = body.decision === "approve" || body.decision === "block" || body.decision === "reroute" ? body.decision : "";
    if (!decision) return error("Choose approve, block, or reroute");
    const decisionPatch = screeningDecisionPatch(decision, body.folder === "custom" ? "custom" : "archive");
    const { event, ...patch } = decisionPatch;
    if (decision === "reroute" && body.folder === "custom") {
      const customFolderId = String(body.customFolderId || "");
      const folders = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(customFolderId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!folders[0]) return error("Choose a valid destination folder");
      patch.custom_folder_id = customFolderId;
    }
    await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ ...patch, screening_policy_id: existing[0].screening_policy_id || null, updated_at: new Date().toISOString() }) });
    await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: user.id, message_id: id, policy_id: existing[0].screening_policy_id || null, decision: event, previous_folder: existing[0].folder, restored_at: decision === "approve" ? new Date().toISOString() : null }) }).catch(() => undefined);
    return json({ ok: true, messageId: id, decision, folder: patch.folder });
  }

  const messageMatch = url.pathname.match(/^\/api\/mail\/([^/]+)$/);
  const trustMatch = url.pathname.match(/^\/api\/mail\/([^/]+)\/trust$/);
  if (request.method === "GET" && trustMatch) {
    const id = trustMatch[1];
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1&select=id,from_name,from_address,reply_to,subject,spam_score,spam_reasons,trust_score,trust_reasons,trust_evidence,auth_results,auth_spf,auth_dkim,auth_dmarc,auth_arc,auth_tls,received_auth_at,sender_first_seen,known_contact,reply_to_mismatch,link_count,tracking_pixel_count,screening_status,screening_policy_id,created_at`);
    if (!rows[0]) return error("Message not found", 404);
    const events = await dbRequest<JsonRecord[]>(env, `screening_events?owner_id=eq.${encodeURIComponent(user.id)}&message_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=20`).catch(() => []);
    return json({ ...rows[0], screening_history: events });
  }
  const inspectionMatch = url.pathname.match(/^\/api\/mail\/([^/]+)\/inspection$/);
  if (request.method === "GET" && inspectionMatch) {
    const id = inspectionMatch[1];
    const scope = messageScopeFilter(user.id, await delegatedMailboxIds(env, user.id, "read"));
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&${scope}&limit=1`);
    if (!rows[0]) return error("Message not found", 404);
    const [attempts, events] = await Promise.all([
      dbRequest<JsonRecord[]>(env, `delivery_attempts?message_id=eq.${encodeURIComponent(id)}&order=attempt_number.asc`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `mail_events?message_id=eq.${encodeURIComponent(id)}&order=occurred_at.asc.nullslast,created_at.asc`).catch(() => []),
    ]);
    return json({ message: rows[0], attempts, events });
  }
  const sourceMatch = url.pathname.match(/^\/api\/mail\/([^/]+)\/source$/);
  if (request.method === "GET" && sourceMatch) {
    const id = sourceMatch[1];
    const scope = messageScopeFilter(user.id, await delegatedMailboxIds(env, user.id, "read"));
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&${scope}&limit=1`);
    const message = rows[0];
    if (!message) return error("Message not found", 404);
    let source = "";
    if (typeof message.raw_object_key === "string" && message.raw_object_key) {
      source = new TextDecoder().decode(await readObject(env, message.raw_object_key));
    } else {
      source = rawMessageSource({ from: String(message.from_address || ""), to: Array.isArray(message.to_addresses) ? message.to_addresses.map(String) : [], cc: Array.isArray(message.cc_addresses) ? message.cc_addresses.map(String) : [], bcc: Array.isArray(message.bcc_addresses) ? message.bcc_addresses.map(String) : [], subject: String(message.subject || "(no subject)"), text: String(message.text_body || ""), html: typeof message.html_body === "string" ? message.html_body : undefined, replyTo: typeof message.reply_to === "string" ? message.reply_to : undefined, messageId: String(message.message_id_header || `<${id}@${env.APP_DOMAIN}>`) });
    }
    return new Response(source, { headers: { "content-type": "message/rfc822; charset=utf-8", "content-disposition": `inline; filename="${id}.eml"`, "cache-control": "no-store" } });
  }
  const feedbackMatch = url.pathname.match(/^\/api\/mail\/([^/]+)\/feedback$/);
  if (request.method === "POST" && feedbackMatch) {
    const id = feedbackMatch[1];
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!rows[0]) return error("Message not found", 404);
    const body = (await request.json()) as JsonRecord;
    const feedback = body.feedback === "spam" || body.feedback === "not_spam" ? body.feedback : "";
    if (!feedback) return error("Feedback must be spam or not_spam");
    await recordScreeningFeedback(env, user.id, rows[0], feedback);
    const updated = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    return json({ ok: true, feedback, message: updated[0] || null });
  }
  if (request.method === "GET" && messageMatch) { const id = messageMatch[1]; const scope = messageScopeFilter(user.id, await delegatedMailboxIds(env, user.id, "read")); const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&${scope}&limit=1`); if (!rows[0]) return error("Message not found", 404); const messageOwnerId = String(rows[0].owner_id || user.id); const attachments = await dbRequest<JsonRecord[]>(env, `attachments?message_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(messageOwnerId)}&order=created_at.asc`); const labels = await dbRequest<JsonRecord[]>(env, `message_labels?message_id=eq.${encodeURIComponent(id)}&select=label_id`); return json({ ...rows[0], attachments, labels }); }
  if (request.method === "GET" && url.pathname.startsWith("/api/threads/")) { const id = url.pathname.split("/").pop() || ""; return json(await dbRequest(env, `messages?thread_id=eq.${encodeURIComponent(id)}&${messageScopeFilter(user.id, await delegatedMailboxIds(env, user.id, "read"))}&order=created_at.asc`)); }
  const outboxCancelMatch = url.pathname.match(/^\/api\/outbox\/([^/]+)\/cancel$/);
  if (request.method === "POST" && outboxCancelMatch) {
    const id = outboxCancelMatch[1];
    const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Message not found", 404);
    if (!canManageOutbox(existing[0], user.id)) return error("This send is already being processed or can no longer be cancelled", 409);
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&status=in.(queued,scheduled)&cancelled_at=is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "draft", folder: "drafts", cancelled_at: new Date().toISOString(), send_after: null, next_delivery_at: null, send_lease_until: null, scheduled_at: null, work_note: "Send cancelled", updated_at: new Date().toISOString() }) });
    await dbRequest(env, `delivery_queue?message_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: "suppressed", locked_until: null, updated_at: new Date().toISOString() }) }).catch(() => undefined);
    return json({ ok: true, message: rows[0] || null });
  }
  const outboxEditMatch = url.pathname.match(/^\/api\/outbox\/([^/]+)$/);
  if (request.method === "PATCH" && outboxEditMatch) {
    const id = outboxEditMatch[1];
    const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Message not found", 404);
    if (!canManageOutbox(existing[0], user.id)) return error("This send is already being processed or can no longer be edited", 409);
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (body.to !== undefined) { const recipients = splitAddresses(body.to); if (!recipients.length) return error("At least one recipient is required"); patch.to_addresses = recipients; }
    if (body.cc !== undefined) patch.cc_addresses = splitAddresses(body.cc);
    if (body.bcc !== undefined) patch.bcc_addresses = splitAddresses(body.bcc);
    if (typeof body.subject === "string") { patch.subject = body.subject.slice(0, 500); patch.snippet = snippet(String((body.text ?? existing[0].text_body) || "")); }
    if (typeof body.text === "string") { patch.text_body = body.text; patch.snippet = snippet(body.text); }
    if (typeof body.html === "string") patch.html_body = body.html;
    if (typeof body.replyTo === "string") patch.reply_to = cleanAddress(body.replyTo);
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&status=in.(queued,scheduled)&cancelled_at=is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json({ ok: true, message: rows[0] || null });
  }
  if (request.method === "POST" && messageMatch) {
    const id = messageMatch[1]; const body = (await request.json()) as JsonRecord; const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!existing[0]) return error("Message not found", 404);
    if (body.action === "restore") {
      if (existing[0].folder !== "trash") return error("Only messages in Trash can be restored");
      let target = trashRestoreTarget(existing[0]);
      if (target.folder === "custom") {
        const customFolder = await dbRequest<JsonRecord[]>(env, `mail_folders?id=eq.${encodeURIComponent(target.custom_folder_id || "")}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
        if (!customFolder[0]) target = { folder: "inbox", custom_folder_id: null };
      }
      const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.trash`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ folder: target.folder, custom_folder_id: target.custom_folder_id, previous_folder: null, snoozed_until: null, updated_at: new Date().toISOString() }) });
      await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: user.id, message_id: id, decision: "restored", previous_folder: "trash", restored_at: new Date().toISOString() }) }).catch(() => undefined);
      return json(Array.isArray(rows) ? rows[0] : rows);
    }
    if (body.action === "permanent_delete") {
      await permanentlyDeleteMessage(env, user.id, id);
      return json({ ok: true, deleted: id });
    }
    const patch: JsonRecord = {};
    if (typeof body.isRead === "boolean") patch.is_read = body.isRead;
    if (typeof body.isStarred === "boolean") patch.is_starred = body.isStarred;
    if (typeof body.isPinned === "boolean") patch.is_pinned = body.isPinned;
    if (typeof body.isFlagged === "boolean") patch.is_flagged = body.isFlagged;
    if (typeof body.priority === "number") patch.priority = Math.max(0, Math.min(2, body.priority));
    if (body.workState !== undefined || body.followUpAt !== undefined || body.workNote !== undefined) {
      try {
        Object.assign(patch, buildWorkStatePatch({ ...body, workState: body.workState ?? existing[0].work_state ?? "none" }));
      } catch (workError) {
        return error(workError instanceof Error ? workError.message : "Work state could not be saved", 400);
      }
    }
    if (typeof body.snoozedUntil === "string" && body.snoozedUntil) { patch.previous_folder = existing[0].folder; patch.snoozed_until = body.snoozedUntil; patch.folder = "archive"; }
    if (body.snoozedUntil === null) { patch.snoozed_until = null; patch.folder = existing[0].previous_folder || "inbox"; patch.previous_folder = null; }
    if (typeof body.folder === "string" && SYSTEM_FOLDERS.includes(body.folder as typeof SYSTEM_FOLDERS[number])) {
      if (body.folder === "trash" && existing[0].folder !== "trash") {
        patch.previous_folder = existing[0].folder === "custom" && existing[0].custom_folder_id ? `custom:${existing[0].custom_folder_id}` : existing[0].folder;
      }
      if (existing[0].folder === "trash" && body.folder !== "trash") patch.previous_folder = null;
      patch.folder = body.folder;
      patch.custom_folder_id = null;
    }
    if (body.folder === "custom" && typeof body.customFolderId === "string") { patch.folder = "custom"; patch.custom_folder_id = body.customFolderId; }
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (body.folder === "spam" || body.folder === "inbox") await recordScreeningFeedback(env, user.id, { ...existing[0], folder: body.folder }, body.folder === "spam" ? "spam" : "not_spam");
    return json(Array.isArray(rows) ? rows[0] : rows);
  }

  if (request.method === "GET" && url.pathname === "/api/folders") return json(await dbRequest(env, `mail_folders?owner_id=eq.${encodeURIComponent(user.id)}&order=sort_order.asc,name.asc`));
  if (request.method === "POST" && url.pathname === "/api/folders") { const body = (await request.json()) as JsonRecord; const name = String(body.name || "").trim(); if (!name) return error("Folder name is required"); const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); const rows = await dbRequest<JsonRecord[]>(env, "mail_folders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name, slug, color: String(body.color || "#6f7d91") }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/labels") return json(await dbRequest(env, `labels?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/labels") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: String(body.name || "Untitled"), color: String(body.color || "#2d5bff") }) }); return json(rows[0], 201); }
  if (request.method === "POST" && url.pathname === "/api/labels/assign") { const body = (await request.json()) as JsonRecord; const labelId = String(body.labelId || ""); const messageId = String(body.messageId || ""); if (!labelId || !messageId) return error("Message and label are required"); await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: labelId }) }); return json({ ok: true }); }
  if (request.method === "GET" && url.pathname === "/api/contacts") { const q = url.searchParams.get("q")?.trim(); const path = `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc${q ? `&or=${encodeURIComponent(`email.ilike.*${q}*,display_name.ilike.*${q}*`)}` : ""}`; return json(await dbRequest(env, path)); }
  if (request.method === "POST" && url.pathname === "/api/contacts") { const body = (await request.json()) as JsonRecord; const email = cleanAddress(String(body.email || "")); if (!email.includes("@")) return error("A valid email is required"); const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim() : null; if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) return error("Profile image URL must use https://"); const rows = await dbRequest<JsonRecord[]>(env, "contacts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, email, display_name: String(body.displayName || email.split("@")[0]), avatar_url: avatarUrl, company: body.company || null, notes: body.notes || null }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/sender-policies") return json(await dbRequest<SenderPolicy[]>(env, `sender_policies?owner_id=eq.${encodeURIComponent(user.id)}&order=enabled.desc,match_type.asc,match_value.asc`).catch(() => []));
  if (request.method === "POST" && url.pathname === "/api/sender-policies") {
    const body = (await request.json()) as JsonRecord;
    const matchType = body.matchType === "domain" ? "domain" : body.matchType === "address" ? "address" : "";
    const action = String(body.action || "");
    if (!matchType || !SENDER_POLICY_ACTIONS.has(action)) return error("Choose a sender or domain and a valid action");
    let matchValue = "";
    try { matchValue = normalizeSenderPolicyValue(matchType, body.matchValue); } catch (policyError) { return error(policyError instanceof Error ? policyError.message : "Sender policy is invalid"); }
    const mailboxId = await ensurePolicyMailbox(env, user.id, body.mailboxId);
    const targetFolderId = typeof body.targetFolderId === "string" && body.targetFolderId ? body.targetFolderId : null;
    if (action === "folder") {
      if (!targetFolderId) return error("Choose a destination folder");
      const target = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(targetFolderId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!target[0]) return error("Destination folder not found", 404);
    }
    try {
      const rows = await dbRequest<SenderPolicy[]>(env, "sender_policies", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: mailboxId, match_type: matchType, match_value: matchValue, action, target_folder_id: targetFolderId, enabled: true }) });
      return json(rows[0], 201);
    } catch (policyError) {
      return error(policyError instanceof Error ? policyError.message : "That sender policy already exists", 409);
    }
  }
  const senderPolicyMatch = url.pathname.match(/^\/api\/sender-policies\/([^/]+)$/);
  if (senderPolicyMatch && request.method === "PATCH") {
    const body = (await request.json()) as JsonRecord;
    const existing = await dbRequest<SenderPolicy[]>(env, `sender_policies?id=eq.${encodeURIComponent(senderPolicyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Sender policy not found", 404);
    const matchType = body.matchType === "domain" || body.matchType === "address" ? body.matchType : existing[0].match_type;
    const action = typeof body.action === "string" ? body.action : existing[0].action;
    if (!SENDER_POLICY_ACTIONS.has(action)) return error("Choose a valid sender policy action");
    let matchValue = existing[0].match_value;
    try { if (body.matchValue !== undefined || body.matchType !== undefined) matchValue = normalizeSenderPolicyValue(matchType, body.matchValue ?? existing[0].match_value); } catch (policyError) { return error(policyError instanceof Error ? policyError.message : "Sender policy is invalid"); }
    const patch: JsonRecord = { updated_at: new Date().toISOString(), match_type: matchType, match_value: matchValue, action };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.mailboxId !== undefined) patch.mailbox_id = await ensurePolicyMailbox(env, user.id, body.mailboxId);
    if (body.targetFolderId !== undefined) patch.target_folder_id = typeof body.targetFolderId === "string" && body.targetFolderId ? body.targetFolderId : null;
    if (action === "folder") {
      const targetFolderId = String(patch.target_folder_id ?? existing[0].target_folder_id ?? "");
      if (!targetFolderId) return error("Choose a destination folder");
      const target = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(targetFolderId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!target[0]) return error("Destination folder not found", 404);
      patch.target_folder_id = targetFolderId;
    } else if (body.targetFolderId === undefined) patch.target_folder_id = null;
    try {
      const rows = await dbRequest<SenderPolicy[]>(env, `sender_policies?id=eq.${encodeURIComponent(senderPolicyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      return json(rows[0] || null);
    } catch (policyError) {
      return error(policyError instanceof Error ? policyError.message : "Sender policy could not be updated", 409);
    }
  }
  if (senderPolicyMatch && request.method === "DELETE") {
    await dbRequest(env, `sender_policies?id=eq.${encodeURIComponent(senderPolicyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
    return json({ ok: true });
  }
  const senderPolicyApplyMatch = url.pathname.match(/^\/api\/sender-policies\/([^/]+)\/apply-existing$/);
  if (request.method === "POST" && senderPolicyApplyMatch) {
    const body = (await request.json()) as JsonRecord;
    if (body.confirm !== true) return error("Explicit confirmation is required before applying a policy to existing messages");
    const policies = await dbRequest<SenderPolicy[]>(env, `sender_policies?id=eq.${encodeURIComponent(senderPolicyApplyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const policy = policies[0];
    if (!policy) return error("Sender policy not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=500&select=id,mailbox_id,from_address,folder,custom_folder_id`);
    const matching = rows.filter((message) => policyMatchesMessage(policy, message));
    const failures: Array<{ id: string; error: string }> = [];
    for (const message of matching) {
      try { await applyPolicyToMessage(env, user.id, message, policy); } catch (applyError) { failures.push({ id: String(message.id), error: applyError instanceof Error ? applyError.message : "Could not apply policy" }); }
    }
    return json({ ok: failures.length === 0, matched: matching.length, changed: matching.length - failures.length, failures, capped: rows.length === 500 });
  }
  if (request.method === "GET" && url.pathname === "/api/rules/export") {
    const rows = await dbRequest<JsonRecord[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`);
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), rules: rows.map((row) => normalizeRuleRecord(row)) };
    return new Response(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=postveil-rules.json", "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/rules/import") {
    const body = (await request.json()) as JsonRecord;
    if (Number(body.schemaVersion || 0) !== 1 || !Array.isArray(body.rules)) return error("This rules file is not supported", 400);
    const imported = body.rules.slice(0, 100);
    const created: JsonRecord[] = [];
    const failures: Array<{ index: number; error: string }> = [];
    for (const [index, value] of imported.entries()) {
      const normalized = normalizeRuleRecord(objectValue(value));
      const validation = validateRuleInput(normalized);
      if (validation.length) { failures.push({ index, error: validation.join("; ") }); continue; }
      try {
        const rows = await dbRequest<JsonRecord[]>(env, "mail_rules", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: normalized.name, priority: normalized.priority, enabled: normalized.enabled, conditions: normalized.conditions, actions: normalized.actions }) });
        if (rows[0]) created.push(rows[0]);
      } catch (importError) {
        failures.push({ index, error: importError instanceof Error ? importError.message : "Could not import rule" });
      }
    }
    return json({ ok: failures.length === 0, imported: created.length, failures, rules: created }, failures.length && !created.length ? 400 : 200);
  }
  if (request.method === "GET" && url.pathname === "/api/rule-runs") {
    const ruleId = url.searchParams.get("ruleId");
    const ruleFilter = ruleId ? `&rule_id=eq.${encodeURIComponent(ruleId)}` : "";
    return json(await dbRequest(env, `mail_rule_runs?owner_id=eq.${encodeURIComponent(user.id)}${ruleFilter}&order=started_at.desc&limit=50`));
  }
  if (request.method === "GET" && url.pathname === "/api/audit-log") {
    const messageId = url.searchParams.get("messageId");
    return json(await dbRequest(env, `message_audit_log?owner_id=eq.${encodeURIComponent(user.id)}${messageId ? `&message_id=eq.${encodeURIComponent(messageId)}` : ""}&order=created_at.desc&limit=100`));
  }
  if (request.method === "GET" && url.pathname === "/api/rules") return json(await dbRequest(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`));
  if (request.method === "POST" && url.pathname === "/api/rules") {
    const body = (await request.json()) as JsonRecord;
    const normalized = normalizeRuleRecord({ ...body, conditions: buildRuleConditions(body.conditions, body.exceptions) });
    const validation = validateRuleInput(normalized);
    if (validation.length) return error(validation.join("; "), 400);
    const rows = await dbRequest<JsonRecord[]>(env, "mail_rules", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: user.id,
        name: normalized.name,
        priority: normalized.priority,
        enabled: normalized.enabled,
        conditions: normalized.conditions,
        actions: normalized.actions,
      }),
    });
    return json(rows[0], 201);
  }
  const ruleActionMatch = url.pathname.match(/^\/api\/rules\/([^/]+)\/(preview|dry-run|apply|conflicts)$/);
  if (ruleActionMatch && (request.method === "POST" || (request.method === "GET" && ruleActionMatch[2] === "conflicts"))) {
    const ruleId = ruleActionMatch[1];
    const action = ruleActionMatch[2];
    const rows = await dbRequest<Rule[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!rows[0]) return error("Rule not found", 404);
    const rule = rows[0];
    const allRules = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`);
    const conflicts = ruleConflicts(rule, allRules);
    if (action === "conflicts") return json({ ruleId, conflicts });
    const sourceRows = await existingRuleMessages(env, user.id);
    const analysis = matchRuleMessages(sourceRows, rule);
    if (action === "preview" || action === "dry-run") {
      const runId = await createRuleRun(env, user.id, rule.id, action === "preview" ? "preview" : "dry_run", analysis.matches);
      await finishRuleRun(env, user.id, runId, { status: "completed", matched_count: analysis.matches.length, changed_count: 0, sample: analysis.matches.slice(0, 20) });
      return json({ ok: true, runId, mode: action === "preview" ? "preview" : "dry_run", matchedCount: analysis.matches.length, changedCount: 0, matches: analysis.matches.slice(0, 50), impact: ruleImpactText(analysis.impact), conflicts });
    }
    const body = (await request.json()) as JsonRecord;
    const suppliedRunId = typeof body.runId === "string" ? body.runId : "";
    let runId = suppliedRunId;
    if (runId) {
      const runRows = await dbRequest<Array<{ id: string; rule_id: string; mode: string }>>(env, `mail_rule_runs?id=eq.${encodeURIComponent(runId)}&owner_id=eq.${encodeURIComponent(user.id)}&rule_id=eq.${encodeURIComponent(rule.id)}&limit=1`);
      if (!runRows[0] || !["preview", "dry_run"].includes(runRows[0].mode)) return error("Run preview or dry-run before applying this rule", 409);
      await dbRequest(env, `mail_rule_runs?id=eq.${encodeURIComponent(runId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ mode: "apply", status: "started" }) });
    } else runId = await createRuleRun(env, user.id, rule.id, "apply", analysis.matches);
    const blockingConflicts = conflicts.filter((conflict) => conflict.severity === "error");
    if (blockingConflicts.length) {
      await finishRuleRun(env, user.id, runId, { status: "failed", error_message: blockingConflicts.map((conflict) => conflict.message).join(" ") });
      return json({ ok: false, runId, conflicts }, 409);
    }
    const result = await applyExistingRuleMatches(env, user.id, rule, runId, analysis.matches, sourceRows);
    await finishRuleRun(env, user.id, runId, { status: result.failures.length ? "failed" : "completed", matched_count: analysis.matches.length, changed_count: result.changedCount, sample: analysis.matches.slice(0, 20), error_message: result.failures[0]?.error || null });
    await dbRequest(env, `mail_rules?id=eq.${encodeURIComponent(rule.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ last_run_at: new Date().toISOString(), last_run_count: result.changedCount, last_error: result.failures[0]?.error || null }) });
    return json({ ok: result.failures.length === 0, runId, mode: "apply", matchedCount: analysis.matches.length, changedCount: result.changedCount, failures: result.failures, conflicts, undoable: result.changedCount > 0 });
  }
  const ruleRunsMatch = url.pathname.match(/^\/api\/rules\/([^/]+)\/runs$/);
  if (ruleRunsMatch && request.method === "GET") {
    const exists = await dbRequest<Array<{ id: string }>>(env, `mail_rules?id=eq.${encodeURIComponent(ruleRunsMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!exists[0]) return error("Rule not found", 404);
    return json(await dbRequest(env, `mail_rule_runs?owner_id=eq.${encodeURIComponent(user.id)}&rule_id=eq.${encodeURIComponent(ruleRunsMatch[1])}&order=started_at.desc&limit=50`));
  }
  const ruleRunUndoMatch = url.pathname.match(/^\/api\/rule-runs\/([^/]+)\/undo$/);
  if (ruleRunUndoMatch && request.method === "POST") {
    const runRows = await dbRequest<Array<{ id: string; rule_id: string; mode: string; status: string; completed_at?: string }>>(env, `mail_rule_runs?id=eq.${encodeURIComponent(ruleRunUndoMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const run = runRows[0];
    if (!run || run.mode !== "apply") return error("This rule run cannot be undone", 409);
    if (run.completed_at && new Date(run.completed_at).getTime() < Date.now() - 30_000) return error("Rule undo is available for 30 seconds", 410);
    const audits = await dbRequest<Array<{ message_id?: string; before_state?: JsonRecord; after_state?: JsonRecord }>>(env, `message_audit_log?owner_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(`rule-run:${run.id}`)}&action_type=eq.rule_apply&limit=500`);
    if (!audits.length) return error("No message changes were recorded for this run", 410);
    const undoneIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];
    for (const audit of audits) {
      const id = String(audit.message_id || "");
      if (!id) continue;
      try {
        const before = objectValue(audit.before_state);
        const after = objectValue(audit.after_state);
        const patch: JsonRecord = {};
        for (const key of ["folder", "custom_folder_id", "previous_folder", "is_read", "is_starred", "is_pinned", "is_flagged", "priority", "work_state", "follow_up_at", "snoozed_until"]) if (key in before) patch[key] = before[key];
        await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        const addedLabelIds = Array.isArray(after.added_label_ids) ? after.added_label_ids.map(String).filter(Boolean) : [];
        for (const labelId of addedLabelIds) await dbRequest(env, `message_labels?message_id=eq.${encodeURIComponent(id)}&label_id=eq.${encodeURIComponent(labelId)}`, { method: "DELETE" });
        const message = { id, mailbox_id: null, thread_id: null };
        await writeMessageAudit(env, user.id, `rule-run:${run.id}`, "rule_undo", message, {}, patch);
        undoneIds.push(id);
      } catch (undoError) {
        failures.push({ id, error: undoError instanceof Error ? undoError.message : "Could not undo rule" });
      }
    }
    await finishRuleRun(env, user.id, run.id, { status: "cancelled", changed_count: 0, error_message: failures[0]?.error || null });
    return json({ ok: failures.length === 0, undoneIds, failures });
  }
  const ruleMatch = url.pathname.match(/^\/api\/rules\/([^/]+)$/);
  if (ruleMatch && request.method === "PATCH") {
    const body = (await request.json()) as JsonRecord;
    const existing = await dbRequest<JsonRecord[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!existing[0]) return error("Rule not found", 404);
    const candidateConditions = body.conditions !== undefined || body.exceptions !== undefined
      ? buildRuleConditions(body.conditions ?? existing[0].conditions, body.exceptions ?? objectValue(existing[0].conditions).exceptions)
      : existing[0].conditions;
    const candidate = normalizeRuleRecord({ name: body.name ?? existing[0].name, priority: body.priority ?? existing[0].priority, enabled: body.enabled ?? existing[0].enabled, conditions: candidateConditions, actions: body.actions ?? existing[0].actions });
    const validation = validateRuleInput(candidate);
    if (validation.length) return error(validation.join("; "), 400);
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.priority === "number" && Number.isFinite(body.priority)) patch.priority = body.priority;
    if (body.conditions !== undefined || body.exceptions !== undefined) patch.conditions = candidate.conditions;
    if (body.actions !== undefined) patch.actions = objectValue(body.actions);
    const rows = await dbRequest<JsonRecord[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (ruleMatch && request.method === "DELETE") {
    const rows = await dbRequest<JsonRecord[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    return json({ ok: true, deleted: rows.length });
  }
  if (ruleMatch && request.method === "POST" && ruleMatch[1].endsWith(":run")) {
    const ruleId = ruleMatch[1].slice(0, -4);
    const rows = await dbRequest<Rule[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!rows[0]) return error("Rule not found", 404);
    const sourceRows = await existingRuleMessages(env, user.id);
    const analysis = matchRuleMessages(sourceRows, rows[0]);
    const runId = await createRuleRun(env, user.id, rows[0].id, "apply", analysis.matches);
    const result = await applyExistingRuleMatches(env, user.id, rows[0], runId, analysis.matches, sourceRows);
    await finishRuleRun(env, user.id, runId, { status: result.failures.length ? "failed" : "completed", matched_count: analysis.matches.length, changed_count: result.changedCount, error_message: result.failures[0]?.error || null });
    return json({ ok: result.failures.length === 0, runId, matched: analysis.matches.length, changed: result.changedCount, failures: result.failures, note: rows[0].actions?.forwardTo ? "Forwarding is skipped when running a rule on existing mail." : undefined });
  }
  if (request.method === "POST" && url.pathname === "/api/rules/reorder") {
    const body = (await request.json()) as JsonRecord;
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    const existing = await dbRequest<Array<{ id: string }>>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&select=id`);
    const allowed = new Set(existing.map((row) => row.id));
    const ordered = ids.filter((id) => allowed.has(id));
    await Promise.all(ordered.map((id, index) => dbRequest(env, `mail_rules?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ priority: (index + 1) * 100, updated_at: new Date().toISOString() }) })));
    return json({ ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/signatures") return json(await dbRequest(env, `signatures?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/signatures") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "signatures", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: body.mailboxId || mailbox.id, name: String(body.name || "Default"), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, is_default: body.isDefault === true }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/settings") { const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); return json({ ...(rows[0] || { owner_id: user.id }), send_undo_seconds: normalizeUndoSeconds(objectValue(mailbox.settings).send_undo_seconds, 0) }); }
  if (request.method === "PATCH" && url.pathname === "/api/settings") { const body = (await request.json()) as JsonRecord; const allowed = ["theme", "density", "reading_pane", "language", "timezone", "focused_inbox_enabled", "desktop_notifications", "push_subscription"]; const patch: JsonRecord = { updated_at: new Date().toISOString() }; for (const key of allowed) if (key in body) patch[key] = body[key]; let undoSeconds = normalizeUndoSeconds(objectValue(mailbox.settings).send_undo_seconds, 0); if ("send_undo_seconds" in body) { undoSeconds = normalizeUndoSeconds(body.send_undo_seconds, undoSeconds); const currentMailboxSettings = objectValue(mailbox.settings); await dbRequest(env, `mailboxes?id=eq.${encodeURIComponent(mailbox.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ settings: { ...currentMailboxSettings, send_undo_seconds: undoSeconds } }) }); } const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json({ ...(rows[0] || patch), send_undo_seconds: undoSeconds }); }
  if (request.method === "GET" && url.pathname === "/api/calendar") return json(await dbRequest(env, `calendar_events?owner_id=eq.${encodeURIComponent(user.id)}&order=starts_at.asc`));
  if (request.method === "POST" && url.pathname === "/api/calendar") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "calendar_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, title: String(body.title || "Untitled event"), description: String(body.description || ""), location: body.location || null, starts_at: body.startsAt, ends_at: body.endsAt, all_day: body.allDay === true, attendees: body.attendees || [] }) }); return json(rows[0], 201); }
  const calendarMatch = url.pathname.match(/^\/api\/calendar\/([^/]+)$/);
  if (request.method === "PATCH" && calendarMatch) { const body = (await request.json()) as JsonRecord; const patch: JsonRecord = { updated_at: new Date().toISOString() }; for (const key of ["title", "description", "location", "starts_at", "ends_at", "all_day", "attendees"]) if (key in body) patch[key] = body[key]; const rows = await dbRequest<JsonRecord[]>(env, `calendar_events?id=eq.${encodeURIComponent(calendarMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || null); }
  if (request.method === "GET" && url.pathname === "/api/tasks") return json(await dbRequest(env, `tasks?owner_id=eq.${encodeURIComponent(user.id)}&order=completed.asc,due_at.asc,created_at.desc`));
  if (request.method === "POST" && url.pathname === "/api/tasks") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, title: String(body.title || "Untitled task"), notes: String(body.notes || ""), due_at: body.dueAt || null, priority: Number(body.priority || 0), source_message_id: body.sourceMessageId || null }) }); return json(rows[0], 201); }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === "PATCH" && taskMatch) { const body = (await request.json()) as JsonRecord; const patch: JsonRecord = { updated_at: new Date().toISOString() }; for (const key of ["title", "notes", "due_at", "priority", "completed"]) if (key in body) patch[key] = body[key]; const rows = await dbRequest<JsonRecord[]>(env, `tasks?id=eq.${encodeURIComponent(taskMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || null); }
  if (request.method === "GET" && url.pathname === "/api/auto-replies") return json(await dbRequest(env, `auto_replies?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`));
  if (request.method === "POST" && url.pathname === "/api/auto-replies") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "auto_replies", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: body.mailboxId || mailbox.id, enabled: body.enabled === true, subject: String(body.subject || "Automatic reply"), body: String(body.body || ""), starts_at: body.startsAt || null, ends_at: body.endsAt || null }) }); return json(rows[0] || null); }
  if (request.method === "GET" && url.pathname === "/api/integrations") return json(await dbRequest(env, `integrations?owner_id=eq.${encodeURIComponent(user.id)}&order=provider.asc`));
  if (request.method === "PATCH" && url.pathname === "/api/integrations") { const body = (await request.json()) as JsonRecord; const provider = String(body.provider || ""); if (!provider) return error("Provider is required"); const rows = await dbRequest<JsonRecord[]>(env, "integrations", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, provider, status: String(body.status || "not_configured"), settings: body.settings || {} }) }); return json(rows[0] || null); }
  if (request.method === "POST" && url.pathname === "/api/drafts") return handleDraft(env, user, (await request.json()) as JsonRecord);
  if (request.method === "POST" && url.pathname === "/api/attachments") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("File is required");
    if (file.size > 15 * 1024 * 1024) return error("Attachments are limited to 15 MB");
    const requestedFrom = cleanAddress(String(form.get("fromAddress") || mailbox.address));
    const uploadAccess = await delegatedMailboxForSend(env, user.id, requestedFrom);
    const uploadMailbox = uploadAccess?.mailbox || (requestedFrom === mailbox.address ? mailbox : null);
    if (!uploadMailbox || !uploadMailbox.can_send) return error("This sender address is not enabled for attachments", 403);
    const attachmentSettings = await getMailboxAdminSettings(env, uploadMailbox);
    if (attachmentSettings && attachmentSettings.status !== "active") return error("This mailbox is currently suspended", 403);
    if (attachmentSettings && attachmentSettings.quota_bytes > 0 && attachmentSettings.storage_used_bytes + file.size > attachmentSettings.quota_bytes) return error("This mailbox has reached its storage quota", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const declaredContentType = file.type || "application/octet-stream";
    const detectedContentType = detectAttachmentContentType(file.name, declaredContentType, bytes);
    const safety = buildAttachmentSafety(file.name, declaredContentType, detectedContentType, file.size);
    if (safety.safetyStatus === "blocked") return error("This attachment type is blocked for safety");
    const objectKey = `drafts/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await putObject(env, objectKey, bytes, detectedContentType);
    if (attachmentSettings) await dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(uploadMailbox.id)}`, { method: "PATCH", body: JSON.stringify({ storage_used_bytes: attachmentSettings.storage_used_bytes + file.size, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
    return json({ object_key: objectKey, filename: file.name, content_type: declaredContentType, detected_content_type: detectedContentType, byte_size: file.size, sha256: await sha256Hex(bytes), preview_state: safety.previewState, safety_status: safety.safetyStatus, safety_reasons: safety.safetyReasons });
  }
  if (request.method === "POST" && url.pathname === "/api/send") { try { return await handleSend(env, user.id, (await request.json()) as JsonRecord, ctx); } catch (sendError) { return error(sendError instanceof Error ? sendError.message : "Send failed", 502); } }
  const sharedAttachmentDownload = url.pathname.match(/^\/api\/messages\/([^/]+)\/attachments\/download$/);
  const sharedAttachmentPreview = url.pathname.match(/^\/api\/attachments\/([^/]+)\/preview$/);
  if (request.method === "GET" && (sharedAttachmentDownload || sharedAttachmentPreview || url.pathname.startsWith("/api/attachments/"))) {
    const scope = messageScopeFilter(user.id, await delegatedMailboxIds(env, user.id, "read"));
    if (sharedAttachmentDownload) {
      const messageId = sharedAttachmentDownload[1];
      const messageRows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&${scope}&limit=1`);
      if (!messageRows[0]) return error("Message not found", 404);
      const messageOwnerId = String(messageRows[0].owner_id || user.id);
      const rows = await dbRequest<Array<{ filename: string; object_key: string; byte_size: number }>>(env, `attachments?message_id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(messageOwnerId)}&order=created_at.asc&limit=10`);
      if (!rows.length) return error("There are no attachments to download", 404);
      const totalBytes = rows.reduce((sum, row) => sum + Number(row.byte_size || 0), 0);
      if (totalBytes > 25 * 1024 * 1024) return error("The download is limited to 25 MB", 413);
      const entries: Array<{ filename: string; data: Uint8Array }> = [];
      for (const row of rows) entries.push({ filename: row.filename, data: await readObject(env, row.object_key) });
      const archive = buildZip(entries);
      const archiveName = `${String(messageRows[0].subject || "attachments").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "attachments"}.zip`;
      return new Response(archive, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${archiveName}"`, "cache-control": "no-store" } });
    }
    const attachmentId = (sharedAttachmentPreview?.[1] || url.pathname.split("/").pop() || "");
    const rows = await dbRequest<Array<{ object_key: string; filename: string; content_type: string; detected_content_type?: string | null; byte_size: number; preview_state: string; safety_status: string; message_id: string }>>(env, `attachments?id=eq.${encodeURIComponent(attachmentId)}&limit=1`);
    const attachment = rows[0];
    if (!attachment) return error("Attachment not found", 404);
    const messageRows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(attachment.message_id)}&${scope}&limit=1`);
    if (!messageRows[0]) return error("Attachment not found", 404);
    const contentType = attachment.detected_content_type || attachment.content_type;
    if (sharedAttachmentPreview) {
      if (attachment.safety_status === "blocked" || attachment.safety_status === "infected") return error("This attachment is blocked from preview", 409);
      if (attachment.preview_state !== "ready" || (!contentType.startsWith("image/") && contentType !== "application/pdf") || Number(attachment.byte_size || 0) > 5 * 1024 * 1024) return error("This file is not eligible for safe preview", 415);
      return json({ url: await signedObjectUrl(env, attachment.object_key), filename: attachment.filename, contentType, previewState: attachment.preview_state });
    }
    const signedUrl = await signedObjectUrl(env, attachment.object_key);
    return url.searchParams.get("json") === "true" ? json({ url: signedUrl }) : Response.redirect(signedUrl, 302);
  }
  const downloadAllMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/attachments\/download$/);
  if (request.method === "GET" && downloadAllMatch) { const messageRows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(downloadAllMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!messageRows[0]) return error("Message not found", 404); const rows = await dbRequest<Array<{ filename: string; object_key: string; byte_size: number }>>(env, `attachments?message_id=eq.${encodeURIComponent(downloadAllMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc&limit=10`); if (!rows.length) return error("There are no attachments to download", 404); const totalBytes = rows.reduce((sum, row) => sum + Number(row.byte_size || 0), 0); if (totalBytes > 25 * 1024 * 1024) return error("The download is limited to 25 MB", 413); const entries: Array<{ filename: string; data: Uint8Array }> = []; for (const row of rows) entries.push({ filename: row.filename, data: await readObject(env, row.object_key) }); const archive = buildZip(entries); const archiveName = `${String(messageRows[0].subject || "attachments").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "attachments"}.zip`; return new Response(archive, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${archiveName}"`, "cache-control": "no-store" } }); }
  const previewMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/preview$/);
  if (request.method === "GET" && previewMatch) { const rows = await dbRequest<Array<{ object_key: string; filename: string; content_type: string; detected_content_type?: string | null; byte_size: number; preview_state: string; safety_status: string }>>(env, `attachments?id=eq.${encodeURIComponent(previewMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); const attachment = rows[0]; if (!attachment) return error("Attachment not found", 404); const contentType = attachment.detected_content_type || attachment.content_type; if (attachment.safety_status === "blocked" || attachment.safety_status === "infected") return error("This attachment is blocked from preview", 409); if (attachment.preview_state !== "ready" || (!contentType.startsWith("image/") && contentType !== "application/pdf") || Number(attachment.byte_size || 0) > 5 * 1024 * 1024) return error("This file is not eligible for safe preview", 415); return json({ url: await signedObjectUrl(env, attachment.object_key), filename: attachment.filename, contentType, previewState: attachment.preview_state }); }
  if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) { const id = url.pathname.split("/").pop() || ""; const rows = await dbRequest<Array<{ object_key: string }>>(env, `attachments?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!rows[0]) return error("Attachment not found", 404); const signedUrl = await signedObjectUrl(env, rows[0].object_key); return url.searchParams.get("json") === "true" ? json({ url: signedUrl }) : Response.redirect(signedUrl, 302); }
  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) { try { return protectedHeaders(await api(request, env, ctx)); } catch (requestError) { return error(requestError instanceof Error ? requestError.message : "Internal server error", 500); } }
    const assetResponse = await env.ASSETS.fetch(request);
    const noStoreAsset = url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest";
    return protectedHeaders(assetResponse, noStoreAsset);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> { await processScheduled(env); },
  async email(message: { from: string; to: string; raw: ReadableStream<Uint8Array>; forward: (address: string) => Promise<void>; setReject: (reason: string) => void }, env: Env, ctx: ExecutionContext): Promise<void> {
    try { const raw = await new Response(message.raw).arrayBuffer(); await ingestRawEmail(env, raw, message.from, message.to, async (address) => message.forward(address), ctx); if (env.OUTLOOK_FORWARD_TO) await message.forward(env.OUTLOOK_FORWARD_TO); }
    catch (ingestError) { message.setReject(ingestError instanceof Error ? ingestError.message.slice(0, 180) : "Inbound processing failed"); }
  },
};

export { buildMailQuery, parseSearchQuery };
