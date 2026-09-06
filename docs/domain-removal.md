# Customer domain removal runbook

1. Confirm the request came from an authorized workspace administrator.
2. Disable the domain's mailboxes and outbound sender identities.
3. Ask the customer to remove Postveil MX, SPF, DKIM, and any forwarding records.
4. Stop inbound routing before deleting mailbox records.
5. Offer a tenant-scoped export and verify that it can be opened before the
   retention deadline.
6. Apply the published retention schedule to messages, raw objects,
   attachments, logs, backups, and provider-side events.
7. Record the removal and resulting object IDs in the audit log.
