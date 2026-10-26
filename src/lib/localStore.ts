import { isStorePillar, type StorePillar } from "./pillars.ts";
import {
  createDefaultStorageAdapter,
  MemoryStorageAdapter,
  normalizeFilename,
  normalizeMimeType,
  sourceToBytes,
  StorageError,
  type StorageAdapter,
  StorageIoError,
  StorageNotFoundError,
  StorageQuotaError,
  StorageUnsupportedError,
  type StorageNamespace,
  RecoveryExportRequiredError,
  RecoveryNotFoundError,
} from "./storageAdapters.ts";
import type { BlobDescriptor, BlobStore, LocalStore, RecoveryEntry, Reservation, StoredRecord } from "./localStoreTypes.ts";

const DRIVE_LIMIT = 1_073_741_824;
const FILE_LIMIT = 250 * 1024 * 1024;
const RESERVATION_TTL_MS = 60 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_STORE_PILLARS: StorePillar[] = ["p-meet", "p-chat", "p-sheets", "p-deck", "p-draw", "p-voice", "p-drive", "p-studio", "p-pdf", "p-record", "p-sign", "p-forms", "p-books", "p-crm", "p-sites", "p-automate"];
type Marker = { versionId: string; dataKey: string; byteSize: number; sha256: string; schemaVersion: number };
type IndexValue = { type: "record" | "blob"; id: string; dataKey: string; versionId: string; descriptor?: BlobDescriptor };

