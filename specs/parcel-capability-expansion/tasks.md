# Parcel Capability Expansion — Implementation Tasks

Status: Ready for staged implementation

Tasks reference `requirements.md` IDs. Complete one phase at a time and run the
listed tests before moving to the next phase.

## Phase 0 — Safety and schema foundation

- [x] P0.1 [R-012,R-013] Add a migration for `message_audit_log`, including
      owner, actor, action, target type/id, before/after JSON, request ID, and
      created time.
- [x] P0.2 [R-004,R-012] Add rule execution metadata and a rule-audit table.
- [x] P0.3 [R-005,R-006] Add message work-state, follow-up, and outbox delay
      columns with indexes for due processing.
- [x] P0.4 [R-006] Add a unique outbound idempotency key and send lease fields.
- [x] P0.5 [R-007] Add attachment hash, detected MIME, preview state, and
      safety state columns.
- [x] P0.6 [R-008] Add normalized trust fields and a JSON evidence contract.
- [x] P0.7 [R-009] Create `sender_policies` and `screening_events`.
- [x] P0.8 [R-010] Create `address_profiles` and activity indexes.
- [x] P0.9 [R-001,R-002] Create `saved_searches` and add a GIN index for the
      message search vector.
- [x] P0.10 [R-014] Add collaboration tables and role-capability constraints.
- [x] P0.11 [R-013] Add push-device records without storing private keys in the
       browser database.
- [x] P0.12 [R-011] Create `domain_checks` and redactable evidence fields.
- [x] P0.13 [R-012] Add settings/export schema version fields.
- [x] P0.14 [R-014] Write RLS policies and negative tests before exposing any
       collaboration UI.

## Phase 1 — Search, saved views, and bulk actions

- [x] P1.1 [R-001] Implement a typed search parser with quoted terms,
      negation, date parsing, size parsing, and operator errors.
- [x] P1.2 [R-001] Extend search-vector generation to recipients and attachment
      filenames.
- [x] P1.3 [R-001] Replace the current broad `ilike` query path with bounded,
      parameterized full-text/operator queries.
- [x] P1.4 [R-001] Add pagination, result totals where safe, and stable sort
      ordering.
- [x] P1.5 [R-002] Add saved-search API and private ownership checks.
- [x] P1.6 [R-002] Add saved-search sidebar UI, rename/reorder/delete, and
      result counts.
- [x] P1.7 [R-003] Add the server-side bulk mutation endpoint with an allowlist
      of action types.
- [x] P1.8 [R-003] Add selection state, select-page, clear-selection, and
      explicit all-results scope in the message list.
- [x] P1.9 [R-003] Add confirmation, optimistic update, partial-failure, and
      30-second undo UI.
- [x] P1.10 [R-001,R-003] Add unit/API/browser tests for search and bulk actions.

## Phase 2 — Rule Lab and work queues

- [x] P2.1 [R-004] Extract the current rule matching code into a pure evaluator.
- [x] P2.2 [R-004] Add preview endpoint returning matches, reasons, and planned
       actions without mutation.
- [x] P2.3 [R-004] Add dry-run endpoint and impact summary.
- [x] P2.4 [R-004] Add rule conflict checks, execution metadata, and audit API.
- [x] P2.5 [R-004] Add JSON rule import/export with schema validation.
- [x] P2.6 [R-004] Replace the current rule editor’s run action with preview,
       dry-run, apply, and undo states.
- [x] P2.7 [R-005] Add work-state API and message detail actions for Reply Later,
       Waiting On, and I Owe.
- [x] P2.8 [R-005] Add Work navigation with counts, overdue state, and task link.
- [x] P2.9 [R-005] Add cron activation for due follow-ups and sync events.
- [x] P2.10 [R-004,R-005] Test rule replay, work-state persistence, and mobile
       queue behavior.

## Phase 3 — Safe sending and attachments

- [ ] P3.1 [R-006] Refactor immediate send and scheduled send into one durable
       outbox processor.
- [ ] P3.2 [R-006] Add configurable 0/10/20/30-second Undo Send delay.
- [ ] P3.3 [R-006] Add cancel/edit endpoints with ownership and lease checks.
- [ ] P3.4 [R-006] Add send warnings for attachment omission, recipient domain,
       Reply-To mismatch, and From identity.
- [ ] P3.5 [R-006] Add idempotent Brevo send and duplicate-send tests.
- [ ] P3.6 [R-007] Compute SHA-256 and detected MIME metadata on upload.
- [ ] P3.7 [R-007] Add safe image/PDF preview endpoint with strict limits.
- [ ] P3.8 [R-007] Add download-all endpoint with bounded ZIP generation.
- [ ] P3.9 [R-007] Add attachment safety state to the message detail UI.
- [ ] P3.10 [R-007] Add scanner adapter interface and explicit unavailable-scan
       messaging; do not claim malware scanning without a configured provider.
- [ ] P3.11 [R-006,R-007] Run outbound, attachment, and signed-URL production
       smoke tests.

## Phase 4 — Trust Lens and sender screening

- [ ] P4.1 [R-008] Normalize Authentication-Results into SPF/DKIM/DMARC/ARC/TLS
       fields during inbound parsing.
- [ ] P4.2 [R-008] Add Reply-To mismatch, first-seen sender, known-contact,
       link-host, and tracking-pixel evidence.
