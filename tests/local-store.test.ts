import assert from "node:assert/strict";
import test from "node:test";
import { createLocalStore } from "../src/lib/localStore.ts";
import { MemoryStorageAdapter, RecoveryExportRequiredError, RecoveryNotFoundError, StorageQuotaError } from "../src/lib/storageAdapters.ts";

const userA = "00000000-0000-4000-8000-000000000011";
const userB = "00000000-0000-4000-8000-000000000012";
const pillar = "p-drive" as const;
const recordId = "00000000-0000-4000-8000-000000000101";
const blobId = "00000000-0000-4000-8000-000000000102";

function record(title: string, blobIds: string[] = []) {
  const timestamp = new Date().toISOString();
  return { id: recordId, schemaVersion: 1, title, createdAt: timestamp, updatedAt: timestamp, data: { title }, blobIds };
}
async function hash(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("stores are user-bound for records and blobs", async () => {
  const adapter = new MemoryStorageAdapter();
  const first = createLocalStore(userA, adapter);
  const second = createLocalStore(userB, adapter);
  await first.write(pillar, record("A"));
  assert.equal((await second.read(pillar, recordId)), null);
  await first.blobs.put(pillar, recordId, { id: blobId, recordId, filename: "hello.txt", mimeType: "text/plain", byteSize: 0, contentHashSha256: "", createdAt: new Date().toISOString() }, new Blob(["hello"]));
  await first.write(pillar, record("A", [blobId]));
  assert.equal(await (await first.exportBlob(pillar, recordId)).text(), "hello");
  await assert.rejects(() => second.exportBlob(pillar, recordId));
  assert.equal((await second.list(pillar)).length, 0);
  await second.remove(pillar, recordId);
  assert.equal((await first.read(pillar, recordId))?.title, "A");
});

test("binary and metadata round trips preserve bytes and normalized descriptors", async () => {
  const store = createLocalStore(userA, new MemoryStorageAdapter());
  const descriptor = await store.blobs.put(pillar, recordId, { id: blobId, recordId, filename: " folder/file.txt ", mimeType: "text/plain", byteSize: 999, contentHashSha256: "wrong", createdAt: new Date().toISOString() }, new Blob([new Uint8Array([0, 1, 255])], { type: "text/plain" }));
  assert.equal(descriptor.filename, "folder_file.txt");
  assert.equal(descriptor.byteSize, 3);
  assert.deepEqual([...new Uint8Array(await (await store.blobs.get(pillar, blobId))!.arrayBuffer())], [0, 1, 255]);
});

test("recovery identifies exact malformed, damaged, and unindexed versions", async () => {
  const adapter = new MemoryStorageAdapter();
  const store = createLocalStore(userA, adapter);
  const invalidBytes = new TextEncoder().encode("not a stored record");
  const invalidKey = "record:bad:v:version-invalid:data";
  await adapter.write({ userId: userA, pillar }, invalidKey, invalidBytes, { kind: "json" });
  await adapter.writeCommitMarker({ userId: userA, pillar }, invalidKey, { versionId: "version-invalid", dataKey: invalidKey, byteSize: invalidBytes.byteLength, sha256: await hash(invalidBytes), schemaVersion: 1 });
  const damagedKey = "record:bad:v:version-damaged:data";
  await adapter.write({ userId: userA, pillar }, damagedKey, new TextEncoder().encode("damaged"), { kind: "json" });
  await adapter.writeCommitMarker({ userId: userA, pillar }, damagedKey, { versionId: "version-damaged", dataKey: damagedKey, byteSize: 7, sha256: "0".repeat(64), schemaVersion: 1 });
  const unindexedKey = "blob:orphan:v:version-orphan:data";
  await adapter.write({ userId: userA, pillar }, unindexedKey, new Uint8Array([1, 2, 3]), { kind: "blob" });
  const entries = await store.getRecoveryEntries(pillar);
  assert.deepEqual(entries.map((entry) => entry.versionId).sort(), ["version-damaged", "version-invalid", "version-orphan"]);
  assert.equal(entries.find((entry) => entry.versionId === "version-invalid")?.kind, "invalid-schema");
  assert.equal(entries.find((entry) => entry.versionId === "version-damaged")?.kind, "hash-mismatch");
  await assert.rejects(() => store.clearAfterRecovery("version-invalid"), RecoveryExportRequiredError);
  const raw = await store.exportRaw("version-invalid");
  assert.equal(await raw.text(), "not a stored record");
  await store.clearAfterRecovery("version-invalid");
  await assert.rejects(() => store.exportRaw("version-invalid"), RecoveryNotFoundError);
});

test("P-Drive reservations enforce file and aggregate limits", async () => {
  const store = createLocalStore(userA, new MemoryStorageAdapter());
  await assert.rejects(() => store.reserveBytes(pillar, 1_073_741_824 + 1), StorageQuotaError);
  const first = await store.reserveBytes(pillar, 1_073_741_824);
  assert.equal(first.remainingBytes, 0);
  await assert.rejects(() => store.reserveBytes(pillar, 1), StorageQuotaError);
  await store.releaseBytes(pillar, first.reservationId);
  assert.equal((await store.reserveBytes(pillar, 1)).remainingBytes, 1_073_741_823);
});

test("blob replacement removes the superseded committed version", async () => {
  const store = createLocalStore(userA, new MemoryStorageAdapter());
  const createdAt = new Date().toISOString();
  await store.blobs.put(pillar, recordId, { id: blobId, recordId, filename: "file.txt", mimeType: "text/plain", byteSize: 0, contentHashSha256: "", createdAt }, new Blob(["old"]));
  await store.blobs.replace(pillar, blobId, new Blob(["new"]));
  assert.equal(await (await store.blobs.get(pillar, blobId))?.text(), "new");
  assert.equal((await store.getRecoveryEntries(pillar)).length, 0);
});
