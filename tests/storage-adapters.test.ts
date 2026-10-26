import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryStorageAdapter,
  StorageConflictError,
  StorageUnsupportedError,
  encodeStorageKey,
  sourceToBytes,
} from "../src/lib/storageAdapters.ts";

const user = "00000000-0000-4000-8000-000000000001";
const otherUser = "00000000-0000-4000-8000-000000000002";
const ns = { userId: user, pillar: "p-drive" as const };

test("memory adapter isolates namespaces and hides uncommitted data", async () => {
  const adapter = new MemoryStorageAdapter();
  await adapter.write(ns, "record:item:data", new TextEncoder().encode("value"), { kind: "json" });
  assert.deepEqual(await adapter.listCommitted(ns, "record:"), []);
  await adapter.writeCommitMarker(ns, "record:item:data", { versionId: "version-1", dataKey: "record:item:data", byteSize: 5, sha256: "hash", schemaVersion: 1 });
  assert.equal((await adapter.listCommitted(ns, "record:")).length, 1);
  assert.equal(await adapter.read({ userId: otherUser, pillar: "p-drive" }, "record:item:data"), null);
  assert.notEqual(encodeStorageKey(ns, "record:item:data"), encodeStorageKey({ userId: otherUser, pillar: "p-drive" }, "record:item:data"));
});

test("adapter consumes binary sources and serializes namespace writers", async () => {
  const adapter = new MemoryStorageAdapter();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); controller.close(); } });
  assert.deepEqual([...await sourceToBytes(stream)], [1, 2, 3]);
  const order: number[] = [];
  await Promise.all([
    adapter.withNamespaceLock(ns, async () => { await new Promise((resolve) => setTimeout(resolve, 5)); order.push(1); }),
    adapter.withNamespaceLock(ns, async () => { order.push(2); }),
  ]);
  assert.deepEqual(order, [1, 2]);
});

test("ifVersion conflicts and localStorage rejects binary data", async () => {
  const adapter = new MemoryStorageAdapter();
  const entry = await adapter.write(ns, "record:item:data", new TextEncoder().encode("one"), { kind: "json" });
  await assert.rejects(() => adapter.write(ns, "record:item:data", new TextEncoder().encode("two"), { kind: "json", ifVersion: "wrong" }), StorageConflictError);
  const local = new (await import("../src/lib/storageAdapters.ts")).LocalStorageAdapter();
  await assert.rejects(() => local.write(ns, "blob:x", new Blob(["x"]), { kind: "blob" }), StorageUnsupportedError);
  assert.ok(entry.updatedAt);
});
