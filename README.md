# Parcel — self-hosted custom-domain mail

Parcel is a Cloudflare Worker and React webmail application for a custom domain. It can receive mail through Cloudflare Email Routing, parse MIME messages, store metadata in Supabase Postgres, store raw mail and attachments in a private Backblaze B2 bucket, and send mail through Brevo.

This repository is a self-hosted reference implementation. It is currently designed around one owner per deployment; it is not a hosted multi-tenant service. Each deployment must use its own Supabase project, provider accounts, storage bucket, domain, and secrets.

## Security boundaries

- The browser receives only the Supabase publishable/anonymous key. Never expose `SUPABASE_SERVICE_ROLE_KEY`, Brevo credentials, or Backblaze application keys to the browser.
- Supabase RLS and explicit grants protect direct database access.
- Backblaze B2 must use a private bucket and an application key limited to the required object operations.
- Attachment checks are static type and size checks. They are not antivirus scanning.
- The public health endpoint intentionally returns only a generic liveness response.
- Production deployments should enable provider 2FA, backups, rate limits, quotas, monitoring, and a malware-scanning workflow.

## Message rendering

HTML messages are rendered as a readable visual message with a plain-text alternative. The reader keeps embedded raster graphics, tables, links, quoted text, and attachment context while removing active content such as scripts, forms, frames, SVG, and unsafe URLs. External images are blocked per message until the reader chooses to load them, which helps prevent tracking pixels and unsolicited network requests.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set the two `VITE_` values for your own Supabase project.
3. Run `npm ci`.
4. Run `npm run dev`.

The Vite app can start without configuration and will display a configuration message. Never place service keys, Brevo keys, or Backblaze application keys in `VITE_` variables.

## Supabase setup

Apply every SQL file in `supabase/migrations/` in filename order, or use the Supabase CLI migration workflow. Keep the migration files in version control and run the RLS tests in `supabase/tests/` against a disposable database before applying changes to production.

The migrations create the mail, organization, screening, recovery, and collaboration data model, including owner-based RLS policies and explicit API grants where client access is required.

## Configuration

Set these as Cloudflare Worker variables or secrets. Variables identify the deployment; secrets contain credentials.

```text
APP_DOMAIN=your-domain.example
ALLOWED_SENDER_DOMAINS=your-domain.example
DEFAULT_FROM_EMAIL=postmaster@your-domain.example

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
BREVO_API_KEY=server-only-brevo-api-key
B2_ENDPOINT=https://s3.your-region.backblazeb2.com
B2_REGION=your-region
B2_KEY_ID=server-only-b2-key-id
B2_APPLICATION_KEY=server-only-b2-application-key
B2_BUCKET=your-private-bucket
BREVO_WEBHOOK_SECRET=long-random-secret
OWNER_USER_ID=the-auth-user-id-for-this-deployment
OUTLOOK_FORWARD_TO=optional-forwarding-address
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
- `/api/rules` — sender, subject, body, attachment rules and actions
- `/api/signatures` — per-mailbox signatures
- `/api/settings` — theme, density, reading pane, notification, timezone, and push settings
- `/api/calendar` — calendar events and attendees
- `/api/tasks` — linked tasks
- `/api/auto-replies` — automatic-reply configuration
- `/api/integrations` — provider connection metadata
- `/api/drafts` — autosaved drafts
- `/api/send` — authenticated Brevo send with threading, CC/BCC, attachments, and scheduling
- `/api/attachments` — private B2 upload and signed download URLs
- `/api/webhooks/brevo` — authenticated delivery-status callback

## Development checks

```text
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Feature boundaries

Parcel includes mail workflow, local spam scoring, static attachment safety checks, custom organization, scheduled send, snooze, PWA support, polling, and optional Supabase Realtime updates. Google/Microsoft calendar, OneDrive, Teams, AI, push delivery, third-party antivirus scanning, and provider-specific workflows require separately operated services and credentials.

## License

Parcel is released under the [MIT License](LICENSE). The license grants reuse
rights for the source code, but it does not provide a warranty, security
guarantee, hosted service, provider account, domain, or permission to use
third-party trademarks.

Before publishing a deployment, operators must run the checks above, scan the
full Git history for secrets, use separate provider accounts and storage, and
rotate any credential that may have been exposed.
