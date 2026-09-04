import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRule,
  normalizeRuleRecord,
  ruleContextFromMessage,
  validateRuleInput,
} from "../worker/rules.ts";

const context = ruleContextFromMessage({
  from_address: "alerts@example.com",
  to_addresses: ["james@example.com"],
  subject: "Delivery update",
  text_body: "The message was delivered.",
  folder: "inbox",
  event_type: "delivered",
});

test("event-trigger conditions match the delivery event type", () => {
  const rule = { name: "Delivered follow-up", conditions: { eventTypeContains: "deliver" }, actions: { markRead: true }, trigger_type: "event" as const };
  const result = evaluateRule(rule, context);
  assert.equal(result.matched, true);
  assert.ok(result.reasons.some((reason) => reason.includes("Event type contains")));
  assert.equal(evaluateRule(rule, { ...context, eventType: "bounced" }).matched, false);
});

test("automation actions validate safe values", () => {
  assert.deepEqual(validateRuleInput({
    name: "Ticket workflow",
    conditions: { subjectContains: "ticket" },
    actions: {
      assignTo: "self",
      snoozeMinutes: 60,
      createTask: "Review ticket",
      createCalendarEvent: true,
      storeInB2: true,
      webhookUrl: "https://hooks.example.com/postveil",
      webhookSecret: "secret",
    },
  }), []);
  assert.ok(validateRuleInput({ name: "Unsafe", conditions: { subjectContains: "x" }, actions: { webhookUrl: "http://example.com" } }).some((message) => message.includes("HTTPS")));
  assert.ok(validateRuleInput({ name: "Too long", conditions: { subjectContains: "x" }, actions: { snoozeMinutes: 43201 } }).some((message) => message.includes("snoozeMinutes")));
});

test("rule export normalization retains execution metadata", () => {
  const normalized = normalizeRuleRecord({
    name: "Workspace schedule",
    scope: "organization",
    organization_id: "org-1",
    trigger_type: "scheduled",
    schedule: { frequency: "weekly", at: "2026-09-04T09:00:00.000Z" },
    next_run_at: "2026-09-11T09:00:00.000Z",
    conditions: { folder: "inbox" },
    actions: { createTask: "Review" },
  });
  assert.equal(normalized.scope, "organization");
  assert.equal(normalized.trigger_type, "scheduled");
  assert.equal((normalized.schedule as Record<string, unknown>).frequency, "weekly");
  assert.equal(normalized.organization_id, "org-1");
});
