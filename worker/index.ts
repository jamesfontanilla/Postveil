import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import PostalMime from "postal-mime";

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
}

type JsonRecord = Record<string, unknown>;
type User = { id: string; email?: string };
type Mailbox = { id: string; owner_id: string; address: string; display_name: string; is_default: boolean; can_send: boolean; can_receive: boolean };
type Rule = { id: string; owner_id: string; conditions: JsonRecord; actions: JsonRecord; enabled: boolean; priority: number };
type StoredAttachment = { object_key: string; filename: string; content_type: string; byte_size: number; content_id?: string; disposition?: string | null };

const SYSTEM_FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam"] as const;

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
  return (await response.json()) as User;
}

function storageClient(env: Env): S3Client {
  return new S3Client({ region: env.B2_REGION, endpoint: env.B2_ENDPOINT, forcePathStyle: false, credentials: { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY } });
}

async function putObject(env: Env, key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await storageClient(env).send(new PutObjectCommand({ Bucket: env.B2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

async function signedObjectUrl(env: Env, key: string): Promise<string> {
  return getSignedUrl(storageClient(env), new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: key }), { expiresIn: 600 });
}

async function ensureProfileAndMailbox(env: Env, user: User): Promise<Mailbox> {
  await dbRequest(env, "profiles", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: user.id, display_name: user.email?.split("@")[0] ?? "Mailbox owner" }) });
  await dbRequest(env, "user_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ owner_id: user.id }) });
  const existing = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc&limit=1`);
  if (existing[0]) return existing[0];
  const created = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address: `james@${env.APP_DOMAIN}`, display_name: "James", is_default: true }) });
  return created[0];
}

async function getMailbox(env: Env, ownerId: string, address: string): Promise<Mailbox | null> {
  const rows = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(ownerId)}&address=eq.${encodeURIComponent(cleanAddress(address))}&limit=1`);
  return rows[0] ?? null;
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

async function saveAttachments(env: Env, ownerId: string, messageId: string, attachments: Array<{ filename?: string | null; mimeType?: string; content?: Uint8Array | ArrayBuffer | string; contentId?: string | null; disposition?: string | null }>): Promise<{ stored: StoredAttachment[]; blocked: string[] }> {
  const stored: StoredAttachment[] = [];
  const blocked: string[] = [];
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment.content) continue;
    const filename = (attachment.filename || `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = attachment.mimeType || "application/octet-stream";
    const content = attachment.content instanceof Uint8Array ? attachment.content : attachment.content instanceof ArrayBuffer ? new Uint8Array(attachment.content) : new TextEncoder().encode(attachment.content);
    if (content.byteLength > 15 * 1024 * 1024 || isDangerousAttachment(filename, contentType)) { blocked.push(filename); continue; }
    const objectKey = `attachments/${ownerId}/${messageId}/${crypto.randomUUID()}-${filename}`;
    await putObject(env, objectKey, content, contentType);
    stored.push({ object_key: objectKey, filename, content_type: contentType, byte_size: content.byteLength, content_id: attachment.contentId || undefined, disposition: attachment.disposition });
  }
  return { stored, blocked };
}

async function assessInbound(env: Env, ownerId: string, envelopeFrom: string, headerFrom: string, subject: string, textBody: string, htmlBody: string, parsed: { headers?: Array<{ key: string; value: string }>; attachments?: Array<{ filename?: string | null; mimeType?: string }> }): Promise<{ score: number; reasons: string[]; focusedScore: number; focusedCategory: string; authResults: JsonRecord }> {
  let score = 0;
  let focusedScore = 0.5;
  const reasons: string[] = [];
  const authHeader = headerValue(parsed, "authentication-results") || "";
  const authResults: JsonRecord = { header: authHeader.slice(0, 1000) };
  if (/\b(spf|dkim|dmarc)=fail\b|\b(softfail|permerror|temperror)\b/i.test(authHeader)) { score += 0.35; reasons.push("authentication failure"); }
  if (envelopeFrom && headerFrom && cleanAddress(envelopeFrom) !== cleanAddress(headerFrom)) { score += 0.12; reasons.push("envelope/header sender mismatch"); }
  if ((textBody.match(/https?:\/\//gi) || []).length >= 5) { score += 0.12; reasons.push("many links"); }
  if (/(verify your account|urgent action|claim your prize|wire transfer|password expires|gift card)/i.test(`${subject} ${textBody}`)) { score += 0.14; reasons.push("high-risk language"); }
  const blocked = (parsed.attachments || []).filter((item) => isDangerousAttachment(String(item.filename || ""), String(item.mimeType || "")));
  if (blocked.length) { score += 0.6; reasons.push("dangerous attachment"); }
  if (!textBody.trim() && htmlBody) { score += 0.08; reasons.push("HTML-only message"); }
  const sender = cleanAddress(headerFrom || envelopeFrom);
  const knownContact = await dbRequest<Array<{ id: string }>>(env, `contacts?owner_id=eq.${encodeURIComponent(ownerId)}&email=eq.${encodeURIComponent(sender)}&limit=1`);
  const previous = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&from_address=eq.${encodeURIComponent(sender)}&limit=1`);
  if (knownContact[0]) { score -= 0.25; focusedScore += 0.35; reasons.push("known contact"); }
  if (previous[0]) { score -= 0.1; focusedScore += 0.1; }
  if (/^no[-_]?reply@/i.test(sender)) focusedScore -= 0.2;
  score = Math.max(0, Math.min(1, score));
  focusedScore = Math.max(0, Math.min(1, focusedScore - score * 0.35));
  return { score, reasons, focusedScore, focusedCategory: focusedScore >= 0.5 ? "focused" : "other", authResults };
}