function now() { return new Date().toISOString(); }
function newId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`; }
function assertId(id: string, label: string) { if (typeof id !== "string" || !ID_PATTERN.test(id) || id === "." || id === "..") throw new StorageIoError(`Invalid ${label}`); }
function assertUserId(id: string) { if (!(UUID_PATTERN.test(id) || /^[A-Za-z0-9_-]{22,86}$/.test(id))) throw new StorageIoError("Invalid user namespace"); }
function assertPillar(pillar: StorePillar) { if (!isStorePillar(pillar)) throw new StorageIoError("Invalid local storage pillar"); }
function ns(userId: string, pillar: StorePillar): StorageNamespace { assertUserId(userId); assertPillar(pillar); return { userId, pillar }; }
function recordKey(id: string, versionId: string) { return `record:${id}:v:${versionId}:data`; }
function blobKey(id: string, versionId: string) { return `blob:${id}:v:${versionId}:data`; }
function markerKey(dataKey: string) { return `${dataKey}:commit`; }
function indexKey(kind: "record" | "blob", id: string) { return `index:${kind}:${id}`; }
function jsonBytes(value: unknown) { try { return new TextEncoder().encode(JSON.stringify(value)); } catch { throw new StorageIoError("Local JSON serialization failed"); } }
function componentFromEncodedKey(key: string): string | null {
  const encoded = key.split("/").pop(); if (!encoded) return null;
  try { const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4); return atob(padded); } catch { return null; }
}
function keyVersion(key: string, kind: "record" | "blob") { const match = key.match(new RegExp(`^${kind}:([^:]+):v:([^:]+):data$`)); return match ? { id: match[1], versionId: match[2] } : null; }
function isRecordShape(value: unknown, userId: string, pillar: StorePillar): value is StoredRecord<unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredRecord<unknown>>;
  return record.userId === userId && record.pillar === pillar && typeof record.id === "string" && typeof record.schemaVersion === "number" && typeof record.title === "string" && typeof record.createdAt === "string" && typeof record.updatedAt === "string" && Array.isArray(record.blobIds) && "data" in record;
}
async function hash(bytes: Uint8Array) {
  try { const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); } catch { throw new StorageIoError("Local content hash failed"); }
}
async function readJson<T>(adapter: StorageAdapter, namespace: StorageNamespace, key: string): Promise<T | null> {
  const read = await adapter.read(namespace, key); if (!read) return null;
  try { return JSON.parse(new TextDecoder().decode(await read.bytes())) as T; } catch { return null; }
}
function rethrow(error: unknown): never { if (error instanceof StorageError) throw error; throw new StorageIoError("Local storage operation failed"); }

export function createLocalStore(userId: string, injectedAdapter?: StorageAdapter): LocalStore {
  assertUserId(userId);
  const adapter = injectedAdapter || createDefaultStorageAdapter();
  const exported = new Set<string>();
  const committed = (pillar: StorePillar, kind: "record" | "blob", id?: string) => adapter.listCommitted(ns(userId, pillar), id ? `${kind}:${id}:` : `${kind}:`);

  async function readLatest<T>(pillar: StorePillar, id: string): Promise<StoredRecord<T> | null> {
    assertPillar(pillar); assertId(id, "record ID");
    const versions = (await committed(pillar, "record", id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const version of versions) {
      try {
        const read = await adapter.read(ns(userId, pillar), version.marker.dataKey); if (!read) continue;
        const record = JSON.parse(new TextDecoder().decode(await read.bytes())) as StoredRecord<T>;
        if (isRecordShape(record, userId, pillar) && record.id === id) return record;
      } catch { /* invalid committed versions are reported by recovery */ }
    }
    return null;
  }

  async function writeRecord<T>(pillar: StorePillar, record: Omit<StoredRecord<T>, "userId" | "pillar">): Promise<StoredRecord<T>> {
    assertPillar(pillar); assertId(record.id, "record ID");
    const value: StoredRecord<T> = { ...record, userId, pillar, blobIds: [...record.blobIds] };
    const bytes = jsonBytes(value); const versionId = newId(); const dataKey = recordKey(record.id, versionId); const namespace = ns(userId, pillar);
    return adapter.withNamespaceLock(namespace, async () => {
      try {
        await adapter.write(namespace, dataKey, bytes, { kind: "json" });
        await adapter.writeCommitMarker(namespace, dataKey, { versionId, dataKey, byteSize: bytes.byteLength, sha256: await hash(bytes), schemaVersion: record.schemaVersion });
        await adapter.write(namespace, indexKey("record", record.id), jsonBytes({ type: "record", id: record.id, dataKey, versionId } satisfies IndexValue), { kind: "index" });
        return value;
      } catch (error) { return rethrow(error); }
    });
  }

  async function descriptors(pillar: StorePillar): Promise<BlobDescriptor[]> {
    const namespace = ns(userId, pillar); const output: BlobDescriptor[] = [];
    for (const entry of await adapter.list(namespace, "index:blob:")) {
      const component = componentFromEncodedKey(entry.key); if (!component) continue;
      const value = await readJson<IndexValue>(adapter, namespace, component);
      if (value?.descriptor && value.descriptor.userId === userId && value.descriptor.pillar === pillar) output.push(value.descriptor);
    }
    return output;
  }
  async function usage(pillar: StorePillar): Promise<number> {
    const namespace = ns(userId, pillar); let total = (await descriptors(pillar)).reduce((sum, item) => sum + item.byteSize, 0);
    for (const entry of await adapter.list(namespace, "quota:reservation:")) {
      const component = componentFromEncodedKey(entry.key); if (!component) continue;
      const reservation = await readJson<Reservation>(adapter, namespace, component); if (!reservation) continue;
      if (Date.parse(reservation.expiresAt) <= Date.now()) await adapter.delete(namespace, component); else total += reservation.bytes;
    }
    return total;
  }
  async function reserve(pillar: StorePillar, bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new StorageQuotaError("Reservation size is invalid");
    const limit = pillar === "p-drive" ? DRIVE_LIMIT : Number.MAX_SAFE_INTEGER; const used = await usage(pillar);
    if (used + bytes > limit) throw new StorageQuotaError("P-Drive quota exceeded");
    const reservationId = newId();
    await adapter.write(ns(userId, pillar), `quota:reservation:${reservationId}`, jsonBytes({ reservationId, userId, pillar, bytes, createdAt: now(), expiresAt: new Date(Date.now() + RESERVATION_TTL_MS).toISOString() } satisfies Reservation), { kind: "index" });
    return { reservationId, usedBytes: used + bytes, remainingBytes: limit - used - bytes };
  }
  async function release(pillar: StorePillar, reservationId: string) { assertId(reservationId, "reservation ID"); await adapter.delete(ns(userId, pillar), `quota:reservation:${reservationId}`); }
  async function blobIndex(pillar: StorePillar, id: string) { assertPillar(pillar); assertId(id, "blob ID"); return readJson<IndexValue>(adapter, ns(userId, pillar), indexKey("blob", id)); }

  async function putBlob(pillar: StorePillar, recordId: string, descriptor: Omit<BlobDescriptor, "userId" | "pillar">, blob: Blob, heldReservationId?: string | null): Promise<BlobDescriptor> {
    assertPillar(pillar); assertId(recordId, "record ID"); assertId(descriptor.id, "blob ID"); const bytes = await sourceToBytes(blob);
    if (pillar === "p-drive" && bytes.byteLength > FILE_LIMIT) throw new StorageQuotaError("P-Drive files are limited to 250 MiB");
    const normalized: BlobDescriptor = { ...descriptor, userId, pillar, recordId, filename: normalizeFilename(descriptor.filename), mimeType: normalizeMimeType(descriptor.mimeType), byteSize: bytes.byteLength, contentHashSha256: await hash(bytes), createdAt: descriptor.createdAt || now() };
    const namespace = ns(userId, pillar); const reservationId = heldReservationId === undefined ? (await reserve(pillar, bytes.byteLength)).reservationId : (heldReservationId || ""); const versionId = newId(); const dataKey = blobKey(descriptor.id, versionId);
    try {
      await adapter.write(namespace, dataKey, bytes, { kind: "blob" });
      await adapter.writeCommitMarker(namespace, dataKey, { versionId, dataKey, byteSize: bytes.byteLength, sha256: normalized.contentHashSha256, schemaVersion: 1 });
      await adapter.write(namespace, indexKey("blob", descriptor.id), jsonBytes({ type: "blob", id: descriptor.id, dataKey, versionId, descriptor: normalized } satisfies IndexValue), { kind: "index" });
      if (reservationId) await release(pillar, reservationId); return normalized;
    } catch (error) { if (reservationId) await release(pillar, reservationId).catch(() => undefined); return rethrow(error); }
  }

  const blobs: BlobStore = {
    put: (pillar, recordId, descriptor, blob) => adapter.withNamespaceLock(ns(userId, pillar), () => putBlob(pillar, recordId, descriptor, blob)),
    get: async (pillar, id) => { const index = await blobIndex(pillar, id); if (!index) return null; const read = await adapter.read(ns(userId, pillar), index.dataKey); return read ? new Blob([new Uint8Array(await read.bytes()).buffer as ArrayBuffer], { type: index.descriptor?.mimeType || "application/octet-stream" }) : null; },
    replace: (pillar, id, blob) => adapter.withNamespaceLock(ns(userId, pillar), async () => {
      const existing = await blobIndex(pillar, id); if (!existing?.descriptor) throw new StorageNotFoundError("Blob was not found");
      const bytes = await sourceToBytes(blob); const delta = bytes.byteLength - existing.descriptor.byteSize; const reservationId = delta > 0 ? (await reserve(pillar, delta)).reservationId : null;
      try {
        const result = await putBlob(pillar, existing.descriptor.recordId, { ...existing.descriptor, id }, blob, reservationId);
        if (reservationId) await release(pillar, reservationId);
        const namespace = ns(userId, pillar);
        if (existing.dataKey !== (await blobIndex(pillar, id))?.dataKey) {
          await adapter.delete(namespace, existing.dataKey);
          await adapter.delete(namespace, markerKey(existing.dataKey));
        }
        return result;
      } catch (error) { if (reservationId) await release(pillar, reservationId).catch(() => undefined); return rethrow(error); }
    }),
    remove: (pillar, id) => adapter.withNamespaceLock(ns(userId, pillar), async () => { if (!(await blobIndex(pillar, id))) return; const namespace = ns(userId, pillar); await adapter.delete(namespace, indexKey("blob", id)); for (const entry of await adapter.list(namespace, `blob:${id}:`)) { const component = componentFromEncodedKey(entry.key); if (component) await adapter.delete(namespace, component); } }),
  };

  async function recovery(pillar: StorePillar): Promise<RecoveryEntry[]> {
    const namespace = ns(userId, pillar); const result: RecoveryEntry[] = [];
    for (const kind of ["record", "blob"] as const) {
      const markerEntries = await committed(pillar, kind); const markers = new Map(markerEntries.map((entry) => [entry.marker.dataKey, entry.marker]));
      const indexedIds = new Set<string>();
      for (const entry of await adapter.list(namespace, `index:${kind}:`)) { const component = componentFromEncodedKey(entry.key); const match = component?.match(new RegExp(`^index:${kind}:([^:]+)$`)); if (match) indexedIds.add(match[1]); }
      for (const entry of await adapter.list(namespace, `${kind}:`)) {
        const component = componentFromEncodedKey(entry.key); if (!component || !component.endsWith(":data")) continue; const identity = keyVersion(component, kind); if (!identity) continue;
        const read = await adapter.read(namespace, component); if (!read) continue; const bytes = await read.bytes(); const marker = markers.get(component); let item: RecoveryEntry | null = null;
        if (!marker) item = { entryId: newId(), pillar, recordId: kind === "record" ? identity.id : null, versionId: identity.versionId, path: component, kind: "unindexed", byteSize: bytes.byteLength, hashStatus: "not-checked", contentHashSha256: null, exportState: exported.has(identity.versionId) ? "exported" : "not-exported" };
        else if (marker.byteSize !== bytes.byteLength || marker.sha256 !== await hash(bytes)) item = { entryId: newId(), pillar, recordId: kind === "record" ? identity.id : null, versionId: marker.versionId, path: component, kind: "hash-mismatch", byteSize: bytes.byteLength, hashStatus: "mismatch", contentHashSha256: marker.sha256 || null, exportState: exported.has(marker.versionId) ? "exported" : "not-exported" };
        else if (kind === "record") { try { if (!isRecordShape(JSON.parse(new TextDecoder().decode(bytes)), userId, pillar)) throw new Error(); } catch { item = { entryId: newId(), pillar, recordId: identity.id, versionId: marker.versionId, path: component, kind: "invalid-schema", byteSize: bytes.byteLength, hashStatus: "valid", contentHashSha256: marker.sha256, exportState: exported.has(marker.versionId) ? "exported" : "not-exported" }; } }
        if (!item && !indexedIds.has(identity.id)) item = { entryId: newId(), pillar, recordId: kind === "record" ? identity.id : null, versionId: marker?.versionId || identity.versionId, path: component, kind: "unindexed", byteSize: bytes.byteLength, hashStatus: marker ? "valid" : "not-checked", contentHashSha256: marker?.sha256 || null, exportState: exported.has(marker?.versionId || identity.versionId) ? "exported" : "not-exported" };
        if (item) result.push(item);
      }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path) || a.versionId.localeCompare(b.versionId));
  }

  async function findRecoveryVersion(versionId: string): Promise<{ entry: RecoveryEntry; namespace: StorageNamespace } | null> {
    for (const pillar of ALL_STORE_PILLARS) {
      const entry = (await recovery(pillar)).find((candidate) => candidate.versionId === versionId);
      if (entry) return { entry, namespace: ns(userId, pillar) };
    }
    return null;
  }

  const store: LocalStore = {
    userId,
    read: readLatest,
    write: writeRecord,
    remove: (pillar, id) => adapter.withNamespaceLock(ns(userId, pillar), async () => { assertId(id, "record ID"); const namespace = ns(userId, pillar); await adapter.delete(namespace, indexKey("record", id)); for (const entry of await adapter.list(namespace, `record:${id}:`)) { const component = componentFromEncodedKey(entry.key); if (component) await adapter.delete(namespace, component); } }),
    list: async <T>(pillar: StorePillar) => { const ids = new Set<string>(); for (const entry of await committed(pillar, "record")) { const identity = keyVersion(entry.marker.dataKey, "record"); if (identity) ids.add(identity.id); } const result: Array<StoredRecord<T>> = []; for (const id of ids) { const record = await readLatest<T>(pillar, id); if (record) result.push(record); } return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    exportBlob: async (pillar, id) => { const record = await readLatest<unknown>(pillar, id); if (!record) throw new StorageNotFoundError("Record was not found"); for (const blobId of record.blobIds) { const blob = await blobs.get(pillar, blobId); if (blob) return blob; } throw new StorageNotFoundError("Referenced blob was not found"); },
    exportRaw: async (versionId) => {
      assertId(versionId, "version ID");
      const match = await findRecoveryVersion(versionId);
      if (!match) throw new RecoveryNotFoundError();
      const read = await adapter.read(match.namespace, match.entry.path);
      if (!read) throw new RecoveryNotFoundError();
      const bytes = await read.bytes();
      exported.add(versionId);
      return new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: match.entry.path.startsWith("record:") ? "application/json" : "application/octet-stream" });
    },
    clearAfterRecovery: async (versionId) => {
      assertId(versionId, "version ID");
      if (!exported.has(versionId)) throw new RecoveryExportRequiredError();
      const match = await findRecoveryVersion(versionId);
      if (!match) { exported.delete(versionId); throw new RecoveryNotFoundError(); }
      await adapter.delete(match.namespace, match.entry.path);
      await adapter.delete(match.namespace, markerKey(match.entry.path));
      exported.delete(versionId);
    },
    getRecoveryEntries: recovery,
    getUsage: async (pillar) => { assertPillar(pillar); return { usedBytes: await usage(pillar), limitBytes: pillar === "p-drive" ? DRIVE_LIMIT : Number.MAX_SAFE_INTEGER }; },
    reserveBytes: (pillar, bytes) => adapter.withNamespaceLock(ns(userId, pillar), () => reserve(pillar, bytes)),
    releaseBytes: (pillar, id) => adapter.withNamespaceLock(ns(userId, pillar), () => release(pillar, id)),
    blobs,
  };
  return store;
}

export { DRIVE_LIMIT as P_DRIVE_QUOTA_BYTES, FILE_LIMIT as P_DRIVE_FILE_LIMIT_BYTES, MemoryStorageAdapter, StorageError, StorageNotFoundError, StorageQuotaError, StorageUnsupportedError, StorageIoError, RecoveryExportRequiredError, RecoveryNotFoundError };
