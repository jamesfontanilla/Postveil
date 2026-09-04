import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanCollaborationText,
  collaborationMentionEmails,
  collaborationPolicyMatches,
  collaborationSlaBreached,
  collaborationSlaDueAt,
} from "../worker/collaboration.ts";

test("collaboration SLAs are bounded and priority-aware", () => {
  const now = Date.parse("2026-09-04T00:00:00.000Z");
  const urgent = collaborationSlaDueAt("urgent", now);
  const low = collaborationSlaDueAt("low", now);
  assert.equal(urgent, "2026-09-04T01:00:00.000Z");
  assert.equal(low, "2026-09-06T00:00:00.000Z");
  assert.equal(collaborationSlaBreached(urgent, now), false);
  assert.equal(collaborationSlaBreached(urgent, now + 60 * 60 * 1000), true);
});

test("collaboration mentions are normalized and capped", () => {
  assert.deepEqual(collaborationMentionEmails("@A@example.com a@example.com B@EXAMPLE.COM"), ["a@example.com", "b@example.com"]);
});

test("collaboration policies match event and optional state constraints", () => {
  assert.equal(collaborationPolicyMatches({ event: "message_received", priority: "urgent" }, "message_received", { priority: "urgent" }), true);
  assert.equal(collaborationPolicyMatches({ event: "message_received", status: "pending" }, "message_received", { status: "open" }), false);
  assert.equal(collaborationPolicyMatches({}, "comment_added", { status: "open" }), true);
});

test("collaboration text strips control characters and bounds input", () => {
  assert.equal(cleanCollaborationText("  hello\u0000\u0007 world  ", 20), "hello world");
  assert.equal(cleanCollaborationText("123456", 4), "1234");
});
