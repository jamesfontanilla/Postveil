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
  INBOUND_SHARED_SECRET?: string;
  BREVO_WEBHOOK_SECRET?: string;
  INTERNAL_TEST_TOKEN?: string;
  OUTLOOK_FORWARD_TO?: string;
}

type JsonRecord = Record<string, unknown>;

type User = { id: string; email?: string };

type Mailbox = {
  id: string;
  owner_id: string;
  address: string;
  display_name: string;
  is_default: boolean;
  can_send: boolean;
  can_receive: boolean;
};

type StoredAttachment = {
  object_key: string;
  filename: string;
  content_type: string;
  byte_size: number;
  content_id?: string;
  disposition?: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const error = (message: string, status = 400) => json({ error: message }, status);

function cleanAddress(value: string): string {
  return value.trim().replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

function splitAddresses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(cleanAddress).filter(Boolean);
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map(cleanAddress)
    .filter(Boolean);
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi, "").trim().toLowerCase() || "(no subject)";
}

function snippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function supabaseHeaders(env: Env, token?: string): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token ?? env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

async function dbRequest<T = unknown>(env: Env, path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env, token), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

async function probeSupabase(env: Env): Promise<{ ok: boolean; status: number; detail?: string }> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: supabaseHeaders(env),
    });
    return {
      ok: response.ok,
      status: response.status,
      ...(response.ok ? {} : { detail: (await response.text()).slice(0, 180) }),
    };
  } catch (probeError) {
    return { ok: false, status: 0, detail: probeError instanceof Error ? probeError.message.slice(0, 180) : "Probe failed" };
  }
}

async function getUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  return (await response.json()) as User;
}

function storageClient(env: Env): S3Client {
  return new S3Client({
    region: env.B2_REGION,
    endpoint: env.B2_ENDPOINT,
    forcePathStyle: false,
    credentials: { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY },
  });
}

async function putObject(env: Env, key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await storageClient(env).send(new PutObjectCommand({
    Bucket: env.B2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

async function signedObjectUrl(env: Env, key: string): Promise<string> {
  return getSignedUrl(storageClient(env), new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: key }), { expiresIn: 600 });
}

async function ensureProfileAndMailbox(env: Env, user: User): Promise<Mailbox> {
  await dbRequest(env, "profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: user.id, display_name: user.email?.split("@")[0] ?? "Mailbox owner" }),
  });
  const existing = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc&limit=1`);
  if (existing[0]) return existing[0];
  const address = `james@${env.APP_DOMAIN}`;
  const created = await dbRequest<Mailbox[]>(env, "mailboxes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: user.id, address, display_name: "James", is_default: true }),
  });
  return created[0];
}

async function getMailbox(env: Env, ownerId: string, address: string): Promise<Mailbox | null> {
  const rows = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(ownerId)}&address=eq.${encodeURIComponent(address)}&limit=1`);
  return rows[0] ?? null;
}

async function findOrCreateThread(env: Env, ownerId: string, subject: string): Promise<string> {
  const normalized = normalizeSubject(subject);
  const existing = await dbRequest<Array<{ id: string }>>(
    env,
    `threads?owner_id=eq.${encodeURIComponent(ownerId)}&subject_normalized=eq.${encodeURIComponent(normalized)}&order=last_message_at.desc&limit=1`,
  );
  if (existing[0]) return existing[0].id;
  const created = await dbRequest<Array<{ id: string }>>(env, "threads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: ownerId, subject: subject || "(no subject)", subject_normalized: normalized }),
  });
  return created[0].id;
}

function headerValue(parsed: { headers?: Array<{ key: string; value: string }> }, key: string): string | undefined {
  return parsed.headers?.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;
}

