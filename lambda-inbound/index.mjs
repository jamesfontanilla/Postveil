import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// Use the Worker URL directly so AWS-to-Worker traffic does not pass through
// the public custom-domain security/challenge layer. Keep it configurable for
// future deployments while retaining the current Worker fallback.
const endpoint = process.env.POSTVEIL_INBOUND_ENDPOINT || "https://postveil.jamesfontanilla-dev.workers.dev/api/webhooks/inbound/ses";
const s3 = new S3Client({});

export const handler = async (event) => {
  const record = event?.Records?.[0];
  const ses = record?.ses;
  const action = ses?.receipt?.action;
  const bucket = action?.bucketName;
  const key = action?.objectKey;
  if (!bucket || !key || !ses?.mail) throw new Error("SES event did not include an S3 message location");
  const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!stored.Body) throw new Error("SES S3 object had no body");
  const raw = await stored.Body.transformToString();
  const recipient = ses.receipt?.recipients?.[0] || ses.mail.destination?.[0];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": process.env.POSTVEIL_INBOUND_SECRET },
      body: JSON.stringify({ raw, from: ses.mail.source, to: recipient, message_id: ses.mail.messageId }),
    });
    if (!response.ok) throw new Error(`Postveil returned ${response.status}: ${await response.text()}`);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true };
  } catch (error) {
    console.error("Inbound processing failed; retaining S3 object for retry", error);
    throw error;
  }
};
