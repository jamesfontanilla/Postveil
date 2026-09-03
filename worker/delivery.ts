import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export type ProviderName = "brevo" | "ses" | "mailgun" | "postmark" | "sendgrid" | "smtp";

export type DeliveryAttachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  byteSize?: number;
  url?: string;
};

export type DeliveryInput = {
  fromAddress: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  idempotencyKey?: string;
  messageIdHeader?: string;
  openTrackingEnabled?: boolean;
  clickTrackingEnabled?: boolean;
  attachments?: DeliveryAttachment[];
};

export type DeliveryEnvironment = {
  BREVO_API_KEY?: string;
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
};

export type DeliveryResult = {
  provider: ProviderName;
  providerMessageId?: string;
  responseStatus: number;
  latencyMs: number;
};

export class ProviderDeliveryError extends Error {
  provider: ProviderName;
  responseStatus: number;
  errorCode: string;
  retryable: boolean;

  constructor(provider: ProviderName, responseStatus: number, errorCode: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderDeliveryError";
    this.provider = provider;
    this.responseStatus = responseStatus;
    this.errorCode = errorCode;
    this.retryable = retryable;
  }
}

function base64(bytes: Uint8Array): string {
  let value = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) value += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(value);
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try { return (JSON.parse(text) || {}) as Record<string, unknown>; } catch { return { message: text.slice(0, 500) }; }
}

