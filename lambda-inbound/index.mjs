const endpoint = "https://postveil.jamesfontanilla.com/api/webhooks/inbound/ses";

export const handler = async (event) => {
  const record = event?.Records?.[0];
  const ses = record?.ses;
  const raw = ses?.content;
  if (!raw || !ses?.mail) throw new Error("SES event did not include raw content");
  const recipient = ses.receipt?.recipients?.[0] || ses.mail.destination?.[0];
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": process.env.POSTVEIL_INBOUND_SECRET },
    body: JSON.stringify({ raw, from: ses.mail.source, to: recipient, message_id: ses.mail.messageId }),
  });
  if (!response.ok) throw new Error(`Postveil returned ${response.status}: ${await response.text()}`);
  return { ok: true };
};