- [ ] P4.3 [R-008] Add trust endpoint and expandable message detail panel.
- [ ] P4.4 [R-008] Add safe/spam feedback actions without deleting evidence.
- [ ] P4.5 [R-009] Add sender-policy CRUD and exact-address/domain matching.
- [ ] P4.6 [R-009] Add screening queue, approve/block/reroute actions, and
       screening history.
- [ ] P4.7 [R-009] Add explicit apply-to-existing confirmation.
- [ ] P4.8 [R-008,R-009] Test missing headers, forged/mismatched headers,
       policy precedence, and user overrides.

## Phase 5 — Address and delivery control center

- [ ] P5.1 [R-010] Add address profile API and mailbox activity aggregation.
- [ ] P5.2 [R-010] Add Addresses screen with per-mailbox cards, activity,
       sender policies, and send/receive controls.
- [ ] P5.3 [R-011] Add DNS-over-HTTPS check service with timeouts and cached
       results.
- [ ] P5.4 [R-011] Implement MX, SPF, DMARC, MTA-STS, TLS-RPT, and configured
       DKIM selector checks.
- [ ] P5.5 [R-011] Aggregate Brevo webhook events into delivery, bounce,
       deferred, and complaint summaries.
- [ ] P5.6 [R-011] Add Domain Health UI with evidence, status, and remediation.
- [ ] P5.7 [R-010,R-011] Test DNS timeout, malformed record, multiple mailbox,
       and webhook replay cases.

## Phase 6 — Portability, recovery, and audit

- [ ] P6.1 [R-012] Implement streamed EML plus JSON message export.
- [ ] P6.2 [R-012] Implement settings/folders/labels/rules/contacts/signatures
       export with schema versioning.
- [ ] P6.3 [R-012] Implement validated settings import with dry-run and conflict
       handling.
- [ ] P6.4 [R-012] Implement Trash restore preserving thread, labels, headers,
       and attachment references.
- [ ] P6.5 [R-012] Add B2 raw-message restore fallback when database metadata is
       incomplete.
- [ ] P6.6 [R-012] Add owner-visible audit log with safe redaction.
- [ ] P6.7 [R-012] Test export/import round trip, corrupted manifest, expired
       signed export, and restore authorization.

## Phase 7 — Sync, offline drafts, and notifications

- [ ] P7.1 [R-013] Add a single sync coordinator that merges Realtime, polling,
       optimistic mutations, and updated timestamps.
- [ ] P7.2 [R-013] Add connection state and last-sync indicator.
- [ ] P7.3 [R-013] Add IndexedDB metadata/draft cache with local encryption key
       handling and explicit cache clearing.
- [ ] P7.4 [R-013] Repair and test the service worker before registration.
- [ ] P7.5 [R-013] Add optional VAPID push subscription and revoke flow.
- [ ] P7.6 [R-013] Add notification actions for read, snooze, and open.
- [ ] P7.7 [R-013] Test offline draft recovery, duplicate events, push denial,
       and service-worker failure fallback.

## Phase 8 — Sharing and delegation

- [ ] P8.1 [R-014] Implement mailbox member listing and owner-only invitations.
- [ ] P8.2 [R-014] Enforce viewer/editor/delegate permissions in SQL RLS and
       Worker routes.
- [ ] P8.3 [R-014] Add shared thread comments, assignments, due dates, and done
       state.
- [ ] P8.4 [R-014] Add draft-for-approval state that prevents unauthorized send.
- [ ] P8.5 [R-014] Add expiring share links using hashed opaque tokens.
- [ ] P8.6 [R-014] Add revocation and collaboration audit entries.
- [ ] P8.7 [R-014] Test cross-owner, revoked-member, viewer-send, attachment,
       and expired-link cases.

## Phase 9 — Accessibility and quality hardening

- [ ] P9.1 [R-015] Add semantic landmarks, labels, dialog focus management, and
       screen-reader status announcements.
- [ ] P9.2 [R-015] Add keyboard shortcuts for search, open, reply, archive,
       move, snooze, and bulk selection.
- [ ] P9.3 [R-015] Add reduced-motion and non-color status treatments.
- [ ] P9.4 [R-015] Test 320px, 390px, 768px, desktop, light/dark, compact, and
       reading-pane variants.
- [ ] P9.5 [all] Add regression tests for every production smoke path.
- [ ] P9.6 [all] Run `npm run typecheck`, `npm run build`, and deploy only after
       migration, API, browser, and security tests pass.

## 10. Recommended delivery order

The shortest path to visible value is:

1. Phase 0: schema and audit safety.
2. Phase 1: search and bulk actions.
3. Phase 2: Rule Lab and work queues.
4. Phase 3: safe send and attachment intelligence.
5. Phase 4: Trust Lens and sender screening.
6. Phase 5: Address Intelligence and Domain Health.
7. Phase 6: portability and recovery.
8. Phase 7: sync and offline behavior.
9. Phase 8: collaboration.
10. Phase 9: accessibility and final hardening.

## 11. Definition of done

An item is complete only when:

- its referenced requirement acceptance criteria pass;
- database changes are in a migration;
- owner and unauthorized-access tests pass;
- the frontend handles loading, empty, error, success, and mobile states;
- the API is idempotent where retries are possible;
- audit entries exist for sensitive mutations;
- `npm run typecheck` and `npm run build` pass;
- the production smoke path is verified after deployment;
- the UI does not claim a stronger security or delivery guarantee than the
  implementation provides.
