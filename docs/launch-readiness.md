# Postveil launch readiness

This is the operator checklist for the hosted deployment. A green code check is
not a substitute for provider approval, a restore exercise, or legal review.

## Implemented in the Worker

- Password signups require a single-use email-verification link before login.
- The API rate-limit binding protects requests by IP and authenticated user.
- Password failures now create a short account lock after five attempts in a
  rolling 15-minute window. Successful sign-in clears the counter.
- Delivery webhooks accept only a Worker secret, deduplicate events for seven
  days, update delivery state, and add bounce/complaint suppressions.
- Amazon SES production sending is approved in Singapore, both configured
  sending domains are verified with DKIM, and the `postveil-events`
  configuration set publishes delivery events to the confirmed SNS subscription
  on the production webhook. A synthetic signed SNS notification was accepted
  by the live Worker.
- Mailbox onboarding checks exact public MX targets from `INBOUND_MX_TARGETS`.
  Zone ownership alone never enables send/receive.
- Raw mail and attachments remain behind authenticated, tenant-scoped routes;
  the B2 bucket is expected to remain private.

## Still requires an operator or provider

### Amazon SES

1. Send one controlled real message to an owned mailbox and verify the
   delivery timeline, bounce/complaint path, and suppression record end to end.

### Customer domains and inbound mail

1. Give each customer the exact MX records required by the configured inbound
   provider. Do not accept “an MX record exists” as proof.
2. Verify the MX check in onboarding after DNS propagation.
3. Configure the provider's inbound route to the email Worker. Cloudflare OAuth
   proves zone access; it does not create MX records or email routes.
4. Verify SPF, DKIM, and DMARC separately before enabling outbound sending.

### Security operations

- Add Cloudflare WAF/bot rules for the custom domain and confirm a 429/blocked
  response with a staging-only test rule before enabling enforcement.
- Configure Turnstile with a real site and secret key, then wire the signup
  widget and reject missing/invalid tokens server-side.
- Operate antivirus scanning before promising malware detection. Until a
  scanner is connected, attachment checks are static and must not be described
  as antivirus protection.
- Set up alerting for failed logins, webhook failures, queue dead letters,
  bounce/complaint rates, D1 errors, B2 errors, and provider throttling.

### Data, recovery, and growth

- Enable D1 backups on the chosen Cloudflare plan and set B2 lifecycle rules.
- Perform and record a restore test before accepting customer data.
- Migrate hot mailbox/message paths from compatibility JSON records to
  normalized, tenant-keyed D1 tables before serious multi-tenant growth.
- Add billing, entitlements, invoices, tax handling, and payment-failure flows
  only after selecting a payment provider and business/tax jurisdiction.

### Legal and support

- Have a qualified adviser finalize the terms, privacy notice, AUP, DPA,
  subprocessor list, retention/deletion rules, and customer support/abuse
  contacts.
- Publish a status page, support intake, domain-removal process, export test,
  incident-response contacts, and recovery runbook.

## Release gate

Do not call the service public-SaaS ready until every item in “Still requires an
operator or provider” has an owner, evidence, and a date. The application can
be open-sourced before then, but the hosted service should remain clearly marked
as beta until those gates are satisfied.
