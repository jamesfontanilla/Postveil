# Postveil incident response

## First 15 minutes

1. Record the time, affected domain/workspace, symptom, and the last known good
   deployment.
2. If abuse or credential compromise is suspected, pause the affected sender,
   revoke its sessions and provider key, and preserve the relevant audit IDs.
3. Check Worker errors, D1 errors, delivery queue dead letters, SES events,
   B2 access failures, and Cloudflare security events.
4. Do not delete evidence or message data while investigating.

## Recovery order

1. Restore service routing and authentication.
2. Restore D1 from a verified backup or replay only the affected additive data.
3. Restore B2 objects from the verified bucket/versioned backup.
4. Re-run tenant-isolation, sign-in, attachment, inbound, outbound, and
   webhook replay tests.
5. Record what was restored, what was lost, and who approved the recovery.

## Required contacts

Replace the placeholders before launch with an on-call owner, privacy contact,
security contact, abuse contact, Cloudflare account owner, SES account owner,
and storage account owner.
