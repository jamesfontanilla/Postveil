# Parcel — private custom-domain mail

Parcel is a small, personal webmail application for `jamesfontanilla.com`.

## Architecture

- Cloudflare Email Routing sends inbound mail to the email Worker.
- The Worker parses MIME messages, stores metadata in Supabase Postgres, and stores raw messages/attachments in a private Backblaze B2 bucket.
- Supabase Auth provides the application session and Row Level Security protects direct database access.
- Brevo sends outbound messages and can call the webhook endpoint with delivery events.
- The same Worker serves the built responsive web app through Cloudflare Workers Assets.

## Local development

1. Copy `.env.example` to `.env.local` and set the two `VITE_` values.
2. Run `npm install`.
3. Run `npm run dev`.

The full server requires the Worker secrets in `wrangler secret` or the Cloudflare dashboard. Never put service keys, Brevo keys, or Backblaze application keys in `VITE_` variables.

## Supabase setup

Run `supabase/migrations/202608250001_initial.sql` once in the Supabase SQL Editor. It creates the mailbox, thread, message, attachment, and delivery-event tables with owner-based RLS policies.

## Worker secrets

Configure these as Cloudflare Worker secrets:

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
```

The Backblaze bucket should be private. The application uses short-lived signed URLs for attachment downloads and Brevo attachment fetches.

## Routes

- `/api/health` — configuration health check
- `/api/mail` — authenticated message list
- `/api/mail/:id` — authenticated message detail/state
- `/api/send` — authenticated Brevo send with sent-message persistence
- `/api/attachments` — authenticated draft attachment upload
- `/api/webhooks/brevo` — delivery-status callback
- `/api/internal/send-test` — secret-protected smoke test only

