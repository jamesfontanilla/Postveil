import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";

if (typeof globalThis.DOMParser === "undefined") {
  (globalThis as typeof globalThis & { DOMParser: typeof XmlDomParser }).DOMParser = XmlDomParser;
}
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
  isValidDomain,
  isValidEmailAddress,
  isValidRecoveryEmail,
  maskRecoveryEmail,
  MAX_JSON_BODY_BYTES,
  MAX_MULTIPART_REQUEST_BYTES,
  MAX_RAW_EMAIL_BYTES,
  normalizeRecoveryEmail,
  RequestInputError,
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
import {
  cleanCollaborationText,
  collaborationCommentKind,
  collaborationMentionEmails,
  collaborationPolicyMatches,
  collaborationPriority,
  collaborationSlaBreached,
  collaborationSlaDueAt,
  collaborationStatus,
  collaborationVisibility,
  type CollaborationEvent,
  type CollaborationPriority,
  type CollaborationStatus,
} from "./collaboration.ts";
import {
  buildIcsCalendar,
  buildIcsEvent,
  buildVCard,
  calendarBusySlots,
  csvEscape,
  normalizeWorkspaceSlug,
  parseContactCsv,
} from "./workspace.ts";

interface Env {
  ASSETS: Fetcher;
  API_RATE_LIMITER: RateLimit;
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
  ALLOWED_SENDER_DOMAINS?: string;
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
  CONFIDENTIAL_LINK_SECRET?: string;
  CONFIDENTIAL_ENCRYPTION_KEY?: string;
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
type CollaborationThread = { id?: string; owner_id: string; organization_id: string; thread_id: string; status: CollaborationStatus; priority: CollaborationPriority; assignee_id?: string | null; sla_due_at?: string | null; sla_breached_at?: string | null; first_response_at?: string | null; last_customer_at?: string | null; last_agent_at?: string | null; created_at?: string; updated_at?: string };
type CollaborationMember = { user_id: string; email: string; display_name: string; role: OrganizationMember["role"]; status: OrganizationMember["status"] };
type WorkspaceCalendar = { id: string; owner_id: string; organization_id?: string | null; name: string; slug: string; color: string; timezone: string; visibility: "private" | "shared" | string; is_default: boolean };
type WorkspaceProject = { id: string; owner_id: string; organization_id?: string | null; name: string; description: string; color: string; status: string; created_by: string };
type AdminAuthUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string | null; banned_until?: string | null; user_metadata?: JsonRecord };
type SecurityEvent = { id: string; organization_id: string | null; actor_id: string | null; subject_user_id: string; event_type: string; event_key: string; session_id: string | null; ip_hash: string | null; user_agent: string | null; is_suspicious: boolean; details: JsonRecord; created_at: string };
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
  created_at?: string;
  updated_at?: string;
};
type Rule = RuleDefinition & { id: string; owner_id: string; conditions: JsonRecord; actions: JsonRecord; enabled: boolean; priority: number };
type StoredAttachment = { object_key: string; filename: string; content_type: string; detected_content_type: string; byte_size: number; sha256: string; preview_state: "ready" | "not_available"; safety_status: "unknown" | "suspicious" | "blocked"; safety_reasons: string[]; content_id?: string; disposition?: string | null };
type ProviderConfig = { id?: string; organization_id?: string; provider: ProviderName; enabled: boolean; priority: number; config: JsonRecord; daily_limit?: number };
type ProviderHealth = { id?: string; organization_id?: string; provider: ProviderName; status: string; last_success_at?: string | null; last_failure_at?: string | null; last_latency_ms?: number | null; consecutive_failures?: number; circuit_open_until?: string | null; sent_24h?: number; delivered_24h?: number; bounced_24h?: number; complained_24h?: number; updated_at?: string };
type DeliveryEvent = { provider: string; eventType: string; providerMessageId?: string; eventId?: string; recipient?: string; reason?: string; occurredAt?: string; payload: JsonRecord };
type ComposeMetadata = {
  composeMode?: "plain" | "html" | "markdown";
  timezone?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  recurrenceUntil?: string | null;
  recurrenceCount?: number | null;
  readReceipt?: boolean;
  deliveryReceipt?: boolean;
  requestConfirmation?: boolean;
  replyTracking?: boolean;
  followUpTracking?: boolean;
  mailMerge?: boolean;
  personalizedBulk?: boolean;
  contactGroup?: string;
  confidentialMode?: boolean;
  expiresHours?: number;
  passwordProtected?: boolean;
  passwordHint?: string;
  linkPreviewEnabled?: boolean;
  confidentialPassword?: string;
  maxViews?: number;
};
type ConfidentialRow = { id: string; owner_id: string; message_id: string; token_hash: string; encryption_iv: string; encrypted_payload: string; password_hash: string | null; password_salt: string | null; password_hint: string; expires_at: string; max_views: number; view_count: number; revoked_at: string | null };

const SYSTEM_FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam", "quarantine"] as const;
const SPAM_THRESHOLD = 0.70;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const error = (message: string, status = 400) => json({ error: message }, status);

function cleanAddress(value: string): string {
  return value.trim().replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

function configuredAppDomain(env: Pick<Env, "APP_DOMAIN">): string {
  const domain = String(env.APP_DOMAIN || "").trim().toLowerCase();
  if (!isValidDomain(domain)) throw new Error("APP_DOMAIN is not configured with a valid domain");
  return domain;
}

function configuredSenderDomains(env: Pick<Env, "APP_DOMAIN" | "ALLOWED_SENDER_DOMAINS">): string[] {
  const configured = String(env.ALLOWED_SENDER_DOMAINS || "")
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => isValidDomain(value));
  return [...new Set([configuredAppDomain(env), ...configured])];
}

function isConfiguredSenderAddress(env: Pick<Env, "APP_DOMAIN" | "ALLOWED_SENDER_DOMAINS">, address: string): boolean {
  const normalized = cleanAddress(address);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return isValidEmailAddress(normalized) && configuredSenderDomains(env).includes(domain);
}

function defaultMailboxAddress(env: Pick<Env, "APP_DOMAIN" | "DEFAULT_FROM_EMAIL" | "ALLOWED_SENDER_DOMAINS">): string {
  const fallback = `postmaster@${configuredAppDomain(env)}`;
  const address = cleanAddress(env.DEFAULT_FROM_EMAIL?.trim() || fallback);
  if (!isConfiguredSenderAddress(env, address)) throw new Error("DEFAULT_FROM_EMAIL must use an allowed sender domain");
  return address;
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function splitAddresses(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  return values
    .map((item) => cleanAddress(String(item)))
    .filter((address) => isValidEmailAddress(address));
}

const MAX_EMAIL_IMAGE_PROXY_BYTES = 5 * 1024 * 1024;

function publicHttpUrl(value: string): URL | null {
  const raw = value.trim();
  if (!raw || raw.length > 4096) return null;
  const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal" || host === "169.254.169.254" || host === "[::1]" || host === "::1") return null;
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      const [first, second] = octets;
      if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) || first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)) return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function fetchProxiedEmailImage(source: string): Promise<Response> {
  const target = publicHttpUrl(source);
  if (!target) return error("This image destination is not allowed", 400);
  const upstream = await fetch(target.toString(), {
    redirect: "follow",
    headers: { accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1", "user-agent": "Postveil privacy image proxy" },
  });
  if (!upstream.ok) return error("The remote image is unavailable", 502);
  const contentType = (upstream.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
  if (!/^image\/(?:avif|gif|jpeg|png|webp)$/.test(contentType)) return error("Only safe raster images can be proxied", 415);
  const declaredLength = Number(upstream.headers.get("content-length") || 0);
  if (declaredLength > MAX_EMAIL_IMAGE_PROXY_BYTES) return error("The remote image is too large", 413);
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_EMAIL_IMAGE_PROXY_BYTES) return error("The remote image is too large", 413);
  return new Response(bytes, { headers: { "content-type": contentType, "content-length": String(bytes.byteLength), "cache-control": "private, no-store", "content-disposition": "inline" } });
}

async function inspectExternalLink(source: string): Promise<JsonRecord> {
  const initial = publicHttpUrl(source);
  if (!initial) return { ok: false, url: source, warning: "This destination is not allowed." };
  const chain: Array<{ url: string; status: number; location?: string | null }> = [];
  let current = initial;
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(current.toString(), { method: "HEAD", redirect: "manual", headers: { "user-agent": "Postveil link inspection" } }).catch(() => null);
    if (!response) return { ok: false, url: initial.toString(), chain, warning: "The destination could not be reached for inspection." };
    const location = response.headers.get("location");
    chain.push({ url: current.toString(), status: response.status, location });
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
    const next = publicHttpUrl(new URL(location, current).toString());
    if (!next) return { ok: false, url: initial.toString(), chain, warning: "The redirect leaves the safe inspection boundary." };
    current = next;
  }
  const tooMany = chain.length >= 6 && [301, 302, 303, 307, 308].includes(chain[chain.length - 1]?.status || 0);
  return { ok: !tooMany, url: initial.toString(), finalUrl: current.toString(), chain, warning: tooMany ? "Too many redirects were detected." : chain.length > 1 ? "This link redirects before reaching its destination." : undefined };
}

function parseAddressList(value: unknown): { addresses: string[]; invalid: boolean } {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  let invalid = false;
  const addresses: string[] = [];
  for (const item of values) {
    const raw = String(item ?? "").trim();
    if (!raw) continue;
    const address = cleanAddress(raw);
    if (!isValidEmailAddress(address)) {
      invalid = true;
      continue;
    }
    addresses.push(address);
  }
  return { addresses, invalid };
}

async function enforceRequestBodyLimit(request: Request): Promise<void> {
  if (!["POST", "PUT", "PATCH"].includes(request.method)) return;
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  const maxBytes = contentType.startsWith("multipart/form-data")
    ? MAX_MULTIPART_REQUEST_BYTES
    : MAX_JSON_BODY_BYTES;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) throw new RequestInputError("Invalid request length");
    if (length > maxBytes) throw new RequestInputError("Request body is too large", 413);
  }
  const bytes = await request.clone().arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new RequestInputError("Request body is too large", 413);
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

function unsubscribeTarget(value: string | undefined): string | null {
  const candidate = (value?.match(/<([^>]+)>/)?.[1] || value || "").trim();
  return /^(https?:\/\/|mailto:)/i.test(candidate) ? candidate.slice(0, 1000) : null;
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
  } catch {
    return { ok: false, status: 0, detail: "Probe failed" };
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
  return new S3Client({
    region: env.B2_REGION,
    endpoint: env.B2_ENDPOINT,
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY },
  });
}

async function putObject(env: Env, key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await storageClient(env).send(new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Encode(bytes: Uint8Array): string {
  let value = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) value += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(value);
}

function base64Decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = atob(normalized);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function deriveConfidentialToken(env: Env, id: string): Promise<string> {
  if (!env.CONFIDENTIAL_LINK_SECRET) throw new Error("Confidential message links are not configured");
  return base64UrlEncode(await hmacSha256(env.CONFIDENTIAL_LINK_SECRET, `share:${id}`));
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: asArrayBuffer(salt), iterations: 100_000, hash: "SHA-256" }, key, 256);
  return base64UrlEncode(new Uint8Array(bits));
}

async function encryptConfidentialPayload(env: Env, payload: JsonRecord): Promise<{ iv: string; encrypted: string }> {
  if (!env.CONFIDENTIAL_ENCRYPTION_KEY) throw new Error("Confidential message encryption is not configured");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, await aesKey(env.CONFIDENTIAL_ENCRYPTION_KEY), new TextEncoder().encode(JSON.stringify(payload)));
  return { iv: base64UrlEncode(iv), encrypted: base64UrlEncode(new Uint8Array(encrypted)) };
}

async function decryptConfidentialPayload(env: Env, row: ConfidentialRow): Promise<JsonRecord> {
  if (!env.CONFIDENTIAL_ENCRYPTION_KEY) throw new Error("Confidential message encryption is not configured");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(base64Decode(row.encryption_iv)) }, await aesKey(env.CONFIDENTIAL_ENCRYPTION_KEY), asArrayBuffer(base64Decode(row.encrypted_payload)));
  return JSON.parse(new TextDecoder().decode(decrypted)) as JsonRecord;
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

async function deleteObjects(env: Env, keys: string[]): Promise<number> {
  const normalizedKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  let failed = 0;
  for (let offset = 0; offset < normalizedKeys.length; offset += 1000) {
    const batch = normalizedKeys.slice(offset, offset + 1000);
    try {
      const result = await storageClient(env).send(new DeleteObjectsCommand({
        Bucket: env.B2_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        ChecksumAlgorithm: "MD5",
      }));
      failed += result.Errors?.length ?? 0;
    } catch (storageError) {
      console.error("B2 multi-object delete failed", {
        name: storageError instanceof Error ? storageError.name : "UnknownError",
        message: storageError instanceof Error ? storageError.message.slice(0, 240) : String(storageError).slice(0, 240),
        statusCode: typeof storageError === "object" && storageError !== null && "$metadata" in storageError
          ? ((storageError as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? null)
          : null,
      });
      failed += batch.length;
    }
  }
  return failed;
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
  await ensurePrivacySettings(env, user.id);
  const existing = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc&limit=1`);
  if (existing[0]) return existing[0];
  const address = defaultMailboxAddress(env);
  const created = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address, display_name: address.split("@")[0], is_default: true }) });
  return created[0];
}

async function ensurePrivacySettings(env: Env, ownerId: string): Promise<PrivacySettings> {
  const existing = await dbRequest<PrivacySettings[]>(env, `user_privacy_settings?owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`).catch(() => []);
  if (existing[0]) return existing[0];
  const created = await dbRequest<PrivacySettings[]>(env, "user_privacy_settings", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ owner_id: ownerId }),
  }).catch(() => []);
  if (created[0]) return created[0];
  const retry = await dbRequest<PrivacySettings[]>(env, `user_privacy_settings?owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  if (!retry[0]) throw new Error("Privacy settings could not be initialized");
  return retry[0];
}

function privacySettingsView(row: PrivacySettings): PrivacySettings {
  return {
    owner_id: row.owner_id,
    ai_processing_enabled: row.ai_processing_enabled === true,
    login_alerts_enabled: row.login_alerts_enabled !== false,
    remote_images_enabled: row.remote_images_enabled === true,
    privacy_analytics_enabled: row.privacy_analytics_enabled === true,
    metadata_minimization_enabled: row.metadata_minimization_enabled !== false,
    external_portal_enabled: row.external_portal_enabled !== false,
    storage_region: String(row.storage_region || "default"),
    no_training_ai_policy_acknowledged: row.no_training_ai_policy_acknowledged === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

async function collaborationMembers(env: Env, organizationId: string): Promise<CollaborationMember[]> {
  const members = await dbRequest<OrganizationMember[]>(env, `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&order=created_at.asc`);
  const users = await authUsers(env).catch(() => []);
  const userMap = new Map(users.map((candidate) => [candidate.id, candidate]));
  return members.map((member) => ({
    user_id: member.user_id,
    email: String(userMap.get(member.user_id)?.email || ""),
    display_name: authUserDisplayName(userMap.get(member.user_id) || { id: member.user_id }),
    role: member.role,
    status: member.status,
  }));
}

async function collaborationThreadContext(env: Env, user: User, threadId: string): Promise<{ organization: Organization; ownerId: string; threadId: string; mailboxIds: string[]; member: OrganizationMember } | null> {
  if (!threadId || !/^[0-9a-f-]{20,}$/i.test(threadId)) return null;
  const messages = await dbRequest<Array<{ owner_id: string; mailbox_id?: string | null }>>(env, `messages?thread_id=eq.${encodeURIComponent(threadId)}&select=owner_id,mailbox_id&limit=100`).catch(() => []);
  if (!messages.length) return null;
  const ownerId = String(messages[0].owner_id || "");
  const delegatedIds = await delegatedMailboxIds(env, user.id, "read");
  const mailboxIds = [...new Set(messages.map((message) => String(message.mailbox_id || "")).filter(Boolean))];
  if (ownerId !== user.id && !mailboxIds.some((id) => delegatedIds.includes(id))) return null;
  const organizations = await dbRequest<Organization[]>(env, `organizations?owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`).catch(() => []);
  const organization = organizations[0] || await ensureOrganization(env, user);
  const member = await organizationMember(env, organization.id, user.id);
  if (!member || member.status !== "active") return null;
  return { organization, ownerId, threadId, mailboxIds, member };
}

async function ensureCollaborationThread(env: Env, ownerId: string, organizationId: string, threadId: string, priority: CollaborationPriority = "normal"): Promise<CollaborationThread> {
  const existing = await dbRequest<CollaborationThread[]>(env, `collaboration_threads?owner_id=eq.${encodeURIComponent(ownerId)}&thread_id=eq.${encodeURIComponent(threadId)}&limit=1`).catch(() => []);
  if (existing[0]) return existing[0];
  const created = await dbRequest<CollaborationThread[]>(env, "collaboration_threads", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ owner_id: ownerId, organization_id: organizationId, thread_id: threadId, status: "open", priority, sla_due_at: collaborationSlaDueAt(priority) }),
  }).catch(() => []);
  if (created[0]) return created[0];
  const retry = await dbRequest<CollaborationThread[]>(env, `collaboration_threads?owner_id=eq.${encodeURIComponent(ownerId)}&thread_id=eq.${encodeURIComponent(threadId)}&limit=1`);
  if (!retry[0]) throw new Error("Collaboration state could not be initialized");
  return retry[0];
}

async function collaborationActivity(env: Env, context: { ownerId: string; organizationId: string; threadId: string | null }, actorId: string, eventType: string, payload: JsonRecord = {}): Promise<void> {
  await dbRequest(env, "collaboration_activity", {
    method: "POST",
    body: JSON.stringify({ owner_id: context.ownerId, organization_id: context.organizationId, thread_id: context.threadId, actor_id: actorId, event_type: eventType.slice(0, 80), payload }),
  }).catch(() => undefined);
}

