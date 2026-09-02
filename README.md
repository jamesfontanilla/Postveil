# Postveil — self-hosted custom-domain mail

Postveil is a Cloudflare Worker and React webmail application for a custom domain. It can receive mail through Cloudflare Email Routing, parse MIME messages, store metadata in Supabase Postgres, store raw mail and attachments in a private Backblaze B2 bucket, and send mail through Brevo.

This repository is a self-hosted reference implementation. It is currently designed around one owner per deployment; it is not a hosted multi-tenant service. Each deployment must use its own Supabase project, provider accounts, storage bucket, domain, and secrets.

- Cloudflare Email Routing sends inbound mail to the email Worker.
- The Worker parses MIME messages, stores metadata in Supabase Postgres, and stores raw messages/attachments in a private Backblaze B2 bucket.
- Supabase Auth provides the application session and Row Level Security protects direct database access.
- The Worker supports Brevo, Amazon SES, Mailgun, Postmark, SendGrid, and an HTTPS generic-SMTP relay. Providers are selected by priority and fail over when a provider is unavailable.
- Provider webhooks update delivery state, bounce/complaint suppression, reputation, and the message timeline with replay protection.
- The same Worker serves the built responsive web app through Cloudflare Workers Assets.

## Security boundaries

- The browser receives only the Supabase publishable/anonymous key. Never expose `SUPABASE_SERVICE_ROLE_KEY`, Brevo credentials, or Backblaze application keys to the browser.
- Supabase RLS and explicit grants protect direct database access.
- Backblaze B2 must use a private bucket and an application key limited to the required object operations.
- Attachment checks are static type and size checks. They are not antivirus scanning.
- The public health endpoint intentionally returns only a generic liveness response.
- Production deployments should enable provider 2FA, backups, rate limits, quotas, monitoring, and a malware-scanning workflow.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set the two `VITE_` values for your own Supabase project.
3. Run `npm ci`.
4. Run `npm run dev`.

The Vite app can start without configuration and will display a configuration message. Never place service keys, Brevo keys, or Backblaze application keys in `VITE_` variables.

## Supabase setup

Run `supabase/migrations/202608250001_initial.sql`, followed by
`supabase/migrations/202608250002_outlook_features.sql` and
`supabase/migrations/20260825133332_capability_foundation.sql` and
`supabase/migrations/20260825140219_sender_identity.sql` and
`supabase/migrations/202609020001_mailbox_administration.sql` in the Supabase
SQL Editor. The second migration adds custom folders, labels, contacts, rules,
signatures, automatic replies, calendar events, tasks, mailbox membership,
integrations, spam feedback, full-text search, threading metadata, scheduled
send, snooze, message flags, and owner-based RLS policies. The capability
foundation adds durable audit records, rule-run metadata, outbox/idempotency
fields, trust and attachment evidence, sender policies, saved searches,
address profiles, collaboration records, push devices, domain checks, and
explicit RLS boundaries for the next application updates. The sender identity
migration preserves display names from incoming `From` headers and adds
optional HTTPS contact avatars.
The mailbox administration migration adds organizations, roles, account
lifecycle state, quotas, usage tracking, sending limits, delegation, group
addresses, recovery-code hashes, security activity, and send-as metadata.

The migrations create the mail, organization, screening, recovery, and collaboration data model, including owner-based RLS policies and explicit API grants where client access is required.

## Configuration