function responseMessage(body: Record<string, unknown>): string {
  return String(body.message || body.error || body.errors || body.detail || "Provider rejected the message").slice(0, 500);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function computeExponentialBackoff(attemptNumber: number, baseMs = 30_000, maxMs = 3_600_000): number {
  const attempt = Math.max(1, Math.min(12, Math.floor(attemptNumber)));
  const exponential = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.floor(exponential * 0.2 * Math.random());
  return Math.min(maxMs, exponential + jitter);
}

function assertCredential(provider: ProviderName, ready: boolean, message: string): void {
  if (!ready) throw new ProviderDeliveryError(provider, 503, "provider_not_configured", message, false);
}

async function sendBrevo(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  assertCredential("brevo", Boolean(env.BREVO_API_KEY), "Brevo is not configured");
  const payload: Record<string, unknown> = {
    sender: { email: input.fromAddress },
    to: input.to.map((email) => ({ email })),
    subject: input.subject || "(no subject)",
    textContent: input.text || "",
    htmlContent: input.html || undefined,
    replyTo: { email: input.replyTo || input.fromAddress },
  };
  if (input.cc.length) payload.cc = input.cc.map((email) => ({ email }));
  if (input.bcc.length) payload.bcc = input.bcc.map((email) => ({ email }));
  if (input.attachments?.length) payload.attachment = input.attachments.map((attachment) => ({ url: attachment.url, name: attachment.filename })).filter((attachment) => Boolean(attachment.url));
  if (input.openTrackingEnabled !== undefined || input.clickTrackingEnabled !== undefined) payload.headers = { "X-Postveil-Open-Tracking": String(Boolean(input.openTrackingEnabled)), "X-Postveil-Click-Tracking": String(Boolean(input.clickTrackingEnabled)) };
  const started = Date.now();
  const response = await fetch(String(config.endpoint || "https://api.brevo.com/v3/smtp/email"), {
    method: "POST",
    headers: { accept: "application/json", "api-key": env.BREVO_API_KEY!, "content-type": "application/json", ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {}) },
    body: JSON.stringify(payload),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new ProviderDeliveryError("brevo", response.status, String(body.code || `http_${response.status}`), responseMessage(body), isRetryableStatus(response.status));
  return { provider: "brevo", providerMessageId: typeof body.messageId === "string" ? body.messageId : undefined, responseStatus: response.status, latencyMs: Date.now() - started };
}

async function sendMailgun(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  assertCredential("mailgun", Boolean(env.MAILGUN_API_KEY && (env.MAILGUN_DOMAIN || config.domain)), "Mailgun domain or API key is not configured");
  const domain = String(config.domain || env.MAILGUN_DOMAIN);
  const baseUrl = String(config.baseUrl || env.MAILGUN_BASE_URL || "https://api.mailgun.net/v3").replace(/\/$/, "");
  const form = new FormData();
  form.set("from", input.fromAddress);
  form.set("to", input.to.join(","));
  if (input.cc.length) form.set("cc", input.cc.join(","));
  if (input.bcc.length) form.set("bcc", input.bcc.join(","));
  form.set("subject", input.subject || "(no subject)");
  form.set("text", input.text || "");
  if (input.html) form.set("html", input.html);
  if (input.replyTo) form.set("h:Reply-To", input.replyTo);
  if (input.messageIdHeader) form.set("h:X-Postveil-Message-ID", input.messageIdHeader);
  if (input.idempotencyKey) form.set("v:postveil-idempotency-key", input.idempotencyKey);
  form.set("o:tracking-opens", input.openTrackingEnabled ? "yes" : "no");
  form.set("o:tracking-clicks", input.clickTrackingEnabled ? "yes" : "no");
  for (const attachment of input.attachments || []) form.append("attachment", new File([attachment.bytes.slice().buffer as ArrayBuffer], attachment.filename, { type: attachment.contentType }));
  const started = Date.now();
  const response = await fetch(`${baseUrl}/${encodeURIComponent(domain)}/messages`, { method: "POST", headers: { authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY!}`)}` }, body: form });
  const body = await responseJson(response);
  if (!response.ok) throw new ProviderDeliveryError("mailgun", response.status, String(body.id || `http_${response.status}`), responseMessage(body), isRetryableStatus(response.status));
  return { provider: "mailgun", providerMessageId: typeof body.id === "string" ? body.id : undefined, responseStatus: response.status, latencyMs: Date.now() - started };
}

async function sendPostmark(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  assertCredential("postmark", Boolean(env.POSTMARK_SERVER_TOKEN), "Postmark server token is not configured");
  const payload: Record<string, unknown> = {
    From: input.fromAddress,
    To: input.to.join(","),
    Cc: input.cc.length ? input.cc.join(",") : undefined,
    Bcc: input.bcc.length ? input.bcc.join(",") : undefined,
    Subject: input.subject || "(no subject)",
    TextBody: input.text || "",
    HtmlBody: input.html || undefined,
    ReplyTo: input.replyTo || input.fromAddress,
    TrackOpens: Boolean(input.openTrackingEnabled),
    TrackLinks: input.clickTrackingEnabled ? "HtmlAndText" : "None",
    MessageStream: String(config.messageStream || env.POSTMARK_MESSAGE_STREAM || "outbound"),
    Headers: input.messageIdHeader ? [{ Name: "X-Postveil-Message-ID", Value: input.messageIdHeader }] : undefined,
    Attachments: (input.attachments || []).map((attachment) => ({ Name: attachment.filename, Content: base64(attachment.bytes), ContentType: attachment.contentType })),
  };
  const started = Date.now();
  const response = await fetch(String(config.endpoint || "https://api.postmarkapp.com/email"), { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN! }, body: JSON.stringify(payload) });
  const body = await responseJson(response);
  if (!response.ok || Number(body.ErrorCode || 0) !== 0) throw new ProviderDeliveryError("postmark", response.status, String(body.ErrorCode || `http_${response.status}`), responseMessage(body), isRetryableStatus(response.status));
  return { provider: "postmark", providerMessageId: typeof body.MessageID === "string" ? body.MessageID : undefined, responseStatus: response.status, latencyMs: Date.now() - started };
}

