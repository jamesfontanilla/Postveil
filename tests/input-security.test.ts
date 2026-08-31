import assert from "node:assert/strict";
import test from "node:test";
import { isValidDomain, isValidEmailAddress, readJsonBody, RequestInputError } from "../worker/security.ts";

test("sender and recipient validation rejects malformed or unsafe addresses", () => {
  assert.equal(isValidDomain("example.com"), true);
  assert.equal(isValidDomain("bad..example.com"), false);
  assert.equal(isValidEmailAddress("person@example.com"), true);
  assert.equal(isValidEmailAddress("person+tag@example.com"), true);
  assert.equal(isValidEmailAddress("person@example"), false);
  assert.equal(isValidEmailAddress("person@@example.com"), false);
  assert.equal(isValidEmailAddress(" person@example.com "), true);
});

test("JSON request bodies are bounded and malformed JSON is rejected", async () => {
  const valid = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJsonBody(valid), { ok: true });

  const oversized = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "12345",
  });
  await assert.rejects(() => readJsonBody(oversized, 4), (error: unknown) => error instanceof RequestInputError && error.status === 413);

  const malformed = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });
  await assert.rejects(() => readJsonBody(malformed), (error: unknown) => error instanceof RequestInputError && error.status === 400);
});
