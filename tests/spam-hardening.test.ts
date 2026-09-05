import assert from "node:assert/strict";
import test from "node:test";
import { feedbackWeight, screeningConfidence, uniqueReasonCodes } from "../worker/trust.ts";

test("feedback decays over time and never disappears completely", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const recent = feedbackWeight("2026-09-04T00:00:00.000Z", now);
  const old = feedbackWeight("2026-07-07T00:00:00.000Z", now);
  assert.ok(recent > old);
  assert.ok(old >= 0.05);
  assert.equal(feedbackWeight("not-a-date", now), 0.25);
});

test("screening confidence is bounded and rises for independent hard signals", () => {
  const weak = screeningConfidence({ score: 0.4, signalCount: 1 });
  const strong = screeningConfidence({ score: 1, signalCount: 8, hardBlock: true, authenticationPresent: true });
  assert.ok(weak >= 0.05 && weak <= 0.99);
  assert.ok(strong > weak);
  assert.ok(strong <= 0.99);
});

test("screening reason codes are stable and bounded", () => {
  assert.deepEqual(uniqueReasonCodes([" DMARC failure ", "DMARC failure", "", "link warning"]), ["DMARC failure", "link warning"]);
});
