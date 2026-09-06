# Postveil launch readiness

This is the operator checklist for the hosted deployment. A green code check is
not a substitute for provider approval, a restore exercise, or legal review.

## Implemented in the Worker

- Password signups require a single-use email-verification link before login.
- The API rate-limit binding protects requests by IP and authenticated user.
- Password failures now create a short account lock after five attempts in a
  rolling 15-minute window. Successful sign-in clears the counter.
- Completed sign-ups, successful sign-ins, failed sign-ins, and lockouts are
  recorded in D1 as audit events with hashed email/IP values and bounded
  user-agent metadata.
- Delivery webhooks accept only a Worker secret, deduplicate events for seven
  days, update delivery state, and add bounce/complaint suppressions.
- Amazon SES production sending is approved in Singapore, both configured
  sending domains are verified with DKIM, and the `postveil-events`
  configuration set is present in the Worker configuration. The live Worker
  accepted the SNS subscription confirmation and a synthetic publish earlier;
  provider-side delivery, bounce, complaint, and suppression events still need
  a fresh end-to-end verification.
- Mailbox onboarding checks exact public MX targets from `INBOUND_MX_TARGETS`.
  Zone ownership alone never enables send/receive.
- Raw mail and attachments remain behind authenticated, tenant-scoped routes;
  the B2 bucket is private. Hosted attachment ingestion is currently disabled
  until an antivirus scanner and quarantine workflow are connected.
- Cloudflare Turnstile is configured for `postveil.jamesfontanilla.com` signup;
  the browser widget is explicit and the Worker rejects missing or invalid
  tokens server-side.
- Cloudflare managed protection, HTTP DDoS protection, Browser Integrity Check,
  and Bot Fight Mode are enabled for the production zone. The Worker also
  enforces its configured per-source and per-user API rate limit.
- D1 Time Travel is available for `postveil-prod`; the current database exposes
  a restore bookmark. A destructive production restore has not been performed.

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

- Add custom Cloudflare WAF and rate-limit rules after upgrading to a plan that
  supports them, then confirm a 429/blocked response with a staging-only rule.
- Operate antivirus scanning before re-enabling attachments. The production
  configuration currently rejects attachment uploads, inbound attachment
  storage, and outbound messages containing attachments.
- Set up alerting for failed logins, webhook failures, queue dead letters,
  bounce/complaint rates, D1 errors, B2 errors, and provider throttling.

### Data, recovery, and growth

- Export and retain encrypted D1 backups in an independent account or region;
  Time Travel alone is not an independent backup. Set B2 lifecycle rules and
  take a protected snapshot of the production bucket.
- Perform and record a restore test against a disposable recovery database or
  bucket before accepting customer data.
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