Set these as Cloudflare Worker variables or secrets. Variables identify the deployment; secrets contain credentials.

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BREVO_API_KEY
B2_ENDPOINT
B2_REGION
B2_KEY_ID
B2_APPLICATION_KEY
B2_BUCKET
OWNER_USER_ID
INBOUND_SHARED_SECRET
BREVO_WEBHOOK_SECRET
INTERNAL_TEST_TOKEN
OUTLOOK_FORWARD_TO (optional)
AWS_ACCESS_KEY_ID (optional, SES)
AWS_SECRET_ACCESS_KEY (optional, SES)
AWS_SES_REGION (optional, defaults to us-east-1)
MAILGUN_API_KEY (optional)
MAILGUN_DOMAIN (optional)
MAILGUN_BASE_URL (optional)
POSTMARK_SERVER_TOKEN (optional)
POSTMARK_MESSAGE_STREAM (optional)
SENDGRID_API_KEY (optional)
SMTP_RELAY_URL (optional HTTPS relay; Workers cannot open arbitrary SMTP TCP connections)
SMTP_USERNAME (optional)
SMTP_PASSWORD (optional)
MAX_EMAIL_BYTES (optional, default 10485760)
MAX_RECIPIENTS (optional, default 50)
MAX_RETRY_ATTEMPTS (optional, default 5)
MAILGUN_WEBHOOK_SIGNING_KEY (optional)
POSTMARK_WEBHOOK_SECRET (optional)
SENDGRID_WEBHOOK_SECRET (optional)
SES_WEBHOOK_SECRET (optional)
SMTP_WEBHOOK_SECRET (optional)
```

`APP_DOMAIN` and `DEFAULT_FROM_EMAIL` must use a domain that is verified with your email provider. `ALLOWED_SENDER_DOMAINS` may contain additional verified domains separated by commas. The default mailbox is `DEFAULT_FROM_EMAIL`, or `postmaster@APP_DOMAIN` when no default is set.

Configure the Brevo webhook to send `POST` requests with the secret in the `x-webhook-secret` header. Query-string webhook tokens are deliberately not accepted.

## Deployment

1. Create your Supabase project and apply the migrations.
2. Create a private Backblaze B2 bucket and a least-privilege, expiring application key.
3. Authenticate your sending domain and sender in Brevo.
4. Configure DNS for MX, SPF, DKIM, and DMARC.
5. For a Cloudflare Git deployment, set the build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the project's build settings. The publishable key is intended for the browser; never use a service-role key here.
6. Set Worker variables and secrets with `wrangler secret put` or the Cloudflare dashboard.
7. Set your domain values in `wrangler.toml` and configure the Cloudflare custom domain in the dashboard.
8. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --omit=dev`.
9. Deploy with `npm run deploy` and verify authenticated API routes, inbound mail, outbound mail, webhook delivery, and signed attachment downloads.

Do not deploy the example domain or example credentials. Do not reuse another deployment's Supabase project, B2 bucket, Brevo account, or secrets.

## Routes

- `/api/health` — generic liveness check
- `/api/mailboxes` — mailbox list and settings for the signed-in owner
- `/api/mail` and `/api/mail/:id` — search, folders, filters, message detail, flags, snooze, spam feedback, and soft-delete state
- `/api/threads/:id` — conversation view
- `/api/folders`, `/api/labels`, `/api/labels/assign` — custom folders and labels
- `/api/contacts` — contacts and autocomplete data
- `/api/sender-policies` — trusted and blocked sender/domain decisions
- `/api/rules` — sender/subject/body/attachment rules and actions
- `/api/signatures` — per-mailbox signatures
- `/api/settings` — theme, density, reading pane, notification, timezone, and push settings
- `/api/calendar` — calendar events and attendees
- `/api/tasks` — linked tasks
- `/api/auto-replies` — automatic-reply configuration
- `/api/integrations` — provider connection metadata
- `/api/drafts` — autosaved drafts
- `/api/send` — authenticated provider-routed send with threading, CC/BCC, attachments, quotas, suppression checks, tracking controls, and scheduled send
- `/api/attachments` — private B2 upload and signed download URLs
- `/api/webhooks/:provider` — provider delivery callback with idempotency and replay protection
- `/api/webhooks/inbound/:provider` — normalized inbound webhook adapter
- `/api/mail/:id/inspection` — delivery attempts, provider events, headers, and MIME metadata
- `/api/mail/:id/source` — authorization-checked raw RFC 822 source
- `/api/delivery/overview` — delivery health for the signed-in workspace
- `/api/admin/delivery-ops` — administrator delivery queue, provider, and reputation dashboard
- `/api/admin/providers` — provider routing priority and non-secret adapter configuration
- `/api/admin/domains/:domain` — per-domain quota and reputation controls
- `/api/internal/send-test` — secret-protected smoke test only
- `/api/admin/overview` — workspace administration dashboard data
- `/api/admin/organization` — organization defaults and inactivity policy
- `/api/admin/users` — invite, import, export, suspend, reset, and revoke sessions
- `/api/admin/mailboxes/:id` — mailbox lifecycle, quotas, and sending limits
- `/api/admin/mailboxes/:id/delegates/:memberId` — shared mailbox permissions
- `/api/admin/groups` — distribution lists and group addresses

## Development checks

The application implements the mail workflow, local spam scoring, static
attachment safety checks, custom organization, scheduled send, snooze, PWA
shell, polling, optional Supabase Realtime updates, mailbox administration,
delegated mailboxes, and organization group-address expansion. Passkeys use
the experimental Supabase Auth passkey API and require the corresponding Auth
configuration in the target project. Outbound provider credentials and inbound
webhook signing secrets are intentionally Worker-only. The HTTPS generic SMTP
adapter requires a relay because Cloudflare Workers do not provide arbitrary
outbound TCP sockets. Provider-specific
Google/Microsoft calendar, OneDrive, Teams, AI, push delivery, and third-party
antivirus scanning still require provider credentials or a separately operated
service; the UI exposes these as integration points rather than pretending they
are connected.

## License

This project is licensed under the MIT License. Review the provider terms,
privacy obligations, domain ownership requirements, and operational security
responsibilities before deploying it for other people.