async function applyCollaborationPolicies(env: Env, context: { ownerId: string; organizationId: string; threadId: string }, actorId: string, event: CollaborationEvent, state: CollaborationThread): Promise<CollaborationThread> {
  const policies = await dbRequest<Array<{ id: string; name: string; kind: string; conditions?: JsonRecord; actions?: JsonRecord }>>(env, `collaboration_policies?organization_id=eq.${encodeURIComponent(context.organizationId)}&enabled=eq.true&order=priority.asc,created_at.asc&limit=100`).catch(() => []);
  let current = state;
  for (const policy of policies) {
    if (!collaborationPolicyMatches(policy.conditions, event, current)) continue;
    const actions = objectValue(policy.actions);
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (actions.status !== undefined) patch.status = collaborationStatus(actions.status);
    if (actions.priority !== undefined) patch.priority = collaborationPriority(actions.priority);
    if (actions.assignTo === "unassigned" || actions.assignTo === null) patch.assignee_id = null;
    if (typeof actions.assignTo === "string" && /^[0-9a-f-]{20,}$/i.test(actions.assignTo)) {
      const member = await organizationMember(env, context.organizationId, actions.assignTo);
      if (member?.status === "active") patch.assignee_id = actions.assignTo;
    }
    if (actions.slaMinutes !== undefined) patch.sla_due_at = collaborationSlaDueAt(collaborationPriority(patch.priority ?? current.priority), Date.now(), Number(actions.slaMinutes));
    if (Object.keys(patch).length > 1) {
      const rows = await dbRequest<CollaborationThread[]>(env, `collaboration_threads?id=eq.${encodeURIComponent(String(current.id || ""))}&owner_id=eq.${encodeURIComponent(context.ownerId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }).catch(() => []);
      current = rows[0] || { ...current, ...patch } as CollaborationThread;
    }
    await collaborationActivity(env, context, actorId, "policy_applied", { policyId: policy.id, policyName: policy.name, kind: policy.kind, event, actions });
  }
  return current;
}

async function workspaceCalendarsForUser(env: Env, user: User, organization: Organization | null): Promise<WorkspaceCalendar[]> {
  const filters = [`owner_id.eq.${user.id}`];
  if (organization?.id) filters.push(`organization_id.eq.${organization.id}`);
  return dbRequest<WorkspaceCalendar[]>(env, `workspace_calendars?or=(${filters.join(",")})&order=is_default.desc,name.asc&limit=100`).catch(() => []);
}

async function ensureWorkspaceCalendar(env: Env, user: User, organization: Organization | null, requestedId?: unknown): Promise<WorkspaceCalendar | null> {
  const calendars = await workspaceCalendarsForUser(env, user, organization);
  if (typeof requestedId === "string" && requestedId) return calendars.find((calendar) => calendar.id === requestedId) || null;
  const existing = calendars.find((calendar) => calendar.owner_id === user.id && calendar.is_default) || calendars.find((calendar) => calendar.owner_id === user.id);
  if (existing) return existing;
  const slug = `personal-${user.id.replace(/-/g, "").slice(0, 12)}`;
  const rows = await dbRequest<WorkspaceCalendar[]>(env, "workspace_calendars", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, organization_id: organization?.id || null, name: "Personal", slug, timezone: "UTC", visibility: "private", is_default: true }) }).catch(() => []);
  return rows[0] || (await workspaceCalendarsForUser(env, user, organization)).find((calendar) => calendar.owner_id === user.id) || null;
}

async function canEditWorkspaceCalendar(env: Env, user: User, organization: Organization | null, calendar: WorkspaceCalendar): Promise<boolean> {
  if (calendar.owner_id === user.id) return true;
  if (!organization?.id || calendar.organization_id !== organization.id) return false;
  const member = await organizationMember(env, organization.id, user.id);
  if (!member || member.status !== "active") return false;
  if (member.role === "owner" || member.role === "admin") return true;
  const access = await dbRequest<Array<{ role: string }>>(env, `workspace_calendar_members?calendar_id=eq.${encodeURIComponent(calendar.id)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
  return access[0]?.role === "editor";
}

async function workspaceCalendarEvents(env: Env, user: User, organization: Organization | null, from?: string, to?: string, query?: string): Promise<JsonRecord[]> {
  const calendars = await workspaceCalendarsForUser(env, user, organization);
  if (!calendars.length) return [];
  const ids = calendars.map((calendar) => calendar.id).join(",");
  const range = `${from ? `&starts_at=lt.${encodeURIComponent(to || "2999-01-01T00:00:00.000Z")}` : ""}${to ? `&ends_at=gt.${encodeURIComponent(from || "1970-01-01T00:00:00.000Z")}` : ""}`;
  const search = query?.trim() ? `&or=${encodeURIComponent(`title.ilike.*${safeLike(query.trim())}*,description.ilike.*${safeLike(query.trim())}*`)}` : "";
  return dbRequest<JsonRecord[]>(env, `calendar_events?calendar_id=in.(${ids})${range}${search}&order=starts_at.asc&limit=500`).catch(() => []);
}

async function workspaceProjectList(env: Env, user: User, organization: Organization | null): Promise<WorkspaceProject[]> {
  const filters = [`owner_id.eq.${user.id}`];
  if (organization?.id) filters.push(`organization_id.eq.${organization.id}`);
  return dbRequest<WorkspaceProject[]>(env, `workspace_projects?or=(${filters.join(",")})&status=neq.archived&order=updated_at.desc&limit=100`).catch(() => []);
}

async function workspaceProjectAccess(env: Env, user: User, organization: Organization | null, projectId: string): Promise<WorkspaceProject | null> {
  const projects = await workspaceProjectList(env, user, organization);
  return projects.find((project) => project.id === projectId) || null;
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
  const privacy = await ensurePrivacySettings(env, user.id).catch(() => null);
  if (suspicious && user.email && privacy?.login_alerts_enabled !== false) {
    ctx.waitUntil(sendSystemMessage(env, {
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
  // Keep account deletion under the Workers subrequest budget even when a
  // mailbox contains many raw messages and attachments.
  await deleteObjects(env, keys);
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
  if (request.method === "GET" && url.pathname === "/api/admin/organization-blocklist") {
    return json(await dbRequest<JsonRecord[]>(env, `organization_sender_blocks?organization_id=eq.${encodeURIComponent(organization.id)}&order=match_type.asc,match_value.asc`).catch(() => []));
  }
  if (request.method === "POST" && url.pathname === "/api/admin/organization-blocklist") {
    const body = (await request.json()) as JsonRecord;
    const matchType = body.matchType === "domain" ? "domain" : body.matchType === "address" ? "address" : "";
    if (!matchType) return error("Choose a sender or domain");
    let matchValue = "";
    try { matchValue = normalizeSenderPolicyValue(matchType, body.matchValue); } catch (blockError) { return error(blockError instanceof Error ? blockError.message : "Blocklist value is invalid"); }
    try {
      const rows = await dbRequest<JsonRecord[]>(env, "organization_sender_blocks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: organization.id, created_by: actor.id, match_type: matchType, match_value: matchValue, enabled: true }) });
      return json(rows[0], 201);
    } catch (blockError) {
      return error(blockError instanceof Error ? blockError.message : "That organization block already exists", 409);
    }
  }
  const organizationBlockMatch = url.pathname.match(/^\/api\/admin\/organization-blocklist\/([^/]+)$/);
  if (organizationBlockMatch && request.method === "PATCH") {
    const id = decodeURIComponent(organizationBlockMatch[1]);
    const existing = await dbRequest<JsonRecord[]>(env, `organization_sender_blocks?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}&limit=1`);
    if (!existing[0]) return error("Organization block not found", 404);
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    const rows = await dbRequest<JsonRecord[]>(env, `organization_sender_blocks?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || { ...existing[0], ...patch });
  }
  if (organizationBlockMatch && request.method === "DELETE") {
    const id = decodeURIComponent(organizationBlockMatch[1]);
    await dbRequest(env, `organization_sender_blocks?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "DELETE" });
    return json({ ok: true });
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
      await sendSystemMessage(env, { fromAddress: await defaultFromAddress(env, actor.id), to: [targetAuth.email], subject: "Reset your Postveil password", text: `An administrator requested a password reset for your Postveil account. Use this one-time link:\n\n${link}\n\nIf you did not expect this, contact your workspace administrator.` }, organization.id);
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

async function hasOwnedRecord(env: Env, table: string, ownerId: string, recordId: unknown): Promise<boolean> {
  const id = typeof recordId === "string" ? recordId.trim() : "";
  if (!id) return false;
  const rows = await dbRequest<Array<{ id: string }>>(
    env,
    `${table}?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id&limit=1`,
  );
  return Boolean(rows[0]);
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

async function assessInbound(env: Env, ownerId: string, mailboxId: string, envelopeFrom: string, headerFrom: string, subject: string, textBody: string, htmlBody: string, parsed: { headers?: Array<{ key: string; value: string }>; attachments?: Array<{ filename?: string | null; mimeType?: string }> }, fromName = "", mailboxAddress = ""): Promise<{ score: number; reasons: string[]; focusedScore: number; focusedCategory: string; authResults: TrustAuthResults; trustScore: number; trustReasons: string[]; trustEvidence: JsonRecord; receivedAuthAt: string | null; senderFirstSeen: boolean; knownContact: boolean; replyToMismatch: boolean; linkCount: number; trackingPixelCount: number; policyId: string | null; policyAction: string | null; policyTargetFolderId: string | null }> {
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
  if (spf === "fail" || spf === "softfail" || spf === "permerror" || spf === "temperror") reasons.push("SPF failure");
  if (dkim === "fail" || dkim === "softfail" || dkim === "permerror" || dkim === "temperror") reasons.push("DKIM failure");
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
  const linkEvidence = extractTrustEvidence({ sender, replyTo, fromName, mailboxAddress, subject, textBody, htmlBody, authentication: authResults, attachments: parsed.attachments });
  if (linkEvidence.reply_to_mismatch) { score += 0.10; reasons.push("reply-to mismatch"); }
  const content = `${subject} ${textBody} ${stripHtml(htmlBody)}`;
  const urls = content.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  if (urls.length >= 5) { score += 0.10; reasons.push("many links"); }
  if (urls.some((url) => /(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly)\//i.test(url))) { score += 0.08; reasons.push("shortened link"); }
  if (urls.some((url) => /^(?:https?:\/\/)?(?:[^/]+@)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)/i.test(url) || urlHost(url).startsWith("xn--"))) { score += 0.08; reasons.push("suspicious link host"); }
  if (linkEvidence.lookalike_domain) { score += 0.16; reasons.push(`lookalike ${linkEvidence.lookalike_domain} domain`); }
  if (linkEvidence.display_name_spoof) { score += 0.14; reasons.push("display-name spoofing signal"); }
  if (linkEvidence.suspicious_reply_to) { score += 0.12; reasons.push("suspicious reply-to domain"); }
  if (linkEvidence.qr_code_count) { score += 0.08; reasons.push("QR-code candidate"); }
  if (linkEvidence.link_reputation.some((item) => item.reputation === "suspicious")) { score += 0.10; reasons.push("link reputation warning"); }
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
  if ((linkEvidence.attachment_reputation || []).some((item) => item.status === "suspicious")) reasons.push("attachment reputation warning");
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
  const trustEvidence = extractTrustEvidence({ sender, replyTo, fromName, mailboxAddress, subject, textBody, htmlBody, authentication: authResults, attachments: parsed.attachments, firstSeenSender: !previous[0], knownContact: Boolean(knownContact[0]), policyAction: senderPolicy?.action || null, policyId: senderPolicy?.id || null });
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
  const messageRows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1&select=id,thread_id,mailbox_id,from_address,subject,text_body,raw_object_key,folder`);
  const message = messageRows[0] || {};
  const patch: JsonRecord = {};
  if (typeof actions.folder === "string" && SYSTEM_FOLDERS.includes(actions.folder as typeof SYSTEM_FOLDERS[number])) {
    patch.folder = actions.folder;
    patch.custom_folder_id = null;
  }
  if (typeof actions.customFolderId === "string") {
    const folders = await dbRequest<Array<{ id: string }>>(env, `mail_folders?id=eq.${encodeURIComponent(actions.customFolderId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
    if (folders[0]) { patch.folder = "custom"; patch.custom_folder_id = actions.customFolderId; }
  }
  if (typeof actions.markRead === "boolean") patch.is_read = actions.markRead;
  if (typeof actions.star === "boolean") patch.is_starred = actions.star;
  if (typeof actions.pin === "boolean") patch.is_pinned = actions.pin;
  if (typeof actions.flag === "boolean") patch.is_flagged = actions.flag;
  if (typeof actions.priority === "number") patch.priority = Math.max(0, Math.min(2, actions.priority));
  if (Number.isInteger(actions.snoozeMinutes) && Number(actions.snoozeMinutes) > 0) {
    patch.previous_folder = String(message.folder || "inbox");
    patch.snoozed_until = new Date(Date.now() + Math.min(43200, Number(actions.snoozeMinutes)) * 60_000).toISOString();
  }
  if (Object.keys(patch).length) await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (typeof actions.label === "string" && actions.label.trim()) {
    const name = actions.label.trim();
    const labels = await dbRequest<Array<{ id: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&name=eq.${encodeURIComponent(name)}&limit=1`);
    const label = labels[0] || (await dbRequest<Array<{ id: string }>>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, name }) }))[0];
    if (label) await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: label.id }) });
  }
  if (typeof actions.forwardTo === "string" && forwardInbound) await forwardInbound(cleanAddress(actions.forwardTo));

  const actionAlreadyRecorded = async (action: string): Promise<boolean> => {
    const rows = await dbRequest<JsonRecord[]>(env, `mail_events?owner_id=eq.${encodeURIComponent(ownerId)}&message_id=eq.${encodeURIComponent(messageId)}&event_type=eq.rule_action&order=created_at.desc&limit=100&select=payload`).catch(() => []);
    return rows.some((row) => String(objectValue(row.payload).action || "") === action);
  };
  const recordAction = async (action: string, payload: JsonRecord): Promise<void> => {
    await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: messageId, provider: "postveil", event_type: "rule_action", payload: { action, ...payload } }) }).catch(() => undefined);
  };
  const optionalAction = async (action: string, callback: () => Promise<JsonRecord | void>): Promise<void> => {
    if (await actionAlreadyRecorded(action)) return;
    try { const result = await callback(); await recordAction(action, result || {}); }
    catch (actionError) { console.error(`Rule action ${action} failed`, actionError); await recordAction(`${action}:failed`, { error: actionError instanceof Error ? actionError.message.slice(0, 240) : "Action failed" }); }
  };
  const assignTo = typeof actions.assignTo === "string" ? actions.assignTo.trim() : "";
  const createTaskTitle = typeof actions.createTask === "string" ? actions.createTask.trim() : "";
  const webhookUrl = typeof actions.webhookUrl === "string" ? actions.webhookUrl.trim() : "";
  if (assignTo && message.thread_id) await optionalAction("assign", async () => {
    const assigneeId = assignTo === "self" ? ownerId : assignTo;
    await dbRequest(env, "thread_assignments?on_conflict=owner_id,thread_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: ownerId, thread_id: message.thread_id, assignee_id: assigneeId, status: "open", updated_at: new Date().toISOString() }) });
    return { assigneeId };
  });
  if (createTaskTitle) await optionalAction("create_task", async () => {
    const rows = await dbRequest<JsonRecord[]>(env, "tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, title: createTaskTitle, notes: `Created by a rule from ${String(message.subject || "this message")}`, source_message_id: messageId, due_at: null, priority: 0 }) });
    return { taskId: rows[0]?.id || null };
  });
  if (actions.createCalendarEvent === true) await optionalAction("create_calendar_event", async () => {
    const startsAt = new Date(Date.now() + 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const rows = await dbRequest<JsonRecord[]>(env, "calendar_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, title: String(message.subject || "Email event"), description: String(message.text_body || "").slice(0, 2000), starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), all_day: false, attendees: [], source_message_id: messageId }) });
    return { calendarEventId: rows[0]?.id || null };
  });
  if (actions.storeInB2 === true) await optionalAction("store_in_object_storage", async () => {
    const key = `automation/${ownerId}/${messageId}.json`;
    await putObject(env, key, JSON.stringify({ messageId, subject: message.subject || "", from: message.from_address || "", text: String(message.text_body || "").slice(0, 200_000), storedAt: new Date().toISOString() }), "application/json");
    return { objectKey: key };
  });
  if (actions.autoReply === true && message.from_address) await optionalAction("auto_reply", async () => {
    const fromAddress = await defaultFromAddress(env, ownerId);
    const result = await sendSystemMessage(env, { fromAddress, to: [String(message.from_address)], subject: `Re: ${String(message.subject || "your message")}`.slice(0, 500), text: "Thanks for your message. This is an automatic reply triggered by a Postveil rule.", replyTo: fromAddress }, undefined);
    return { provider: result.provider || null };
  });
  if (webhookUrl) await optionalAction("webhook", async () => {
    const target = new URL(webhookUrl);
    const blockedHost = /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|::1)$/i.test(target.hostname) || target.hostname.endsWith(".local") || target.hostname.endsWith(".internal");
    if (target.protocol !== "https:" || blockedHost) throw new Error("Automation webhooks must use a public HTTPS endpoint");
    const payload = JSON.stringify({ event: "postveil.rule.matched", messageId, subject: message.subject || "", from: message.from_address || "", triggeredAt: new Date().toISOString() });
    const headers = new Headers({ "content-type": "application/json", "user-agent": "Postveil-Automation/1" });
    if (typeof actions.webhookSecret === "string" && actions.webhookSecret.trim()) headers.set("x-postveil-signature", `sha256=${base64UrlEncode(await hmacSha256(actions.webhookSecret.trim(), payload))}`);
    const response = await fetch(target.toString(), { method: "POST", headers, body: payload, redirect: "manual" });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    return { status: response.status };
  });
  return patch;
}

async function applyInboundRules(env: Env, ownerId: string, messageId: string, context: RuleContext, forwardInbound?: (address: string) => Promise<void>, organizationId?: string | null): Promise<void> {
  const personal = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&trigger_type=eq.inbound&order=priority.asc,created_at.asc`).catch(async () => (await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&order=priority.asc,created_at.asc`).catch(() => [])).filter((rule) => !rule.trigger_type || rule.trigger_type === "inbound"));
  const shared = organizationId ? await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(organizationId)}&scope=eq.organization&enabled=eq.true&trigger_type=eq.inbound&order=priority.asc,created_at.asc`).catch(async () => (await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(organizationId)}&scope=eq.organization&enabled=eq.true&order=priority.asc,created_at.asc`).catch(() => [])).filter((rule) => !rule.trigger_type || rule.trigger_type === "inbound")) : [];
  const rules = [...personal, ...shared].sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0));
  for (const rule of rules) {
    if (!ruleMatches(rule, context)) continue;
    const actions = rule.actions || {};
    await applyRuleActions(env, ownerId, messageId, actions, forwardInbound);
    if (actions.stopProcessing === true) break;
  }
}

async function applyEventRules(env: Env, ownerId: string, messageId: string, eventType: string, organizationId?: string | null): Promise<void> {
  const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  const message = rows[0];
  if (!message) return;
  const context = { ...ruleContextFromMessage(message), eventType };
  const personal = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&trigger_type=eq.event&order=priority.asc,created_at.asc`).catch(async () => (await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&order=priority.asc,created_at.asc`).catch(() => [])).filter((rule) => rule.trigger_type === "event"));
  const shared = organizationId ? await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(organizationId)}&scope=eq.organization&enabled=eq.true&trigger_type=eq.event&order=priority.asc,created_at.asc`).catch(async () => (await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(organizationId)}&scope=eq.organization&enabled=eq.true&order=priority.asc,created_at.asc`).catch(() => [])).filter((rule) => rule.trigger_type === "event")) : [];
  for (const rule of [...personal, ...shared].sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))) {
    if (!ruleMatches(rule, context)) continue;
    await applyRuleActions(env, ownerId, messageId, rule.actions || {});
    if (rule.actions?.stopProcessing === true) break;
  }
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeComposeMetadata(metadata: ComposeMetadata): JsonRecord {
  const { confidentialPassword: _confidentialPassword, ...safe } = metadata;
  return safe;
}

function buildRuleConditions(conditions: unknown, exceptions: unknown): JsonRecord {
  const next = { ...objectValue(conditions) };
  const exceptionObject = objectValue(exceptions);
  if (Object.keys(exceptionObject).length) next.exceptions = exceptionObject;
  else delete next.exceptions;
  return next;
}

function automationTrigger(value: unknown): "inbound" | "event" | "scheduled" {
  return value === "event" || value === "scheduled" ? value : "inbound";
}

function automationSchedule(value: unknown): JsonRecord {
  const source = objectValue(value);
  const frequency = ["hourly", "daily", "weekly"].includes(String(source.frequency)) ? String(source.frequency) : "daily";
  const at = typeof source.at === "string" && !Number.isNaN(Date.parse(source.at)) ? new Date(source.at).toISOString() : null;
  return { frequency, at };
}

function nextAutomationRun(schedule: JsonRecord, from = new Date()): string {
  const next = new Date(from);
  const frequency = String(schedule.frequency || "daily");
  if (frequency === "hourly") next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  else if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

async function ruleForActor(env: Env, user: User, ruleId: string): Promise<{ rule: Rule; shared: boolean } | null> {
  const personal = await dbRequest<Rule[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
  if (personal[0]) return { rule: personal[0], shared: false };
  const access = await organizationAdmin(env, user).catch(() => null);
  if (!access) return null;
  const shared = await dbRequest<Rule[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleId)}&organization_id=eq.${encodeURIComponent(access.organization.id)}&scope=eq.organization&limit=1`).catch(() => []);
  return shared[0] ? { rule: shared[0], shared: true } : null;
}

function sieveQuoted(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`; }

function ruleToSieve(rule: Rule): string {
  const conditions = objectValue(rule.conditions);
  const tests = Object.entries(conditions).filter(([key]) => key !== "exceptions" && typeof conditions[key] === "string").map(([key, value]) => {
    const header = key === "fromContains" ? "from" : key === "toContains" ? "to" : key === "subjectContains" ? "subject" : key === "bodyContains" ? "body" : null;
    return header ? `header :contains ${sieveQuoted(header)} ${sieveQuoted(String(value))}` : null;
  }).filter((value): value is string => Boolean(value));
  const actions = objectValue(rule.actions);
  const commands: string[] = [];
  if (typeof actions.folder === "string") commands.push(`fileinto ${sieveQuoted(String(actions.folder))};`);
  if (actions.markRead === true) commands.push('addflag "\\Seen";');
  if (actions.markRead === false) commands.push('removeflag "\\Seen";');
  if (typeof actions.forwardTo === "string") commands.push(`redirect ${sieveQuoted(actions.forwardTo)};`);
  if (actions.stopProcessing === true) commands.push("stop;");
  const test = tests.length ? tests.length === 1 ? tests[0] : `allof (${tests.join(", ")})` : "true";
  return `# Postveil rule: ${rule.name}\nif ${test} {\n  ${commands.join(" ")}\n}`;
}

function parseSieveRules(source: string): Array<{ name: string; conditions: JsonRecord; actions: JsonRecord; sieve_source: string }> {
  const rules: Array<{ name: string; conditions: JsonRecord; actions: JsonRecord; sieve_source: string }> = [];
  const blocks = source.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  for (const [index, block] of blocks.entries()) {
    const conditions: JsonRecord = {};
    for (const match of block.matchAll(/header\s*:contains\s+"(from|to|subject)"\s+"([^"]+)"/gi)) conditions[match[1].toLowerCase() === "from" ? "fromContains" : match[1].toLowerCase() === "to" ? "toContains" : "subjectContains"] = match[2];
    const actions: JsonRecord = { stopProcessing: /\bstop\s*;/i.test(block) };
    const fileinto = block.match(/fileinto\s+"([^"]+)"/i); if (fileinto) actions.folder = fileinto[1].toLowerCase();
    const redirect = block.match(/redirect\s+"([^"\n]+)"/i); if (redirect) actions.forwardTo = redirect[1];
    if (/addflag\s+"\\\\Seen"/i.test(block)) actions.markRead = true;
    if (/removeflag\s+"\\\\Seen"/i.test(block)) actions.markRead = false;
    if (!Object.keys(conditions).length || !Object.keys(actions).some((key) => key !== "stopProcessing")) continue;
    rules.push({ name: `Imported Sieve rule ${index + 1}`, conditions, actions, sieve_source: block });
  }
  return rules;
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

async function sendSystemMessage(env: Env, input: { fromAddress: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string; replyTo?: string; idempotencyKey?: string; attachments?: Array<{ filename: string; object_key: string }> }, organizationId?: string): Promise<{ messageId?: string; provider?: ProviderName }> {
  const attachments: DeliveryAttachment[] = await Promise.all((input.attachments || []).map(async (attachment) => ({ filename: attachment.filename, contentType: "application/octet-stream", bytes: await readObject(env, attachment.object_key), url: await signedObjectUrl(env, attachment.object_key) })));
  const configs = await providerConfigs(env, organizationId);
  let lastError: unknown = null;
  for (const config of configs) {
    if (await providerIsCircuitOpen(env, organizationId, config.provider)) continue;
    try {
      const result = await sendThroughProvider(config.provider, env, { fromAddress: input.fromAddress, to: input.to, cc: input.cc || [], bcc: input.bcc || [], subject: input.subject, text: input.text, html: input.html, replyTo: input.replyTo, idempotencyKey: input.idempotencyKey, attachments });
      return { messageId: result.providerMessageId, provider: result.provider };
    } catch (sendError) {
      lastError = sendError;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No configured delivery provider is available");
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
    await sendSystemMessage(env, { fromAddress: await defaultFromAddress(env, row.owner_id), to: [authUser.email], subject: "Your Postveil recovery link", text: `Use this one-time link to regain access to Postveil and set a new password:\n\n${link}\n\nThis recovery code has now been consumed.` });
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
    await sendSystemMessage(env, {
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
  const messageIdHeader = headerValue(parsed, "message-id") || `<${crypto.randomUUID()}@${configuredAppDomain(env)}>`;
  const duplicate = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&message_id_header=eq.${encodeURIComponent(messageIdHeader)}&limit=1`);
  if (duplicate[0]) return;
  const sender = senderIdentity(parsed, envelopeFrom);
  const headerFrom = sender.address;
  const fromName = sender.name;
  const inReplyTo = headerValue(parsed, "in-reply-to") || null;
  const references = headerValue(parsed, "references") || null;
  const unsubscribeUrl = unsubscribeTarget(headerValue(parsed, "list-unsubscribe"));
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
      const assessment = await assessInbound(env, ownerId, mailbox.id, envelopeFrom, headerFrom, subject, textBody, htmlBody, parsed, fromName, destination);
      const rawKey = `raw/${ownerId}/${messageId}.eml`;
      await putObject(env, rawKey, new Uint8Array(raw), "message/rfc822");
      const attachmentResult = await saveAttachments(env, ownerId, messageId, parsed.attachments ?? []);
      const mailboxSettings = await getMailboxAdminSettings(env, mailbox);
      const organizationId = mailboxSettings?.organization_id || null;
      const [blockedAddressRows, blockedDomainRows] = await Promise.all([
        dbRequest<JsonRecord[]>(env, `sender_blocks?owner_id=eq.${encodeURIComponent(ownerId)}&match_type=eq.address&match_value=eq.${encodeURIComponent(headerFrom)}&enabled=eq.true&limit=1`).catch(() => []),
        dbRequest<JsonRecord[]>(env, `sender_blocks?owner_id=eq.${encodeURIComponent(ownerId)}&match_type=eq.domain&match_value=eq.${encodeURIComponent(domainOf(headerFrom))}&enabled=eq.true&limit=1`).catch(() => []),
      ]);
      const [organizationBlockedAddressRows, organizationBlockedDomainRows] = organizationId ? await Promise.all([
        dbRequest<JsonRecord[]>(env, `organization_sender_blocks?organization_id=eq.${encodeURIComponent(organizationId)}&match_type=eq.address&match_value=eq.${encodeURIComponent(headerFrom)}&enabled=eq.true&limit=1`).catch(() => []),
        dbRequest<JsonRecord[]>(env, `organization_sender_blocks?organization_id=eq.${encodeURIComponent(organizationId)}&match_type=eq.domain&match_value=eq.${encodeURIComponent(domainOf(headerFrom))}&enabled=eq.true&limit=1`).catch(() => []),
      ]) : [[], []] as [JsonRecord[], JsonRecord[]];
      const organizationBlocked = Boolean(organizationBlockedAddressRows[0] || organizationBlockedDomainRows[0]);
      const blockedSender = Boolean(blockedAddressRows[0] || blockedDomainRows[0] || organizationBlocked);
      const reasons = [...assessment.reasons, ...(blockedSender ? [organizationBlocked ? "organization blocklist match" : "sender is blocked"] : []), ...(attachmentResult.blocked.length ? [`blocked attachments: ${attachmentResult.blocked.join(", ")}`] : [])];
      const explicitPolicy = blockedSender ? "spam" : assessment.policyAction;
      const effectiveScore = blockedSender ? 1 : assessment.score;
      const customFolderId = explicitPolicy === "folder" ? assessment.policyTargetFolderId : null;
      const folder = explicitPolicy === "screen" ? "inbox" : explicitPolicy === "archive" && effectiveScore < SPAM_THRESHOLD ? "archive" : explicitPolicy === "folder" && customFolderId && effectiveScore < SPAM_THRESHOLD ? "custom" : effectiveScore >= SPAM_THRESHOLD || explicitPolicy === "spam" ? "spam" : "inbox";
      const screeningStatus = explicitPolicy === "screen" || (effectiveScore >= 0.35 && effectiveScore < SPAM_THRESHOLD) ? "review" : folder === "spam" ? "blocked" : "none";
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify({ folder, custom_folder_id: folder === "custom" ? customFolderId : null, status: "received", delivery_status: "received", screening_status: screeningStatus, screening_policy_id: assessment.policyId, raw_object_key: rawKey, has_attachment: Boolean(parsed.attachments?.length), unsubscribe_url: unsubscribeUrl, spam_score: effectiveScore, spam_reasons: reasons, focused_score: assessment.focusedScore, focused_category: assessment.focusedCategory, auth_results: assessment.authResults, auth_spf: assessment.authResults.spf, auth_dkim: assessment.authResults.dkim, auth_dmarc: assessment.authResults.dmarc, auth_arc: assessment.authResults.arc, auth_tls: assessment.authResults.tls, trust_score: assessment.trustScore, trust_reasons: reasons, trust_evidence: { ...assessment.trustEvidence, blocked_attachments: attachmentResult.blocked, blocked_sender: blockedSender, organization_blocked: organizationBlocked, malware_scanner: "static_only" }, received_auth_at: assessment.receivedAuthAt, sender_first_seen: assessment.senderFirstSeen, known_contact: assessment.knownContact, reply_to_mismatch: assessment.replyToMismatch, link_count: assessment.linkCount, tracking_pixel_count: assessment.trackingPixelCount, updated_at: new Date().toISOString() }) });
      await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: messageId, policy_id: assessment.policyId, decision: screeningStatus === "blocked" ? "blocked" : screeningStatus === "review" ? "screened" : "allowed", previous_folder: "inbox" }) }).catch(() => undefined);
      if (attachmentResult.stored.length) await dbRequest(env, "attachments", { method: "POST", body: JSON.stringify(attachmentResult.stored.map((attachment) => ({ ...attachment, owner_id: ownerId, message_id: messageId }))) });
      if (mailboxSettings && attachmentResult.stored.length) {
        const storedBytes = attachmentResult.stored.reduce((total, attachment) => total + Math.max(0, Number(attachment.byte_size || 0)), 0);
        await dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}`, { method: "PATCH", body: JSON.stringify({ storage_used_bytes: mailboxSettings.storage_used_bytes + storedBytes, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
      }
      await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}`, { method: "PATCH", body: JSON.stringify({ last_message_at: new Date().toISOString() }) });
      if (organizationId) {
        const collaboration = await ensureCollaborationThread(env, ownerId, organizationId, threadId, "normal").catch(() => null);
        if (collaboration) {
          await dbRequest(env, `collaboration_threads?id=eq.${encodeURIComponent(String(collaboration.id || ""))}`, { method: "PATCH", body: JSON.stringify({ last_customer_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
          await collaborationActivity(env, { ownerId, organizationId, threadId }, ownerId, "message_received", { messageId, from: headerFrom });
          await applyCollaborationPolicies(env, { ownerId, organizationId, threadId }, ownerId, "message_received", collaboration).catch(() => undefined);
        }
      }
      await markInboundReply(env, ownerId, threadId, messageId, headerFrom);
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
      }, forwardInbound, organizationId);
      const autoReplies = await dbRequest<Array<{ enabled: boolean; subject: string; body: string; starts_at: string | null; ends_at: string | null }>>(env, `auto_replies?owner_id=eq.${encodeURIComponent(ownerId)}&mailbox_id=eq.${encodeURIComponent(mailbox.id)}&enabled=eq.true&limit=1`);
      const autoReply = autoReplies[0];
      const now = Date.now();
      if (autoReply && (!autoReply.starts_at || now >= Date.parse(autoReply.starts_at)) && (!autoReply.ends_at || now <= Date.parse(autoReply.ends_at)) && headerFrom !== destination && !/auto-submitted|list-/i.test(headerValue(parsed, "auto-submitted") || "")) await sendSystemMessage(env, { fromAddress: destination, to: [headerFrom], subject: autoReply.subject, text: autoReply.body, replyTo: destination }, mailboxSettings?.organization_id);
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

async function markInboundReply(env: Env, ownerId: string, threadId: string, inboundMessageId: string, sender: string): Promise<void> {
  const tracked = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&thread_id=eq.${encodeURIComponent(threadId)}&direction=eq.outbound&reply_tracking_enabled=eq.true&select=id&limit=50`).catch(() => []);
  for (const message of tracked) {
    await dbRequest(env, `messages?id=eq.${encodeURIComponent(message.id)}&owner_id=eq.${encodeURIComponent(ownerId)}&reply_tracking_enabled=eq.true`, { method: "PATCH", body: JSON.stringify({ reply_received_at: new Date().toISOString(), follow_up_at: null, work_state: "none", updated_at: new Date().toISOString() }) }).catch(() => undefined);
    await recordReceiptEvent(env, ownerId, message.id, "reply", sender, "inbound", `reply:${inboundMessageId}:${message.id}`, { inboundMessageId, threadId });
  }
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

async function confidentialDeliveryContent(env: Env, row: ConfidentialRow): Promise<{ text: string; html: string }> {
  const token = await deriveConfidentialToken(env, row.id);
  const link = `https://${configuredAppDomain(env)}/share/${token}`;
  const passwordNotice = row.password_hash ? " The recipient will need the password you set." : "";
  return {
    text: `You have received a confidential Postveil message. Open it securely here: ${link}\n\nThis link expires ${new Date(row.expires_at).toLocaleString()} and can be opened ${row.max_views ? `up to ${row.max_views} time${row.max_views === 1 ? "" : "s"}` : "until it expires"}.${passwordNotice}`,
    html: `<p>You have received a confidential Postveil message.</p><p><a href="${htmlEscape(link)}">Open the protected message</a></p><p>This link expires ${htmlEscape(new Date(row.expires_at).toLocaleString())}.${htmlEscape(passwordNotice)}</p>`,
  };
}

async function createConfidentialRecord(env: Env, ownerId: string, messageId: string, payload: JsonRecord, metadata: ComposeMetadata): Promise<void> {
  const id = crypto.randomUUID();
  const token = await deriveConfidentialToken(env, id);
  const encrypted = await encryptConfidentialPayload(env, payload);
  const password = metadata.passwordProtected ? String(metadata.confidentialPassword || "") : "";
  if (metadata.passwordProtected && password.length < 10) throw new Error("Password-protected messages require a password of at least 10 characters");
  const passwordSalt = password ? crypto.getRandomValues(new Uint8Array(16)) : null;
  const passwordHash = passwordSalt ? await derivePasswordHash(password, passwordSalt) : null;
  const hours = Math.max(1, Math.min(168, Number(metadata.expiresHours || 24)));
  const maxViews = Math.max(0, Math.min(100, Number(metadata.maxViews || 0)));
  await dbRequest(env, "confidential_messages", {
    method: "POST",
    body: JSON.stringify({ id, owner_id: ownerId, message_id: messageId, token_hash: await sha256Hex(new TextEncoder().encode(token)), encryption_iv: encrypted.iv, encrypted_payload: encrypted.encrypted, password_hash: passwordHash, password_salt: passwordSalt ? base64UrlEncode(passwordSalt) : null, password_hint: String(metadata.passwordHint || "").slice(0, 120), expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(), max_views: maxViews }),
  });
}

function personalizeComposeValue(value: string, email: string, displayName = "", company = ""): string {
  const firstName = displayName.trim().split(/\s+/)[0] || "there";
  return value
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, displayName || firstName)
    .replace(/\{\{\s*company\s*\}\}/gi, company || "your team")
    .replace(/\{\{\s*email\s*\}\}/gi, email);
}

async function recipientContact(env: Env, ownerId: string, email: string): Promise<{ displayName: string; company: string }> {
  const rows = await dbRequest<Array<{ display_name?: string | null; company?: string | null }>>(env, `contacts?owner_id=eq.${encodeURIComponent(ownerId)}&email=eq.${encodeURIComponent(email)}&select=display_name,company&limit=1`).catch(() => []);
  return { displayName: String(rows[0]?.display_name || ""), company: String(rows[0]?.company || "") };
}

async function sendOutboxMessage(env: Env, message: JsonRecord): Promise<{ messageId?: string; provider?: ProviderName }> {
  const attachmentRows = await dbRequest<Array<{ filename: string; object_key: string; content_type?: string; byte_size?: number }>>(env, `attachments?message_id=eq.${encodeURIComponent(String(message.id))}&select=filename,object_key,content_type,byte_size&order=created_at.asc`);
  const mailboxSettings = message.mailbox_id ? (await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(String(message.mailbox_id))}&limit=1`).catch(() => []))[0] : undefined;
  const organizationId = mailboxSettings?.organization_id;
  const confidential = message.confidential_mode === true ? (await dbRequest<ConfidentialRow[]>(env, `confidential_messages?message_id=eq.${encodeURIComponent(String(message.id))}&limit=1`).catch(() => []))[0] : undefined;
  if (message.confidential_mode === true && !confidential) throw new Error("Confidential message protection is unavailable; delivery was blocked");
  if (confidential && attachmentRows.length) throw new Error("Confidential message delivery was blocked because attachments are not supported");
  const attachments: DeliveryAttachment[] = await Promise.all(attachmentRows.map(async (attachment) => ({ filename: attachment.filename, contentType: attachment.content_type || "application/octet-stream", byteSize: Number(attachment.byte_size || 0), bytes: await readObject(env, attachment.object_key), url: await signedObjectUrl(env, attachment.object_key) })));
  const deliveryContent = confidential ? await confidentialDeliveryContent(env, confidential) : null;
  const input: DeliveryInput = { fromAddress: String(message.from_address), to: Array.isArray(message.to_addresses) ? message.to_addresses.map(String) : [], cc: Array.isArray(message.cc_addresses) ? message.cc_addresses.map(String) : [], bcc: Array.isArray(message.bcc_addresses) ? message.bcc_addresses.map(String) : [], subject: String(message.subject || "(no subject)"), text: deliveryContent?.text || String(message.text_body || ""), html: deliveryContent?.html || (typeof message.html_body === "string" ? message.html_body : undefined), replyTo: String(message.reply_to || message.from_address), idempotencyKey: typeof message.send_idempotency_key === "string" ? message.send_idempotency_key : undefined, messageIdHeader: typeof message.message_id_header === "string" ? message.message_id_header : undefined, openTrackingEnabled: message.open_tracking_enabled === true, clickTrackingEnabled: message.click_tracking_enabled === true, requestDeliveryReceipt: message.delivery_receipt_requested === true, requestReadReceipt: message.read_receipt_requested === true, requestConfirmation: message.request_confirmation === true, attachments };
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
      if (confidential) await recordReceiptEvent(env, String(message.owner_id), String(message.id), "confirmation", input.to[0], config.provider, `accepted:${result.providerMessageId || result.responseStatus}`, { providerMessageId: result.providerMessageId || null });
      await scheduleNextRecurringMessage(env, message);
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

async function recordReceiptEvent(env: Env, ownerId: string, messageId: string, kind: "delivery" | "read" | "confirmation" | "reply", recipient: string | undefined, provider: string | undefined, eventId: string, payload: JsonRecord): Promise<void> {
  await dbRequest(env, "message_receipt_events", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: ownerId, message_id: messageId, kind, recipient: recipient || null, provider: provider || null, provider_event_id: eventId, payload }) }).catch(() => undefined);
}

function nextRecurringDate(value: string, rule: string): string | null {
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return null;
  if (rule === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (rule === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (rule === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  } else return null;
  return next.toISOString();
}

async function scheduleNextRecurringMessage(env: Env, message: JsonRecord): Promise<void> {
  const rule = String(message.recurrence_rule || "none");
  if (rule === "none") return;
  const currentSequence = Number(message.recurrence_sequence || 0);
  const maxCount = message.recurrence_count === null || message.recurrence_count === undefined ? null : Number(message.recurrence_count);
  if (maxCount !== null && currentSequence + 1 >= maxCount) return;
  const nextAt = nextRecurringDate(String(message.scheduled_at || message.sent_at || new Date().toISOString()), rule);
  if (!nextAt || (message.recurrence_until && Date.parse(nextAt) > Date.parse(String(message.recurrence_until)))) return;
  const existing = await dbRequest<JsonRecord[]>(env, `messages?recurrence_parent_id=eq.${encodeURIComponent(String(message.id))}&recurrence_sequence=eq.${currentSequence + 1}&limit=1`).catch(() => []);
  if (existing[0]) return;
  const nextId = crypto.randomUUID();
  const nextHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  const nextMessageRows = await dbRequest<Array<{ id: string }>>(env, "messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: message.owner_id, sent_by: message.sent_by || message.owner_id, send_mode: message.send_mode || "own", thread_id: message.thread_id, mailbox_id: message.mailbox_id, direction: "outbound", folder: "drafts", status: "scheduled", delivery_status: "queued", from_name: message.from_name || "", from_address: message.from_address, to_addresses: message.to_addresses || [], cc_addresses: message.cc_addresses || [], bcc_addresses: message.bcc_addresses || [], reply_to: message.reply_to || message.from_address, subject: message.subject || "(no subject)", text_body: message.text_body || "", html_body: message.html_body || null, snippet: message.snippet || "", message_id_header: nextHeader, in_reply_to: message.in_reply_to || null, references_header: message.references_header || null, has_attachment: message.has_attachment === true, message_size_bytes: message.message_size_bytes || 0, max_size_bytes: message.max_size_bytes || maxEmailBytes(env), open_tracking_enabled: message.open_tracking_enabled === true, click_tracking_enabled: message.click_tracking_enabled === true, compose_mode: message.compose_mode || "plain", schedule_timezone: message.schedule_timezone || "UTC", recurrence_rule: rule, recurrence_until: message.recurrence_until || null, recurrence_count: maxCount, recurrence_sequence: currentSequence + 1, recurrence_parent_id: message.id, read_receipt_requested: message.read_receipt_requested === true, delivery_receipt_requested: message.delivery_receipt_requested === true, request_confirmation: message.request_confirmation === true, reply_tracking_enabled: message.reply_tracking_enabled === true, follow_up_tracking_enabled: message.follow_up_tracking_enabled === true, confidential_mode: message.confidential_mode === true, scheduled_at: nextAt, send_after: nextAt, next_delivery_at: nextAt, send_idempotency_key: `${String(message.send_idempotency_key || message.id)}:recurrence:${currentSequence + 1}` }),
  });
  const nextIdValue = nextMessageRows[0]?.id;
  if (!nextIdValue) return;
  await dbRequest(env, "delivery_queue", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: nextIdValue, owner_id: message.owner_id, status: "queued", available_at: nextAt, attempt_count: 0 }) }).catch(() => undefined);
  const attachments = await dbRequest<JsonRecord[]>(env, `attachments?message_id=eq.${encodeURIComponent(String(message.id))}&select=owner_id,object_key,filename,content_type,detected_content_type,byte_size,sha256,preview_state,safety_status,safety_reasons,content_id,disposition`).catch(() => []);
  if (attachments.length) await dbRequest(env, "attachments", { method: "POST", body: JSON.stringify(attachments.map((attachment) => ({ ...attachment, message_id: nextIdValue }))) }).catch(() => undefined);
  if (message.confidential_mode === true) {
    const confidential = (await dbRequest<ConfidentialRow[]>(env, `confidential_messages?message_id=eq.${encodeURIComponent(String(message.id))}&limit=1`).catch(() => []))[0];
    if (confidential) {
      const nextConfidentialId = crypto.randomUUID();
      const token = await deriveConfidentialToken(env, nextConfidentialId);
      await dbRequest(env, "confidential_messages", { method: "POST", body: JSON.stringify({ ...confidential, id: nextConfidentialId, message_id: nextIdValue, token_hash: await sha256Hex(new TextEncoder().encode(token)), view_count: 0, revoked_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
    }
  }
  await putObject(env, `raw/${String(message.owner_id)}/${nextIdValue}.eml`, rawMessageSource({ from: String(message.from_address), to: Array.isArray(message.to_addresses) ? message.to_addresses.map(String) : [], cc: Array.isArray(message.cc_addresses) ? message.cc_addresses.map(String) : [], bcc: Array.isArray(message.bcc_addresses) ? message.bcc_addresses.map(String) : [], subject: String(message.subject || "(no subject)"), text: String(message.text_body || ""), html: typeof message.html_body === "string" ? message.html_body : undefined, replyTo: String(message.reply_to || message.from_address), messageId: nextHeader }), "message/rfc822").then(() => dbRequest(env, `messages?id=eq.${encodeURIComponent(nextIdValue)}`, { method: "PATCH", body: JSON.stringify({ raw_object_key: `raw/${String(message.owner_id)}/${nextIdValue}.eml` }) })).catch(() => undefined);
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

async function queueOutboundMessage(env: Env, input: {
  ownerId: string;
  actorId: string;
  mailbox: Mailbox;
  sendMode: string;
  threadId: string;
  fromAddress: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
  scheduledDate: Date | null;
  sendAfter: string;
  messageBytes: number;
  maxSizeBytes: number;
  openTrackingEnabled: boolean;
  clickTrackingEnabled: boolean;
  composeMetadata: ComposeMetadata;
  warnings: SendWarning[];
  idempotencyKey: string;
  attachments: OutboundAttachment[];
}): Promise<string> {
  const messageIdHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: input.ownerId, sent_by: input.actorId, send_mode: input.sendMode, thread_id: input.threadId, mailbox_id: input.mailbox.id, direction: "outbound", folder: input.scheduledDate ? "drafts" : "sent", status: input.scheduledDate ? "scheduled" : "queued", delivery_status: "queued", from_name: input.mailbox.display_name || "", from_address: input.fromAddress, to_addresses: input.to, cc_addresses: input.cc, bcc_addresses: input.bcc, reply_to: input.replyTo, subject: input.subject, text_body: input.text, html_body: input.html || null, snippet: snippet(input.text), message_id_header: messageIdHeader, has_attachment: input.attachments.length > 0, message_size_bytes: input.messageBytes, max_size_bytes: input.maxSizeBytes, open_tracking_enabled: input.openTrackingEnabled, click_tracking_enabled: input.clickTrackingEnabled, compose_mode: input.composeMetadata.composeMode || "plain", schedule_timezone: input.composeMetadata.timezone || "UTC", recurrence_rule: input.composeMetadata.recurrence || "none", recurrence_until: input.composeMetadata.recurrenceUntil || null, recurrence_count: input.composeMetadata.recurrenceCount ?? null, read_receipt_requested: input.composeMetadata.readReceipt === true, delivery_receipt_requested: input.composeMetadata.deliveryReceipt === true, request_confirmation: input.composeMetadata.requestConfirmation === true, reply_tracking_enabled: input.composeMetadata.replyTracking === true, follow_up_tracking_enabled: input.composeMetadata.followUpTracking === true, confidential_mode: input.composeMetadata.confidentialMode === true, scheduled_at: input.scheduledDate?.toISOString() || null, send_after: input.sendAfter, next_delivery_at: input.sendAfter, send_idempotency_key: input.idempotencyKey, send_warning_acknowledged: Object.fromEntries(input.warnings.map((warning) => [warning.code, true])) }),
  });
  const messageId = inserted[0]?.id;
  if (!messageId) throw new Error("The message could not be queued");
  await dbRequest(env, "delivery_queue", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, owner_id: input.ownerId, status: "queued", available_at: input.sendAfter, attempt_count: 0 }) });
  const rawKey = `raw/${input.ownerId}/${messageId}.eml`;
  await putObject(env, rawKey, rawMessageSource({ from: input.fromAddress, to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text, html: input.html, replyTo: input.replyTo, messageId: messageIdHeader }), "message/rfc822").then(() => dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, { method: "PATCH", body: JSON.stringify({ raw_object_key: rawKey, updated_at: new Date().toISOString() }) })).catch(() => undefined);
  if (input.attachments.length) {
    await dbRequest(env, "attachments", {
      method: "POST",
      body: JSON.stringify(input.attachments.map((attachment) => ({
        owner_id: input.ownerId,
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
  if (input.composeMetadata.confidentialMode === true) await createConfidentialRecord(env, input.ownerId, messageId, { subject: input.subject, text: input.text, html: input.html || null }, input.composeMetadata);
  if (Object.keys(input.composeMetadata).length) await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: input.ownerId, message_id: messageId, provider: "postveil", event_type: "compose_features", payload: safeComposeMetadata(input.composeMetadata) }) }).catch(() => undefined);
  return messageId;
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
  const composeMetadata = objectValue(body.composeMetadata) as ComposeMetadata;
  const recurrence = ["none", "daily", "weekly", "monthly"].includes(String(composeMetadata.recurrence)) ? String(composeMetadata.recurrence) as ComposeMetadata["recurrence"] : "none";
  composeMetadata.recurrence = recurrence;
  composeMetadata.timezone = typeof composeMetadata.timezone === "string" && composeMetadata.timezone.length <= 80 ? composeMetadata.timezone : "UTC";
  composeMetadata.recurrenceUntil = typeof composeMetadata.recurrenceUntil === "string" && !Number.isNaN(Date.parse(composeMetadata.recurrenceUntil)) ? new Date(composeMetadata.recurrenceUntil).toISOString() : null;
  composeMetadata.recurrenceCount = Number.isFinite(Number(composeMetadata.recurrenceCount)) && Number(composeMetadata.recurrenceCount) > 0 ? Math.min(365, Number(composeMetadata.recurrenceCount)) : null;
  const warnings = ownerId ? buildSendWarnings({ fromAddress, mailboxAddress: mailbox?.address, mailboxCanSend: mailbox?.can_send, to, cc, bcc, replyTo, subject, text, attachmentCount: attachments.length }) : [];
  const acknowledged = new Set(Array.isArray(body.warningsAcknowledged) ? body.warningsAcknowledged.map(String) : []);
  const unacknowledgedWarnings = warnings.filter((warning) => !acknowledged.has(warning.code));
  if (unacknowledgedWarnings.length) return json({ ok: false, requiresConfirmation: true, warnings: unacknowledgedWarnings }, 409);
  const messageIdHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  if (!ownerId) {
    const result = await sendSystemMessage(env, { fromAddress, to, cc, bcc, subject, text, html, replyTo, attachments });
    return json({ ok: true, providerMessageId: result.messageId });
  }
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 200) : crypto.randomUUID();
  const mailboxOwnerId = mailbox?.owner_id || ownerId;
  if (composeMetadata.confidentialMode === true && !(await ensurePrivacySettings(env, mailboxOwnerId)).external_portal_enabled) return error("Protected external-message delivery is disabled in privacy settings", 403);
  const duplicate = await dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&send_idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,folder,send_after,scheduled_at&limit=1`);
  if (duplicate[0]) return json({ ok: true, replayed: true, id: duplicate[0].id, status: duplicate[0].status, scheduled: duplicate[0].status === "scheduled" });
  const mergeRequested = composeMetadata.mailMerge === true || composeMetadata.personalizedBulk === true;
  if (mergeRequested && to.length > 1) {
    const priorJobs = await dbRequest<JsonRecord[]>(env, `mail_events?owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&event_type=eq.mail_merge_job&order=created_at.desc&limit=100&select=payload`).catch(() => []);
    const priorJob = priorJobs.find((job) => objectValue(job.payload).idempotencyKey === idempotencyKey);
    if (priorJob) {
      const priorPayload = objectValue(priorJob.payload);
      const priorIds = Array.isArray(priorPayload.messageIds) ? priorPayload.messageIds.map(String) : [];
      if (priorIds.length) return json({ ok: true, replayed: true, mailMerge: true, ids: priorIds, status: "queued" });
    }
  }
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
  if (composeMetadata.confidentialMode === true && !env.CONFIDENTIAL_LINK_SECRET) return error("Confidential messages are not configured on this deployment", 503);
  if (composeMetadata.confidentialMode === true && !env.CONFIDENTIAL_ENCRYPTION_KEY) return error("Confidential message encryption is not configured on this deployment", 503);
  if (composeMetadata.confidentialMode === true && attachments.length) return error("Confidential messages cannot include attachments yet; send the files in a separate protected message", 422);
  if (mergeRequested && to.length > 1) {
    if (cc.length || bcc.length) return error("Mail merge cannot use shared Cc or Bcc recipients; send each copy privately");
    const messageIds: string[] = [];
    for (const recipient of to) {
      const contact = await recipientContact(env, mailboxOwnerId, recipient);
      const personalizedSubject = personalizeComposeValue(subject, recipient, contact.displayName, contact.company);
      const personalizedText = personalizeComposeValue(text, recipient, contact.displayName, contact.company);
      const personalizedHtml = html ? personalizeComposeValue(html, recipient, contact.displayName, contact.company) : undefined;
      const personalizedThreadId = threadId || await findOrCreateThread(env, mailboxOwnerId, personalizedSubject);
      const childMetadata: ComposeMetadata = { ...composeMetadata, mailMerge: false, personalizedBulk: false };
      const childId = await queueOutboundMessage(env, { ownerId: mailboxOwnerId, actorId: ownerId, mailbox: mailbox!, sendMode, threadId: personalizedThreadId, fromAddress, to: [recipient], cc: [], bcc: [], replyTo, subject: personalizedSubject, text: personalizedText, html: personalizedHtml, scheduledDate, sendAfter, messageBytes: messageSizeBytes({ subject: personalizedSubject, text: personalizedText, html: personalizedHtml, to: [recipient], cc: [], bcc: [], attachments }), maxSizeBytes: maxEmailBytes(env), openTrackingEnabled, clickTrackingEnabled, composeMetadata: childMetadata, warnings, idempotencyKey: `${idempotencyKey}:${recipient}`, attachments });
      messageIds.push(childId);
    }
    if (mailboxAdminSettings && mailbox) {
      const today = new Date().toISOString().slice(0, 10);
      const usedToday = mailboxAdminSettings.sending_window_started_at === today ? mailboxAdminSettings.sending_used_today : 0;
      await dbRequest(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(mailbox.id)}`, { method: "PATCH", body: JSON.stringify({ sending_used_today: usedToday + messageIds.length, sending_window_started_at: today, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).catch(() => undefined);
    }
    await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: mailboxOwnerId, provider: "postveil", event_type: "mail_merge_job", payload: { idempotencyKey, messageIds, recipientCount: messageIds.length } }) }).catch(() => undefined);
    const run = async () => { if (undoSeconds) await new Promise<void>((resolve) => setTimeout(resolve, undoSeconds * 1000)); await processOutbox(env, Math.min(5, messageIds.length)); };
    if (ctx) { if (scheduledDate) return json({ ok: true, mailMerge: true, ids: messageIds, scheduled: true, sendAfter }); ctx.waitUntil(run()); return json({ ok: true, mailMerge: true, ids: messageIds, status: "queued", sendAfter, undoSeconds }); }
    await run();
    return json({ ok: true, mailMerge: true, ids: messageIds, status: "queued", sendAfter, undoSeconds });
  }
  const threadFingerprint = await sha256Hex(new TextEncoder().encode(`${mailboxOwnerId}\n${normalizeSubject(subject)}\n${fromAddress}\n${to.join(",")}`));
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: mailboxOwnerId, sent_by: ownerId, send_mode: sendMode, thread_id: threadId, mailbox_id: mailbox?.id, direction: "outbound", folder: scheduledDate ? "drafts" : "sent", status: scheduledDate ? "scheduled" : "queued", delivery_status: "queued", from_name: mailbox?.display_name || "", from_address: fromAddress, to_addresses: to, cc_addresses: cc, bcc_addresses: bcc, reply_to: replyTo, subject, text_body: text, html_body: html || null, snippet: snippet(text), message_id_header: messageIdHeader, in_reply_to: typeof body.inReplyTo === "string" ? body.inReplyTo : null, references_header: typeof body.references === "string" ? body.references : null, has_attachment: attachments.length > 0, message_size_bytes: messageBytes, max_size_bytes: maxEmailBytes(env), open_tracking_enabled: openTrackingEnabled, click_tracking_enabled: clickTrackingEnabled, compose_mode: composeMetadata.composeMode || "plain", schedule_timezone: composeMetadata.timezone || "UTC", recurrence_rule: composeMetadata.recurrence || "none", recurrence_until: composeMetadata.recurrenceUntil || null, recurrence_count: composeMetadata.recurrenceCount ?? null, read_receipt_requested: composeMetadata.readReceipt === true, delivery_receipt_requested: composeMetadata.deliveryReceipt === true, request_confirmation: composeMetadata.requestConfirmation === true, reply_tracking_enabled: composeMetadata.replyTracking === true, follow_up_tracking_enabled: composeMetadata.followUpTracking === true, confidential_mode: composeMetadata.confidentialMode === true, thread_fingerprint: threadFingerprint, scheduled_at: scheduledDate?.toISOString() || null, send_after: sendAfter, next_delivery_at: sendAfter, send_idempotency_key: idempotencyKey, send_warning_acknowledged: Object.fromEntries(warnings.map((warning) => [warning.code, true])), sent_at: null }) });
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
  if (composeMetadata.confidentialMode === true) await createConfidentialRecord(env, mailboxOwnerId, messageId, { subject, text, html: html || null }, composeMetadata);
  if (Object.keys(composeMetadata).length) await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: mailboxOwnerId, message_id: messageId, provider: "postveil", event_type: "compose_features", payload: safeComposeMetadata(composeMetadata) }) }).catch(() => undefined);
  const run = async () => { if (undoSeconds) await new Promise<void>((resolve) => setTimeout(resolve, undoSeconds * 1000)); await processOutbox(env); };
  if (ctx) { if (scheduledDate) return json({ ok: true, id: messageId, scheduled: true, sendAfter }); ctx.waitUntil(run()); return json({ ok: true, id: messageId, status: "queued", sendAfter, undoSeconds }); }
  await run();
  return json({ ok: true, id: messageId, status: "queued", sendAfter, undoSeconds });
}

function confidentialPortalPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protected Postveil message</title><style>body{margin:0;background:#f4f6f2;color:#17221f;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}.card{width:min(680px,100%);background:white;border:1px solid #dce4df;border-radius:18px;padding:32px;box-shadow:0 18px 50px #17221f18}h1{font-size:24px;margin:0 0 8px}p{line-height:1.55;color:#52615b}.message{white-space:pre-wrap;background:#f6f8f6;border-radius:12px;padding:18px;margin-top:20px;line-height:1.6}.error{color:#9b3027}.hidden{display:none}label{display:block;margin:20px 0 8px;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b9c7c0;border-radius:9px;font:inherit}button{margin-top:16px;background:#172d26;color:#fff;border:0;border-radius:9px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}</style></head><body><main class="card"><p>POSTVEIL · PROTECTED MESSAGE</p><h1>Someone shared a confidential message with you</h1><p id="status">This message is encrypted and expires automatically. Open it only on a trusted device.</p><form id="unlock"><label for="password">Message password <span id="optional"></span></label><input id="password" type="password" autocomplete="off" placeholder="Enter the password if required"><button>Open message</button></form><section id="content" class="hidden"><h2 id="subject"></h2><div class="message" id="body"></div></section></main><script>(()=>{const form=document.querySelector('#unlock'),status=document.querySelector('#status'),content=document.querySelector('#content'),subject=document.querySelector('#subject'),body=document.querySelector('#body'),password=document.querySelector('#password'),token=location.pathname.split('/').filter(Boolean).pop();fetch('/api/share/'+encodeURIComponent(token)+'/unlock',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(async r=>{const data=await r.json();if(data.requiresPassword){status.textContent=data.hint?'Password hint: '+data.hint:'Enter the password to continue';return}if(r.ok)show(data);}).catch(()=>{});form.addEventListener('submit',async event=>{event.preventDefault();status.textContent='Unlocking…';const response=await fetch('/api/share/'+encodeURIComponent(token)+'/unlock',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:password.value})});const data=await response.json().catch(()=>({}));if(!response.ok){status.textContent=data.error||'This message could not be opened';status.className='error';return}show(data)});function show(data){form.classList.add('hidden');status.classList.add('hidden');subject.textContent=data.subject||'(no subject)';body.textContent=data.text||'';content.classList.remove('hidden')}})()</script></body></html>`;
}

async function handleConfidentialRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  await enforceRequestBodyLimit(request);
  const pageMatch = url.pathname.match(/^\/share\/([^/]+)$/);
  if (pageMatch) {
    if (request.method !== "GET") return error("Method not allowed", 405);
    return new Response(confidentialPortalPage(), { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'", "cache-control": "no-store" } });
  }
  const unlockMatch = url.pathname.match(/^\/api\/share\/([^/]+)\/unlock$/);
  if (!unlockMatch) return error("Not found", 404);
  if (request.method !== "POST") return error("Method not allowed", 405);
  const token = unlockMatch[1];
  const tokenHash = await sha256Hex(new TextEncoder().encode(token));
  const rows = await dbRequest<ConfidentialRow[]>(env, `confidential_messages?token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`).catch(() => []);
  const row = rows[0];
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || (row.max_views > 0 && row.view_count >= row.max_views)) return error("This confidential message is no longer available", 410);
  let body: JsonRecord = {};
  try { body = (await request.json()) as JsonRecord; } catch { /* the initial no-password probe is an empty request */ }
  const password = String(body.password || "");
  if (row.password_hash) {
    if (!password || !row.password_salt || await derivePasswordHash(password, base64Decode(row.password_salt)) !== row.password_hash) return json({ requiresPassword: true, hint: row.password_hint || "" }, 401);
  }
  const payload = await decryptConfidentialPayload(env, row);
  const updated = await dbRequest<ConfidentialRow[]>(env, `confidential_messages?id=eq.${encodeURIComponent(row.id)}&view_count=eq.${row.view_count}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ view_count: row.view_count + 1, updated_at: new Date().toISOString() }) }).catch(() => []);
  if (!updated[0] && row.max_views > 0) return error("This confidential message has reached its view limit", 410);
  await recordReceiptEvent(env, row.owner_id, row.message_id, "read", undefined, "postveil", `share:${row.id}:${row.view_count + 1}`, { confidential: true }).catch(() => undefined);
  return json({ subject: String(payload.subject || "(no subject)"), text: String(payload.text || stripHtml(String(payload.html || ""))), expiresAt: row.expires_at });
}

async function enforceRetentionPolicies(env: Env): Promise<void> {
  const policies = await dbRequest<JsonRecord[]>(env, "message_retention_policies?enabled=eq.true&limit=1000").catch(() => []);
  for (const policy of policies) {
    const ownerId = String(policy.owner_id || "");
    const retentionDays = Math.max(1, Number(policy.retention_days || 0));
    if (!ownerId || !Number.isFinite(retentionDays)) continue;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const scope = String(policy.scope || "all");
    const folderFilter = scope === "all" ? "" : `&folder=eq.${encodeURIComponent(scope)}`;
    const candidates = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&created_at=lt.${encodeURIComponent(cutoff)}&legal_hold=eq.false${folderFilter}&select=id&limit=200`).catch(() => []);
    for (const message of candidates) await permanentlyDeleteMessage(env, ownerId, message.id).catch(() => undefined);
  }
}

async function processDueReminders(env: Env, now = new Date().toISOString()): Promise<void> {
  const due = await dbRequest<JsonRecord[]>(env, `messages?reminder_at=lte.${encodeURIComponent(now)}&limit=100&select=id,owner_id,reminder_at,reminder_note,subject`).catch(() => []);
  for (const message of due) {
    const messageId = String(message.id || "");
    const ownerId = String(message.owner_id || "");
    const reminderAt = String(message.reminder_at || "");
    if (!messageId || !ownerId || !reminderAt) continue;
    const previous = await dbRequest<JsonRecord[]>(env, `mail_events?message_id=eq.${encodeURIComponent(messageId)}&event_type=eq.reminder_due&order=created_at.desc&limit=1&select=payload`).catch(() => []);
    if (String(objectValue(previous[0]?.payload).reminderAt || "") === reminderAt) continue;
    await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: ownerId, message_id: messageId, provider: "postveil", event_type: "reminder_due", payload: { messageId, reminderAt, note: String(message.reminder_note || "Follow up on this message"), subject: String(message.subject || "(no subject)") } }) }).catch(() => undefined);
  }
}

async function processScheduled(env: Env): Promise<void> {
  await enforceAllOrganizationInactivity(env);
  await processOutbox(env);
  await detectDelayedMessages(env);
  await enforceRetentionPolicies(env);
  const now = new Date().toISOString();
  const snoozed = await dbRequest<JsonRecord[]>(env, `messages?snoozed_until=lte.${encodeURIComponent(now)}&limit=50`);
  for (const message of snoozed) await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ folder: message.previous_folder || "inbox", previous_folder: null, snoozed_until: null }) }).catch(() => undefined);
  await processDueFollowUps(env, now);
  await processDueReminders(env, now);
  await processScheduledRules(env, now);
}

async function processScheduledRules(env: Env, now = new Date().toISOString()): Promise<void> {
  const rules = await dbRequest<Rule[]>(env, `mail_rules?enabled=eq.true&trigger_type=eq.scheduled&next_run_at=lte.${encodeURIComponent(now)}&order=next_run_at.asc&limit=25`).catch(() => []);
  for (const rule of rules) {
    const ownerId = String(rule.owner_id || "");
    if (!ownerId) continue;
    const sourceRows = await existingRuleMessages(env, ownerId);
    const analysis = matchRuleMessages(sourceRows, rule);
    let runId = "";
    try {
      runId = await createRuleRun(env, ownerId, rule.id, "replay", analysis.matches);
      const result = await applyExistingRuleMatches(env, ownerId, rule, runId, analysis.matches, sourceRows);
      await finishRuleRun(env, ownerId, runId, { status: result.failures.length ? "failed" : "completed", matched_count: analysis.matches.length, changed_count: result.changedCount, sample: analysis.matches.slice(0, 20), error_message: result.failures[0]?.error || null });
      await dbRequest(env, `mail_rules?id=eq.${encodeURIComponent(rule.id)}`, { method: "PATCH", body: JSON.stringify({ last_run_at: now, last_run_count: result.changedCount, last_error: result.failures[0]?.error || null, next_run_at: nextAutomationRun(automationSchedule(rule.schedule), new Date(now)) }) });
    } catch (scheduledError) {
      if (runId) await finishRuleRun(env, ownerId, runId, { status: "failed", error_message: scheduledError instanceof Error ? scheduledError.message.slice(0, 500) : "Scheduled rule failed" }).catch(() => undefined);
      await dbRequest(env, `mail_rules?id=eq.${encodeURIComponent(rule.id)}`, { method: "PATCH", body: JSON.stringify({ last_run_at: now, last_error: scheduledError instanceof Error ? scheduledError.message.slice(0, 500) : "Scheduled rule failed", next_run_at: nextAutomationRun(automationSchedule(rule.schedule), new Date(now)) }) }).catch(() => undefined);
    }
  }
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
   const composeMetadata = objectValue(body.composeMetadata) as ComposeMetadata;
   const patch = { subject: String(body.subject || ""), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, to_addresses: splitAddresses(body.to), cc_addresses: splitAddresses(body.cc), bcc_addresses: splitAddresses(body.bcc), from_name: mailbox.display_name || "", from_address: fromAddress, snippet: snippet(String(body.text || "")), compose_mode: body.composeMode === "markdown" || body.composeMode === "html" ? body.composeMode : "plain", schedule_timezone: typeof body.timezone === "string" ? body.timezone.slice(0, 80) : "UTC", recurrence_rule: ["daily", "weekly", "monthly"].includes(String(composeMetadata.recurrence)) ? composeMetadata.recurrence : "none", confidential_mode: composeMetadata.confidentialMode === true, reply_tracking_enabled: composeMetadata.replyTracking === true, follow_up_tracking_enabled: composeMetadata.followUpTracking === true, updated_at: new Date().toISOString() };
  if (id) {
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(mailboxOwnerId)}&folder=eq.drafts`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (rows[0] && Object.keys(composeMetadata).length) await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: mailboxOwnerId, message_id: id, provider: "postveil", event_type: "draft_version_saved", payload: { ...safeComposeMetadata(composeMetadata), subject: patch.subject, text: patch.text_body, html: patch.html_body, savedAt: new Date().toISOString() } }) }).catch(() => undefined);
    return json(rows?.[0] || null);
  }
  const threadId = await findOrCreateThread(env, mailboxOwnerId, patch.subject);
  const rows = await dbRequest<JsonRecord[]>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: mailboxOwnerId, sent_by: user.id, send_mode: access?.delegation?.can_send_as ? "send_as" : access?.delegation?.can_send_on_behalf ? "send_on_behalf" : "own", thread_id: threadId, mailbox_id: mailbox.id, direction: "outbound", folder: "drafts", status: "draft", message_id_header: `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`, ...patch }) });
  if (rows[0] && Object.keys(composeMetadata).length) await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: mailboxOwnerId, message_id: rows[0].id, provider: "postveil", event_type: "draft_version_saved", payload: { ...safeComposeMetadata(composeMetadata), subject: patch.subject, text: patch.text_body, html: patch.html_body, savedAt: new Date().toISOString() } }) }).catch(() => undefined);
  return json(rows?.[0] || null, 201);
}

type SearchToken = { value: string; quoted: boolean; negated: boolean };
type SearchTextPart = { value: string; negated: boolean };
type SearchField = "from" | "to" | "cc" | "bcc" | "subject" | "filename" | "rfc822msgid";
type SearchStateField = "is_read" | "is_starred" | "is_flagged" | "is_pinned" | "is_important" | "is_muted" | "is_ignored" | "has_attachment";
type SearchFilter =
  | { kind: "field"; field: SearchField; value: string; negated: boolean }
  | { kind: "state"; field: SearchStateField; value: boolean; negated: boolean }
  | { kind: "folder"; value: string; negated: boolean }
  | { kind: "date"; operator: "after" | "before"; value: string; negated: boolean }
  | { kind: "size"; operator: "larger" | "smaller"; bytes: number; negated: boolean }
  | { kind: "numeric"; field: "spam_score" | "link_count"; operator: "gt" | "gte" | "lt" | "lte" | "eq"; value: number; negated: boolean }
  | { kind: "domain"; value: string; negated: boolean }
  | { kind: "auth"; value: string; negated: boolean }
  | { kind: "relation"; relation: "filetype" | "label" | "calendar" | "work" | "project"; value: string; negated: boolean };
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
    let inQuotes = false;
    while (index < value.length) {
      const character = value[index];
      if (character === '"') {
        quoted = true;
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }
      if (!inQuotes && /\s/.test(character)) break;
      token += character;
      index += 1;
    }
    if (inQuotes) throw new Error("Unclosed quoted phrase");
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

function expandNaturalLanguageSearch(input: string): string {
  let value = input.trim();
  value = value.replace(/\bwithout\s+(?:any\s+)?(?:attachments?|files?)\b/gi, "-has:attachment");
  value = value.replace(/\bwith\s+(?:any\s+)?(?:attachments?|files?)\b/gi, "has:attachment");
  value = value.replace(/\bwithout\s+(?:any\s+)?links?\b/gi, "-has:link");
  value = value.replace(/\bwith\s+(?:any\s+)?links?\b/gi, "has:link");
  value = value.replace(/\bnot\s+read\b/gi, "is:unread");
  value = value.replace(/\bunread\b/gi, "is:unread");
  value = value.replace(/\bread\s+messages?\b/gi, "is:read");
  value = value.replace(/\bfrom\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, "from:$1");
  value = value.replace(/\bto\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, "to:$1");
  value = value.replace(/\b(?:in\s+)?the\s+last\s+(\d+)\s+(days?|weeks?|months?|years?)\b/gi, (_match, amount: string, unit: string) => {
    const suffix = unit.toLowerCase().startsWith("day") ? "d" : unit.toLowerCase().startsWith("week") ? "w" : unit.toLowerCase().startsWith("month") ? "m" : "y";
    return `after:${amount}${suffix}`;
  });
  value = value.replace(/\b(?:this|past)\s+week\b/gi, "after:7d");
  value = value.replace(/\bold(?:er)?\s+than\s+(\d+(?:\.\d+)?\s*(?:kb|kib|mb|mib|gb|gib))\b/gi, "larger:$1");
  return value.replace(/\s+/g, " ").trim();
}

function parseSearchNumber(value: string, operator: string, field: "spam_score" | "link_count"): { operator: "gt" | "gte" | "lt" | "lte" | "eq"; value: number } {
  const match = value.trim().match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)(%)?$/);
  if (!match) throw new Error(`${operator}: invalid number "${value}"`);
  let number = Number(match[2]);
  if (field === "spam_score" && (match[3] || number > 1)) number /= 100;
  if (!Number.isFinite(number) || number < 0 || (field === "spam_score" && number > 1)) throw new Error(`${operator}: value must be between 0 and 1`);
  const comparison = match[1] || "=";
  return { operator: comparison === ">" ? "gt" : comparison === ">=" ? "gte" : comparison === "<" ? "lt" : comparison === "<=" ? "lte" : "eq", value: number };
}

function parseSearchQuery(input: string): ParsedSearch {
  const query = expandNaturalLanguageSearch(input);
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
    if (["from", "to", "cc", "bcc", "subject", "filename", "rfc822msgid"].includes(operator)) {
      filters.push({ kind: "field", field: operator as SearchField, value: operand, negated: token.negated });
      continue;
    }
    if (operator === "domain") {
      filters.push({ kind: "domain", value: operand.toLowerCase().replace(/^@/, ""), negated: token.negated });
      continue;
    }
    if (operator === "auth" || operator === "authentication") {
      const authValue = operand.toLowerCase();
      if (!["pass", "fail", "none", "neutral", "missing"].includes(authValue)) throw new Error(`auth: unsupported value "${operand}"; use pass, fail, none, neutral, or missing`);
      filters.push({ kind: "auth", value: authValue, negated: token.negated });
      continue;
    }
    if (["type", "filetype", "mime"].includes(operator)) {
      filters.push({ kind: "relation", relation: "filetype", value: operand.toLowerCase().replace(/^\./, ""), negated: token.negated });
      continue;
    }
    if (operator === "label") {
      filters.push({ kind: "relation", relation: "label", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "calendar" || operator === "event") {
      filters.push({ kind: "relation", relation: "calendar", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "work" || operator === "task") {
      filters.push({ kind: "relation", relation: "work", value: operand.toLowerCase(), negated: token.negated });
      continue;
    }
    if (operator === "project") {
      filters.push({ kind: "relation", relation: "project", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "has") {
      const hasValue = operand.toLowerCase();
      if (["attachment", "attachments", "file", "files"].includes(hasValue)) filters.push({ kind: "state", field: "has_attachment", value: true, negated: token.negated });
      else if (["link", "links"].includes(hasValue)) filters.push({ kind: "numeric", field: "link_count", operator: "gt", value: 0, negated: token.negated });
      else if (["calendar", "event", "events"].includes(hasValue)) filters.push({ kind: "relation", relation: "calendar", value: "any", negated: token.negated });
      else if (["work", "task", "tasks"].includes(hasValue)) filters.push({ kind: "relation", relation: "work", value: "any", negated: token.negated });
      else throw new Error(`has: unsupported value "${operand}"; use attachment, link, calendar, or work`);
      continue;
    }
    if (operator === "is") {
      const states: Record<string, { field: SearchStateField; value: boolean }> = {
        unread: { field: "is_read", value: false }, read: { field: "is_read", value: true },
        starred: { field: "is_starred", value: true }, unstarred: { field: "is_starred", value: false },
        flagged: { field: "is_flagged", value: true }, unflagged: { field: "is_flagged", value: false },
        pinned: { field: "is_pinned", value: true }, unpinned: { field: "is_pinned", value: false },
        important: { field: "is_important", value: true }, unimportant: { field: "is_important", value: false },
        muted: { field: "is_muted", value: true }, ignored: { field: "is_ignored", value: true },
      };
      const state = states[operand.toLowerCase()];
      if (!state) throw new Error(`is: unsupported value "${operand}"; use unread, read, starred, flagged, pinned, important, muted, or ignored`);
      filters.push({ kind: "state", ...state, negated: token.negated });
      continue;
    }
    if (operator === "in") {
      const folder = operand.toLowerCase();
      const validFolder = folder === "all" || ["important", "snoozed", "muted"].includes(folder) || SYSTEM_FOLDERS.includes(folder as typeof SYSTEM_FOLDERS[number]) || (folder.startsWith("custom:") && /^[0-9a-f-]{36}$/i.test(folder.slice(7)));
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
    if (["spam", "spam_score", "risk", "score"].includes(operator)) {
      filters.push({ kind: "numeric", field: "spam_score", ...parseSearchNumber(operand, operator, "spam_score"), negated: token.negated });
      continue;
    }
    if (["links", "link_count"].includes(operator)) {
      const linksValue = operand.toLowerCase();
      if (["yes", "true", "present"].includes(linksValue)) filters.push({ kind: "numeric", field: "link_count", operator: "gt", value: 0, negated: token.negated });
      else if (["no", "false", "none", "absent"].includes(linksValue)) filters.push({ kind: "numeric", field: "link_count", operator: "eq", value: 0, negated: token.negated });
      else filters.push({ kind: "numeric", field: "link_count", ...parseSearchNumber(operand, operator, "link_count"), negated: token.negated });
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
    if (filter.kind !== "field" && filter.kind !== "relation") continue;
    const isFilename = filter.kind === "field" && filter.field === "filename";
    const isFileType = filter.kind === "relation" && filter.relation === "filetype";
    if (!isFilename && !isFileType) continue;
    const condition = isFilename
      ? `filename=ilike.*${encodeURIComponent(safeLike(filter.value))}*`
      : `or=${encodeURIComponent(`(content_type.ilike.*${safeLike(filter.value)}*,filename.ilike.*.${safeLike(filter.value)})`)}`;
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

async function domainSearchIds(env: Env, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  const domainFilters = filters.filter((filter): filter is Extract<SearchFilter, { kind: "domain" }> => filter.kind === "domain");
  if (!domainFilters.length) return { include: null, exclude: [] };
  const rows = await dbRequest<Array<{ id: string; from_address?: string; to_addresses?: unknown; cc_addresses?: unknown; bcc_addresses?: unknown }>>(
    env,
    `messages?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,from_address,to_addresses,cc_addresses,bcc_addresses&limit=10000`,
  );
  for (const filter of domainFilters) {
    const domain = filter.value.toLowerCase().replace(/^@/, "");
    const matchingIds = rows
      .filter((row) => [String(row.from_address || ""), ...splitAddresses(row.to_addresses), ...splitAddresses(row.cc_addresses), ...splitAddresses(row.bcc_addresses)].some((address) => domainOf(address) === domain))
      .map((row) => String(row.id));
    const ids = new Set<string>(matchingIds);
    if (filter.negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else {
      const currentInclude = include as Set<string>;
      include = new Set<string>([...currentInclude].filter((id) => ids.has(id)));
    }
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

async function relatedSearchIds(env: Env, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  const apply = (ids: Set<string>, negated: boolean) => {
    if (negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else include = new Set<string>([...include].filter((id) => ids.has(id)));
  };
  for (const filter of filters) {
    if (filter.kind !== "relation" || ["filetype"].includes(filter.relation)) continue;
    let ids = new Set<string>();
    if (filter.relation === "label") {
      const labels = await dbRequest<Array<{ id: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&name=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=id&limit=100`);
      if (labels.length) {
        const labelIds = labels.map((row) => row.id).join(",");
        const rows = await dbRequest<Array<{ message_id: string }>>(env, `message_labels?label_id=in.(${encodeURIComponent(labelIds)})&select=message_id&limit=10000`);
        ids = new Set(rows.map((row) => row.message_id));
      }
    } else if (filter.relation === "calendar") {
      const value = filter.value.toLowerCase();
      const path = value === "any" || ["yes", "true", "present"].includes(value)
        ? `calendar_events?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&select=source_message_id&limit=10000`
        : `calendar_events?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`;
      const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, path);
      ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
    } else if (filter.relation === "work") {
      const value = filter.value.toLowerCase();
      if (["any", "yes", "true", "open", "task", "tasks"].includes(value)) {
        const [tasks, messages] = await Promise.all([
          dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&completed=eq.false&select=source_message_id&limit=10000`),
          dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&work_state=neq.none&select=id&limit=10000`),
        ]);
        tasks.forEach((row) => { if (row.source_message_id) ids.add(row.source_message_id); });
        messages.forEach((row) => ids.add(row.id));
      } else if (["none", "reply_later", "waiting_on", "i_owe"].includes(value)) {
        const rows = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&work_state=eq.${encodeURIComponent(value)}&select=id&limit=10000`);
        ids = new Set(rows.map((row) => row.id));
      } else {
        const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`);
        ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
      }
    } else if (filter.relation === "project") {
      const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`);
      ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
    }
    apply(ids, filter.negated);
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

type MailQueryOptions = { folder: string; query?: string; filter?: string; sort?: string; page?: number; pageSize?: number; maxPageSize?: number; mailboxIds?: string[] };

async function buildMailQuery(env: Env, ownerId: string, options: MailQueryOptions): Promise<{ path: string; parsed?: ParsedSearch; page: number; pageSize: number; searchActive: boolean }> {
  const query = options.query?.trim() || "";
  const parsed = query ? parseSearchQuery(query) : undefined;
  const page = Math.max(1, Math.min(100000, Number(options.page || 1)));
  const maxPageSize = Math.max(100, Math.min(5000, Number(options.maxPageSize || 100)));
  const pageSize = Math.max(10, Math.min(maxPageSize, Number(options.pageSize || 80)));
  const parts = [messageScopeFilter(ownerId, options.mailboxIds || []), "select=id,thread_id,mailbox_id,owner_id,direction,folder,status,custom_folder_id,previous_folder,from_name,from_address,to_addresses,cc_addresses,subject,snippet,message_id_header,is_read,is_starred,is_pinned,is_flagged,is_important,is_muted,is_ignored,priority,has_attachment,spam_score,spam_reasons,link_count,auth_spf,auth_dkim,auth_dmarc,auth_arc,auth_tls,trust_score,trust_reasons,screening_status,focused_score,focused_category,delivery_status,delivery_error_code,delivery_error,provider,provider_message_id,open_tracking_enabled,click_tracking_enabled,message_size_bytes,scheduled_at,next_delivery_at,snoozed_until,work_state,follow_up_at,work_note,reminder_at,reminder_note,unsubscribe_url,retention_expires_at,legal_hold,received_at,sent_at,created_at"];
  const explicitFolders = parsed?.filters.filter((filter): filter is Extract<SearchFilter, { kind: "folder" }> => filter.kind === "folder") || [];
  if (!parsed) {
    if (options.folder.startsWith("custom:")) { parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(options.folder.slice(7))}`); }
    else if (options.folder === "focused") parts.push("folder=eq.inbox", "focused_category=eq.focused", "is_ignored=eq.false");
    else if (options.folder === "other") parts.push("folder=eq.inbox", "focused_category=eq.other", "is_ignored=eq.false");
    else if (options.folder === "important") parts.push("is_important=eq.true");
    else if (options.folder === "snoozed") parts.push("snoozed_until=not.is.null");
    else if (options.folder === "muted") parts.push("is_muted=eq.true");
    else if (options.folder === "inbox") parts.push("folder=eq.inbox", "is_ignored=eq.false");
    else if (options.folder !== "all") parts.push(`folder=eq.${encodeURIComponent(options.folder)}`);
  } else {
    for (const folder of explicitFolders) {
      if (folder.value === "all") continue;
      if (folder.value.startsWith("custom:")) {
        if (folder.negated) throw new Error("Negating a custom folder is not supported; use a positive in: folder filter");
        parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(folder.value.slice(7))}`);
      } else if (folder.value === "important") parts.push(`is_important=${folder.negated ? "eq.false" : "eq.true"}`);
      else if (folder.value === "snoozed") parts.push(`snoozed_until=${folder.negated ? "is.null" : "not.is.null"}`);
      else if (folder.value === "muted") parts.push(`is_muted=${folder.negated ? "eq.false" : "eq.true"}`);
      else parts.push(`folder=${folder.negated ? "not.eq" : "eq"}.${encodeURIComponent(folder.value)}`);
    }
    const fts = webSearchValue(parsed);
    if (fts) parts.push(`search_vector=wfts.${encodeURIComponent(fts)}`);
    for (const filter of parsed.filters) {
      if (filter.kind === "field") {
        if (filter.field === "filename") continue;
        if (filter.field === "rfc822msgid") { parts.push(`message_id_header=${filter.negated ? "not.eq" : "eq"}.${encodeURIComponent(filter.value)}`); continue; }
        if (filter.field === "to" || filter.field === "cc" || filter.field === "bcc") {
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
      if (filter.kind === "size") {
        const operator = filter.operator === "larger"
          ? (filter.negated ? "lte" : "gt")
          : (filter.negated ? "gte" : "lt");
        parts.push(`message_size_bytes=${operator}.${filter.bytes}`);
      }
      if (filter.kind === "numeric") {
        const inverted: Record<"gt" | "gte" | "lt" | "lte" | "eq", string> = { gt: "lte", gte: "lt", lt: "gte", lte: "gt", eq: "neq" };
        const operator = filter.negated ? inverted[filter.operator] : filter.operator;
        parts.push(`${filter.field}=${operator}.${filter.value}`);
      }
      if (filter.kind === "auth") {
        const authFields = ["auth_spf", "auth_dkim", "auth_dmarc", "auth_arc", "auth_tls"];
        const authValue = filter.value === "missing" ? "" : filter.value;
        if (filter.value === "missing") {
          const condition = filter.negated
            ? `or=(${authFields.map((field) => `${field}.not.is.null`).join(",")})`
            : `and=(${authFields.map((field) => `${field}.is.null`).join(",")})`;
          parts.push(condition.startsWith("or=") ? `or=${encodeURIComponent(condition.slice(3))}` : `and=${encodeURIComponent(condition.slice(4))}`);
        } else {
          const condition = filter.negated
            ? `and=(${authFields.map((field) => `${field}.not.eq.${authValue}`).join(",")})`
            : `or=(${authFields.map((field) => `${field}.eq.${authValue}`).join(",")})`;
          parts.push(condition.startsWith("or=") ? `or=${encodeURIComponent(condition.slice(3))}` : `and=${encodeURIComponent(condition.slice(4))}`);
        }
      }
    }
    const attachmentIds = await attachmentSearchIds(env, ownerId, parsed.filters);
    const domainIds = await domainSearchIds(env, ownerId, parsed.filters);
    const relatedIds = await relatedSearchIds(env, ownerId, parsed.filters);
    const includeSets = [attachmentIds.include, domainIds.include, relatedIds.include].filter((ids): ids is string[] => Boolean(ids));
    if (includeSets.length) {
      let combined = new Set(includeSets[0]);
      for (const ids of includeSets.slice(1)) combined = new Set([...combined].filter((id) => ids.includes(id)));
      parts.push(combined.size ? `id=${encodeURIComponent(`in.(${[...combined].join(",")})`)}` : "id=eq.00000000-0000-0000-0000-000000000000");
    }
    const excludedIds = [...new Set([...attachmentIds.exclude, ...domainIds.exclude, ...relatedIds.exclude])];
    if (excludedIds.length) parts.push(`id=${encodeURIComponent(`not.in.(${excludedIds.join(",")})`)}`);
  }
  const listFilter = options.filter || "all";
  if (listFilter === "unread") parts.push("is_read=eq.false");
  if (listFilter === "starred") parts.push("is_starred=eq.true");
  if (listFilter === "attachments") parts.push("has_attachment=eq.true");
  parts.push(`order=${options.sort === "oldest" ? "created_at.asc,id.asc" : "created_at.desc,id.desc"}`, `offset=${(page - 1) * pageSize}`, `limit=${pageSize + 1}`);
  return { path: `messages?${parts.join("&")}`, parsed, page, pageSize, searchActive: Boolean(parsed) };
}

type SearchHistoryRow = { id: string; owner_id: string; query: string; normalized_query: string; usage_count: number; last_used_at: string; created_at: string };
type SearchSuggestion = { kind: "recent" | "saved" | "label" | "contact" | "syntax"; value: string; label: string; detail?: string };

async function recordSearchHistory(env: Env, ownerId: string, query: string): Promise<SearchHistoryRow> {
  const parsed = parseSearchQuery(query);
  const normalized = parsed.normalized.slice(0, 1000);
  const now = new Date().toISOString();
  const existing = await dbRequest<SearchHistoryRow[]>(env, `search_history?owner_id=eq.${encodeURIComponent(ownerId)}&normalized_query=eq.${encodeURIComponent(normalized)}&limit=1`);
  if (existing[0]) {
    const rows = await dbRequest<SearchHistoryRow[]>(env, `search_history?id=eq.${encodeURIComponent(existing[0].id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ query: query.slice(0, 1000), usage_count: Math.min(1000000, Number(existing[0].usage_count || 0) + 1), last_used_at: now }) });
    return rows[0] || { ...existing[0], query, last_used_at: now, usage_count: Number(existing[0].usage_count || 0) + 1 };
  }
  const rows = await dbRequest<SearchHistoryRow[]>(env, "search_history", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, query: query.slice(0, 1000), normalized_query: normalized, usage_count: 1, last_used_at: now }) });
  return rows[0];
}

