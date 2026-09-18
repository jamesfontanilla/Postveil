import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// Use the Worker URL directly so AWS-to-Worker traffic does not pass through
// the public custom-domain security/challenge layer. Keep it configurable for
// future deployments while retaining the current Worker fallback.
const endpoint = process.env.POSTVEIL_INBOUND_ENDPOINT || "https://postveil.jamesfontanilla.com/api/webhooks/inbound/ses";
const s3 = new S3Client({});

function headerValue(raw, name) {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+(?:\\n[ \\t].+)*)$`, "im"));
  return match?.[1]?.replace(/\\r?\\n[ \\t]+/g, " ").trim() || undefined;
}

function mailboxAddress(value) {
  if (!value) return undefined;
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] || value).trim().toLowerCase();
}

export const handler = async (event) => {
  const record = event?.Records?.[0];
  const ses = record?.ses;
  // SES's Lambda receipt action does not include the object written by a
  // preceding S3 receipt action. The durable trigger is therefore the S3
  // ObjectCreated event; keep the SES shape as a backward-compatible
  // fallback for any older rule that still invokes this function directly.
  const sesAction = ses?.receipt?.action;
  const s3Record = record?.eventSource === "aws:s3" ? record.s3 : undefined;
  const bucket = sesAction?.bucketName || s3Record?.bucket?.name;
  const key = sesAction?.objectKey || (s3Record?.object?.key ? decodeURIComponent(s3Record.object.key.replace(/\+/g, " ")) : undefined);
  if (!bucket || !key) {
    console.error("Inbound event did not contain an S3 object location", JSON.stringify({ eventSource: record?.eventSource, hasSes: Boolean(ses), recordKeys: Object.keys(record || {}) }));
    throw new Error("Inbound event did not include an S3 message location");
  }
  const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!stored.Body) throw new Error("SES S3 object had no body");
  const raw = await stored.Body.transformToString();
  const recipient = mailboxAddress(ses?.receipt?.recipients?.[0] || ses?.mail?.destination?.[0] || headerValue(raw, "To"));
  const sender = mailboxAddress(ses?.mail?.source || headerValue(raw, "From"));
  // Some senders omit Message-ID. The S3 object key is stable across retries,
  // so use it as the idempotency key instead of generating a new value.
  const messageId = ses?.mail?.messageId || headerValue(raw, "Message-ID") || `s3:${bucket}/${key}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": process.env.POSTVEIL_INBOUND_SECRET },
      body: JSON.stringify({ raw, from: sender, to: recipient, message_id: messageId }),
    });
    if (!response.ok) throw new Error(`Postveil returned ${response.status}: ${await response.text()}`);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true };
  } catch (error) {
    console.error("Inbound processing failed; retaining S3 object for retry", error);
    throw error;
  }
};
