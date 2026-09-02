import assert from "node:assert/strict";
import test from "node:test";
import { computeExponentialBackoff, isRetryableStatus, ProviderDeliveryError, sendThroughProvider } from "../worker/delivery.ts";

test("provider status classification keeps transient failures retryable", () => {
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
});

test("exponential backoff grows but stays bounded", () => {
  const first = computeExponentialBackoff(1, 100, 1000);
  const later = computeExponentialBackoff(4, 100, 1000);
  assert.ok(first >= 100 && first <= 120);
  assert.ok(later >= 800 && later <= 1000);
  assert.equal(computeExponentialBackoff(99, 100, 1000) <= 1000, true);
});

test("unconfigured providers fail closed without making a network request", async () => {
  await assert.rejects(
    () => sendThroughProvider("sendgrid", {}, { fromAddress: "a@example.invalid", to: ["b@example.invalid"], cc: [], bcc: [], subject: "test", text: "test" }),
    (error: unknown) => error instanceof ProviderDeliveryError && error.errorCode === "provider_not_configured" && error.retryable === false,
  );
});