function ruleMatches(rule: Rule, context: { from: string; subject: string; body: string; hasAttachment: boolean }): boolean {
  const conditions = rule.conditions || {};
  const text = `${context.subject} ${context.body}`.toLowerCase();
  if (conditions.fromContains && !context.from.toLowerCase().includes(String(conditions.fromContains).toLowerCase())) return false;
  if (conditions.subjectContains && !context.subject.toLowerCase().includes(String(conditions.subjectContains).toLowerCase())) return false;
  if (conditions.bodyContains && !text.includes(String(conditions.bodyContains).toLowerCase())) return false;
  if (typeof conditions.hasAttachment === "boolean" && conditions.hasAttachment !== context.hasAttachment) return false;
  return true;
}

async function applyInboundRules(env: Env, ownerId: string, messageId: string, context: { from: string; subject: string; body: string; hasAttachment: boolean }, forwardInbound?: (address: string) => Promise<void>): Promise<void> {
  const rules = await dbRequest<Rule[]>(env, `mail_rules?owner_id=eq.${encodeURIComponent(ownerId)}&enabled=eq.true&order=priority.asc`);
  for (const rule of rules) {
    if (!ruleMatches(rule, context)) continue;
    const actions = rule.actions || {};
    const patch: JsonRecord = {};
    if (typeof actions.folder === "string" && SYSTEM_FOLDERS.includes(actions.folder as typeof SYSTEM_FOLDERS[number])) patch.folder = actions.folder;
    if (typeof actions.customFolderId === "string") { patch.folder = "custom"; patch.custom_folder_id = actions.customFolderId; }
    if (typeof actions.markRead === "boolean") patch.is_read = actions.markRead;
    if (typeof actions.star === "boolean") patch.is_starred = actions.star;
    if (typeof actions.pin === "boolean") patch.is_pinned = actions.pin;
    if (typeof actions.priority === "number") patch.priority = Math.max(0, Math.min(2, actions.priority));
    if (Object.keys(patch).length) await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (typeof actions.label === "string" && actions.label.trim()) {
      const name = actions.label.trim();
      const labels = await dbRequest<Array<{ id: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&name=eq.${encodeURIComponent(name)}&limit=1`);
      const label = labels[0] || (await dbRequest<Array<{ id: string }>>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, name }) }))[0];
      if (label) await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: label.id }) });
    }
    if (typeof actions.forwardTo === "string" && forwardInbound) await forwardInbound(cleanAddress(actions.forwardTo));
    if (actions.stopProcessing === true) break;
  }
}

async function sendViaBrevo(env: Env, input: { fromAddress: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string; replyTo?: string; attachments?: Array<{ filename: string; object_key: string }> }): Promise<{ messageId?: string }> {
  const payload: JsonRecord = { sender: { email: input.fromAddress }, to: input.to.map((email) => ({ email })), subject: input.subject || "(no subject)", textContent: input.text || "", htmlContent: input.html || undefined, replyTo: { email: input.replyTo || input.fromAddress } };
  if (input.cc?.length) payload.cc = input.cc.map((email) => ({ email }));
  if (input.bcc?.length) payload.bcc = input.bcc.map((email) => ({ email }));
  if (input.attachments?.length) payload.attachment = await Promise.all(input.attachments.map(async (attachment) => ({ url: await signedObjectUrl(env, attachment.object_key), name: attachment.filename })));
  const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { accept: "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  return result as { messageId?: string };
}

async function ingestRawEmail(env: Env, raw: ArrayBuffer, envelopeFrom: string, envelopeTo: string, forwardInbound?: (address: string) => Promise<void>): Promise<void> {
  const destination = cleanAddress(envelopeTo);
  const ownerId = env.OWNER_USER_ID;
  if (!ownerId) throw new Error("OWNER_USER_ID is not configured");
  const mailbox = await getMailbox(env, ownerId, destination);
  if (!mailbox) throw new Error(`No receiving mailbox configured for ${destination}`);
  const parsed = await new PostalMime().parse(raw);
  const subject = String(parsed.subject || "(no subject)");
  const textBody = String(parsed.text || "");
  const htmlBody = String(parsed.html || "");
  const messageIdHeader = headerValue(parsed, "message-id") || `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  const duplicate = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&message_id_header=eq.${encodeURIComponent(messageIdHeader)}&limit=1`);
  if (duplicate[0]) return;
  const headerFrom = cleanAddress(headerValue(parsed, "from") || envelopeFrom);
  const inReplyTo = headerValue(parsed, "in-reply-to") || null;
  const references = headerValue(parsed, "references") || null;
  const assessment = await assessInbound(env, ownerId, envelopeFrom, headerFrom, subject, textBody, htmlBody, parsed);
  const messageId = crypto.randomUUID();
  const threadId = await findOrCreateThread(env, ownerId, subject, inReplyTo || undefined, references || undefined);
  const rawKey = `raw/${ownerId}/${messageId}.eml`;
  await putObject(env, rawKey, new Uint8Array(raw), "message/rfc822");
  const attachmentResult = await saveAttachments(env, ownerId, messageId, parsed.attachments ?? []);
  const reasons = [...assessment.reasons, ...(attachmentResult.blocked.length ? [`blocked attachments: ${attachmentResult.blocked.join(", ")}`] : [])];
  const folder = assessment.score >= 0.7 ? "spam" : "inbox";
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: messageId, owner_id: ownerId, thread_id: threadId, mailbox_id: mailbox.id, direction: "inbound", folder, status: "received", from_address: headerFrom, to_addresses: splitAddresses(headerValue(parsed, "to") || destination), reply_to: cleanAddress(headerValue(parsed, "reply-to") || headerFrom), subject, text_body: textBody, html_body: htmlBody || null, snippet: snippet(textBody || htmlBody.replace(/<[^>]+>/g, " ")), message_id_header: messageIdHeader, in_reply_to: inReplyTo, references_header: references, raw_object_key: rawKey, has_attachment: attachmentResult.stored.length > 0, spam_score: assessment.score, spam_reasons: reasons, focused_score: assessment.focusedScore, focused_category: assessment.focusedCategory, auth_results: assessment.authResults, received_at: new Date().toISOString() }) });
  if (!inserted[0]) throw new Error("Message insert returned no row");
  if (attachmentResult.stored.length) await dbRequest(env, "attachments", { method: "POST", body: JSON.stringify(attachmentResult.stored.map((attachment) => ({ ...attachment, owner_id: ownerId, message_id: messageId }))) });
  await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}`, { method: "PATCH", body: JSON.stringify({ last_message_at: new Date().toISOString() }) });
  await applyInboundRules(env, ownerId, messageId, { from: headerFrom, subject, body: textBody, hasAttachment: attachmentResult.stored.length > 0 }, forwardInbound);
  const autoReplies = await dbRequest<Array<{ enabled: boolean; subject: string; body: string; starts_at: string | null; ends_at: string | null }>>(env, `auto_replies?owner_id=eq.${encodeURIComponent(ownerId)}&mailbox_id=eq.${encodeURIComponent(mailbox.id)}&enabled=eq.true&limit=1`);
  const autoReply = autoReplies[0];
  const now = Date.now();
  if (autoReply && (!autoReply.starts_at || now >= Date.parse(autoReply.starts_at)) && (!autoReply.ends_at || now <= Date.parse(autoReply.ends_at)) && headerFrom !== destination && !/auto-submitted|list-/i.test(headerValue(parsed, "auto-submitted") || "")) await sendViaBrevo(env, { fromAddress: destination, to: [headerFrom], subject: autoReply.subject, text: autoReply.body, replyTo: destination });
}

async function handleSend(env: Env, ownerId: string | null, body: JsonRecord): Promise<Response> {
  const fromAddress = cleanAddress(String(body.fromAddress || `james@${env.APP_DOMAIN}`));
  const to = splitAddresses(body.to);
  const cc = splitAddresses(body.cc);
  const bcc = splitAddresses(body.bcc);
  if (!fromAddress || !to.length) return error("A sender and at least one recipient are required");
  const mailbox = ownerId ? await getMailbox(env, ownerId, fromAddress) : null;
  if (ownerId && !mailbox?.can_send) return error("This sender address is not enabled for sending", 403);
  const subject = String(body.subject || "(no subject)");
  const text = String(body.text || "");
  const html = typeof body.html === "string" ? body.html : undefined;
  const replyTo = cleanAddress(String(body.replyTo || fromAddress));
  const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item): item is { filename: string; object_key: string } => Boolean(item && typeof item.filename === "string" && typeof item.object_key === "string")) : [];
  const messageIdHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  let messageId: string | undefined;
  if (ownerId && mailbox) {
    const threadId = typeof body.threadId === "string" && body.threadId ? body.threadId : await findOrCreateThread(env, ownerId, subject, typeof body.inReplyTo === "string" ? body.inReplyTo : undefined, typeof body.references === "string" ? body.references : undefined);
    const scheduledAt = typeof body.scheduledAt === "string" && body.scheduledAt ? body.scheduledAt : null;
    const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, thread_id: threadId, mailbox_id: mailbox.id, direction: "outbound", folder: scheduledAt ? "drafts" : "sent", status: scheduledAt ? "scheduled" : "queued", from_address: fromAddress, to_addresses: to, cc_addresses: cc, bcc_addresses: bcc, reply_to: replyTo, subject, text_body: text, html_body: html || null, snippet: snippet(text), message_id_header: messageIdHeader, in_reply_to: typeof body.inReplyTo === "string" ? body.inReplyTo : null, references_header: typeof body.references === "string" ? body.references : null, has_attachment: attachments.length > 0, scheduled_at: scheduledAt, sent_at: scheduledAt ? null : new Date().toISOString() }) });
    messageId = inserted[0]?.id;
    if (scheduledAt) return json({ ok: true, id: messageId, scheduled: true });
  }
  try {
    const providerResult = await sendViaBrevo(env, { fromAddress, to, cc, bcc, subject, text, html, replyTo, attachments });
    if (messageId) await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, { method: "PATCH", body: JSON.stringify({ status: "sent", provider_message_id: providerResult.messageId || null }) });
    return json({ ok: true, id: messageId, providerMessageId: providerResult.messageId });
  } catch (sendError) {
    if (messageId) await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed" }) }).catch(() => undefined);
    throw sendError;
  }
}

