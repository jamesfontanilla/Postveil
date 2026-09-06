# Postveil — self-hosted custom-domain mail

Postveil is a Cloudflare Worker and React webmail application for custom-domain mail. It can receive mail through a configured Cloudflare Email Worker route, parse MIME messages, store metadata in Cloudflare D1, store raw mail and attachments in a private Backblaze B2 bucket, and send mail through Amazon SES.

This repository is an early-release reference implementation. The current deployment is not a turnkey multi-tenant custom-domain SaaS: domain verification, provider identity provisioning, and inbound routing still require operator-controlled setup. Each deployment must use its own D1 database, provider accounts, storage bucket, domain, and secrets until the hosted multi-tenant architecture is completed.

- Cloudflare Email Routing sends inbound mail to the email Worker.
- The Worker parses MIME messages, stores metadata in D1, and stores raw messages/attachments in a private Backblaze B2 bucket.
- The Worker owns authentication and session tokens in D1; the browser never receives a database credential.
- Amazon SES provides outbound delivery. Other provider adapter interfaces can be added later, but no provider secret is required in the browser.
- Provider webhooks update delivery state, bounce/complaint suppression, reputation, and the message timeline with replay protection.
- Scheduled and recurring sends are durable Worker outbox jobs. Mail merge expands into one private outbound message per recipient and substitutes contact variables server-side.
- Delivery, read, and confirmation requests are emitted as standards-based message headers where supported by the selected provider; provider callbacks are normalized into receipt events.
- Confidential mode sends an expiring, password-capable protected-message link. The portal payload is encrypted at rest with a Worker secret; this mode is not end-to-end encryption because the Worker must deliver the content.
- Reply tracking closes tracked follow-ups when an inbound reply lands in the same conversation.
- The same Worker serves the built responsive web app through Cloudflare Workers Assets.

## Security boundaries

- The browser receives no database or provider key. Never expose AWS SES or Backblaze application keys to the browser.
- D1 access is only through authenticated Worker routes, with owner-scoped queries and server-side authorization.
- Backblaze B2 must use a private bucket and an application key limited to the required object operations.
- The hosted deployment currently disables attachment ingestion until an
  antivirus scanner and quarantine workflow are connected. The code includes
  static type and size checks, but those are not antivirus scanning.
- The public health endpoint intentionally returns only a generic liveness response.
- Production deployments should enable provider 2FA, backups, rate limits, quotas, monitoring, and a malware-scanning workflow.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Configure the Worker variables and secrets described below.
3. Run `npm ci`.
4. Run `npm run dev`.

The Vite app does not require provider credentials. Never place AWS SES or Backblaze application keys in browser build variables.

## D1 setup

Apply the ordered files under `migrations/` to the target D1 database with Wrangler.
The Worker currently uses a compatibility record adapter so the existing mail
routes can run on D1 without exposing D1 directly to the browser. It stores
tenant-scoped JSON records in D1 and keeps authentication sessions and OAuth
state in separate tables. This adapter is appropriate for development and a
small controlled beta; a public multi-tenant service should migrate hot paths
to normalized SQL tables with database-enforced constraints.

Powerful search uses the `search_vector` GIN index for full-text queries and
owner-scoped indexes for dates, size, spam score, links, authentication
results, attachments, calendar events, and work items. Search history is
stored per user in `search_history` and protected by RLS. The search UI
supports field syntax such as `from:`, `to:`, `subject:`, `filename:`,
`type:`, `label:`, `in:`, `domain:`, `auth:`, `is:`, `has:`, `spam:`,
`links:`, `after:`, `before:`, `larger:`, `work:`, and `project:`. Prefix a
filter with `-` to exclude it, and use quotes for phrases. Natural-language
shortcuts such as `unread from alex@example.com this week` are also accepted.

The record adapter preserves owner-scoped authorization in the Worker. Before
hosting multiple organizations in one deployment, replace the compatibility
store with normalized D1 tables and add organization-scoped indexes.

## Configuration

Set these as Cloudflare Worker variables or secrets. Variables identify the deployment; secrets contain credentials.

```text
B2_ENDPOINT
B2_REGION
B2_KEY_ID
B2_APPLICATION_KEY
B2_BUCKET
INBOUND_SHARED_SECRET
INTERNAL_TEST_TOKEN
OUTLOOK_FORWARD_TO (optional)
AWS_ACCESS_KEY_ID (optional, SES)
AWS_SECRET_ACCESS_KEY (optional, SES)
AWS_SES_REGION (optional, defaults to us-east-1)
INBOUND_MX_TARGETS (required for mailbox enablement; comma-separated exact MX targets)
CLOUDFLARE_OAUTH_CLIENT_ID (optional, one-click domain verification)
CLOUDFLARE_OAUTH_CLIENT_SECRET (optional, one-click domain verification)
CLOUDFLARE_OAUTH_SCOPES (optional, defaults to zone.read dns.read)
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
SES_SNS_TOPIC_ARN (optional; restricts native Amazon SNS SES notifications to one topic ARN)
SES_CONFIGURATION_SET_NAME (optional; attaches SES sends to the event configuration set)
SMTP_WEBHOOK_SECRET (optional)
CONFIDENTIAL_LINK_SECRET (required for confidential mode)
CONFIDENTIAL_ENCRYPTION_KEY (required for confidential mode)
```