async function searchSuggestions(env: Env, ownerId: string, input: string): Promise<SearchSuggestion[]> {
  const needle = input.trim().toLowerCase();
  const [history, saved, labels, contacts] = await Promise.all([
    dbRequest<SearchHistoryRow[]>(env, `search_history?owner_id=eq.${encodeURIComponent(ownerId)}&order=last_used_at.desc&limit=8`).catch(() => []),
    dbRequest<Array<{ name: string; query: string }>>(env, `saved_searches?owner_id=eq.${encodeURIComponent(ownerId)}&order=sort_order.asc,name.asc&limit=20`).catch(() => []),
    dbRequest<Array<{ name: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&order=name.asc&limit=20`).catch(() => []),
    dbRequest<Array<{ display_name?: string; email: string }>>(env, `contacts?owner_id=eq.${encodeURIComponent(ownerId)}&order=display_name.asc&limit=20`).catch(() => []),
  ]);
  const suggestions: SearchSuggestion[] = [];
  const add = (suggestion: SearchSuggestion) => {
    if (suggestions.some((item) => item.value.toLowerCase() === suggestion.value.toLowerCase())) return;
    if (needle && !`${suggestion.value} ${suggestion.label} ${suggestion.detail || ""}`.toLowerCase().includes(needle)) return;
    suggestions.push(suggestion);
  };
  history.forEach((item) => add({ kind: "recent", value: item.query, label: item.query, detail: `${item.usage_count} use${item.usage_count === 1 ? "" : "s"}` }));
  saved.forEach((item) => add({ kind: "saved", value: item.query, label: item.name, detail: item.query }));
  labels.forEach((item) => add({ kind: "label", value: `label:${item.name}`, label: `Label: ${item.name}` }));
  contacts.forEach((item) => add({ kind: "contact", value: `from:${item.email}`, label: item.display_name || item.email, detail: item.email }));
  [
    ["from:", "Sender"], ["to:", "Recipient"], ["subject:", "Subject"], ["filename:", "Attachment name"], ["type:", "File type"],
    ["label:", "Label"], ["in:", "Folder"], ["domain:", "Domain"], ["auth:pass", "Authentication passed"], ["is:unread", "Unread"],
    ["has:attachment", "Has attachments"], ["has:calendar", "Has calendar event"], ["has:work", "Has follow-up work"], ["spam:>70%", "Spam score"],
    ["links:>0", "Has links"], ["after:7d", "Recent messages"], ["larger:5MB", "Message size"], ["work:reply_later", "Work state"], ["project:", "Project or task"],
  ].forEach(([value, label]) => add({ kind: "syntax", value, label: String(label), detail: String(value) }));
  return suggestions.slice(0, 12);
}

function exportSearchRows(rows: JsonRecord[], format: "csv" | "json"): { body: string; contentType: string; extension: string } {
  const fields = ["created_at", "folder", "from_address", "to_addresses", "subject", "message_size_bytes", "spam_score", "auth_spf", "auth_dkim", "auth_dmarc", "link_count", "has_attachment", "work_state"];
  if (format === "json") return { body: JSON.stringify(rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]))), null, 2), contentType: "application/json; charset=utf-8", extension: "json" };
  const lines = [fields.join(",")];
  rows.forEach((row) => lines.push(fields.map((field) => csvCell(Array.isArray(row[field]) ? row[field].join("; ") : row[field])).join(",")));
  return { body: `${lines.join("\n")}\n`, contentType: "text/csv; charset=utf-8", extension: "csv" };
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
    is_flagged: message.is_flagged === true, is_important: message.is_important === true, is_muted: message.is_muted === true, is_ignored: message.is_ignored === true,
    priority: typeof message.priority === "number" ? message.priority : 0,
    work_state: message.work_state || "none", follow_up_at: message.follow_up_at || null, reminder_at: message.reminder_at || null, reminder_note: message.reminder_note || null, snoozed_until: message.snoozed_until || null,
  };
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
  const mail = objectValue(event.mail);
  const eventData = objectValue(event["event-data"] || event.eventData);
  const headers = objectValue(objectValue(eventData.message).headers || objectValue(event.message).headers);
  return String(event.eventId || event.event_id || event.sg_event_id || event.id || event.MessageID || event.messageId || event["message-id"] || mail.messageId || mail["message-id"] || headers["message-id"] || `${provider}:${event.eventType || event.event || event.Type || event.RecordType || event.notificationType || "event"}:${event.timestamp || event.occurredAt || event.recipient || event.email || ""}`);
}

function normalizeDeliveryEvents(provider: ProviderName, input: unknown): DeliveryEvent[] {
  let payload = input as JsonRecord;
  if (provider === "ses" && typeof payload.Message === "string") {
    try { payload = JSON.parse(payload.Message) as JsonRecord; } catch { /* keep the envelope for the failure explanation */ }
  }
  const values = Array.isArray(input) ? input : Array.isArray(payload?.events) ? payload.events : [payload];
  return values.filter((value): value is JsonRecord => Boolean(value && typeof value === "object")).map((raw) => {
    const eventData = objectValue(raw["event-data"] || raw.eventData);
    const mail = objectValue(raw.mail);
    const delivery = objectValue(raw.delivery);
    const bounce = objectValue(raw.bounce);
    const complaint = objectValue(raw.complaint);
    const nested = Object.keys(eventData).length ? eventData : Object.keys(mail).length ? mail : raw;
    const nestedMessage = objectValue(nested.message);
    const nestedHeaders = objectValue(nestedMessage.headers);
    const bounceRecipient = objectValue(Array.isArray(bounce.bouncedRecipients) ? bounce.bouncedRecipients[0] : undefined);
    const complaintRecipient = objectValue(Array.isArray(complaint.complainedRecipients) ? complaint.complainedRecipients[0] : undefined);
    const eventType = String(raw.event || raw.eventType || raw.Type || raw.RecordType || raw.notificationType || nested.event || nested.eventType || (Object.keys(delivery).length ? "delivered" : Object.keys(bounce).length ? "bounce" : Object.keys(complaint).length ? "complaint" : "unknown")).toLowerCase();
    const providerMessageId = String(raw["message-id"] || raw.messageId || raw.sg_message_id || raw.MessageID || mail.messageId || mail["message-id"] || nestedHeaders["message-id"] || nested.id || nested.messageId || raw.id || "");
    const recipient = cleanAddress(String(raw.email || raw.recipient || nested.recipient || nested.destination || (Array.isArray(delivery.recipients) ? delivery.recipients[0] : "") || bounceRecipient.emailAddress || complaintRecipient.emailAddress || ""));
    const reason = String(raw.reason || raw.description || raw.error || bounceRecipient.diagnosticCode || bounceRecipient.action || nested.message || nested.reason || nested.description || "").slice(0, 500);
    const timestamp = Number(raw.timestamp || delivery.timestamp || bounce.timestamp || complaint.timestamp || nested.timestamp || 0);
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
  const eventName = event.eventType.toLowerCase();
  const receiptKind = eventName.includes("open") || eventName.includes("read") ? "read" : eventName.includes("confirm") || eventName.includes("receipt") ? "confirmation" : state?.deliveryStatus === "delivered" ? "delivery" : null;
  if (receiptKind) await recordReceiptEvent(env, String(message.owner_id), String(message.id), receiptKind, event.recipient, provider, event.eventId || claim.hash, event.payload);
  const organizationId = message.mailbox_id ? (await dbRequest<MailboxAdminSettings[]>(env, `mailbox_admin_settings?mailbox_id=eq.${encodeURIComponent(String(message.mailbox_id))}&limit=1`).catch(() => []))[0]?.organization_id : undefined;
  await applyEventRules(env, String(message.owner_id), String(message.id), event.eventType, organizationId).catch((eventRuleError) => console.error("Event rule processing failed", eventRuleError));
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
  const isHtml = headers.get("content-type")?.toLowerCase().includes("text/html") === true;
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
  await enforceRequestBodyLimit(request);
  if (url.pathname === "/api/client-config") {
    if (request.method !== "GET") return error("Method not allowed", 405);
    const publicUrl = String(env.SUPABASE_URL || "").trim();
    const publicKey = String(env.SUPABASE_ANON_KEY || "").trim();
    if (!publicUrl || !publicKey) return error("Service temporarily unavailable", 503);
    return json({ supabaseUrl: publicUrl, supabaseAnonKey: publicKey });
  }
  if (url.pathname === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") return error("Method not allowed", 405);
    return json({ ok: true, service: "postveil", configured: { supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), brevo: Boolean(env.BREVO_API_KEY), b2: Boolean(env.B2_ENDPOINT && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY), inboundOwner: Boolean(env.OWNER_USER_ID) }, supabaseProbe: await probeSupabase(env), timestamp: new Date().toISOString() });
  }
  const deliveryWebhookMatch = url.pathname.match(/^\/api\/webhooks\/(brevo|ses|mailgun|postmark|sendgrid|smtp)$/);
  if (deliveryWebhookMatch) {
    if (request.method !== "POST") return error("Method not allowed", 405);
    const provider = deliveryWebhookMatch[1] as ProviderName;
    const expectedSecret = providerWebhookSecret(env, provider);
    const suppliedSecret = request.headers.get("x-webhook-secret") || request.headers.get("x-webhook-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!expectedSecret) return error("This provider webhook is not configured", 503);
    if (!constantTimeEqual(suppliedSecret, expectedSecret)) return error("Unauthorized", 401);
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
    const suppliedSecret = request.headers.get("x-webhook-secret") || request.headers.get("x-webhook-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!expectedSecret) return error("This inbound webhook is not configured", 503);
    if (!constantTimeEqual(suppliedSecret, expectedSecret)) return error("Unauthorized", 401);
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
  if (request.method === "GET" && url.pathname === "/api/email-image-proxy") {
    try {
      return await fetchProxiedEmailImage(url.searchParams.get("url") || "");
    } catch {
      return error("The remote image could not be loaded", 502);
    }
  }
  if (request.method === "GET" && url.pathname === "/api/link-inspection") {
    try {
      return json(await inspectExternalLink(url.searchParams.get("url") || ""));
    } catch {
      return error("The link destination could not be inspected", 502);
    }
  }
  let organization: Organization | null = null;
  try {
    organization = await ensureOrganization(env, user);
    const mfaSetupRoute = url.pathname === "/api/recovery-methods" || url.pathname.startsWith("/api/recovery-methods/") || url.pathname === "/api/recovery-codes" || url.pathname === "/api/recovery-codes/status" || url.pathname === "/api/security/overview" || url.pathname === "/api/privacy-settings" || url.pathname === "/api/admin/organization" || url.pathname === "/api/admin/overview";
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
    await sendSystemMessage(env, {
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
    const result = await dbRequest<JsonRecord>(env, "rpc/empty_trash", {
      method: "POST",
      body: "{}",
    }, user.accessToken);
    const objectKeys = Array.isArray(result.object_keys)
      ? result.object_keys.filter((key): key is string => typeof key === "string")
      : [];
    const storageCleanupFailed = await deleteObjects(env, objectKeys);
    return json({
      ok: result.ok !== false,
      deleted: Number(result.deleted_count || 0),
      storageCleanupFailed,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/search/parse") {
    try {
      const parsed = parseSearchQuery(url.searchParams.get("q") || "");
      return json({ ok: true, ...parsed });
    } catch (parseError) {
      return error(parseError instanceof Error ? parseError.message : "Invalid search query", 400);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/search/history") {
    const rows = await dbRequest<SearchHistoryRow[]>(env, `search_history?owner_id=eq.${encodeURIComponent(user.id)}&order=last_used_at.desc&limit=20`).catch(() => []);
    return json(rows);
  }
  if (request.method === "POST" && url.pathname === "/api/search/history") {
    const body = (await request.json()) as JsonRecord;
    const queryText = String(body.query || "").trim().slice(0, 1000);
    if (!queryText) return error("Search query is required");
    try { return json(await recordSearchHistory(env, user.id, queryText), 201); }
    catch (historyError) { return error(historyError instanceof Error ? historyError.message : "Search history could not be saved", 400); }
  }
  if (request.method === "DELETE" && url.pathname === "/api/search/history") {
    await dbRequest(env, `search_history?owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" }).catch(() => undefined);
    return json({ ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/search/suggestions") {
    return json(await searchSuggestions(env, user.id, url.searchParams.get("q") || ""));
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

  if (request.method === "GET" && url.pathname === "/api/mail/export") {
    try {
      const requestedFormat = (url.searchParams.get("format") || "csv").toLowerCase();
      if (requestedFormat !== "csv" && requestedFormat !== "json") return error("Export format must be csv or json", 400);
      const format = requestedFormat as "csv" | "json";
      const exportRows: JsonRecord[] = [];
      for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
        const query = await buildMailQuery(env, user.id, {
          folder: url.searchParams.get("folder") || "inbox",
          query: url.searchParams.get("q") || "",
          filter: url.searchParams.get("filter") || "all",
          sort: url.searchParams.get("sort") || "newest",
          page: pageNumber,
          pageSize: 100,
          mailboxIds: await delegatedMailboxIds(env, user.id, "read"),
        });
        const rows = await dbRequest<JsonRecord[]>(env, query.path);
        const hasMore = rows.length > query.pageSize;
        exportRows.push(...(hasMore ? rows.slice(0, query.pageSize) : rows));
        if (!hasMore || exportRows.length >= 5000) break;
      }
      const exported = exportSearchRows(exportRows.slice(0, 5000), format);
      return new Response(exported.body, { headers: { "content-type": exported.contentType, "content-disposition": `attachment; filename="postveil-search-${new Date().toISOString().slice(0, 10)}.${exported.extension}"`, "cache-control": "no-store" } });
    } catch (exportError) {
      return error(exportError instanceof Error ? exportError.message : "Search results could not be exported", 400);
    }
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
    try {
      const result = await dbRequest<JsonRecord>(env, "rpc/undo_bulk_message_action", {
        method: "POST",
        body: JSON.stringify({ p_request_id: requestId }),
      }, user.accessToken);
      return json({
        ok: result.ok !== false,
        undoneIds: Array.isArray(result.undone_ids) ? result.undone_ids.map(String) : [],
        failures: Array.isArray(result.failures) ? result.failures : [],
      });
    } catch (undoError) {
      const message = undoError instanceof Error ? undoError.message : "Undo failed";
      const status = message.includes("no longer") ? 410 : message.includes("cannot") ? 409 : 400;
      return error(message, status);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/mail/bulk") {
    const body = (await request.json()) as JsonRecord;
    const action = objectValue(body.action);
    const actionType = String(action.type || "");
    const allowedActions = new Set(["archive", "move", "label", "mark_read", "mark_unread", "star", "unstar", "pin", "unpin", "flag", "unflag", "important", "not_important", "mute", "unmute", "ignore", "unignore", "reminder", "priority", "snooze", "reply_later", "waiting_on", "i_owe", "spam", "trash", "restore", "export", "create_task"]);
    if (!allowedActions.has(actionType)) return error(`Unsupported bulk action "${actionType}"`);
    const requestId = String(body.idempotencyKey || crypto.randomUUID()).trim().slice(0, 100);
    const scope = body.scope === "all_results" ? "all_results" : "selected";
    const failures: Array<{ id: string; error: string }> = [];
    let messageIds: string[] = [];
    let truncated = false;
    if (scope === "selected") {
      const requested = Array.isArray(body.messageIds) ? [...new Set(body.messageIds.map(String).filter(Boolean))] : [];
      const ids = requested.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      requested.filter((id) => !ids.includes(id)).forEach((id) => failures.push({ id, error: "Invalid message id" }));
      if (!ids.length) return error("Select at least one message");
      messageIds = ids;
    } else {
      const pageSize = 5000;
      const firstQuery = await buildMailQuery(env, user.id, { folder: String(body.folder || "all"), query: String(body.query || ""), filter: "all", sort: "newest", page: 1, pageSize, maxPageSize: pageSize });
      let pageNumber = 1;
      let nextPath = firstQuery.path;
      while (true) {
        const result = await dbRequest<JsonRecord[]>(env, nextPath);
        const pageItems = result.length > pageSize ? result.slice(0, pageSize) : result;
        messageIds.push(...pageItems.map((row) => String(row.id)));
        if (result.length <= pageSize) break;
        pageNumber += 1;
        nextPath = firstQuery.path.replace(/offset=\d+/, `offset=${(pageNumber - 1) * pageSize}`).replace(/limit=\d+$/, `limit=${pageSize + 1}`);
      }
      messageIds = [...new Set(messageIds)];
    }
    if (!messageIds.length) return error("Select at least one message");
    try {
      const result = await dbRequest<JsonRecord>(env, "rpc/execute_bulk_message_action", {
        method: "POST",
        body: JSON.stringify({ p_request_id: requestId, p_message_ids: messageIds, p_action: action }),
      }, user.accessToken);
      const rpcFailures = Array.isArray(result.failures) ? result.failures as Array<{ id: string; error: string }> : [];
      const mergedFailures = [...failures, ...rpcFailures];
      return json({
        ok: result.ok !== false && mergedFailures.length === 0,
        replayed: result.replayed === true,
        requestId,
        scope,
        requestedCount: scope === "all_results" ? messageIds.length : (Array.isArray(body.messageIds) ? body.messageIds.length : 0),
        changedIds: Array.isArray(result.changed_ids) ? result.changed_ids.map(String) : [],
        exported: Array.isArray(result.exported) ? result.exported : [],
        failures: mergedFailures,
        truncated: truncated || result.truncated === true,
        undoable: result.undoable === true,
      });
    } catch (actionError) {
      return error(actionError instanceof Error ? actionError.message : "Bulk action failed", 400);
    }
  }

  const collaborationThreadMatch = url.pathname.match(/^\/api\/collaboration\/threads\/([^/]+)$/);
  if (collaborationThreadMatch && request.method === "GET") {
    const threadId = decodeURIComponent(collaborationThreadMatch[1]);
    const context = await collaborationThreadContext(env, user, threadId);
    if (!context) return error("Conversation not found or not shared with you", 404);
    let state = await ensureCollaborationThread(env, context.ownerId, context.organization.id, threadId);
    if (collaborationSlaBreached(state.sla_due_at) && !state.sla_breached_at) {
      const breachedAt = new Date().toISOString();
      const rows = await dbRequest<CollaborationThread[]>(env, `collaboration_threads?id=eq.${encodeURIComponent(String(state.id || ""))}&owner_id=eq.${encodeURIComponent(context.ownerId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sla_breached_at: breachedAt, updated_at: breachedAt }) }).catch(() => []);
      state = rows[0] || { ...state, sla_breached_at: breachedAt };
      await collaborationActivity(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, "sla_breached", { priority: state.priority, dueAt: state.sla_due_at });
    }
    const [comments, activity, presence, members, assignment] = await Promise.all([
      dbRequest<JsonRecord[]>(env, `thread_comments?thread_id=eq.${encodeURIComponent(threadId)}&organization_id=eq.${encodeURIComponent(context.organization.id)}&order=created_at.asc&limit=200`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `collaboration_activity?thread_id=eq.${encodeURIComponent(threadId)}&organization_id=eq.${encodeURIComponent(context.organization.id)}&order=created_at.asc&limit=200`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `collaboration_presence?thread_id=eq.${encodeURIComponent(threadId)}&organization_id=eq.${encodeURIComponent(context.organization.id)}&last_seen_at=gte.${encodeURIComponent(new Date(Date.now() - 45_000).toISOString())}&order=last_seen_at.desc`).catch(() => []),
      collaborationMembers(env, context.organization.id),
      dbRequest<JsonRecord[]>(env, `thread_assignments?owner_id=eq.${encodeURIComponent(context.ownerId)}&thread_id=eq.${encodeURIComponent(threadId)}&limit=1`).catch(() => []),
    ]);
    const memberMap = new Map(members.map((member) => [member.user_id, member]));
    const canSeePrivate = context.member.role === "owner" || context.member.role === "admin";
    const visibleComments = comments.filter((comment) => comment.visibility !== "private" || canSeePrivate || String(comment.author_id || "") === user.id).map((comment) => ({ ...comment, author: memberMap.get(String(comment.author_id || "")) || null, mentioned_user_ids: Array.isArray(comment.mentioned_user_ids) ? comment.mentioned_user_ids : [] }));
    return json({ thread: state, assignment: assignment[0] || null, comments: visibleComments, activity: activity.map((item) => ({ ...item, actor: memberMap.get(String(item.actor_id || "")) || null })), presence: presence.map((item) => ({ ...item, member: memberMap.get(String(item.user_id || "")) || null })), members });
  }

  const collaborationCommentMatch = url.pathname.match(/^\/api\/collaboration\/threads\/([^/]+)\/comments(?:\/([^/]+))?$/);
  if (collaborationCommentMatch) {
    const threadId = decodeURIComponent(collaborationCommentMatch[1]);
    const commentId = collaborationCommentMatch[2] ? decodeURIComponent(collaborationCommentMatch[2]) : "";
    const context = await collaborationThreadContext(env, user, threadId);
    if (!context) return error("Conversation not found or not shared with you", 404);
    await ensureCollaborationThread(env, context.ownerId, context.organization.id, threadId);
    if (request.method === "POST" && !commentId) {
      const body = (await request.json()) as JsonRecord;
      const text = cleanCollaborationText(body.body, 4000);
      if (!text) return error("Comment text is required");
      const kind = collaborationCommentKind(body.kind);
      const visibility = collaborationVisibility(body.visibility);
      const requestedIds = Array.isArray(body.mentionedUserIds) ? body.mentionedUserIds.map(String).filter((id) => /^[0-9a-f-]{20,}$/i.test(id)).slice(0, 20) : [];
      const members = await collaborationMembers(env, context.organization.id);
      const memberIds = new Set(members.map((member) => member.user_id));
      const mentionedUserIds = requestedIds.filter((id) => memberIds.has(id));
      const rows = await dbRequest<JsonRecord[]>(env, "thread_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: context.ownerId, organization_id: context.organization.id, thread_id: threadId, author_id: user.id, body: text, kind, visibility, mentioned_user_ids: mentionedUserIds }) });
      await collaborationActivity(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, kind === "note" ? "internal_note_added" : "comment_added", { commentId: rows[0]?.id || null, visibility, mentionedUserIds, mentionedEmails: collaborationMentionEmails(text) });
      const state = await ensureCollaborationThread(env, context.ownerId, context.organization.id, threadId);
      await applyCollaborationPolicies(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, "comment_added", state).catch(() => undefined);
      return json(rows[0] || null, 201);
    }
    if (commentId && (request.method === "PATCH" || request.method === "DELETE")) {
      const existing = await dbRequest<JsonRecord[]>(env, `thread_comments?id=eq.${encodeURIComponent(commentId)}&thread_id=eq.${encodeURIComponent(threadId)}&organization_id=eq.${encodeURIComponent(context.organization.id)}&limit=1`);
      if (!existing[0]) return error("Comment not found", 404);
      const canManage = String(existing[0].author_id || "") === user.id || context.member.role === "owner" || context.member.role === "admin";
      if (!canManage) return error("Only the author or a workspace administrator can change this comment", 403);
      if (request.method === "DELETE") {
        await dbRequest(env, `thread_comments?id=eq.${encodeURIComponent(commentId)}&thread_id=eq.${encodeURIComponent(threadId)}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString(), body: "Comment removed", updated_at: new Date().toISOString() }) });
        await collaborationActivity(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, "comment_removed", { commentId });
        return json({ ok: true });
      }
      const body = (await request.json()) as JsonRecord;
      const text = cleanCollaborationText(body.body, 4000);
      if (!text) return error("Comment text is required");
      const rows = await dbRequest<JsonRecord[]>(env, `thread_comments?id=eq.${encodeURIComponent(commentId)}&thread_id=eq.${encodeURIComponent(threadId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ body: text, updated_at: new Date().toISOString() }) });
      await collaborationActivity(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, "comment_edited", { commentId });
      return json(rows[0] || null);
    }
    return error("Comment route not found", 404);
  }

  const collaborationAssignmentMatch = url.pathname.match(/^\/api\/collaboration\/threads\/([^/]+)\/(assignment|presence)$/);
  if (collaborationAssignmentMatch) {
    const threadId = decodeURIComponent(collaborationAssignmentMatch[1]);
    const operation = collaborationAssignmentMatch[2];
    const context = await collaborationThreadContext(env, user, threadId);
    if (!context) return error("Conversation not found or not shared with you", 404);
    let state = await ensureCollaborationThread(env, context.ownerId, context.organization.id, threadId);
    if (operation === "presence") {
      if (request.method === "POST") {
        const body = (await request.json()) as JsonRecord;
        const presenceState = body.state === "composing" || body.state === "idle" ? body.state : "viewing";
        await dbRequest(env, "collaboration_presence", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ organization_id: context.organization.id, thread_id: threadId, user_id: user.id, state: presenceState, last_seen_at: new Date().toISOString() }) });
        return json({ ok: true, state: presenceState });
      }
      return error("Presence route requires POST", 405);
    }
    if (request.method !== "PATCH" && request.method !== "POST") return error("Assignment route requires PATCH or POST", 405);
    const body = (await request.json()) as JsonRecord;
    const members = await collaborationMembers(env, context.organization.id);
    const assigneeId = body.assigneeId === null || body.assigneeId === "" || body.assigneeId === "unassigned" ? null : String(body.assigneeId || "");
    if (assigneeId && !members.some((member) => member.user_id === assigneeId)) return error("Assignee must be an active workspace member", 400);
    const nextPriority = body.priority === undefined ? state.priority : collaborationPriority(body.priority);
    const nextStatus = body.status === undefined ? state.status : collaborationStatus(body.status);
    const dueAt = body.slaDueAt === null ? null : typeof body.slaDueAt === "string" && Date.parse(body.slaDueAt) > Date.now() ? body.slaDueAt : body.slaMinutes !== undefined ? collaborationSlaDueAt(nextPriority, Date.now(), Number(body.slaMinutes)) : state.sla_due_at || collaborationSlaDueAt(nextPriority);
    const patch: JsonRecord = { assignee_id: assigneeId, status: nextStatus, priority: nextPriority, sla_due_at: dueAt, sla_breached_at: null, updated_at: new Date().toISOString() };
    const rows = await dbRequest<CollaborationThread[]>(env, `collaboration_threads?id=eq.${encodeURIComponent(String(state.id || ""))}&owner_id=eq.${encodeURIComponent(context.ownerId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    state = rows[0] || { ...state, ...patch } as CollaborationThread;
    await dbRequest(env, "thread_assignments", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: context.ownerId, organization_id: context.organization.id, thread_id: threadId, assignee_id: assigneeId, assigned_by: user.id, status: ["resolved", "closed"].includes(nextStatus) ? "done" : nextStatus === "pending" ? "open" : "in_progress", due_at: dueAt, updated_at: new Date().toISOString() }) }).catch(() => undefined);
    await collaborationActivity(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, "thread_assignment_updated", { assigneeId, status: nextStatus, priority: nextPriority, slaDueAt: dueAt });
    const event: CollaborationEvent = body.priority !== undefined ? "priority_changed" : body.status !== undefined ? "status_changed" : "assignment_changed";
    state = await applyCollaborationPolicies(env, { ownerId: context.ownerId, organizationId: context.organization.id, threadId }, user.id, event, state);
    return json(state);
  }

  if (request.method === "GET" && url.pathname === "/api/collaboration/overview") {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    const [members, sharedItems, policies, threads, activity] = await Promise.all([
      collaborationMembers(env, organization.id),
      dbRequest<JsonRecord[]>(env, `collaboration_shared_items?organization_id=eq.${encodeURIComponent(organization.id)}&enabled=eq.true&order=kind.asc,name.asc&limit=500`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `collaboration_policies?organization_id=eq.${encodeURIComponent(organization.id)}&order=priority.asc,created_at.asc&limit=100`).catch(() => []),
      dbRequest<CollaborationThread[]>(env, `collaboration_threads?organization_id=eq.${encodeURIComponent(organization.id)}&order=updated_at.desc&limit=1000`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `collaboration_activity?organization_id=eq.${encodeURIComponent(organization.id)}&order=created_at.desc&limit=100`).catch(() => []),
    ]);
    const statusCounts = threads.reduce<Record<string, number>>((result, row) => { result[row.status] = (result[row.status] || 0) + 1; return result; }, {});
    const priorityCounts = threads.reduce<Record<string, number>>((result, row) => { result[row.priority] = (result[row.priority] || 0) + 1; return result; }, {});
    return json({ organization: { id: organization.id, name: organization.name }, members, sharedItems, policies, activity, analytics: { totalThreads: threads.length, assignedThreads: threads.filter((row) => row.assignee_id).length, unassignedThreads: threads.filter((row) => !row.assignee_id).length, slaBreached: threads.filter((row) => collaborationSlaBreached(row.sla_due_at) || row.sla_breached_at).length, statusCounts, priorityCounts } });
  }

  if (request.method === "GET" && url.pathname === "/api/collaboration/shared-items") {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    return json(await dbRequest(env, `collaboration_shared_items?organization_id=eq.${encodeURIComponent(organization.id)}&enabled=eq.true&order=kind.asc,name.asc&limit=500`));
  }
  if (request.method === "POST" && url.pathname === "/api/collaboration/shared-items") {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    const admin = await organizationAdmin(env, user);
    if (!admin) return error("Workspace administrator access is required", 403);
    const body = (await request.json()) as JsonRecord;
    const kind = ["template", "contact", "signature", "calendar", "label"].includes(String(body.kind)) ? String(body.kind) : "template";
    const name = cleanCollaborationText(body.name, 120);
    const payload = objectValue(body.payload);
    if (!name) return error("A shared item name is required");
    if (JSON.stringify(payload).length > 100_000) return error("Shared item data is too large");
    const rows = await dbRequest<JsonRecord[]>(env, "collaboration_shared_items", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: organization.id, created_by: user.id, kind, name, payload, enabled: true }) });
    await collaborationActivity(env, { ownerId: organization.owner_id, organizationId: organization.id, threadId: null }, user.id, "shared_item_created", { kind, name }).catch(() => undefined);
    return json(rows[0] || null, 201);
  }
  const collaborationSharedItemMatch = url.pathname.match(/^\/api\/collaboration\/shared-items\/([^/]+)$/);
  if (collaborationSharedItemMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    const admin = await organizationAdmin(env, user);
    if (!admin) return error("Workspace administrator access is required", 403);
    const id = decodeURIComponent(collaborationSharedItemMatch[1]);
    if (request.method === "DELETE") { await dbRequest(env, `collaboration_shared_items?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "DELETE" }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = cleanCollaborationText(body.name, 120);
    if (body.payload !== undefined) patch.payload = objectValue(body.payload);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    const rows = await dbRequest<JsonRecord[]>(env, `collaboration_shared_items?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }

  if (request.method === "GET" && url.pathname === "/api/collaboration/policies") {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    return json(await dbRequest(env, `collaboration_policies?organization_id=eq.${encodeURIComponent(organization.id)}&order=priority.asc,created_at.asc&limit=100`));
  }
  if (request.method === "POST" && url.pathname === "/api/collaboration/policies") {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    const admin = await organizationAdmin(env, user);
    if (!admin) return error("Workspace administrator access is required", 403);
    const body = (await request.json()) as JsonRecord;
    const name = cleanCollaborationText(body.name, 120);
    const kind = body.kind === "approval" ? "approval" : "escalation";
    if (!name) return error("A policy name is required");
    const conditions = objectValue(body.conditions);
    const actions = objectValue(body.actions);
    if (JSON.stringify(conditions).length > 10_000 || JSON.stringify(actions).length > 10_000) return error("Policy data is too large");
    const rows = await dbRequest<JsonRecord[]>(env, "collaboration_policies", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: organization.id, created_by: user.id, name, kind, priority: Math.max(0, Math.min(10_000, Number(body.priority || 100))), enabled: body.enabled !== false, conditions, actions }) });
    return json(rows[0] || null, 201);
  }
  const collaborationPolicyMatch = url.pathname.match(/^\/api\/collaboration\/policies\/([^/]+)$/);
  if (collaborationPolicyMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    if (!organization) return error("Workspace collaboration is unavailable", 503);
    const admin = await organizationAdmin(env, user);
    if (!admin) return error("Workspace administrator access is required", 403);
    const id = decodeURIComponent(collaborationPolicyMatch[1]);
    if (request.method === "DELETE") { await dbRequest(env, `collaboration_policies?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "DELETE" }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = cleanCollaborationText(body.name, 120);
    if (body.conditions !== undefined) patch.conditions = objectValue(body.conditions);
    if (body.actions !== undefined) patch.actions = objectValue(body.actions);
    if (body.kind === "approval" || body.kind === "escalation") patch.kind = body.kind;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.priority !== undefined) patch.priority = Math.max(0, Math.min(10_000, Number(body.priority)));
    const rows = await dbRequest<JsonRecord[]>(env, `collaboration_policies?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
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
  const threadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)$/);
  if (request.method === "PATCH" && threadMatch) {
    const threadId = threadMatch[1];
    const body = (await request.json()) as JsonRecord;
    const threads = await dbRequest<JsonRecord[]>(env, `threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!threads[0]) return error("Conversation not found", 404);
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (typeof body.isMuted === "boolean") patch.is_muted = body.isMuted;
    if (typeof body.isIgnored === "boolean") patch.is_ignored = body.isIgnored;
    await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (patch.is_muted !== undefined) await dbRequest(env, `messages?thread_id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ is_muted: patch.is_muted, updated_at: new Date().toISOString() }) });
    if (patch.is_ignored !== undefined) await dbRequest(env, `messages?thread_id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ is_ignored: patch.is_ignored, updated_at: new Date().toISOString() }) });
    return json({ ok: true });
  }
  if (request.method === "POST" && threadMatch) {
    const threadId = threadMatch[1];
    const body = (await request.json()) as JsonRecord;
    const action = String(body.action || "");
    const threads = await dbRequest<JsonRecord[]>(env, `threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!threads[0]) return error("Conversation not found", 404);
    if (action === "split") {
      const messageId = String(body.messageId || "");
      const messages = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&thread_id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!messages[0]) return error("Message not found", 404);
      const newThreads = await dbRequest<JsonRecord[]>(env, "threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, subject_normalized: normalizeSubject(String(messages[0].subject || "(no subject)")), last_message_at: messages[0].received_at || messages[0].sent_at || new Date().toISOString() }) });
      if (!newThreads[0]) return error("Conversation could not be split", 500);
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ thread_id: newThreads[0].id, updated_at: new Date().toISOString() }) });
      return json({ ok: true, threadId: newThreads[0].id });
    }
    if (action === "merge") {
      const targetThreadId = String(body.targetThreadId || "");
      const targets = await dbRequest<JsonRecord[]>(env, `threads?id=eq.${encodeURIComponent(targetThreadId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!targets[0] || targetThreadId === threadId) return error("Target conversation not found", 404);
      await dbRequest(env, `messages?thread_id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ thread_id: targetThreadId, updated_at: new Date().toISOString() }) });
      await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ merged_into_thread_id: targetThreadId, updated_at: new Date().toISOString() }) });
      return json({ ok: true, threadId: targetThreadId });
    }
    return error("Unsupported conversation action");
  }
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
    if (typeof body.isImportant === "boolean") patch.is_important = body.isImportant;
    if (typeof body.isMuted === "boolean") patch.is_muted = body.isMuted;
    if (typeof body.isIgnored === "boolean") patch.is_ignored = body.isIgnored;
    if (typeof body.reminderAt === "string" || body.reminderAt === null) patch.reminder_at = body.reminderAt || null;
    if (typeof body.reminderNote === "string") patch.reminder_note = body.reminderNote.slice(0, 240);
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
  if (request.method === "POST" && url.pathname === "/api/folders") { const body = (await request.json()) as JsonRecord; const name = String(body.name || "").trim(); if (!name) return error("Folder name is required"); const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); const rows = await dbRequest<JsonRecord[]>(env, "mail_folders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name, slug, color: String(body.color || "#6f7d91"), parent_id: body.parentId || null, sort_order: Number(body.sortOrder || 0) }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/labels") return json(await dbRequest(env, `labels?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/labels") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: String(body.name || "Untitled"), color: String(body.color || "#2d5bff"), parent_id: body.parentId || null, sort_order: Number(body.sortOrder || 0) }) }); return json(rows[0], 201); }
  if (request.method === "POST" && url.pathname === "/api/labels/assign") { const body = (await request.json()) as JsonRecord; const labelId = String(body.labelId || ""); const messageId = String(body.messageId || ""); if (!labelId || !messageId) return error("Message and label are required"); const messageOwned = await hasOwnedRecord(env, "messages", user.id, messageId); const labelOwned = await hasOwnedRecord(env, "labels", user.id, labelId); if (!messageOwned || !labelOwned) return error("Message or label not found", 404); await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: labelId }) }); return json({ ok: true }); }
  if (request.method === "GET" && url.pathname === "/api/sender-blocks") return json(await dbRequest<JsonRecord[]>(env, `sender_blocks?owner_id=eq.${encodeURIComponent(user.id)}&order=match_type.asc,match_value.asc`));
  if (request.method === "POST" && url.pathname === "/api/sender-blocks") {
    const body = (await request.json()) as JsonRecord;
    const matchType = body.matchType === "domain" ? "domain" : "address";
    const matchValue = cleanAddress(String(body.matchValue || ""));
    if (!matchValue || (matchType === "address" ? !matchValue.includes("@") : !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(matchValue))) return error("Enter a valid sender or domain");
    const rows = await dbRequest<JsonRecord[]>(env, "sender_blocks", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, match_type: matchType, match_value: matchValue.replace(/^@/, ""), enabled: true }) });
    return json(rows[0] || { ok: true }, 201);
  }
  const senderBlockMatch = url.pathname.match(/^\/api\/sender-blocks\/([^/]+)$/);
  if (senderBlockMatch && request.method === "PATCH") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, `sender_blocks?id=eq.${encodeURIComponent(senderBlockMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ enabled: body.enabled !== false }) }); return json(rows[0] || null); }
  if (senderBlockMatch && request.method === "DELETE") { await dbRequest(env, `sender_blocks?id=eq.${encodeURIComponent(senderBlockMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" }); return json({ ok: true }); }
  if (request.method === "GET" && url.pathname === "/api/retention-policies") return json(await dbRequest<JsonRecord[]>(env, `message_retention_policies?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/retention-policies") { const body = (await request.json()) as JsonRecord; const days = Math.max(1, Math.min(36500, Number(body.retentionDays || 30))); const rows = await dbRequest<JsonRecord[]>(env, "message_retention_policies", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: String(body.name || "Default retention"), scope: String(body.scope || "all"), retention_days: days, enabled: body.enabled !== false }) }); return json(rows[0], 201); }
  const retentionPolicyMatch = url.pathname.match(/^\/api\/retention-policies\/([^/]+)$/);
  if (retentionPolicyMatch && request.method === "PATCH") { const body = (await request.json()) as JsonRecord; const patch: JsonRecord = { updated_at: new Date().toISOString() }; if (typeof body.enabled === "boolean") patch.enabled = body.enabled; if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120); if (body.retentionDays !== undefined) patch.retention_days = Math.max(1, Math.min(36500, Number(body.retentionDays))); const rows = await dbRequest<JsonRecord[]>(env, `message_retention_policies?id=eq.${encodeURIComponent(retentionPolicyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || null); }
  if (retentionPolicyMatch && request.method === "DELETE") { await dbRequest(env, `message_retention_policies?id=eq.${encodeURIComponent(retentionPolicyMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" }); return json({ ok: true }); }
  if (request.method === "POST" && url.pathname === "/api/mail/legal-hold") {
    const body = (await request.json()) as JsonRecord;
    const messageId = String(body.messageId || "");
    const message = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!message[0]) return error("Message not found", 404);
    const held = body.held === true;
    if (held) await dbRequest(env, "message_legal_holds", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: user.id, message_id: messageId, reason: String(body.reason || "User placed legal hold").slice(0, 500) }) });
    else await dbRequest(env, `message_legal_holds?owner_id=eq.${encodeURIComponent(user.id)}&message_id=eq.${encodeURIComponent(messageId)}`, { method: "DELETE" });
    await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ legal_hold: held, updated_at: new Date().toISOString() }) });
    return json({ ok: true, held });
  }
  if (request.method === "POST" && url.pathname === "/api/mail/report") {
    const body = (await request.json()) as JsonRecord;
    const messageId = String(body.messageId || "");
    const reportType = body.reportType === "phishing" ? "phishing" : body.reportType === "spam" ? "spam" : "";
    if (!messageId || !reportType) return error("Message and report type are required");
    const message = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!message[0]) return error("Message not found", 404);
    const previousFolder = String(message[0].folder || "inbox");
    await dbRequest(env, "message_reports", { method: "POST", body: JSON.stringify({ owner_id: user.id, message_id: messageId, report_type: reportType, details: reportType === "phishing" ? "User reported suspected phishing; escalated to quarantine." : "User reported suspected spam." }) });
    const existingReasons = Array.isArray(message[0].spam_reasons) ? message[0].spam_reasons.map(String) : [];
    const existingEvidence = objectValue(message[0].trust_evidence);
    const patch: JsonRecord = reportType === "phishing"
      ? { folder: "quarantine", screening_status: "blocked", previous_folder: previousFolder, spam_score: Math.max(1, Number(message[0].spam_score || 0)), spam_reasons: [...new Set([...existingReasons, "user reported phishing", "automatic phishing escalation"])], trust_evidence: { ...existingEvidence, phishing_reported: true, phishing_escalated: true }, updated_at: new Date().toISOString() }
      : { folder: "spam", screening_status: "blocked", previous_folder: previousFolder, spam_reasons: [...new Set([...existingReasons, "user reported spam"])], updated_at: new Date().toISOString() };
    await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await dbRequest(env, "screening_events", { method: "POST", body: JSON.stringify({ owner_id: user.id, message_id: messageId, decision: reportType === "phishing" ? "blocked" : "screened", previous_folder: previousFolder }) }).catch(() => undefined);
    return json({ ok: true, reportType, escalated: reportType === "phishing" });
  }
  if (request.method === "GET" && url.pathname === "/api/contacts") {
    const q = url.searchParams.get("q")?.trim();
    const path = `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc${q ? `&or=${encodeURIComponent(`email.ilike.*${safeLike(q)}*,display_name.ilike.*${safeLike(q)}*,company.ilike.*${safeLike(q)}*`)}` : ""}`;
    return json(await dbRequest(env, path));
  }
  if (request.method === "POST" && url.pathname === "/api/contacts") {
    const body = (await request.json()) as JsonRecord;
    const email = cleanAddress(String(body.email || ""));
    if (!isValidEmailAddress(email)) return error("A valid email is required");
    const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim() : null;
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) return error("Profile image URL must use https://");
    const rows = await dbRequest<JsonRecord[]>(env, "contacts?on_conflict=owner_id,email", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, email, display_name: String(body.displayName || email.split("@")[0]).trim().slice(0, 160), avatar_url: avatarUrl, company: String(body.company || "").trim().slice(0, 160) || null, notes: String(body.notes || "").slice(0, 2000), source: String(body.source || "manual").slice(0, 40) }) });
    const contact = rows[0];
    if (contact && typeof body.groupId === "string" && body.groupId) {
      const group = await dbRequest<JsonRecord[]>(env, `contact_groups?id=eq.${encodeURIComponent(body.groupId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
      if (group[0]) await dbRequest(env, "contact_group_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ group_id: group[0].id, contact_id: contact.id }) }).catch(() => undefined);
    }
    return json(contact, 201);
  }
  const contactMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
  if (contactMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const id = decodeURIComponent(contactMatch[1]);
    const owned = await dbRequest<JsonRecord[]>(env, `contacts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!owned[0]) return error("Contact not found", 404);
    if (request.method === "DELETE") { await dbRequest(env, `contacts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    if (body.email !== undefined) { const email = cleanAddress(String(body.email)); if (!isValidEmailAddress(email)) return error("A valid email is required"); patch.email = email; }
    if (body.displayName !== undefined) patch.display_name = String(body.displayName).trim().slice(0, 160);
    if (body.company !== undefined) patch.company = String(body.company || "").trim().slice(0, 160) || null;
    if (body.notes !== undefined) patch.notes = String(body.notes || "").slice(0, 2000);
    const rows = await dbRequest<JsonRecord[]>(env, `contacts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (request.method === "GET" && url.pathname === "/api/contact-groups") {
    const groups = await dbRequest<JsonRecord[]>(env, `contact_groups?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`);
    const ids = groups.map((group) => String(group.id));
    const members = ids.length ? await dbRequest<Array<{ group_id: string; contact_id: string }>>(env, `contact_group_members?group_id=in.(${ids.join(",")})`).catch(() => []) : [];
    return json(groups.map((group) => ({ ...group, contact_ids: members.filter((member) => member.group_id === group.id).map((member) => member.contact_id), count: members.filter((member) => member.group_id === group.id).length })));
  }
  if (request.method === "POST" && url.pathname === "/api/contact-groups") {
    const body = (await request.json()) as JsonRecord;
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return error("Group name is required");
    const rows = await dbRequest<JsonRecord[]>(env, "contact_groups", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, name, color: String(body.color || "#2d5bff") }) });
    return json(rows[0] || null, 201);
  }
  const contactGroupMatch = url.pathname.match(/^\/api\/contact-groups\/([^/]+)\/members$/);
  if (contactGroupMatch && request.method === "POST") {
    const groupId = decodeURIComponent(contactGroupMatch[1]);
    const group = await dbRequest<JsonRecord[]>(env, `contact_groups?id=eq.${encodeURIComponent(groupId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!group[0]) return error("Contact group not found", 404);
    const body = (await request.json()) as JsonRecord;
    const requestedContactIds = Array.isArray(body.contactIds) ? (body.contactIds as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 500) : [];
    const ownedContacts = requestedContactIds.length ? await dbRequest<Array<{ id: string }>>(env, `contacts?id=in.(${requestedContactIds.map((id) => encodeURIComponent(id)).join(",")})&owner_id=eq.${encodeURIComponent(user.id)}&select=id`).catch(() => []) : [];
    const contactIds = ownedContacts.map((contact) => contact.id);
    if (contactIds.length) await dbRequest(env, "contact_group_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(contactIds.map((contactId) => ({ group_id: groupId, contact_id: contactId }))) });
    return json({ ok: true, added: contactIds.length });
  }
  if (request.method === "POST" && url.pathname === "/api/contacts/import") {
    const body = (await request.json()) as JsonRecord;
    const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : null;
    if (groupId) {
      const group = await dbRequest<JsonRecord[]>(env, `contact_groups?id=eq.${encodeURIComponent(groupId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
      if (!group[0]) return error("Contact group not found", 404);
    }
    const imported = parseContactCsv(String(body.csv || "")).slice(0, 500).map((contact) => ({ owner_id: user.id, email: cleanAddress(contact.email), display_name: contact.displayName.slice(0, 160) || contact.email.split("@")[0], company: contact.company.slice(0, 160) || null, notes: contact.notes.slice(0, 2000), source: "csv" })).filter((contact) => isValidEmailAddress(contact.email));
    if (!imported.length) return error("No valid contacts were found", 400);
    const rows = await dbRequest<JsonRecord[]>(env, "contacts?on_conflict=owner_id,email", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(imported) });
    if (groupId && rows.length) await dbRequest(env, "contact_group_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows.map((contact) => ({ group_id: groupId, contact_id: contact.id }))) }).catch(() => undefined);
    return json({ ok: true, imported: rows.length });
  }
  if (request.method === "GET" && url.pathname === "/api/contacts/export") {
    const rows = await dbRequest<JsonRecord[]>(env, `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc`);
    const csv = ["display_name,email,company,notes", ...rows.map((row) => [row.display_name, row.email, row.company, row.notes].map(csvEscape).join(","))].join("\r\n");
    return new Response(`${csv}\r\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=postveil-contacts.csv", "cache-control": "no-store" } });
  }
  const contactVcardMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)\.vcf$/);
  if (contactVcardMatch && request.method === "GET") {
    const id = decodeURIComponent(contactVcardMatch[1]);
    const rows = await dbRequest<JsonRecord[]>(env, `contacts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!rows[0]) return error("Contact not found", 404);
    return new Response(buildVCard(rows[0]), { headers: { "content-type": "text/vcard; charset=utf-8", "content-disposition": `attachment; filename="postveil-contact-${id}.vcf"`, "cache-control": "no-store" } });
  }
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
        const triggerType = automationTrigger(objectValue(value).triggerType ?? objectValue(value).trigger_type);
        const schedule = triggerType === "scheduled" ? automationSchedule(objectValue(value).schedule) : {};
        const rows = await dbRequest<JsonRecord[]>(env, "mail_rules", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: normalized.name, priority: normalized.priority, enabled: normalized.enabled, conditions: normalized.conditions, actions: normalized.actions, scope: "personal", organization_id: null, trigger_type: triggerType, schedule, next_run_at: triggerType === "scheduled" ? nextAutomationRun(schedule) : null }) });
        if (rows[0]) created.push(rows[0]);
      } catch (importError) {
        failures.push({ index, error: importError instanceof Error ? importError.message : "Could not import rule" });
      }
    }
    return json({ ok: failures.length === 0, imported: created.length, failures, rules: created }, failures.length && !created.length ? 400 : 200);
  }
  if (request.method === "GET" && url.pathname === "/api/rules/sieve") {
    const rows = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`);
    return new Response(rows.map(ruleToSieve).join("\n\n"), { headers: { "content-type": "application/sieve; charset=utf-8", "content-disposition": "attachment; filename=postveil-rules.sieve", "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/rules/sieve") {
    const body = (await request.json()) as JsonRecord;
    const source = String(body.sieve || "").slice(0, 100_000);
    const parsed = parseSieveRules(source).slice(0, 100);
    const created: JsonRecord[] = [];
    const failures: Array<{ index: number; error: string }> = [];
    for (const [index, rule] of parsed.entries()) {
      const validation = validateRuleInput(rule);
      if (validation.length) { failures.push({ index, error: validation.join("; ") }); continue; }
      try {
        const rows = await dbRequest<JsonRecord[]>(env, "mail_rules", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: rule.name, priority: (index + 1) * 100, enabled: true, conditions: rule.conditions, actions: rule.actions, scope: "personal", organization_id: null, trigger_type: "inbound", schedule: {}, next_run_at: null, sieve_source: rule.sieve_source }) });
        if (rows[0]) created.push(rows[0]);
      } catch (sieveError) { failures.push({ index, error: sieveError instanceof Error ? sieveError.message : "Could not import Sieve rule" }); }
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
  if (request.method === "GET" && url.pathname === "/api/rules") {
    const personal = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&scope=eq.personal&order=priority.asc,created_at.asc`).catch(() => dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`).catch(() => []));
    const access = await organizationAdmin(env, user).catch(() => null);
    const shared = access ? await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(access.organization.id)}&scope=eq.organization&order=priority.asc,created_at.asc`).catch(() => []) : [];
    return json([...personal, ...shared].sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0)));
  }
  if (request.method === "POST" && url.pathname === "/api/rules") {
    const body = (await request.json()) as JsonRecord;
    const normalized = normalizeRuleRecord({ ...body, conditions: buildRuleConditions(body.conditions, body.exceptions) });
    const validation = validateRuleInput(normalized);
    if (validation.length) return error(validation.join("; "), 400);
    const scope = body.scope === "organization" ? "organization" : "personal";
    const triggerType = automationTrigger(body.triggerType ?? body.trigger_type);
    const schedule = triggerType === "scheduled" ? automationSchedule(body.schedule) : {};
    const nextRunAt = triggerType === "scheduled" ? (schedule.at && Date.parse(String(schedule.at)) > Date.now() ? schedule.at : nextAutomationRun(schedule)) : null;
    let organizationId: string | null = null;
    if (scope === "organization") {
      const access = await organizationAdmin(env, user).catch(() => null);
      if (!access) return error("Workspace administrator access is required for shared rules", 403);
      organizationId = access.organization.id;
    }
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
        scope,
        organization_id: organizationId,
        trigger_type: triggerType,
        schedule,
        next_run_at: nextRunAt,
      }),
    });
    return json(rows[0], 201);
  }
  const ruleActionMatch = url.pathname.match(/^\/api\/rules\/([^/]+)\/(preview|dry-run|apply|conflicts)$/);
  if (ruleActionMatch && (request.method === "POST" || (request.method === "GET" && ruleActionMatch[2] === "conflicts"))) {
    const ruleId = ruleActionMatch[1];
    const action = ruleActionMatch[2];
    const lookup = await ruleForActor(env, user, ruleId);
    if (!lookup) return error("Rule not found", 404);
    const rule = lookup.rule;
    const allRules = lookup.shared && rule.organization_id
      ? await dbRequest<Rule[]>(env, `mail_rules?organization_id=eq.${encodeURIComponent(rule.organization_id)}&scope=eq.organization&order=priority.asc,created_at.asc`).catch(() => [rule])
      : await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc,created_at.asc`);
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
    await dbRequest(env, `mail_rules?id=eq.${encodeURIComponent(rule.id)}`, { method: "PATCH", body: JSON.stringify({ last_run_at: new Date().toISOString(), last_run_count: result.changedCount, last_error: result.failures[0]?.error || null }) });
    return json({ ok: result.failures.length === 0, runId, mode: "apply", matchedCount: analysis.matches.length, changedCount: result.changedCount, failures: result.failures, conflicts, undoable: result.changedCount > 0 });
  }
  const ruleRunsMatch = url.pathname.match(/^\/api\/rules\/([^/]+)\/runs$/);
  if (ruleRunsMatch && request.method === "GET") {
    if (!(await ruleForActor(env, user, ruleRunsMatch[1]))) return error("Rule not found", 404);
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
    const lookup = await ruleForActor(env, user, ruleMatch[1]);
    if (!lookup) return error("Rule not found", 404);
    const existing = [lookup.rule as JsonRecord];
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
    if (body.scope !== undefined || body.triggerType !== undefined || body.schedule !== undefined) {
      if (lookup.shared && body.scope === "personal") return error("Shared rules cannot be changed into personal rules");
      if (!lookup.shared && body.scope === "organization") {
        const access = await organizationAdmin(env, user).catch(() => null);
        if (!access) return error("Workspace administrator access is required for shared rules", 403);
        patch.scope = "organization"; patch.organization_id = access.organization.id;
      }
      const triggerType = automationTrigger(body.triggerType ?? lookup.rule.trigger_type);
      const schedule = triggerType === "scheduled" ? automationSchedule(body.schedule ?? lookup.rule.schedule) : {};
      patch.trigger_type = triggerType; patch.schedule = schedule; patch.next_run_at = triggerType === "scheduled" ? nextAutomationRun(schedule) : null;
    }
    const rows = await dbRequest<JsonRecord[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleMatch[1])}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (ruleMatch && request.method === "DELETE") {
    const lookup = await ruleForActor(env, user, ruleMatch[1]);
    if (!lookup) return error("Rule not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, `mail_rules?id=eq.${encodeURIComponent(ruleMatch[1])}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
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
  if (request.method === "GET" && url.pathname === "/api/compose-library") {
    const rows = await dbRequest<Array<{ id: string; payload?: JsonRecord }>>(env, `mail_events?owner_id=eq.${encodeURIComponent(user.id)}&event_type=eq.compose_library_item&order=created_at.desc&limit=100&select=id,payload`).catch(() => []);
    const sharedRows = organization ? await dbRequest<Array<{ id: string; name: string; kind: string; payload?: JsonRecord }>>(env, `collaboration_shared_items?organization_id=eq.${encodeURIComponent(organization.id)}&kind=eq.template&enabled=eq.true&order=name.asc&limit=100&select=id,name,kind,payload`).catch(() => []) : [];
    const shared = sharedRows.map((row) => {
      const payload = objectValue(row.payload);
      const text = String(payload.text_body || payload.text || "");
      return { ...payload, id: `shared:${row.id}`, kind: "template", name: row.name, text_body: text, html_body: typeof payload.html_body === "string" ? payload.html_body : null, shared: true };
    }).filter((row) => row.text_body || row.html_body);
    return json([...rows.map((row) => ({ ...objectValue(row.payload), id: row.id })), ...shared]);
  }
  if (request.method === "POST" && url.pathname === "/api/compose-library") {
    const body = (await request.json()) as JsonRecord;
    const kind = ["template", "canned", "snippet"].includes(String(body.kind)) ? String(body.kind) : "template";
    const name = String(body.name || "Reusable message").trim().slice(0, 120);
    const payload = { kind, name, subject: String(body.subject || "").slice(0, 500), text_body: String(body.text_body || "").slice(0, 100000), html_body: typeof body.html_body === "string" ? body.html_body.slice(0, 200000) : null, metadata: objectValue(body.metadata) };
    if (!name || (!payload.text_body && !payload.html_body)) return error("A name and message content are required");
    const rows = await dbRequest<JsonRecord[]>(env, "mail_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, provider: "postveil", event_type: "compose_library_item", payload }) });
    return json({ ...payload, id: rows[0]?.id || crypto.randomUUID() }, 201);
  }
  const composeLibraryMatch = url.pathname.match(/^\/api\/compose-library\/([^/]+)$/);
  if (composeLibraryMatch && request.method === "DELETE") {
    await dbRequest(env, `mail_events?id=eq.${encodeURIComponent(composeLibraryMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&event_type=eq.compose_library_item`, { method: "DELETE" });
    return json({ ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/signatures") return json(await dbRequest(env, `signatures?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/signatures") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "signatures", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: body.mailboxId || mailbox.id, name: String(body.name || "Default"), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, is_default: body.isDefault === true }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/security/overview") {
    const [privacy, events] = await Promise.all([
      ensurePrivacySettings(env, user.id),
      dbRequest<SecurityEvent[]>(env, `account_security_events?subject_user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=50`).catch(() => []),
    ]);
    return json({
      privacy: privacySettingsView(privacy),
      activity: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        sessionId: event.session_id,
        ipFingerprint: event.ip_hash ? `${event.ip_hash.slice(0, 12)}…` : null,
        userAgent: event.user_agent,
        suspicious: event.is_suspicious,
        details: event.details,
        createdAt: event.created_at,
      })),
    });
  }
  if (request.method === "GET" && url.pathname === "/api/privacy-settings") return json(privacySettingsView(await ensurePrivacySettings(env, user.id)));
  if (request.method === "PATCH" && url.pathname === "/api/privacy-settings") {
    const body = (await request.json()) as JsonRecord;
    const current = await ensurePrivacySettings(env, user.id);
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    const booleanKeys = [
      "ai_processing_enabled",
      "login_alerts_enabled",
      "remote_images_enabled",
      "privacy_analytics_enabled",
      "metadata_minimization_enabled",
      "external_portal_enabled",
      "no_training_ai_policy_acknowledged",
    ];
    for (const key of booleanKeys) if (typeof body[key] === "boolean") patch[key] = body[key];
    if (body.storage_region !== undefined) {
      const region = String(body.storage_region || "default");
      if (!["default", "ap-southeast-1", "us-east-1", "eu-west-1", "custom"].includes(region)) return error("Choose a supported storage region", 400);
      patch.storage_region = region;
    }
    if (patch.ai_processing_enabled === true && patch.no_training_ai_policy_acknowledged !== true && current.no_training_ai_policy_acknowledged !== true) return error("Acknowledge the no-training AI policy before enabling AI processing", 409);
    const rows = await dbRequest<PrivacySettings[]>(env, `user_privacy_settings?owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    await dbRequest(env, "account_security_events", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ organization_id: null, actor_id: user.id, subject_user_id: user.id, event_type: "privacy_settings_updated", event_key: `privacy:${user.id}:${crypto.randomUUID()}`, details: { fields: Object.keys(patch).filter((key) => key !== "updated_at") } }) }).catch(() => undefined);
    return json(privacySettingsView(rows[0] || { ...current, ...patch } as PrivacySettings));
  }
  if (request.method === "GET" && url.pathname === "/api/account/export") {
    const owner = encodeURIComponent(user.id);
    const [profile, settings, privacy, mailboxes, messages, attachments, folders, labels, contacts, rules, events] = await Promise.all([
      dbRequest<JsonRecord[]>(env, `profiles?id=eq.${owner}&limit=1`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${owner}&limit=1`).catch(() => []),
      dbRequest<PrivacySettings[]>(env, `user_privacy_settings?owner_id=eq.${owner}&limit=1`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `mailboxes?owner_id=eq.${owner}&order=created_at.asc`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `messages?owner_id=eq.${owner}&order=created_at.asc&limit=10000`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `attachments?owner_id=eq.${owner}&order=created_at.asc&limit=10000`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `mail_folders?owner_id=eq.${owner}&order=sort_order.asc,name.asc`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `labels?owner_id=eq.${owner}&order=name.asc`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `contacts?owner_id=eq.${owner}&order=display_name.asc`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `mail_rules?owner_id=eq.${owner}&order=priority.asc,created_at.asc`).catch(() => []),
      dbRequest<SecurityEvent[]>(env, `account_security_events?subject_user_id=eq.${owner}&order=created_at.desc&limit=1000`).catch(() => []),
    ]);
    await dbRequest(env, "account_security_events", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ actor_id: user.id, subject_user_id: user.id, event_type: "account_exported", event_key: `export:${user.id}:${crypto.randomUUID()}`, details: { messageCount: messages.length, attachmentCount: attachments.length } }) }).catch(() => undefined);
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email || null },
      profile: profile[0] || null,
      settings: settings[0] || null,
      privacy: privacySettingsView(privacy[0] || await ensurePrivacySettings(env, user.id)),
      mailboxes,
      messages,
      attachments,
      folders,
      labels,
      contacts,
      rules,
      securityEvents: events,
      note: "Object-storage binaries are not embedded. Attachment metadata and object keys are included so a controlled export worker can stream them separately.",
    };
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="postveil-account-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/account/delete") {
    const body = (await request.json()) as JsonRecord;
    const confirmation = String(body.confirmation || "");
    const email = normalizeRecoveryEmail(String(body.email || ""));
    if (confirmation !== "DELETE MY ACCOUNT" || !user.email || email !== normalizeRecoveryEmail(user.email)) return error("Type DELETE MY ACCOUNT and your sign-in email to continue", 400);
    await dbRequest(env, "account_security_events", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ actor_id: user.id, subject_user_id: user.id, event_type: "account_deletion_requested", event_key: `delete:${user.id}:${crypto.randomUUID()}`, details: { confirmed: true } }) }).catch(() => undefined);
    await purgeOwnerObjects(env, user.id);
    const deleted = await adminAuthClient(env).auth.admin.deleteUser(user.id);
    if (deleted.error) return error("The account could not be deleted", 502);
    return json({ ok: true, deleted: true });
  }
  if (request.method === "GET" && url.pathname === "/api/settings") { const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); return json({ ...(rows[0] || { owner_id: user.id }), send_undo_seconds: normalizeUndoSeconds(objectValue(mailbox.settings).send_undo_seconds, 0) }); }
  if (request.method === "PATCH" && url.pathname === "/api/settings") { const body = (await request.json()) as JsonRecord; const allowed = ["theme", "density", "reading_pane", "language", "timezone", "focused_inbox_enabled", "desktop_notifications", "push_subscription"]; const patch: JsonRecord = { updated_at: new Date().toISOString() }; for (const key of allowed) if (key in body) patch[key] = body[key]; let undoSeconds = normalizeUndoSeconds(objectValue(mailbox.settings).send_undo_seconds, 0); if ("send_undo_seconds" in body) { undoSeconds = normalizeUndoSeconds(body.send_undo_seconds, undoSeconds); const currentMailboxSettings = objectValue(mailbox.settings); await dbRequest(env, `mailboxes?id=eq.${encodeURIComponent(mailbox.id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ settings: { ...currentMailboxSettings, send_undo_seconds: undoSeconds } }) }); } const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json({ ...(rows[0] || patch), send_undo_seconds: undoSeconds }); }
  if (request.method === "GET" && url.pathname === "/api/calendars") return json(await workspaceCalendarsForUser(env, user, organization));
  if (request.method === "POST" && url.pathname === "/api/calendars") {
    const body = (await request.json()) as JsonRecord;
    const visibility = body.visibility === "shared" ? "shared" : "private";
    if (visibility === "shared" && !(organization?.id && await organizationAdmin(env, user).catch(() => null))) return error("Workspace administrator access is required for shared calendars", 403);
    const name = String(body.name || "Personal").trim().slice(0, 120);
    const rows = await dbRequest<WorkspaceCalendar[]>(env, "workspace_calendars", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, organization_id: visibility === "shared" ? organization?.id || null : null, name, slug: normalizeWorkspaceSlug(body.slug || name), color: String(body.color || "#2d5bff"), timezone: String(body.timezone || "UTC"), visibility, is_default: body.isDefault === true }) });
    return json(rows[0] || null, 201);
  }
  const calendarAdminMatch = url.pathname.match(/^\/api\/calendars\/([^/]+)$/);
  if (calendarAdminMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const calendarId = decodeURIComponent(calendarAdminMatch[1]);
    const calendar = (await workspaceCalendarsForUser(env, user, organization)).find((item) => item.id === calendarId);
    if (!calendar) return error("Calendar not found", 404);
    if (!(await canEditWorkspaceCalendar(env, user, organization, calendar))) return error("Calendar editor access is required", 403);
    if (request.method === "DELETE") { await dbRequest(env, `workspace_calendars?id=eq.${encodeURIComponent(calendarId)}&owner_id=eq.${encodeURIComponent(calendar.owner_id)}`, { method: "DELETE" }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const [input, column] of [["name", "name"], ["color", "color"], ["timezone", "timezone"], ["isDefault", "is_default"]] as const) if (input in body) patch[column] = input === "isDefault" ? body[input] === true : String(body[input] || "").trim().slice(0, 120);
    const rows = await dbRequest<JsonRecord[]>(env, `workspace_calendars?id=eq.${encodeURIComponent(calendarId)}&owner_id=eq.${encodeURIComponent(calendar.owner_id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  const calendarMemberMatch = url.pathname.match(/^\/api\/calendars\/([^/]+)\/members$/);
  if (calendarMemberMatch && request.method === "POST") {
    const calendarId = decodeURIComponent(calendarMemberMatch[1]);
    const calendar = (await workspaceCalendarsForUser(env, user, organization)).find((item) => item.id === calendarId);
    if (!calendar || calendar.visibility !== "shared") return error("Shared calendar not found", 404);
    const admin = organization?.id ? await organizationAdmin(env, user).catch(() => null) : null;
    if (!admin) return error("Workspace administrator access is required", 403);
    const body = (await request.json()) as JsonRecord;
    const memberId = String(body.userId || "");
    const member = organization?.id ? await organizationMember(env, organization.id, memberId) : null;
    if (!member || member.status !== "active") return error("Workspace member not found", 404);
    const role = ["free_busy", "viewer", "editor"].includes(String(body.role)) ? String(body.role) : "viewer";
    await dbRequest(env, "workspace_calendar_members", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ calendar_id: calendarId, user_id: memberId, role }) });
    return json({ ok: true, calendarId, userId: memberId, role });
  }
  if (request.method === "GET" && url.pathname === "/api/workspace/overview") {
    const calendars = await workspaceCalendarsForUser(env, user, organization);
    const events = await workspaceCalendarEvents(env, user, organization, url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined, url.searchParams.get("q") || undefined);
    const eventIds = events.map((event) => String(event.id));
    const attendees = eventIds.length ? await dbRequest<JsonRecord[]>(env, `calendar_event_attendees?event_id=in.(${eventIds.join(",")})&order=created_at.asc`).catch(() => []) : [];
    const contacts = await dbRequest<JsonRecord[]>(env, `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc&limit=2000`).catch(() => []);
    const groups = await dbRequest<JsonRecord[]>(env, `contact_groups?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`).catch(() => []);
    const groupIds = groups.map((group) => String(group.id));
    const groupMembers = groupIds.length ? await dbRequest<JsonRecord[]>(env, `contact_group_members?group_id=in.(${groupIds.join(",")})`).catch(() => []) : [];
    const projects = await workspaceProjectList(env, user, organization);
    const tasks = await dbRequest<JsonRecord[]>(env, `tasks?owner_id=eq.${encodeURIComponent(user.id)}&order=status.asc,position.asc,due_at.asc.nullsfirst,created_at.desc&limit=500`).catch(() => []);
    const links = await dbRequest<JsonRecord[]>(env, `scheduling_links?or=(owner_id.eq.${user.id}${organization?.id ? `,organization_id.eq.${organization.id}` : ""})&order=created_at.desc&limit=100`).catch(() => []);
    return json({ calendars, events: events.map((event) => ({ ...event, attendees: attendees.filter((attendee) => attendee.event_id === event.id) })), contacts, groups: groups.map((group) => ({ ...group, contact_ids: groupMembers.filter((member) => member.group_id === group.id).map((member) => member.contact_id) })), projects, tasks, schedulingLinks: links });
  }
  const calendarIcsMatch = url.pathname.match(/^\/api\/calendar\/([^/]+)\.ics$/);
  if (calendarIcsMatch && request.method === "GET") {
    const eventId = decodeURIComponent(calendarIcsMatch[1]);
    const events = await workspaceCalendarEvents(env, user, organization);
    const event = events.find((item) => item.id === eventId);
    if (!event) return error("Event not found", 404);
    return new Response(buildIcsEvent(event), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="postveil-event-${eventId}.ics"`, "cache-control": "no-store" } });
  }
  if (request.method === "GET" && url.pathname === "/api/calendar") {
    return json(await workspaceCalendarEvents(env, user, organization, url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined, url.searchParams.get("q") || undefined));
  }
  if ((request.method === "GET" || request.method === "REPORT") && url.pathname === "/dav/calendars") {
    const calendars = await workspaceCalendarsForUser(env, user, organization);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${calendars.map((calendar) => `<d:response><d:href>/dav/calendars/${calendar.id}</d:href><d:propstat><d:prop><d:displayname>${calendar.name}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:getcontenttype>text/calendar</d:getcontenttype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join("")}</d:multistatus>`;
    return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" } });
  }
  const davCalendarMatch = url.pathname.match(/^\/dav\/calendars\/([^/]+)$/);
  if ((request.method === "GET" || request.method === "REPORT") && davCalendarMatch) {
    const calendarId = decodeURIComponent(davCalendarMatch[1]);
    const calendar = (await workspaceCalendarsForUser(env, user, organization)).find((item) => item.id === calendarId);
    if (!calendar) return error("Calendar not found", 404);
    const events = await dbRequest<JsonRecord[]>(env, `calendar_events?calendar_id=eq.${encodeURIComponent(calendarId)}&order=starts_at.asc&limit=1000`).catch(() => []);
    return new Response(buildIcsCalendar(events), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method === "GET" && url.pathname === "/dav/addressbooks") {
    const contacts = await dbRequest<JsonRecord[]>(env, `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc&limit=2000`).catch(() => []);
    const vCards = contacts.map((contact) => buildVCard(contact)).join("");
    return new Response(vCards, { headers: { "content-type": "text/vcard; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/calendar") {
    const body = (await request.json()) as JsonRecord;
    const calendar = await ensureWorkspaceCalendar(env, user, organization, body.calendarId);
    if (!calendar) return error("Calendar not found", 404);
    if (!(await canEditWorkspaceCalendar(env, user, organization, calendar))) return error("You cannot edit this calendar", 403);
    const startsAt = String(body.startsAt || "");
    const endsAt = String(body.endsAt || "");
    if (!startsAt || !endsAt || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) return error("Event times are invalid", 400);
    const attendees = Array.isArray(body.attendees) ? (body.attendees as unknown[]).map((entry) => typeof entry === "string" ? { email: cleanAddress(entry), display_name: "" } : { email: cleanAddress(String(objectValue(entry).email || "")), display_name: String(objectValue(entry).displayName || objectValue(entry).display_name || "").slice(0, 160) }).filter((entry) => isValidEmailAddress(entry.email)).slice(0, 100) : [];
    if (body.sourceMessageId !== undefined && body.sourceMessageId !== null && !(await hasOwnedRecord(env, "messages", user.id, body.sourceMessageId))) return error("Source message not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, "calendar_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, organizer_id: user.id, calendar_id: calendar.id, title: String(body.title || "Untitled event").trim().slice(0, 240), description: String(body.description || "").slice(0, 5000), location: String(body.location || "").slice(0, 500) || null, starts_at: startsAt, ends_at: endsAt, all_day: body.allDay === true, attendees: attendees.map((entry) => entry.email), timezone: String(body.timezone || calendar.timezone || "UTC").slice(0, 80), recurrence_rule: String(body.recurrenceRule || "").slice(0, 240) || null, recurrence_until: body.recurrenceUntil || null, reminders: Array.isArray(body.reminders) ? (body.reminders as unknown[]).slice(0, 10) : [], visibility: body.visibility === "shared" && calendar.visibility === "shared" ? "shared" : "private", status: "confirmed", conference_url: String(body.conferenceUrl || "").slice(0, 1000) || null, source_message_id: body.sourceMessageId || null, external_uid: `${crypto.randomUUID()}@${env.APP_DOMAIN}` }) });
    const event = rows[0];
    if (event && attendees.length) await dbRequest(env, "calendar_event_attendees", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(attendees.map((entry) => ({ event_id: event.id, email: entry.email, display_name: entry.display_name }))) }).catch(() => undefined);
    return json(event, 201);
  }
  const calendarRsvpMatch = url.pathname.match(/^\/api\/calendar\/([^/]+)\/rsvp$/);
  if (calendarRsvpMatch && request.method === "POST") {
    const eventId = decodeURIComponent(calendarRsvpMatch[1]);
    const body = (await request.json()) as JsonRecord;
    const response = ["accepted", "tentative", "declined"].includes(String(body.response)) ? String(body.response) : "pending";
    const email = cleanAddress(String(body.email || user.email || ""));
    if (!isValidEmailAddress(email)) return error("A valid attendee email is required", 400);
    const event = await dbRequest<JsonRecord[]>(env, `calendar_events?id=eq.${encodeURIComponent(eventId)}&limit=1`).catch(() => []);
    if (!event[0]) return error("Event not found", 404);
    const eventCalendars = await workspaceCalendarsForUser(env, user, organization);
    if (event[0].owner_id !== user.id && !eventCalendars.some((calendar) => calendar.id === event[0].calendar_id)) return error("Event is not available to this account", 403);
    const rows = await dbRequest<JsonRecord[]>(env, `calendar_event_attendees?event_id=eq.${encodeURIComponent(eventId)}&email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ response, responded_at: new Date().toISOString() }) });
    if (!rows[0]) await dbRequest(env, "calendar_event_attendees", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ event_id: eventId, email, response, responded_at: new Date().toISOString() }) });
    return json({ ok: true, eventId, email, response });
  }
  if (request.method === "GET" && url.pathname === "/api/calendar/availability") {
    const from = new Date(url.searchParams.get("from") || Date.now());
    const to = new Date(url.searchParams.get("to") || from.getTime() + 7 * 86_400_000);
    if (to <= from) return error("Availability range is invalid", 400);
    const requestedEmail = cleanAddress(String(url.searchParams.get("email") || user.email || ""));
    let targetUserId = user.id;
    if (requestedEmail && requestedEmail !== cleanAddress(String(user.email || ""))) {
      const memberUsers = await authUsers(env).catch(() => []);
      const target = memberUsers.find((candidate) => cleanAddress(String(candidate.email || "")) === requestedEmail);
      const member = target && organization?.id ? await organizationMember(env, organization.id, target.id) : null;
      if (!target || !member || member.status !== "active") return error("Availability is only shared with workspace members", 403);
      targetUserId = target.id;
    }
    const rows = await dbRequest<JsonRecord[]>(env, `calendar_events?owner_id=eq.${encodeURIComponent(targetUserId)}&starts_at=lt.${encodeURIComponent(to.toISOString())}&ends_at=gt.${encodeURIComponent(from.toISOString())}&status=neq.cancelled&order=starts_at.asc&limit=500`).catch(() => []);
    return json({ email: requestedEmail, from: from.toISOString(), to: to.toISOString(), busy: calendarBusySlots(rows, from, to) });
  }
  const calendarMatch = url.pathname.match(/^\/api\/calendar\/([^/]+)$/);
  if (calendarMatch && request.method === "PATCH") {
    const eventId = decodeURIComponent(calendarMatch[1]);
    const existing = await dbRequest<JsonRecord[]>(env, `calendar_events?id=eq.${encodeURIComponent(eventId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!existing[0]) return error("Event not found", 404);
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const [input, column] of [["title", "title"], ["description", "description"], ["location", "location"], ["startsAt", "starts_at"], ["endsAt", "ends_at"], ["allDay", "all_day"], ["timezone", "timezone"], ["recurrenceRule", "recurrence_rule"], ["recurrenceUntil", "recurrence_until"], ["reminders", "reminders"], ["conferenceUrl", "conference_url"], ["status", "status"]] as const) if (input in body) patch[column] = body[input];
    if (body.calendarId !== undefined) { const target = await ensureWorkspaceCalendar(env, user, organization, body.calendarId); if (!target || !(await canEditWorkspaceCalendar(env, user, organization, target))) return error("Calendar not found or not editable", 403); patch.calendar_id = target.id; }
    const rows = await dbRequest<JsonRecord[]>(env, `calendar_events?id=eq.${encodeURIComponent(eventId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (request.method === "GET" && url.pathname === "/api/scheduling-links") {
    return json(await dbRequest(env, `scheduling_links?or=(owner_id.eq.${user.id}${organization?.id ? `,organization_id.eq.${organization.id}` : ""})&order=created_at.desc&limit=100`).catch(() => []));
  }
  if (request.method === "POST" && url.pathname === "/api/scheduling-links") {
    const body = (await request.json()) as JsonRecord;
    const title = String(body.title || "Meet with me").trim().slice(0, 160);
    const slug = normalizeWorkspaceSlug(body.slug || title, `meet-${crypto.randomUUID().slice(0, 8)}`);
    const calendar = await ensureWorkspaceCalendar(env, user, organization, body.calendarId);
    const rows = await dbRequest<JsonRecord[]>(env, "scheduling_links", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, organization_id: organization?.id || null, calendar_id: calendar?.id || null, slug, title, description: String(body.description || "").slice(0, 1000), duration_minutes: Math.max(5, Math.min(480, Number(body.durationMinutes || 30))), timezone: String(body.timezone || calendar?.timezone || "UTC"), availability: objectValue(body.availability), active: body.active !== false, require_email: body.requireEmail !== false }) });
    return json(rows[0] || null, 201);
  }
  const schedulingLinkMatch = url.pathname.match(/^\/api\/scheduling-links\/([^/]+)$/);
  if (schedulingLinkMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const id = decodeURIComponent(schedulingLinkMatch[1]);
    if (request.method === "DELETE") { await dbRequest(env, `scheduling_links?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const [input, column] of [["title", "title"], ["description", "description"], ["timezone", "timezone"], ["availability", "availability"], ["active", "active"], ["requireEmail", "require_email"]] as const) if (input in body) patch[column] = body[input];
    if (body.durationMinutes !== undefined) patch.duration_minutes = Math.max(5, Math.min(480, Number(body.durationMinutes)));
    const rows = await dbRequest<JsonRecord[]>(env, `scheduling_links?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (request.method === "GET" && url.pathname === "/api/projects") return json(await workspaceProjectList(env, user, organization));
  if (request.method === "POST" && url.pathname === "/api/projects") {
    const body = (await request.json()) as JsonRecord;
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return error("Project name is required");
    const rows = await dbRequest<WorkspaceProject[]>(env, "workspace_projects", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, organization_id: organization?.id || null, created_by: user.id, name, description: String(body.description || "").slice(0, 2000), color: String(body.color || "#2d5bff"), status: "active" }) });
    const project = rows[0];
    if (project && organization?.id) await dbRequest(env, "workspace_project_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ project_id: project.id, user_id: user.id, role: "manager" }) }).catch(() => undefined);
    return json(project, 201);
  }
  const projectBoardMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/board$/);
  if (projectBoardMatch && request.method === "GET") {
    const projectId = decodeURIComponent(projectBoardMatch[1]);
    const project = await workspaceProjectAccess(env, user, organization, projectId);
    if (!project) return error("Project not found", 404);
    const [tasks, messages] = await Promise.all([
      dbRequest<JsonRecord[]>(env, `tasks?project_id=eq.${encodeURIComponent(projectId)}&order=status.asc,position.asc,due_at.asc.nullsfirst,created_at.desc&limit=500`).catch(() => []),
      dbRequest<JsonRecord[]>(env, `messages?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=100&select=id,thread_id,subject,from_address,work_state,follow_up_at,created_at`).catch(() => []),
    ]);
    return json({ project, tasks, messages });
  }
  const projectTaskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (projectTaskMatch && request.method === "POST") {
    const projectId = decodeURIComponent(projectTaskMatch[1]);
    const project = await workspaceProjectAccess(env, user, organization, projectId);
    if (!project) return error("Project not found", 404);
    const body = (await request.json()) as JsonRecord;
    const status = ["todo", "in_progress", "blocked", "done"].includes(String(body.status)) ? String(body.status) : "todo";
    const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
    if (assigneeId && (!organization?.id || !(await organizationMember(env, organization.id, assigneeId)))) return error("Assignee is not a workspace member", 400);
    if (body.sourceMessageId !== undefined && body.sourceMessageId !== null && !(await hasOwnedRecord(env, "messages", user.id, body.sourceMessageId))) return error("Source message not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, "tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, project_id: projectId, assignee_id: assigneeId, title: String(body.title || "Untitled task").trim().slice(0, 240), notes: String(body.notes || "").slice(0, 5000), due_at: body.dueAt || null, priority: Math.max(0, Math.min(2, Number(body.priority || 0))), status, completed: status === "done", completed_at: status === "done" ? new Date().toISOString() : null, position: Math.max(0, Number(body.position || 0)), source_message_id: body.sourceMessageId || null }) });
    return json(rows[0] || null, 201);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = await workspaceProjectAccess(env, user, organization, projectId);
    if (!project) return error("Project not found", 404);
    const admin = organization?.id ? await organizationAdmin(env, user).catch(() => null) : null;
    if (project.owner_id !== user.id && !admin) return error("Project manager access is required", 403);
    if (request.method === "DELETE") { await dbRequest(env, `workspace_projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(project.owner_id)}`, { method: "PATCH", body: JSON.stringify({ status: "archived", updated_at: new Date().toISOString() }) }); return json({ ok: true }); }
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const [input, column] of [["name", "name"], ["description", "description"], ["color", "color"], ["status", "status"]] as const) if (input in body) patch[column] = String(body[input] || "").slice(0, input === "description" ? 2000 : 120);
    const rows = await dbRequest<JsonRecord[]>(env, `workspace_projects?id=eq.${encodeURIComponent(projectId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  if (request.method === "GET" && url.pathname === "/api/tasks") return json(await dbRequest(env, `tasks?owner_id=eq.${encodeURIComponent(user.id)}&order=status.asc,position.asc,completed.asc,due_at.asc.nullsfirst,created_at.desc&limit=500`));
  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = (await request.json()) as JsonRecord;
    if (body.sourceMessageId !== undefined && body.sourceMessageId !== null && !(await hasOwnedRecord(env, "messages", user.id, body.sourceMessageId))) return error("Source message not found", 404);
    let projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
    if (projectId && !(await workspaceProjectAccess(env, user, organization, projectId))) return error("Project not found", 404);
    const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
    if (assigneeId && (!organization?.id || !(await organizationMember(env, organization.id, assigneeId)))) return error("Assignee is not a workspace member", 400);
    const status = ["todo", "in_progress", "blocked", "done"].includes(String(body.status)) ? String(body.status) : body.completed === true ? "done" : "todo";
    const rows = await dbRequest<JsonRecord[]>(env, "tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, project_id: projectId, assignee_id: assigneeId, title: String(body.title || "Untitled task").trim().slice(0, 240), notes: String(body.notes || "").slice(0, 5000), due_at: body.dueAt || null, priority: Math.max(0, Math.min(2, Number(body.priority || 0))), status, completed: status === "done", completed_at: status === "done" ? new Date().toISOString() : null, position: Math.max(0, Number(body.position || 0)), source_message_id: body.sourceMessageId || null }) });
    return json(rows[0], 201);
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === "PATCH" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const existing = await dbRequest<JsonRecord[]>(env, `tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!existing[0]) return error("Task not found", 404);
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const key of ["title", "notes", "due_at", "priority", "position", "project_id", "assignee_id"]) if (key in body) patch[key] = body[key];
    const status = body.status !== undefined ? String(body.status) : body.completed === true ? "done" : body.completed === false ? "todo" : String(existing[0].status || "todo");
    if (!["todo", "in_progress", "blocked", "done"].includes(status)) return error("Task status is invalid", 400);
    patch.status = status;
    patch.completed = status === "done";
    patch.completed_at = status === "done" ? existing[0].completed_at || new Date().toISOString() : null;
    if (patch.project_id && !(await workspaceProjectAccess(env, user, organization, String(patch.project_id)))) return error("Project not found", 404);
    if (patch.assignee_id && (!organization?.id || !(await organizationMember(env, organization.id, String(patch.assignee_id))))) return error("Assignee is not a workspace member", 400);
    const rows = await dbRequest<JsonRecord[]>(env, `tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(rows[0] || null);
  }
  const messageTaskMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/task$/);
  if (messageTaskMatch && request.method === "POST") {
    const messageId = decodeURIComponent(messageTaskMatch[1]);
    const message = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!message[0]) return error("Message not found", 404);
    const body = (await request.json()) as JsonRecord;
    const title = String(body.title || message[0].subject || "Follow up on message").trim().slice(0, 240);
    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
    if (projectId && !(await workspaceProjectAccess(env, user, organization, projectId))) return error("Project not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, "tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, project_id: projectId, title, notes: String(body.notes || `Created from ${message[0].from_address || "message"}`).slice(0, 5000), due_at: body.dueAt || null, priority: Math.max(0, Math.min(2, Number(body.priority || 0))), status: "todo", completed: false, source_message_id: messageId }) });
    return json(rows[0] || null, 201);
  }
  const messageProjectMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/project$/);
  if (messageProjectMatch && request.method === "POST") {
    const messageId = decodeURIComponent(messageProjectMatch[1]);
    const message = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
    if (!message[0]) return error("Message not found", 404);
    const body = (await request.json()) as JsonRecord;
    const projectId = body.projectId ? String(body.projectId) : null;
    if (projectId && !(await workspaceProjectAccess(env, user, organization, projectId))) return error("Project not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ project_id: projectId, updated_at: new Date().toISOString() }) });
    return json(rows[0] || null);
  }
  if (request.method === "GET" && url.pathname === "/api/auto-replies") return json(await dbRequest(env, `auto_replies?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`));
  if (request.method === "POST" && url.pathname === "/api/auto-replies") { const body = (await request.json()) as JsonRecord; const mailboxId = String(body.mailboxId || mailbox.id); if (!(await hasOwnedRecord(env, "mailboxes", user.id, mailboxId))) return error("Mailbox not found", 404); const rows = await dbRequest<JsonRecord[]>(env, "auto_replies", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: mailboxId, enabled: body.enabled === true, subject: String(body.subject || "Automatic reply"), body: String(body.body || ""), starts_at: body.startsAt || null, ends_at: body.endsAt || null }) }); return json(rows[0] || null); }
  if (request.method === "GET" && url.pathname === "/api/integrations") return json(await dbRequest(env, `integrations?owner_id=eq.${encodeURIComponent(user.id)}&order=provider.asc`));
  if (request.method === "PATCH" && url.pathname === "/api/integrations") { const body = (await request.json()) as JsonRecord; const provider = String(body.provider || ""); if (!provider) return error("Provider is required"); const rows = await dbRequest<JsonRecord[]>(env, "integrations", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: user.id, provider, status: String(body.status || "not_configured"), settings: body.settings || {} }) }); return json(rows[0] || null); }
  const draftVersionsMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/versions$/);
  if (draftVersionsMatch && request.method === "GET") {
    const draft = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(draftVersionsMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.drafts&limit=1`).catch(() => []);
    if (!draft[0]) return error("Draft not found", 404);
    const versions = await dbRequest<JsonRecord[]>(env, `mail_events?owner_id=eq.${encodeURIComponent(user.id)}&message_id=eq.${encodeURIComponent(draftVersionsMatch[1])}&event_type=eq.draft_version_saved&order=created_at.desc&limit=100`).catch(() => []);
    return json(versions.map((version) => ({ id: version.id, createdAt: version.created_at, ...objectValue(version.payload) })));
  }
  if (draftVersionsMatch && request.method === "POST") {
    const draft = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(draftVersionsMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.drafts&limit=1`).catch(() => []);
    if (!draft[0]) return error("Draft not found", 404);
    const body = (await request.json()) as JsonRecord;
    const versionId = String(body.versionId || "");
    if (!versionId) return error("Version is required");
    const versions = await dbRequest<JsonRecord[]>(env, `mail_events?id=eq.${encodeURIComponent(versionId)}&owner_id=eq.${encodeURIComponent(user.id)}&message_id=eq.${encodeURIComponent(draftVersionsMatch[1])}&event_type=eq.draft_version_saved&limit=1`).catch(() => []);
    const version = objectValue(versions[0]?.payload);
    if (!versions[0] || (!version.subject && !version.text && !version.html)) return error("Draft version not found", 404);
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(draftVersionsMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.drafts`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ subject: String(version.subject || ""), text_body: String(version.text || ""), html_body: typeof version.html === "string" ? version.html : null, snippet: snippet(String(version.text || "")), updated_at: new Date().toISOString() }) });
    return json(rows[0] || null);
  }
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
      return new Response(archive.buffer as ArrayBuffer, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${archiveName}"`, "cache-control": "no-store" } });
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
  if (request.method === "GET" && downloadAllMatch) { const messageRows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(downloadAllMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!messageRows[0]) return error("Message not found", 404); const rows = await dbRequest<Array<{ filename: string; object_key: string; byte_size: number }>>(env, `attachments?message_id=eq.${encodeURIComponent(downloadAllMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc&limit=10`); if (!rows.length) return error("There are no attachments to download", 404); const totalBytes = rows.reduce((sum, row) => sum + Number(row.byte_size || 0), 0); if (totalBytes > 25 * 1024 * 1024) return error("The download is limited to 25 MB", 413); const entries: Array<{ filename: string; data: Uint8Array }> = []; for (const row of rows) entries.push({ filename: row.filename, data: await readObject(env, row.object_key) }); const archive = buildZip(entries); const archiveName = `${String(messageRows[0].subject || "attachments").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "attachments"}.zip`; return new Response(archive.buffer as ArrayBuffer, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${archiveName}"`, "cache-control": "no-store" } }); }
  const previewMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/preview$/);
  if (request.method === "GET" && previewMatch) { const rows = await dbRequest<Array<{ object_key: string; filename: string; content_type: string; detected_content_type?: string | null; byte_size: number; preview_state: string; safety_status: string }>>(env, `attachments?id=eq.${encodeURIComponent(previewMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); const attachment = rows[0]; if (!attachment) return error("Attachment not found", 404); const contentType = attachment.detected_content_type || attachment.content_type; if (attachment.safety_status === "blocked" || attachment.safety_status === "infected") return error("This attachment is blocked from preview", 409); if (attachment.preview_state !== "ready" || (!contentType.startsWith("image/") && contentType !== "application/pdf") || Number(attachment.byte_size || 0) > 5 * 1024 * 1024) return error("This file is not eligible for safe preview", 415); return json({ url: await signedObjectUrl(env, attachment.object_key), filename: attachment.filename, contentType, previewState: attachment.preview_state }); }
  if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) { const id = url.pathname.split("/").pop() || ""; const rows = await dbRequest<Array<{ object_key: string }>>(env, `attachments?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!rows[0]) return error("Attachment not found", 404); const signedUrl = await signedObjectUrl(env, rows[0].object_key); return url.searchParams.get("json") === "true" ? json({ url: signedUrl }) : Response.redirect(signedUrl, 302); }
  return error("Not found", 404);
}

async function readStreamWithLimit(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Inbound message is too large");
        throw new Error(`Inbound message exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/share/") || url.pathname.startsWith("/api/share/")) { try { return protectedHeaders(await handleConfidentialRoute(request, env)); } catch (requestError) { return error(requestError instanceof Error ? requestError.message : "Message could not be opened", 500); } }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dav/")) { try { return protectedHeaders(await api(request, env, ctx)); } catch (requestError) { return error(requestError instanceof Error ? requestError.message : "Internal server error", 500); } }
    const assetResponse = await env.ASSETS.fetch(request);
    const noStoreAsset = url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest";
    return protectedHeaders(assetResponse, noStoreAsset);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> { await processScheduled(env); },
  async email(message: { from: string; to: string; raw: ReadableStream<Uint8Array>; forward: (address: string) => Promise<void>; setReject: (reason: string) => void }, env: Env, ctx: ExecutionContext): Promise<void> {
    try { const raw = await readStreamWithLimit(message.raw, MAX_RAW_EMAIL_BYTES); await ingestRawEmail(env, raw, message.from, message.to, async (address) => message.forward(address), ctx); if (env.OUTLOOK_FORWARD_TO) await message.forward(env.OUTLOOK_FORWARD_TO); }
    catch (ingestError) { message.setReject(ingestError instanceof Error ? ingestError.message.slice(0, 180) : "Inbound processing failed"); }
  },
};

export { buildMailQuery, parseSearchQuery };
