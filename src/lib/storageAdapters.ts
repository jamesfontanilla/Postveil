import type { StorePillar } from "./pillars.ts";
import type { Reservation } from "./localStoreTypes.ts";

export interface StorageNamespace {
  userId: string;
  pillar: StorePillar;
}

export type StorageSource = Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;
export type StorageKind = "json" | "blob" | "marker" | "index";

export interface StorageEntry {
  key: string;
  kind: StorageKind;
  byteSize: number;
  updatedAt: string;
}

export interface StorageRead {
  entry: StorageEntry;
  bytes(): Promise<Uint8Array>;
  stream(): ReadableStream<Uint8Array>;
}

export interface CommitMarker {
  versionId: string;
  dataKey: string;
  byteSize: number;
  sha256: string;
  schemaVersion: number;
}

export interface StorageAdapter {
  list(ns: StorageNamespace, prefix?: string): Promise<StorageEntry[]>;
  read(ns: StorageNamespace, key: string): Promise<StorageRead | null>;
  write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }): Promise<StorageEntry>;
  delete(ns: StorageNamespace, key: string): Promise<void>;
  writeCommitMarker(ns: StorageNamespace, key: string, marker: CommitMarker): Promise<void>;
  listCommitted(ns: StorageNamespace, prefix?: string): Promise<Array<StorageEntry & { marker: CommitMarker }>>;
  withNamespaceLock<T>(ns: StorageNamespace, operation: () => Promise<T>): Promise<T>;
}

export class StorageError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}
export class StorageUnsupportedError extends StorageError {
  constructor(message = "No supported local storage medium is available") { super(message, "unsupported"); }
}
export class StorageQuotaError extends StorageError {
  constructor(message = "Local storage quota exceeded") { super(message, "quota"); }
}
export class StorageIoError extends StorageError {
  constructor(message = "Local storage operation failed") { super(message, "io"); }
}
export class StorageNotFoundError extends StorageError {
  constructor(message = "Local storage entry was not found") { super(message, "not-found"); }
}
export class StorageConflictError extends StorageError {
  constructor(message = "Local storage operation conflicted with another writer") { super(message, "conflict"); }
}
export class RecoveryExportRequiredError extends StorageError {
  constructor(message = "Export the exact recovery version before clearing it") { super(message, "recovery-export-required"); }
}
export class RecoveryNotFoundError extends StorageError {
  constructor(message = "Recovery version was not found") { super(message, "recovery-not-found"); }
}

