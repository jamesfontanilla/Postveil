import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, decryptTotpSecret, encryptTotpSecret, totpCode, totpQrCode, totpUri } from "../worker/mfa.ts";

test("TOTP matches the RFC 6238 SHA-1 vector", async () => {
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(await totpCode(secret, 59_000), "287082");
  assert.equal(await totpCode(secret, 1_111_111_109_000), "081804");
});

test("TOTP base32 encoding round-trips without exposing bytes", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test("TOTP secrets are encrypted at rest and produce standard authenticator URIs", async () => {
  const encrypted = await encryptTotpSecret("test-only-encryption-key", "JBSWY3DPEHPK3PXP");
  assert.notEqual(encrypted.ciphertext, "JBSWY3DPEHPK3PXP");
  assert.equal(await decryptTotpSecret("test-only-encryption-key", encrypted.iv, encrypted.ciphertext), "JBSWY3DPEHPK3PXP");
  assert.match(totpUri("JBSWY3DPEHPK3PXP", "admin@example.com"), /^otpauth:\/\/totp\//);
});

test("authenticator provisioning URIs render as local SVG QR codes", async () => {
  const svg = await totpQrCode(totpUri("JBSWY3DPEHPK3PXP", "admin@example.com"));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /JBSWY3DPEHPK3PXP|admin@example\.com/);
});
