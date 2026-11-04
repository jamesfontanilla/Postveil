import { normalizeDocumentSignatures, type UniversalDoc, type SaveResult } from "../types.ts";

export type { SaveResult } from "../types.ts";

export interface DocStorageSummary {
  id: string;
  title: string;
  updatedAt: string;
  author?: string;
  wordCount?: number;
  paperSize?: string;
  blocksCount?: number;
}

export class OpfsDocStorage {
  private static DIRECTORY_NAME = "pdocs_vault";
  private static ACTIVE_KEY = "pdocs_active_id";
  private static META_PREFIX = "pdocs_meta_";
  private static DB_NAME = "pdocs_db";
  private static DB_VERSION = 1;
  private static STORE_DOCS = "documents";

  public static async isOpfsSupported(): Promise<boolean> {
    return typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function";
  }

  public static getActiveDocumentId(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(this.ACTIVE_KEY);
  }

  public static setActiveDocumentId(id: string): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(this.ACTIVE_KEY, id);
    } catch {
      // Ignore if quota or disabled
    }
  }

  /**
   * IndexedDB fallback connection helper for resilient large-payload storage
   */
  private static openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return reject(new Error("IndexedDB is not available in this environment."));
      }
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_DOCS)) {
          db.createObjectStore(this.STORE_DOCS, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
    });
  }

  private static async saveToIndexedDb(id: string, payload: UniversalDoc): Promise<void> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(this.STORE_DOCS, "readwrite");
        const store = tx.objectStore(this.STORE_DOCS);
        const req = store.put({ id, doc: payload, updatedAt: payload.metadata?.updatedAt || new Date().toISOString() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error("IndexedDB write failed"));
      } catch (err) {
        reject(err);
      }
    });
  }

  private static async loadFromIndexedDb(id: string): Promise<UniversalDoc | null> {
    try {
      const db = await this.openDatabase();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(this.STORE_DOCS, "readonly");
          const store = tx.objectStore(this.STORE_DOCS);
          const req = store.get(id);
          req.onsuccess = () => {
            const result = req.result;
            resolve(result?.doc ? normalizeDocumentSignatures(result.doc as UniversalDoc) : null);
          };
          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch {
      return null;
    }
  }

  private static async deleteFromIndexedDb(id: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(this.STORE_DOCS, "readwrite");
          const store = tx.objectStore(this.STORE_DOCS);
          store.delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Writes lightweight metadata record into localStorage (~200 bytes)
   * and purges any legacy heavy full-document payloads under `pdocs_{id}` to prevent QuotaExceededError.
   */
  private static recordLightweightIndex(doc: UniversalDoc): void {
    if (typeof localStorage === "undefined") return;
    try {
      const id = doc.metadata.id;
      // Clean up legacy heavy key if it was stored in localStorage earlier
      try {
        localStorage.removeItem(`pdocs_${id}`);
      } catch {}

      // Calculate lightweight wordcount summary
      let wordCount = 0;
      if (doc.blocks) {
        for (const b of doc.blocks) {
          if (b.content) wordCount += b.content.trim().split(/\s+/).filter(Boolean).length;
        }
      }

      const indexRecord: DocStorageSummary = {
        id,
        title: doc.metadata.title || "Untitled Document",
        updatedAt: doc.metadata.updatedAt || new Date().toISOString(),
        author: doc.metadata.author,
        wordCount,
        paperSize: doc.metadata.paperSize || "A4",
        blocksCount: doc.blocks?.length || 0,
      };

      localStorage.setItem(`${this.META_PREFIX}${id}`, JSON.stringify(indexRecord));
    } catch {
      // Storage quota or policy prevented index entry write, non-fatal
    }
  }

  public static async saveDocumentLocally(doc: UniversalDoc): Promise<SaveResult> {
    let serialized: string;
    try {
      serialized = JSON.stringify(doc, null, 2);
    } catch {
      return { status: "failed", reason: "io", message: "The document could not be serialized for local storage." };
    }

    const docId = doc.metadata.id;
    this.setActiveDocumentId(docId);

    // 1. Primary Sovereign Storage: Origin Private File System (OPFS)
    if (typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        const fileHandle = await dir.getFileHandle(`${docId}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(serialized);
        await writable.close();

        // Update lightweight index (~200 bytes) and clear heavy payload from localStorage
        this.recordLightweightIndex(doc);

        return { status: "saved", medium: "opfs", savedAt: new Date().toISOString() };
      } catch (caught) {
        // Fall through to resilient IndexedDB engine
      }
    }

    // 2. Resilient High-Capacity Fallback: IndexedDB (hundreds of MBs capacity)
    try {
      await this.saveToIndexedDb(docId, doc);
      this.recordLightweightIndex(doc);
      return { status: "saved", medium: "indexeddb", savedAt: new Date().toISOString() };
    } catch (idbErr) {
      // Fall through to emergency localStorage fallback
    }

    // 3. Emergency Fallback: localStorage (guarded against QuotaExceededError)
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`pdocs_${docId}`, serialized);
        this.recordLightweightIndex(doc);
        return { status: "saved", medium: "localStorage", savedAt: new Date().toISOString() };
      } catch (caught) {
        const name = typeof DOMException !== "undefined" && caught instanceof DOMException ? caught.name : "";
        return {
          status: "failed",
          reason: name === "QuotaExceededError" ? "quota" : "io",
          message: name === "QuotaExceededError"
            ? "Browser storage quota reached. Please export your document or enable file system permissions."
            : "Local browser storage could not confirm this document write.",
        };
      }
    }

    return { status: "failed", reason: "unsupported", message: "No supported local document storage medium is available." };
  }

  public static async loadDocumentLocally(id: string): Promise<UniversalDoc | null> {
    // 1. Try Primary: OPFS
    try {
      if (typeof window !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        const fileHandle = await dir.getFileHandle(`${id}.json`);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return normalizeDocumentSignatures(JSON.parse(text) as UniversalDoc);
      }
    } catch {}

    // 2. Try Secondary: IndexedDB
    try {
      const fromIdb = await this.loadFromIndexedDb(id);
      if (fromIdb) return fromIdb;
    } catch {}

    // 3. Try Legacy / Emergency: localStorage
    try {
      if (typeof localStorage !== "undefined") {
        const item = localStorage.getItem(`pdocs_${id}`);
        if (item) return normalizeDocumentSignatures(JSON.parse(item) as UniversalDoc);
      }
    } catch {}

    return null;
  }

  public static async deleteDocumentLocally(id: string): Promise<boolean> {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`pdocs_${id}`);
        localStorage.removeItem(`${this.META_PREFIX}${id}`);
        if (this.getActiveDocumentId() === id) {
          localStorage.removeItem(this.ACTIVE_KEY);
        }
      }

      await this.deleteFromIndexedDb(id);

      if (typeof window !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: false });
        await dir.removeEntry(`${id}.json`);
      }
      return true;
    } catch {
      return false;
    }
  }

  public static async duplicateDocumentLocally(id: string): Promise<UniversalDoc | null> {
    const existing = await this.loadDocumentLocally(id);
    if (!existing) return null;

    const newId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const duplicated: UniversalDoc = {
      ...existing,
      metadata: {
        ...existing.metadata,
        id: newId,
        title: `Copy of ${existing.metadata.title}`,
        createdAt: now,
        updatedAt: now,
      },
      blocks: existing.blocks.map((b) => ({
        ...b,
        id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      })),
    };

    await this.saveDocumentLocally(duplicated);
    return duplicated;
  }

  public static async listLocalDocuments(): Promise<DocStorageSummary[]> {
    const list: DocStorageSummary[] = [];
    const seenIds = new Set<string>();

    const computeWordCount = (doc: UniversalDoc): number => {
      let count = 0;
      for (const b of doc.blocks) {
        if (b.content) {
          count += b.content.trim().split(/\s+/).filter(Boolean).length;
        }
      }
      return count;
    };

    // 1. Scan OPFS Directory
    try {
      if (typeof window !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        // @ts-ignore
        for await (const [name, handle] of dir.entries()) {
          if (name.endsWith(".json") && !name.startsWith("pdocs_versions_")) {
            try {
              const file = await handle.getFile();
              const text = await file.text();
              const parsed = JSON.parse(text) as UniversalDoc;
              if (parsed?.metadata?.id && !seenIds.has(parsed.metadata.id)) {
                seenIds.add(parsed.metadata.id);
                list.push({
                  id: parsed.metadata.id,
                  title: parsed.metadata.title || "Untitled Document",
                  updatedAt: parsed.metadata.updatedAt || new Date().toISOString(),
                  author: parsed.metadata.author,
                  wordCount: computeWordCount(parsed),
                  paperSize: parsed.metadata.paperSize || "A4",
                  blocksCount: parsed.blocks?.length || 0,
                });
              }
            } catch {}
          }
        }
      }
    } catch {}

    // 2. Scan IndexedDB Store
    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(this.STORE_DOCS, "readonly");
          const store = tx.objectStore(this.STORE_DOCS);
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const record = cursor.value;
              const doc = record?.doc as UniversalDoc;
              if (doc?.metadata?.id && !seenIds.has(doc.metadata.id)) {
                seenIds.add(doc.metadata.id);
                list.push({
                  id: doc.metadata.id,
                  title: doc.metadata.title || "Untitled Document",
                  updatedAt: doc.metadata.updatedAt || new Date().toISOString(),
                  author: doc.metadata.author,
                  wordCount: computeWordCount(doc),
                  paperSize: doc.metadata.paperSize || "A4",
                  blocksCount: doc.blocks?.length || 0,
                });
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          cursorReq.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {}

    // 3. Scan localStorage lightweight indices and legacy entries
    try {
      if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;

          // Check lightweight index
          if (key.startsWith(this.META_PREFIX)) {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const summary = JSON.parse(raw) as DocStorageSummary;
                if (summary?.id && !seenIds.has(summary.id)) {
                  seenIds.add(summary.id);
                  list.push(summary);
                }
              } catch {}
            }
          } else if (key.startsWith("pdocs_") && key !== this.ACTIVE_KEY && !key.startsWith(this.VERSIONS_PREFIX)) {
            // Check legacy full-doc key
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as UniversalDoc;
                if (parsed?.metadata?.id && !seenIds.has(parsed.metadata.id)) {
                  seenIds.add(parsed.metadata.id);
                  list.push({
                    id: parsed.metadata.id,
                    title: parsed.metadata.title || "Untitled Document",
                    updatedAt: parsed.metadata.updatedAt || new Date().toISOString(),
                    author: parsed.metadata.author,
                    wordCount: computeWordCount(parsed),
                    paperSize: parsed.metadata.paperSize || "A4",
                    blocksCount: parsed.blocks?.length || 0,
                  });
                }
              } catch {}
            }
          }
        }
      }
    } catch {}

    // Sort descending by updatedAt
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /* --------------------------------------------------------------------------
     Document Version History / Revision Snapshots
     -------------------------------------------------------------------------- */
  private static VERSIONS_PREFIX = "pdocs_versions_";
  private static STORE_VERSIONS = "versions";

  private static async saveVersionsToIndexedDb(docId: string, snapshots: import("../types").DocVersionSnapshot[]): Promise<void> {
    try {
      const db = await this.openDatabase();
      if (!db.objectStoreNames.contains(this.STORE_VERSIONS)) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(this.STORE_VERSIONS, "readwrite");
          const store = tx.objectStore(this.STORE_VERSIONS);
          store.put({ id: docId, snapshots });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {}
  }

  private static async loadVersionsFromIndexedDb(docId: string): Promise<import("../types").DocVersionSnapshot[]> {
    try {
      const db = await this.openDatabase();
      if (!db.objectStoreNames.contains(this.STORE_VERSIONS)) return [];
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(this.STORE_VERSIONS, "readonly");
          const store = tx.objectStore(this.STORE_VERSIONS);
          const req = store.get(docId);
          req.onsuccess = () => {
            const val = req.result?.snapshots;
            resolve(Array.isArray(val) ? val.map((s) => ({ ...s, doc: normalizeDocumentSignatures(s.doc) })) : []);
          };
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    } catch {
      return [];
    }
  }

  public static async saveVersionSnapshot(doc: UniversalDoc, name?: string): Promise<import("../types").DocVersionSnapshot> {
    const snapshot: import("../types").DocVersionSnapshot = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      name: name || undefined,
      author: doc.metadata.author || "Current User",
      wordCount: doc.metadata.wordCount || 0,
      doc: JSON.parse(JSON.stringify(doc)),
    };

    try {
      const key = `${this.VERSIONS_PREFIX}${doc.metadata.id}`;
      const existing = await this.loadVersionSnapshots(doc.metadata.id);
      const updated = [snapshot, ...existing].slice(0, 30); // Keep last 30 snapshots

      // 1. Primary: Save to OPFS
      if (typeof window !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
        try {
          const root = await navigator.storage.getDirectory();
          const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
          const fileHandle = await dir.getFileHandle(`${key}.json`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(updated, null, 2));
          await writable.close();
        } catch {}
      }

      // 2. High capacity fallback: Save to IndexedDB
      await this.saveVersionsToIndexedDb(doc.metadata.id, updated);

      // 3. Purge legacy versions from localStorage to free domain quota
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    } catch {}

    return snapshot;
  }

  public static async loadVersionSnapshots(docId: string): Promise<import("../types").DocVersionSnapshot[]> {
    const key = `${this.VERSIONS_PREFIX}${docId}`;
    try {
      if (typeof window !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        try {
          const fileHandle = await dir.getFileHandle(`${key}.json`);
          const file = await fileHandle.getFile();
          const text = await file.text();
          return (JSON.parse(text) as import("../types").DocVersionSnapshot[]).map((snapshot) => ({ ...snapshot, doc: normalizeDocumentSignatures(snapshot.doc) }));
        } catch {}
      }

      // Try IndexedDB
      const fromIdb = await this.loadVersionsFromIndexedDb(docId);
      if (fromIdb && fromIdb.length > 0) return fromIdb;

      // Legacy fallback in localStorage
      if (typeof localStorage !== "undefined") {
        const item = localStorage.getItem(key);
        if (item) return (JSON.parse(item) as import("../types").DocVersionSnapshot[]).map((snapshot) => ({ ...snapshot, doc: normalizeDocumentSignatures(snapshot.doc) }));
      }
    } catch {}
    return [];
  }

  public static async restoreVersionSnapshot(
    docId: string,
    snapshotId: string
  ): Promise<UniversalDoc | null> {
    const versions = await this.loadVersionSnapshots(docId);
    const target = versions.find((v) => v.id === snapshotId);
    if (!target) return null;

    const restoredDoc: UniversalDoc = {
      ...target.doc,
      metadata: {
        ...target.doc.metadata,
        updatedAt: new Date().toISOString(),
      },
    };

    await this.saveDocumentLocally(restoredDoc);
    return restoredDoc;
  }
}