const STORE_PILLARS = new Set<string>([
  "p-meet", "p-chat", "p-sheets", "p-deck", "p-draw", "p-voice", "p-drive", "p-studio",
  "p-pdf", "p-record", "p-sign", "p-forms", "p-books", "p-crm", "p-sites", "p-automate",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]{22,86}$/;
const CONTROL_OR_SEPARATOR = /[\u0000-\u001f\u007f/\\]/;

export function isValidUserId(userId: string): boolean {
  return UUID.test(userId) || BASE64URL.test(userId);
}

export function validateStorageNamespace(ns: StorageNamespace): void {
  if (!isValidUserId(ns.userId)) throw new StorageIoError("Invalid user namespace");
  if (!STORE_PILLARS.has(ns.pillar)) throw new StorageIoError("Invalid storage pillar");
}

function validateComponent(component: string): void {
  if (!component || component === "." || component === ".." || CONTROL_OR_SEPARATOR.test(component) || new TextEncoder().encode(component).byteLength > 128) {
    throw new StorageIoError("Invalid storage key component");
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

export function encodeStorageKey(ns: StorageNamespace, component: string): string {
  validateStorageNamespace(ns);
  validateComponent(component);
  return `postveil/v1/${base64url(new TextEncoder().encode(ns.userId))}/${ns.pillar}/${base64url(new TextEncoder().encode(component))}`;
}

export function normalizeFilename(filename: string): string {
  const source = filename.normalize("NFC").trim();
  if (/[\u0000-\u001f\u007f]/.test(source)) throw new StorageIoError("Invalid filename");
  const normalized = source.replace(/[\\/]/g, "_");
  const safe = normalized === "." || normalized === ".." ? "attachment" : normalized;
  return new TextEncoder().encode(safe).byteLength > 255 ? new TextDecoder().decode(new TextEncoder().encode(safe).slice(0, 255)) : (safe || "attachment");
}

export function normalizeMimeType(mimeType: string): string {
  if (!mimeType || mimeType.length > 128 || !/^[\x20-\x7e]+$/.test(mimeType)) throw new StorageIoError("Invalid MIME type");
  return mimeType;
}

export async function sourceToBytes(source: StorageSource): Promise<Uint8Array> {
  try {
    if (source instanceof Uint8Array) return new Uint8Array(source);
    if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
    if (typeof Blob !== "undefined" && source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    if ("getReader" in source && typeof source.getReader === "function") {
      const reader = (source as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = new Uint8Array(next.value);
        chunks.push(chunk);
        total += chunk.byteLength;
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    }
    throw new StorageIoError("Storage source could not be read");
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageIoError("Storage source could not be read");
  }
}

function streamFor(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
}

function componentFromMemoryKey(key: string): string | null {
  const encoded = key.split("/").pop();
  if (!encoded) return null;
  try { return fromBase64url(encoded); } catch { return null; }
}

interface StoredBytes { entry: StorageEntry; bytes: Uint8Array; }

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly entries = new Map<string, StoredBytes>();
  private readonly locks = new Map<string, Promise<void>>();

  private fullKey(ns: StorageNamespace, key: string): string { return encodeStorageKey(ns, key); }
  private namespacePrefix(ns: StorageNamespace): string { return `postveil/v1/${base64url(new TextEncoder().encode(ns.userId))}/${ns.pillar}/`; }

  async list(ns: StorageNamespace, prefix = ""): Promise<StorageEntry[]> {
    validateStorageNamespace(ns);
    const encodedPrefix = this.namespacePrefix(ns);
    return [...this.entries.values()]
      .filter(({ entry }) => {
        if (!entry.key.startsWith(encodedPrefix)) return false;
        const encodedComponent = entry.key.slice(encodedPrefix.length);
        try {
          const decoded = fromBase64url(encodedComponent);
          return decoded.startsWith(prefix);
        } catch {
          return false;
        }
      })
      .map(({ entry }) => ({ ...entry }));
  }
  async read(ns: StorageNamespace, key: string): Promise<StorageRead | null> {
    const full = this.fullKey(ns, key);
    const stored = this.entries.get(full);
    if (!stored) return null;
    const bytes = new Uint8Array(stored.bytes);
    return { entry: { ...stored.entry }, bytes: async () => new Uint8Array(bytes), stream: () => streamFor(bytes) };
  }
  async write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }): Promise<StorageEntry> {
    const full = this.fullKey(ns, key);
    const existing = this.entries.get(full);
    if (options.ifVersion && (!existing || existing.entry.updatedAt !== options.ifVersion)) throw new StorageConflictError();
    const bytes = await sourceToBytes(source);
    const entry: StorageEntry = { key: full, kind: options.kind, byteSize: bytes.byteLength, updatedAt: new Date().toISOString() };
    this.entries.set(full, { entry, bytes });
    return { ...entry };
  }
  async delete(ns: StorageNamespace, key: string): Promise<void> { this.entries.delete(this.fullKey(ns, key)); }
  async writeCommitMarker(ns: StorageNamespace, key: string, marker: CommitMarker): Promise<void> {
    await this.write(ns, `${key}:commit`, new TextEncoder().encode(JSON.stringify(marker)), { kind: "marker" });
  }
  async listCommitted(ns: StorageNamespace, prefix = ""): Promise<Array<StorageEntry & { marker: CommitMarker }>> {
    const result: Array<StorageEntry & { marker: CommitMarker }> = [];
    const entries = await this.list(ns, prefix);
    for (const entry of entries.filter((item) => {
      const component = componentFromMemoryKey(item.key);
      return item.kind === "marker" && Boolean(component?.endsWith(":commit"));
    })) {
      const read = await this.readEncoded(entry);
      if (!read) continue;
      try {
        const marker = JSON.parse(new TextDecoder().decode(read.bytes)) as CommitMarker;
        const data = await this.read(ns, marker.dataKey);
        if (data && marker.versionId && marker.dataKey && Number.isSafeInteger(marker.byteSize) && typeof marker.sha256 === "string") {
          result.push({ ...data.entry, marker });
        }
      } catch { /* Invalid markers stay available to recovery scanners. */ }
    }
    return result;
  }
  private async readEncoded(entry: StorageEntry): Promise<{ bytes: Uint8Array } | null> {
    const stored = this.entries.get(entry.key);
    return stored ? { bytes: new Uint8Array(stored.bytes) } : null;
  }
  async withNamespaceLock<T>(ns: StorageNamespace, operation: () => Promise<T>): Promise<T> {
    validateStorageNamespace(ns);
    const lockKey = `${ns.userId}:${ns.pillar}`;
    const previous = this.locks.get(lockKey) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(lockKey, queued);
    await previous;
    try { return await operation(); } finally { release(); if (this.locks.get(lockKey) === queued) this.locks.delete(lockKey); }
  }
}
export const InMemoryStorageAdapter = MemoryStorageAdapter;
export function createMemoryStorageAdapter(): StorageAdapter { return new MemoryStorageAdapter(); }

class BrowserStorageAdapterBase implements StorageAdapter {
  protected readonly memory = new MemoryStorageAdapter();
  async list(ns: StorageNamespace, prefix?: string) { return this.memory.list(ns, prefix); }
  async read(ns: StorageNamespace, key: string) { return this.memory.read(ns, key); }
  async write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }) { return this.memory.write(ns, key, source, options); }
  async delete(ns: StorageNamespace, key: string) { return this.memory.delete(ns, key); }
  async writeCommitMarker(ns: StorageNamespace, key: string, marker: CommitMarker) { await this.write(ns, `${key}:commit`, new TextEncoder().encode(JSON.stringify(marker)), { kind: "marker" }); }
  async listCommitted(ns: StorageNamespace, prefix = "") {
    const result: Array<StorageEntry & { marker: CommitMarker }> = [];
    for (const entry of await this.list(ns, prefix)) {
      const component = componentFromMemoryKey(entry.key);
      if (entry.kind !== "marker" || !component?.endsWith(":commit")) continue;
      const markerEntry = await this.read(ns, component);
      if (!markerEntry) continue;
      try {
        const marker = JSON.parse(new TextDecoder().decode(await markerEntry.bytes())) as CommitMarker;
        const data = await this.read(ns, marker.dataKey);
        if (data && marker.versionId && marker.dataKey && Number.isSafeInteger(marker.byteSize) && typeof marker.sha256 === "string") result.push({ ...data.entry, marker });
      } catch { /* malformed markers remain visible to recovery scanners */ }
    }
    return result;
  }
  async withNamespaceLock<T>(ns: StorageNamespace, operation: () => Promise<T>) { return this.memory.withNamespaceLock(ns, operation); }
}