`APP_DOMAIN`, `DEFAULT_FROM_EMAIL`, and `SYSTEM_FROM_EMAIL` must use domains that are verified with your email provider. `SYSTEM_FROM_EMAIL` is the sender used for new-account email verification. `ALLOWED_SENDER_DOMAINS` may contain additional verified domains separated by commas. The default mailbox is `DEFAULT_FROM_EMAIL`, or `postmaster@APP_DOMAIN` when no default is set.

### Cloudflare one-click domain verification

Create a Cloudflare OAuth client with the authorization-code flow, the redirect
URL `https://YOUR_APP_DOMAIN/api/cloudflare/oauth/callback`, and the read-only
scopes `zone.read dns.read`. Configure the token endpoint authentication method
as `client_secret_post`, then store the client ID as a Worker variable and the
client secret with `wrangler secret put CLOUDFLARE_OAUTH_CLIENT_SECRET`. The
onboarding button uses the OAuth grant to confirm the user controls the zone;
the access token is exchanged and discarded, never stored by Postveil. Mailbox
enablement additionally requires a public MX lookup to match one of the exact
`INBOUND_MX_TARGETS`; an arbitrary MX record no longer counts. SPF/DKIM/DMARC
setup remains a separate DNS handoff.

Configure each provider webhook to send `POST` requests with the deployment's provider secret in the `x-webhook-secret` header. Query-string webhook tokens are deliberately not accepted. Amazon SES may also send native Amazon SNS `Notification` messages: the Worker validates the SNS signing certificate and signature, optionally checks `SES_SNS_TOPIC_ARN`, handles subscription confirmation, and then applies the same idempotent delivery processing. Provider-specific webhook payloads are normalized for delivery, bounce, complaint, open, click, and receipt events; the provider must still be configured to emit those events.

## Deployment

1. Create the D1 database and apply every ordered migration under `migrations/`.
2. Create a private Backblaze B2 bucket and a least-privilege application key.
3. Authenticate each sending domain and sender with Amazon SES. For password signups, verify the `SYSTEM_FROM_EMAIL` domain and move the SES account out of the sandbox before sending verification messages to arbitrary recipients.
4. Configure DNS for the exact inbound MX target(s) in `INBOUND_MX_TARGETS`, plus SPF, DKIM, and DMARC.
5. Set Worker variables and secrets with `wrangler secret put` or the Cloudflare dashboard.
6. Set your deployment domain values in `wrangler.toml` and configure the Cloudflare custom domain. Do not treat the onboarding domain field as automatic provider provisioning: custom-domain SaaS operation requires a separate verified-domain and routing workflow.
7. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --omit=dev`.
8. Deploy with `npm run deploy` and verify authenticated API routes, inbound mail, outbound mail, webhook delivery, and signed attachment downloads.

Do not deploy the example domain or example credentials. Do not reuse another deployment's D1 database, B2 bucket, SES account, or secrets.

## Routes

- `/api/health` — generic liveness check
- `/api/mailboxes` — mailbox list and settings for the signed-in owner
- `/api/mail` and `/api/mail/:id` — search, folders, filters, message detail, flags, snooze, spam feedback, and soft-delete state
- `/api/mail/export` — export the current tenant-scoped search as CSV or JSON, capped at 5,000 results
- `/api/search/parse` — validate and normalize search syntax without returning message data
- `/api/search/history` — owner-scoped search history with clear-history support
- `/api/search/suggestions` — owner-scoped recent, saved-search, label, contact, and syntax suggestions
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
- `/api/drafts/:id/versions` — draft history and version restore
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
- `/share/:token` — public protected-message portal for confidential delivery
- `/api/share/:token/unlock` — one-time/password-checked protected-message access

## Development checks

The application implements the mail workflow, local spam scoring, static
attachment safety checks, custom organization, scheduled send, snooze, PWA
shell, polling, D1-backed authentication, email verification, account-level
sign-in lockouts, mailbox administration,
delegated mailboxes, and organization group-address expansion. Passkeys use
and TOTP require a separately implemented D1/WebAuthn service before they can
be enabled in this configuration. Outbound provider credentials and inbound
webhook signing secrets are intentionally Worker-only. The HTTPS generic SMTP
adapter requires a relay because Cloudflare Workers do not provide arbitrary
outbound TCP sockets. Provider-specific
Google/Microsoft calendar, OneDrive, Teams, AI, push delivery, and third-party
antivirus scanning still require provider credentials or a separately operated
service; the UI exposes these as integration points rather than pretending they
are connected.

Composition delivery is implemented in the trusted Worker: recurring messages
generate the next durable outbox item after successful delivery, mail merge
creates isolated per-recipient messages, contact variables are expanded on the
server, and receipt events are recorded from provider callbacks. Provider
support still depends on the provider account's webhook/event configuration;
SMTP relay deployments must forward the same receipt headers and event payloads.

## License

This project is licensed under the MIT License. Review the provider terms,
privacy obligations, domain ownership requirements, and operational security
responsibilities before deploying it for other people.