async function processScheduled(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const scheduled = await dbRequest<JsonRecord[]>(env, `messages?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&limit=25`);
  for (const message of scheduled) {
    try {
      const attachments = await dbRequest<Array<{ filename: string; object_key: string }>>(env, `attachments?message_id=eq.${encodeURIComponent(String(message.id))}&select=filename,object_key`);
      const result = await sendViaBrevo(env, { fromAddress: String(message.from_address), to: Array.isArray(message.to_addresses) ? message.to_addresses.map(String) : [], cc: Array.isArray(message.cc_addresses) ? message.cc_addresses.map(String) : [], bcc: Array.isArray(message.bcc_addresses) ? message.bcc_addresses.map(String) : [], subject: String(message.subject || "(no subject)"), text: String(message.text_body || ""), html: typeof message.html_body === "string" ? message.html_body : undefined, replyTo: String(message.reply_to || message.from_address), attachments });
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ status: "sent", folder: "sent", sent_at: new Date().toISOString(), provider_message_id: result.messageId || null, scheduled_at: null }) });
    } catch { await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ status: "failed" }) }).catch(() => undefined); }
  }
  const snoozed = await dbRequest<JsonRecord[]>(env, `messages?snoozed_until=lte.${encodeURIComponent(now)}&limit=50`);
  for (const message of snoozed) await dbRequest(env, `messages?id=eq.${encodeURIComponent(String(message.id))}`, { method: "PATCH", body: JSON.stringify({ folder: message.previous_folder || "inbox", previous_folder: null, snoozed_until: null }) }).catch(() => undefined);
}