type BrowserPayload = { entry: StorageEntry; data: string };

function bytesFromBase64url(value: string): Uint8Array {
  const binary = fromBase64url(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function keyFileName(key: string): string { return `${base64url(new TextEncoder().encode(key))}.json`; }

export class OpfsStorageAdapter extends BrowserStorageAdapterBase {
  static isSupported(): boolean { return typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage.getDirectory === "function"; }
  private async directory(ns: StorageNamespace, create: boolean): Promise<FileSystemDirectoryHandle> {
    validateStorageNamespace(ns);
    if (!OpfsStorageAdapter.isSupported()) throw new StorageUnsupportedError();
    try {
      const root = await navigator.storage.getDirectory();
      const postveil = await root.getDirectoryHandle("postveil", { create: true });
      const version = await postveil.getDirectoryHandle("v1", { create: true });
      const user = await version.getDirectoryHandle(base64url(new TextEncoder().encode(ns.userId)), { create });
      return user.getDirectoryHandle(ns.pillar, { create });
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageIoError("OPFS directory is unavailable");
    }
  }
  private async payload(ns: StorageNamespace, key: string): Promise<BrowserPayload | null> {
    const directory = await this.directory(ns, false).catch((error) => {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      throw error;
    });
    if (!directory) return null;
    try {
      const file = await (await directory.getFileHandle(keyFileName(encodeStorageKey(ns, key)))).getFile();
      return JSON.parse(await file.text()) as BrowserPayload;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      throw new StorageIoError("OPFS entry is malformed");
    }
  }
  async list(ns: StorageNamespace, prefix = ""): Promise<StorageEntry[]> {
    const directory = await this.directory(ns, false).catch((error) => {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      throw error;
    });
    if (!directory) return [];
    const entries: StorageEntry[] = [];
    // FileSystemDirectoryHandle.entries() is available in browsers implementing OPFS.
    // @ts-ignore Browser OPFS typings vary across TypeScript DOM versions.
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".json")) continue;
      try {
        const file = await handle.getFile();
        const payload = JSON.parse(await file.text()) as BrowserPayload;
        if (payload.entry.key && payload.entry.key.includes(`/${ns.pillar}/`)) {
          const component = componentFromMemoryKey(payload.entry.key);
          if (component?.startsWith(prefix)) entries.push(payload.entry);
        }
      } catch { /* malformed files remain inaccessible until a future diagnostic scanner */ }
    }
    return entries;
  }
  async read(ns: StorageNamespace, key: string): Promise<StorageRead | null> {
    const payload = await this.payload(ns, key);
    if (!payload) return null;
    const bytes = bytesFromBase64url(payload.data);
    return { entry: payload.entry, bytes: async () => new Uint8Array(bytes), stream: () => streamFor(bytes) };
  }
  async write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }): Promise<StorageEntry> {
    const fullKey = encodeStorageKey(ns, key);
    const existing = await this.read(ns, key);
    if (options.ifVersion && (!existing || existing.entry.updatedAt !== options.ifVersion)) throw new StorageConflictError();
    const bytes = await sourceToBytes(source);
    const entry: StorageEntry = { key: fullKey, kind: options.kind, byteSize: bytes.byteLength, updatedAt: new Date().toISOString() };
    const directory = await this.directory(ns, true);
    try {
      const handle = await directory.getFileHandle(keyFileName(fullKey), { create: true });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify({ entry, data: base64url(bytes) } satisfies BrowserPayload));
      await writable.close();
      return entry;
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw new StorageQuotaError();
      throw new StorageIoError("OPFS write failed");
    }
  }
  async delete(ns: StorageNamespace, key: string): Promise<void> {
    const directory = await this.directory(ns, false).catch((error) => {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      throw error;
    });
    if (!directory) return;
    try { await directory.removeEntry(keyFileName(encodeStorageKey(ns, key))); } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw new StorageIoError("OPFS delete failed");
    }
  }
}
export class IndexedDbStorageAdapter extends BrowserStorageAdapterBase {
  static isSupported(): boolean { return typeof indexedDB !== "undefined"; }
  private async database(): Promise<IDBDatabase> {
    if (!IndexedDbStorageAdapter.isSupported()) throw new StorageUnsupportedError();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("postveil-v1", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("entries")) request.result.createObjectStore("entries", { keyPath: "key" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new StorageIoError("IndexedDB could not be opened"));
    });
  }
  private async value(ns: StorageNamespace, key: string): Promise<{ entry: StorageEntry; data: ArrayBuffer } | null> {
    validateStorageNamespace(ns);
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const request = db.transaction("entries", "readonly").objectStore("entries").get(encodeStorageKey(ns, key));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new StorageIoError("IndexedDB read failed"));
    });
  }
  async list(ns: StorageNamespace, prefix = ""): Promise<StorageEntry[]> {
    validateStorageNamespace(ns); const db = await this.database();
    return new Promise((resolve, reject) => {
      const request = db.transaction("entries", "readonly").objectStore("entries").getAll();
      request.onsuccess = () => resolve((request.result as Array<{ entry: StorageEntry }>).map((item) => item.entry).filter((entry) => {
        const component = componentFromMemoryKey(entry.key);
        return entry.key.includes(`/${ns.pillar}/`) && Boolean(component?.startsWith(prefix));
      }));
      request.onerror = () => reject(new StorageIoError("IndexedDB list failed"));
    });
  }
  async read(ns: StorageNamespace, key: string): Promise<StorageRead | null> {
    const value = await this.value(ns, key); if (!value) return null;
    const bytes = new Uint8Array(value.data);
    return { entry: value.entry, bytes: async () => new Uint8Array(bytes), stream: () => streamFor(bytes) };
  }
  async write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }): Promise<StorageEntry> {
    const existing = await this.read(ns, key);
    if (options.ifVersion && (!existing || existing.entry.updatedAt !== options.ifVersion)) throw new StorageConflictError();
    const bytes = await sourceToBytes(source); const entry: StorageEntry = { key: encodeStorageKey(ns, key), kind: options.kind, byteSize: bytes.byteLength, updatedAt: new Date().toISOString() }; const db = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readwrite");
      transaction.objectStore("entries").put({ key: entry.key, entry, data: bytes.slice().buffer as ArrayBuffer });
      transaction.oncomplete = () => resolve(entry);
      transaction.onerror = () => reject(transaction.error?.name === "QuotaExceededError" ? new StorageQuotaError() : new StorageIoError("IndexedDB write failed"));
    });
  }
  async delete(ns: StorageNamespace, key: string): Promise<void> {
    const db = await this.database();
    return new Promise((resolve, reject) => { const transaction = db.transaction("entries", "readwrite"); transaction.objectStore("entries").delete(encodeStorageKey(ns, key)); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(new StorageIoError("IndexedDB delete failed")); });
  }
}
export class LocalStorageAdapter extends BrowserStorageAdapterBase {
  static isSupported(): boolean { return typeof localStorage !== "undefined"; }
  private storedKey(ns: StorageNamespace, key: string): string { return encodeStorageKey(ns, key); }
  private componentForKey(ns: StorageNamespace, fullKey: string): string | null {
    const prefix = `postveil/v1/${base64url(new TextEncoder().encode(ns.userId))}/${ns.pillar}/`;
    if (!fullKey.startsWith(prefix)) return null;
    try { return fromBase64url(fullKey.slice(prefix.length)); } catch { return null; }
  }
  async list(ns: StorageNamespace, prefix = ""): Promise<StorageEntry[]> {
    validateStorageNamespace(ns);
    const result: StorageEntry[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.endsWith(":meta")) continue;
      const fullKey = key.slice(0, -5);
      const component = this.componentForKey(ns, fullKey);
      if (!component?.startsWith(prefix)) continue;
      try { result.push(JSON.parse(localStorage.getItem(key) || "null") as StorageEntry); } catch { /* recovery will report it as missing */ }
    }
    return result.filter(Boolean);
  }
  async read(ns: StorageNamespace, key: string): Promise<StorageRead | null> {
    const fullKey = this.storedKey(ns, key);
    const raw = localStorage.getItem(fullKey);
    const metadata = localStorage.getItem(`${fullKey}:meta`);
    if (raw === null || metadata === null) return null;
    try {
      const binary = fromBase64url(raw);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const entry = JSON.parse(metadata) as StorageEntry;
      return { entry, bytes: async () => new Uint8Array(bytes), stream: () => streamFor(bytes) };
    } catch { throw new StorageIoError("localStorage entry is malformed"); }
  }
  async write(ns: StorageNamespace, key: string, source: StorageSource, options: { kind: StorageKind; ifVersion?: string }): Promise<StorageEntry> {
    if (options.kind === "blob") throw new StorageUnsupportedError("localStorage cannot persist binary blobs");
    const bytes = await sourceToBytes(source);
    if (bytes.byteLength > 5 * 1024 * 1024) throw new StorageQuotaError();
    const fullKey = this.storedKey(ns, key);
    const existing = await this.read(ns, key);
    if (options.ifVersion && (!existing || existing.entry.updatedAt !== options.ifVersion)) throw new StorageConflictError();
    const entry: StorageEntry = { key: fullKey, kind: options.kind, byteSize: bytes.byteLength, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(fullKey, base64url(bytes));
      localStorage.setItem(`${fullKey}:meta`, JSON.stringify(entry));
      return entry;
    } catch { throw new StorageQuotaError(); }
  }
  async delete(ns: StorageNamespace, key: string): Promise<void> {
    const fullKey = this.storedKey(ns, key);
    localStorage.removeItem(fullKey); localStorage.removeItem(`${fullKey}:meta`);
  }
}

class UnsupportedStorageAdapter implements StorageAdapter {
  private unavailable(): never { throw new StorageUnsupportedError(); }
  list(): Promise<StorageEntry[]> { return Promise.reject(this.unavailable()); }
  read(): Promise<StorageRead | null> { return Promise.reject(this.unavailable()); }
  write(): Promise<StorageEntry> { return Promise.reject(this.unavailable()); }
  delete(): Promise<void> { return Promise.reject(this.unavailable()); }
  writeCommitMarker(): Promise<void> { return Promise.reject(this.unavailable()); }
  listCommitted(): Promise<Array<StorageEntry & { marker: CommitMarker }>> { return Promise.reject(this.unavailable()); }
  withNamespaceLock<T>(): Promise<T> { return Promise.reject(this.unavailable()); }
}

export function createDefaultStorageAdapter(): StorageAdapter {
  if (OpfsStorageAdapter.isSupported()) return new OpfsStorageAdapter();
  if (IndexedDbStorageAdapter.isSupported()) return new IndexedDbStorageAdapter();
  if (LocalStorageAdapter.isSupported()) return new LocalStorageAdapter();
  return new UnsupportedStorageAdapter();
}

export function reservationBytes(reservation: Reservation): number { return reservation.bytes; }