async function sendSendGrid(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  assertCredential("sendgrid", Boolean(env.SENDGRID_API_KEY), "SendGrid API key is not configured");
  const personalization: Record<string, unknown> = { to: input.to.map((email) => ({ email })) };
  if (input.cc.length) personalization.cc = input.cc.map((email) => ({ email }));
  if (input.bcc.length) personalization.bcc = input.bcc.map((email) => ({ email }));
  const payload: Record<string, unknown> = {
    personalizations: [personalization],
    from: { email: input.fromAddress },
    reply_to: { email: input.replyTo || input.fromAddress },
    subject: input.subject || "(no subject)",
    content: [{ type: "text/plain", value: input.text || "" }, ...(input.html ? [{ type: "text/html", value: input.html }] : [])],
    headers: input.messageIdHeader ? { "X-Postveil-Message-ID": input.messageIdHeader } : undefined,
    custom_args: input.idempotencyKey ? { "postveil-idempotency-key": input.idempotencyKey } : undefined,
    tracking_settings: { open_tracking: { enable: Boolean(input.openTrackingEnabled) }, click_tracking: { enable: Boolean(input.clickTrackingEnabled), enable_text: Boolean(input.clickTrackingEnabled) } },
    attachments: (input.attachments || []).map((attachment) => ({ content: base64(attachment.bytes), filename: attachment.filename, type: attachment.contentType, disposition: "attachment" })),
  };
  const started = Date.now();
  const response = await fetch(String(config.endpoint || "https://api.sendgrid.com/v3/mail/send"), { method: "POST", headers: { authorization: `Bearer ${env.SENDGRID_API_KEY!}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await responseJson(response);
  if (!response.ok) throw new ProviderDeliveryError("sendgrid", response.status, String(body.errors || `http_${response.status}`), responseMessage(body), isRetryableStatus(response.status));
  return { provider: "sendgrid", responseStatus: response.status, latencyMs: Date.now() - started };
}

async function sendSes(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  assertCredential("ses", Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY), "Amazon SES credentials are not configured");
  const region = String(config.region || env.AWS_SES_REGION || env.AWS_REGION || "us-east-1");
  const client = new SESv2Client({ region, credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! } });
  const command = new SendEmailCommand({
    FromEmailAddress: input.fromAddress,
    Destination: { ToAddresses: input.to, CcAddresses: input.cc, BccAddresses: input.bcc },
    ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
    ConfigurationSetName: typeof config.configurationSetName === "string" ? config.configurationSetName : undefined,
    Content: { Simple: { Subject: { Data: input.subject || "(no subject)" }, Body: { Text: { Data: input.text || "" }, Html: input.html ? { Data: input.html } : undefined }, Attachments: (input.attachments || []).map((attachment) => ({ FileName: attachment.filename, ContentType: attachment.contentType, RawContent: attachment.bytes, ContentDisposition: "ATTACHMENT" })) } },
  });
  const started = Date.now();
  try {
    const result = await client.send(command);
    return { provider: "ses", providerMessageId: result.MessageId, responseStatus: 200, latencyMs: Date.now() - started };
  } catch (sendError) {
    const name = sendError instanceof Error ? sendError.name : "ses_error";
    const message = sendError instanceof Error ? sendError.message : "Amazon SES rejected the message";
    const status = Number((sendError as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode || 500);
    throw new ProviderDeliveryError("ses", status, name, message.slice(0, 500), isRetryableStatus(status) || /throttl|timeout|temporar/i.test(message));
  }
}

async function sendSmtpRelay(env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown>): Promise<DeliveryResult> {
  const relayUrl = String(config.relayUrl || env.SMTP_RELAY_URL || "");
  assertCredential("smtp", Boolean(relayUrl), "Generic SMTP requires an HTTPS relay URL in a Cloudflare Worker");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.SMTP_USERNAME || env.SMTP_PASSWORD) headers.authorization = `Basic ${btoa(`${env.SMTP_USERNAME || ""}:${env.SMTP_PASSWORD || ""}`)}`;
  const started = Date.now();
  const response = await fetch(relayUrl, { method: "POST", headers, body: JSON.stringify({ from: input.fromAddress, to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text, html: input.html, replyTo: input.replyTo, idempotencyKey: input.idempotencyKey, messageId: input.messageIdHeader, openTracking: input.openTrackingEnabled, clickTracking: input.clickTrackingEnabled, attachments: (input.attachments || []).map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, content: base64(attachment.bytes) })) }) });
  const body = await responseJson(response);
  if (!response.ok) throw new ProviderDeliveryError("smtp", response.status, String(body.code || `http_${response.status}`), responseMessage(body), isRetryableStatus(response.status));
  return { provider: "smtp", providerMessageId: typeof body.messageId === "string" ? body.messageId : undefined, responseStatus: response.status, latencyMs: Date.now() - started };
}

export async function sendThroughProvider(provider: ProviderName, env: DeliveryEnvironment, input: DeliveryInput, config: Record<string, unknown> = {}): Promise<DeliveryResult> {
  if (provider === "brevo") return sendBrevo(env, input, config);
  if (provider === "ses") return sendSes(env, input, config);
  if (provider === "mailgun") return sendMailgun(env, input, config);
  if (provider === "postmark") return sendPostmark(env, input, config);
  if (provider === "sendgrid") return sendSendGrid(env, input, config);
  return sendSmtpRelay(env, input, config);
}