async function handleDraft(env: Env, user: User, body: JsonRecord): Promise<Response> {
  const fromAddress = cleanAddress(String(body.fromAddress || `james@${env.APP_DOMAIN}`));
  const mailbox = await getMailbox(env, user.id, fromAddress);
  if (!mailbox) return error("Sender mailbox not found", 404);
  const id = typeof body.id === "string" ? body.id : "";
  const patch = { subject: String(body.subject || ""), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, to_addresses: splitAddresses(body.to), cc_addresses: splitAddresses(body.cc), bcc_addresses: splitAddresses(body.bcc), from_address: fromAddress, snippet: snippet(String(body.text || "")), updated_at: new Date().toISOString() };
  if (id) { const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.drafts`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows?.[0] || null); }
  const threadId = await findOrCreateThread(env, user.id, patch.subject);
  const rows = await dbRequest<JsonRecord[]>(env, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, thread_id: threadId, mailbox_id: mailbox.id, direction: "outbound", folder: "drafts", status: "draft", message_id_header: `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`, ...patch }) });
  return json(rows?.[0] || null, 201);
}

function protectedHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") return json({ ok: true, service: "james-email-service", configured: { supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), brevo: Boolean(env.BREVO_API_KEY), b2: Boolean(env.B2_ENDPOINT && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY), inboundOwner: Boolean(env.OWNER_USER_ID) }, supabaseProbe: await probeSupabase(env), timestamp: new Date().toISOString() });
  if (url.pathname === "/api/webhooks/brevo") {
    const secret = url.searchParams.get("token") || request.headers.get("x-webhook-secret");
    if (env.BREVO_WEBHOOK_SECRET && secret !== env.BREVO_WEBHOOK_SECRET) return error("Unauthorized", 401);
    const event = (await request.json()) as JsonRecord;
    const providerMessageId = typeof event["message-id"] === "string" ? event["message-id"] : String(event.messageId || "");
    const rows = providerMessageId ? await dbRequest<Array<{ id: string; owner_id: string }>>(env, `messages?provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`) : [];
    const statusMap: Record<string, string> = { delivered: "delivered", hard_bounce: "bounced", soft_bounce: "bounced", blocked: "failed", error: "failed" };
    if (rows[0]) { const status = statusMap[String(event.event || "").toLowerCase()]; if (status) await dbRequest(env, `messages?id=eq.${encodeURIComponent(rows[0].id)}`, { method: "PATCH", body: JSON.stringify({ status }) }); await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: rows[0].owner_id, message_id: rows[0].id, provider: "brevo", event_type: String(event.event || "unknown"), provider_message_id: providerMessageId, payload: event }) }); }
    return json({ ok: true });
  }
  if (url.pathname === "/api/internal/send-test") { if (!env.INTERNAL_TEST_TOKEN || request.headers.get("x-internal-test-token") !== env.INTERNAL_TEST_TOKEN) return error("Unauthorized", 401); try { return await handleSend(env, null, (await request.json()) as JsonRecord); } catch (sendError) { return error(sendError instanceof Error ? sendError.message : "Send failed", 502); } }
  const user = await getUser(request, env);
  if (!user) return error("Sign in required", 401);
  const mailbox = await ensureProfileAndMailbox(env, user);

  if (request.method === "GET" && url.pathname === "/api/mailboxes") return json(await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc`));
  if (request.method === "POST" && url.pathname === "/api/mailboxes") { const body = (await request.json()) as JsonRecord; const address = cleanAddress(String(body.address || "")); if (!address.includes("@")) return error("Enter a valid email address"); const rows = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address, display_name: String(body.displayName || address.split("@")[0]), is_default: false }) }); return json(rows[0], 201); }
  const mailboxMatch = url.pathname.match(/^\/api\/mailboxes\/([^/]+)$/);
  if (request.method === "PATCH" && mailboxMatch) { const body = (await request.json()) as JsonRecord; const patch: JsonRecord = {}; for (const key of ["display_name", "can_send", "can_receive", "is_default", "reply_to", "settings"]) if (key in body) patch[key] = body[key]; const rows = await dbRequest<JsonRecord[]>(env, `mailboxes?id=eq.${encodeURIComponent(mailboxMatch[1])}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || null); }

  if (request.method === "GET" && url.pathname === "/api/mail") {
    const folder = url.searchParams.get("folder") || "inbox";
    const q = url.searchParams.get("q")?.trim();
    const parts = [`owner_id=eq.${encodeURIComponent(user.id)}`, "select=id,thread_id,mailbox_id,direction,folder,status,custom_folder_id,from_address,to_addresses,cc_addresses,subject,snippet,is_read,is_starred,is_pinned,is_flagged,priority,has_attachment,spam_score,focused_score,focused_category,scheduled_at,snoozed_until,received_at,sent_at,created_at"];
    if (folder.startsWith("custom:")) { parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(folder.slice(7))}`); } else if (folder === "focused") parts.push("folder=eq.inbox", "focused_category=eq.focused"); else if (folder === "other") parts.push("folder=eq.inbox", "focused_category=eq.other"); else parts.push(`folder=eq.${encodeURIComponent(folder)}`);
    if (q) { const safe = q.replace(/[*(),]/g, " "); parts.push(`or=${encodeURIComponent(`(subject.ilike.*${safe}*,from_address.ilike.*${safe}*,text_body.ilike.*${safe}*,snippet.ilike.*${safe}*)`)}`); }
    if (url.searchParams.get("unread") === "true") parts.push("is_read=eq.false");
    if (url.searchParams.get("starred") === "true") parts.push("is_starred=eq.true");
    if (url.searchParams.get("pinned") === "true") parts.push("is_pinned=eq.true");
    if (url.searchParams.get("attachments") === "true") parts.push("has_attachment=eq.true");
    parts.push(`order=${url.searchParams.get("sort") === "oldest" ? "created_at.asc" : "created_at.desc"}`, `limit=${Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)))}`);
    return json(await dbRequest(env, `messages?${parts.join("&")}`));
  }

  const messageMatch = url.pathname.match(/^\/api\/mail\/([^/]+)$/);
  if (request.method === "GET" && messageMatch) { const id = messageMatch[1]; const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!rows[0]) return error("Message not found", 404); const attachments = await dbRequest<JsonRecord[]>(env, `attachments?message_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`); const labels = await dbRequest<JsonRecord[]>(env, `message_labels?message_id=eq.${encodeURIComponent(id)}&select=label_id`); return json({ ...rows[0], attachments, labels }); }
  if (request.method === "GET" && url.pathname.startsWith("/api/threads/")) { const id = url.pathname.split("/").pop() || ""; return json(await dbRequest(env, `messages?thread_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`)); }
  if (request.method === "POST" && messageMatch) {
    const id = messageMatch[1]; const body = (await request.json()) as JsonRecord; const existing = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!existing[0]) return error("Message not found", 404); const patch: JsonRecord = {};
    if (typeof body.isRead === "boolean") patch.is_read = body.isRead;
    if (typeof body.isStarred === "boolean") patch.is_starred = body.isStarred;
    if (typeof body.isPinned === "boolean") patch.is_pinned = body.isPinned;
    if (typeof body.isFlagged === "boolean") patch.is_flagged = body.isFlagged;
    if (typeof body.priority === "number") patch.priority = Math.max(0, Math.min(2, body.priority));
    if (typeof body.snoozedUntil === "string" && body.snoozedUntil) { patch.previous_folder = existing[0].folder; patch.snoozed_until = body.snoozedUntil; patch.folder = "archive"; }
    if (body.snoozedUntil === null) { patch.snoozed_until = null; patch.folder = existing[0].previous_folder || "inbox"; patch.previous_folder = null; }
    if (typeof body.folder === "string" && SYSTEM_FOLDERS.includes(body.folder as typeof SYSTEM_FOLDERS[number])) { patch.folder = body.folder; patch.custom_folder_id = null; }
    if (body.folder === "custom" && typeof body.customFolderId === "string") { patch.folder = "custom"; patch.custom_folder_id = body.customFolderId; }
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (body.folder === "spam" || body.folder === "inbox") await dbRequest(env, "spam_feedback", { method: "POST", body: JSON.stringify({ owner_id: user.id, message_id: id, feedback: body.folder === "spam" ? "spam" : "not_spam" }) }).catch(() => undefined);
    return json(Array.isArray(rows) ? rows[0] : rows);
  }

  if (request.method === "GET" && url.pathname === "/api/folders") return json(await dbRequest(env, `mail_folders?owner_id=eq.${encodeURIComponent(user.id)}&order=sort_order.asc,name.asc`));
  if (request.method === "POST" && url.pathname === "/api/folders") { const body = (await request.json()) as JsonRecord; const name = String(body.name || "").trim(); if (!name) return error("Folder name is required"); const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); const rows = await dbRequest<JsonRecord[]>(env, "mail_folders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name, slug, color: String(body.color || "#6f7d91") }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/labels") return json(await dbRequest(env, `labels?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/labels") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "labels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: String(body.name || "Untitled"), color: String(body.color || "#2d5bff") }) }); return json(rows[0], 201); }
  if (request.method === "POST" && url.pathname === "/api/labels/assign") { const body = (await request.json()) as JsonRecord; const labelId = String(body.labelId || ""); const messageId = String(body.messageId || ""); if (!labelId || !messageId) return error("Message and label are required"); await dbRequest(env, "message_labels", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ message_id: messageId, label_id: labelId }) }); return json({ ok: true }); }
  if (request.method === "GET" && url.pathname === "/api/contacts") { const q = url.searchParams.get("q")?.trim(); const path = `contacts?owner_id=eq.${encodeURIComponent(user.id)}&order=display_name.asc${q ? `&or=${encodeURIComponent(`email.ilike.*${q}*,display_name.ilike.*${q}*`)}` : ""}`; return json(await dbRequest(env, path)); }
  if (request.method === "POST" && url.pathname === "/api/contacts") { const body = (await request.json()) as JsonRecord; const email = cleanAddress(String(body.email || "")); if (!email.includes("@")) return error("A valid email is required"); const rows = await dbRequest<JsonRecord[]>(env, "contacts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, email, display_name: String(body.displayName || email.split("@")[0]), company: body.company || null, notes: body.notes || null }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/rules") return json(await dbRequest(env, `mail_rules?owner_id=eq.${encodeURIComponent(user.id)}&order=priority.asc`));
  if (request.method === "POST" && url.pathname === "/api/rules") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "mail_rules", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, name: String(body.name || "New rule"), priority: Number(body.priority || 100), enabled: body.enabled !== false, conditions: body.conditions || {}, actions: body.actions || {} }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/signatures") return json(await dbRequest(env, `signatures?owner_id=eq.${encodeURIComponent(user.id)}&order=name.asc`));
  if (request.method === "POST" && url.pathname === "/api/signatures") { const body = (await request.json()) as JsonRecord; const rows = await dbRequest<JsonRecord[]>(env, "signatures", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, mailbox_id: body.mailboxId || mailbox.id, name: String(body.name || "Default"), text_body: String(body.text || ""), html_body: typeof body.html === "string" ? body.html : null, is_default: body.isDefault === true }) }); return json(rows[0], 201); }
  if (request.method === "GET" && url.pathname === "/api/settings") { const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); return json(rows[0] || { owner_id: user.id }); }
  if (request.method === "PATCH" && url.pathname === "/api/settings") { const body = (await request.json()) as JsonRecord; const allowed = ["theme", "density", "reading_pane", "language", "timezone", "focused_inbox_enabled", "desktop_notifications", "push_subscription"]; const patch: JsonRecord = { updated_at: new Date().toISOString() }; for (const key of allowed) if (key in body) patch[key] = body[key]; const rows = await dbRequest<JsonRecord[]>(env, `user_settings?owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return json(rows[0] || patch); }
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
  if (request.method === "POST" && url.pathname === "/api/attachments") { const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return error("File is required"); if (file.size > 15 * 1024 * 1024) return error("Attachments are limited to 15 MB"); if (isDangerousAttachment(file.name, file.type)) return error("This attachment type is blocked for safety"); const objectKey = `drafts/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; await putObject(env, objectKey, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream"); return json({ object_key: objectKey, filename: file.name, content_type: file.type || "application/octet-stream", byte_size: file.size }); }
  if (request.method === "POST" && url.pathname === "/api/send") { try { return await handleSend(env, user.id, (await request.json()) as JsonRecord); } catch (sendError) { return error(sendError instanceof Error ? sendError.message : "Send failed", 502); } }
  if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) { const id = url.pathname.split("/").pop() || ""; const rows = await dbRequest<Array<{ object_key: string }>>(env, `attachments?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`); if (!rows[0]) return error("Attachment not found", 404); const signedUrl = await signedObjectUrl(env, rows[0].object_key); return url.searchParams.get("json") === "true" ? json({ url: signedUrl }) : Response.redirect(signedUrl, 302); }
  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) { try { return protectedHeaders(await api(request, env)); } catch (requestError) { return error(requestError instanceof Error ? requestError.message : "Internal server error", 500); } }
    return protectedHeaders(await env.ASSETS.fetch(request));
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> { await processScheduled(env); },
  async email(message: { from: string; to: string; raw: ReadableStream<Uint8Array>; forward: (address: string) => Promise<void>; setReject: (reason: string) => void }, env: Env): Promise<void> {
    try { const raw = await new Response(message.raw).arrayBuffer(); await ingestRawEmail(env, raw, message.from, message.to, async (address) => message.forward(address)); if (env.OUTLOOK_FORWARD_TO) await message.forward(env.OUTLOOK_FORWARD_TO); }
    catch (ingestError) { message.setReject(ingestError instanceof Error ? ingestError.message.slice(0, 180) : "Inbound processing failed"); }
  },
};