async function saveAttachments(env: Env, ownerId: string, messageId: string, attachments: Array<{
  filename?: string | null;
  mimeType?: string;
  content?: Uint8Array | ArrayBuffer | string;
  contentId?: string | null;
  disposition?: string | null;
}>): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment.content) continue;
    const filename = (attachment.filename || `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const content = attachment.content instanceof Uint8Array
      ? attachment.content
      : attachment.content instanceof ArrayBuffer
        ? new Uint8Array(attachment.content)
        : new TextEncoder().encode(attachment.content);
    const objectKey = `attachments/${ownerId}/${messageId}/${crypto.randomUUID()}-${filename}`;
    await putObject(env, objectKey, content, attachment.mimeType || "application/octet-stream");
    stored.push({
      object_key: objectKey,
      filename,
      content_type: attachment.mimeType || "application/octet-stream",
      byte_size: content.byteLength,
      content_id: attachment.contentId || undefined,
      disposition: attachment.disposition,
    });
  }
  return stored;
}

async function ingestRawEmail(env: Env, raw: ArrayBuffer, envelopeFrom: string, envelopeTo: string): Promise<void> {
  const destination = cleanAddress(envelopeTo);
  const ownerId = env.OWNER_USER_ID;
  if (!ownerId) throw new Error("OWNER_USER_ID is not configured");
  const mailbox = await getMailbox(env, ownerId, destination);
  if (!mailbox) throw new Error(`No receiving mailbox configured for ${destination}`);

  const parsed = await new PostalMime().parse(raw);
  const subject = String(parsed.subject || "(no subject)");
  const messageIdHeader = headerValue(parsed, "message-id") || `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  const duplicate = await dbRequest<Array<{ id: string }>>(
    env,
    `messages?owner_id=eq.${encodeURIComponent(ownerId)}&message_id_header=eq.${encodeURIComponent(messageIdHeader)}&limit=1`,
  );
  if (duplicate[0]) return;

  const threadId = await findOrCreateThread(env, ownerId, subject);
  const messageId = crypto.randomUUID();
  const rawKey = `raw/${ownerId}/${messageId}.eml`;
  await putObject(env, rawKey, new Uint8Array(raw), "message/rfc822");
  const parsedAttachments = await saveAttachments(env, ownerId, messageId, parsed.attachments ?? []);
  const textBody = String(parsed.text || "");
  const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: messageId,
      owner_id: ownerId,
      thread_id: threadId,
      mailbox_id: mailbox.id,
      direction: "inbound",
      folder: "inbox",
      status: "received",
      from_address: cleanAddress(envelopeFrom),
      to_addresses: [destination],
      reply_to: cleanAddress(envelopeFrom),
      subject,
      text_body: textBody,
      html_body: parsed.html || null,
      snippet: snippet(textBody),
      message_id_header: messageIdHeader,
      in_reply_to: headerValue(parsed, "in-reply-to") || null,
      references_header: headerValue(parsed, "references") || null,
      received_at: new Date().toISOString(),
    }),
  });
  if (!inserted[0]) throw new Error("Message insert returned no row");
  if (parsedAttachments.length) {
    await dbRequest(env, "attachments", {
      method: "POST",
      body: JSON.stringify(parsedAttachments.map((attachment) => ({ ...attachment, owner_id: ownerId, message_id: messageId }))),
    });
  }
  await dbRequest(env, `threads?id=eq.${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: new Date().toISOString() }),
  });
  await putObject(env, rawKey, new Uint8Array(raw), "message/rfc822");
}

async function sendViaBrevo(env: Env, input: {
  fromAddress: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; object_key: string }>;
}): Promise<{ messageId?: string }> {
  const payload: JsonRecord = {
    sender: { email: input.fromAddress },
    to: input.to.map((email) => ({ email })),
    subject: input.subject || "(no subject)",
    textContent: input.text || "",
    htmlContent: input.html || undefined,
    replyTo: { email: input.replyTo || input.fromAddress },
  };
  if (input.cc?.length) payload.cc = input.cc.map((email) => ({ email }));
  if (input.bcc?.length) payload.bcc = input.bcc.map((email) => ({ email }));
  if (input.attachments?.length) {
    payload.attachment = await Promise.all(input.attachments.map(async (attachment) => ({
      url: await signedObjectUrl(env, attachment.object_key),
      name: attachment.filename,
    })));
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  return result as { messageId?: string };
}

async function handleSend(env: Env, ownerId: string | null, body: JsonRecord): Promise<Response> {
  const fromAddress = cleanAddress(String(body.fromAddress || `james@${env.APP_DOMAIN}`));
  const to = splitAddresses(body.to);
  const cc = splitAddresses(body.cc);
  const bcc = splitAddresses(body.bcc);
  if (!fromAddress || !to.length) return error("A sender and at least one recipient are required");

  let mailbox: Mailbox | null = null;
  if (ownerId) {
    mailbox = await getMailbox(env, ownerId, fromAddress);
    if (!mailbox?.can_send) return error("This sender address is not enabled for sending", 403);
  }

  const subject = String(body.subject || "(no subject)");
  const text = String(body.text || "");
  const html = typeof body.html === "string" ? body.html : undefined;
  const replyTo = cleanAddress(String(body.replyTo || fromAddress));
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter((item): item is { filename: string; object_key: string } => Boolean(item && typeof item.filename === "string" && typeof item.object_key === "string"))
    : [];
  const messageIdHeader = `<${crypto.randomUUID()}@${env.APP_DOMAIN}>`;
  let messageId: string | undefined;
  let threadId: string | undefined;
  if (ownerId && mailbox) {
    threadId = await findOrCreateThread(env, ownerId, subject);
    const inserted = await dbRequest<Array<{ id: string }>>(env, "messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: ownerId,
        thread_id: threadId,
        mailbox_id: mailbox.id,
        direction: "outbound",
        folder: "sent",
        status: "queued",
        from_address: fromAddress,
        to_addresses: to,
        cc_addresses: cc,
        bcc_addresses: bcc,
        reply_to: replyTo,
        subject,
        text_body: text,
        html_body: html || null,
        snippet: snippet(text),
        message_id_header: messageIdHeader,
        sent_at: new Date().toISOString(),
      }),
    });
    messageId = inserted[0]?.id;
  }

  try {
    const providerResult = await sendViaBrevo(env, { fromAddress, to, cc, bcc, subject, text, html, replyTo, attachments });
    if (messageId) {
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "sent", provider_message_id: providerResult.messageId || null }),
      });
    }
    return json({ ok: true, id: messageId, providerMessageId: providerResult.messageId });
  } catch (sendError) {
    if (messageId) {
      await dbRequest(env, `messages?id=eq.${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed" }),
      }).catch(() => undefined);
    }
    throw sendError;
  }
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "james-email-service",
      configured: {
        supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        brevo: Boolean(env.BREVO_API_KEY),
        b2: Boolean(env.B2_ENDPOINT && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY),
        inboundOwner: Boolean(env.OWNER_USER_ID),
      },
      supabaseProbe: await probeSupabase(env),
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === "/api/webhooks/brevo") {
    const secret = url.searchParams.get("token") || request.headers.get("x-webhook-secret");
    if (env.BREVO_WEBHOOK_SECRET && secret !== env.BREVO_WEBHOOK_SECRET) return error("Unauthorized", 401);
    const event = (await request.json()) as JsonRecord;
    const providerMessageId = typeof event["message-id"] === "string" ? event["message-id"] : String(event.messageId || "");
    const rows = providerMessageId
      ? await dbRequest<Array<{ id: string; owner_id: string }>>(env, `messages?provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`)
      : [];
    const statusMap: Record<string, string> = { delivered: "delivered", hard_bounce: "bounced", soft_bounce: "bounced", blocked: "failed", error: "failed" };
    if (rows[0]) {
      const status = statusMap[String(event.event || "").toLowerCase()];
      if (status) await dbRequest(env, `messages?id=eq.${encodeURIComponent(rows[0].id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await dbRequest(env, "mail_events", { method: "POST", body: JSON.stringify({ owner_id: rows[0].owner_id, message_id: rows[0].id, provider: "brevo", event_type: String(event.event || "unknown"), provider_message_id: providerMessageId, payload: event }) });
    }
    return json({ ok: true });
  }

  if (url.pathname === "/api/internal/send-test") {
    if (!env.INTERNAL_TEST_TOKEN || request.headers.get("x-internal-test-token") !== env.INTERNAL_TEST_TOKEN) return error("Unauthorized", 401);
    try {
      const body = (await request.json()) as JsonRecord;
      return await handleSend(env, null, body);
    } catch (sendError) {
      return error(sendError instanceof Error ? sendError.message : "Send failed", 502);
    }
  }

  const user = await getUser(request, env);
  if (!user) return error("Sign in required", 401);
  const mailbox = await ensureProfileAndMailbox(env, user);

  if (request.method === "GET" && url.pathname === "/api/mailboxes") {
    const rows = await dbRequest<Mailbox[]>(env, `mailboxes?owner_id=eq.${encodeURIComponent(user.id)}&order=is_default.desc,created_at.asc`);
    return json(rows);
  }

  if (request.method === "POST" && url.pathname === "/api/mailboxes") {
    const body = (await request.json()) as JsonRecord;
    const address = cleanAddress(String(body.address || ""));
    if (!address.includes("@")) return error("Enter a valid email address");
    const rows = await dbRequest<Mailbox[]>(env, "mailboxes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: user.id, address, display_name: String(body.displayName || address.split("@")[0]), is_default: false }) });
    return json(rows[0], 201);
  }

  if (request.method === "GET" && url.pathname === "/api/mail") {
    const folder = url.searchParams.get("folder") || "inbox";
    const rows = await dbRequest(env, `messages?owner_id=eq.${encodeURIComponent(user.id)}&folder=eq.${encodeURIComponent(folder)}&order=created_at.desc&select=id,thread_id,mailbox_id,direction,folder,status,from_address,to_addresses,cc_addresses,subject,snippet,is_read,is_starred,received_at,sent_at,created_at`);
    return json(rows);
  }

  const messageMatch = url.pathname.match(/^\/api\/mail\/([^/]+)$/);
  if (request.method === "GET" && messageMatch) {
    const id = messageMatch[1];
    const rows = await dbRequest<JsonRecord[]>(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!rows[0]) return error("Message not found", 404);
    const attachments = await dbRequest<JsonRecord[]>(env, `attachments?message_id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`);
    return json({ ...rows[0], attachments });
  }

  if (request.method === "POST" && messageMatch) {
    const id = messageMatch[1];
    const body = (await request.json()) as JsonRecord;
    const patch: JsonRecord = {};
    if (typeof body.isRead === "boolean") patch.is_read = body.isRead;
    if (typeof body.isStarred === "boolean") patch.is_starred = body.isStarred;
    if (typeof body.folder === "string" && ["inbox", "sent", "drafts", "archive", "trash", "spam"].includes(body.folder)) patch.folder = body.folder;
    const rows = await dbRequest(env, `messages?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return json(Array.isArray(rows) ? rows[0] : rows);
  }

  if (request.method === "POST" && url.pathname === "/api/attachments") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("File is required");
    if (file.size > 15 * 1024 * 1024) return error("Attachments are limited to 15 MB");
    const objectKey = `drafts/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await putObject(env, objectKey, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
    return json({ object_key: objectKey, filename: file.name, content_type: file.type || "application/octet-stream", byte_size: file.size });
  }

  if (request.method === "POST" && url.pathname === "/api/send") {
    try {
      return await handleSend(env, user.id, (await request.json()) as JsonRecord);
    } catch (sendError) {
      return error(sendError instanceof Error ? sendError.message : "Send failed", 502);
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/attachments/")) {
    const id = url.pathname.split("/").pop() || "";
    const rows = await dbRequest<Array<{ object_key: string; filename: string }>>(env, `attachments?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!rows[0]) return error("Attachment not found", 404);
    return Response.redirect(await signedObjectUrl(env, rows[0].object_key), 302);
  }

  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env);
      } catch (requestError) {
        return error("Internal server error", 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async email(message: { from: string; to: string; raw: ReadableStream<Uint8Array>; forward: (address: string) => Promise<void>; setReject: (reason: string) => void }, env: Env): Promise<void> {
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      await ingestRawEmail(env, raw, message.from, message.to);
      if (env.OUTLOOK_FORWARD_TO) await message.forward(env.OUTLOOK_FORWARD_TO);
    } catch (ingestError) {
      message.setReject(ingestError instanceof Error ? ingestError.message.slice(0, 180) : "Inbound processing failed");
    }
  },
};
