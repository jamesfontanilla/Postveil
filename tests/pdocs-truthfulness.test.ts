import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDocumentSignatures, normalizeSignatureMetadata, type UniversalDoc } from "../src/components/docs/types.ts";
import { nativePdocCodec } from "../src/components/docs/formats/nativePdocCodec.ts";
import { OpfsDocStorage } from "../src/components/docs/engine/OpfsDocStorage.ts";

const legacy = { id: "sig-1", signerName: "A", signerEmail: "a@example.com", publicKey: "legacy-key", signatureBase64: "legacy-signature", documentHashSha256: "a".repeat(64), timestamp: "2026-01-01T00:00:00Z", algorithm: "Ed25519" as const };
const doc: UniversalDoc = { metadata: { id: "doc-1", title: "Test", author: "A", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", version: 1, wordCount: 0, charCount: 0, readingTimeMinutes: 0, paperSize: "A4", orientation: "portrait", lineSpacing: "1.15", fontFamily: "sans-serif", fontSize: 15, isEncrypted: false, signatures: [legacy as unknown as import("../src/components/docs/types.ts").SignatureMetadata] }, blocks: [] };

test("legacy signature metadata is normalized only as unverified", () => {
  const signature = normalizeSignatureMetadata(legacy);
  assert.equal(signature?.kind, "unverified");
  assert.equal(signature?.status, "unverified");
  assert.equal(normalizeSignatureMetadata({ ...legacy, publicKey: 12 }), null);
  assert.equal((normalizeDocumentSignatures(doc).metadata.signatures?.[0] as { reason?: string } | undefined)?.reason, "legacy-signature-metadata");
});

test("native pdoc round-trips signature metadata without verification claims", async () => {
  const exported = await nativePdocCodec.export(doc);
  const imported = await nativePdocCodec.import(exported.data);
  assert.deepEqual(imported.metadata.signatures, normalizeDocumentSignatures(doc).metadata.signatures);
  assert.match(String(exported.data), /signatureMetadata/);
  assert.doesNotMatch(String(exported.data), /signatureStandard/);
});

test("local document save reports a confirmed medium", async () => {
  const previousStorage = (globalThis as Record<string, unknown>).localStorage;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) || null, removeItem: (key: string) => values.delete(key) } });
  const result = await OpfsDocStorage.saveDocumentLocally(doc);
  assert.equal(result.status, "saved");
  if (result.status === "saved") assert.equal(result.medium, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage });
});
