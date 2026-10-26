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

  public static async isOpfsSupported(): Promise<boolean> {
    return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
  }

  public static getActiveDocumentId(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(this.ACTIVE_KEY);
  }

  public static setActiveDocumentId(id: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(this.ACTIVE_KEY, id);
  }

  public static async saveDocumentLocally(doc: UniversalDoc): Promise<SaveResult> {
    let serialized: string;
    try { serialized = JSON.stringify(doc, null, 2); } catch { return { status: "failed", reason: "io", message: "The document could not be serialized for local storage." }; }
    let localStorageFailure: SaveResult | null = null;
    if (typeof localStorage === "undefined") {
      localStorageFailure = { status: "failed", reason: "unsupported", message: "Local browser storage is unavailable." };
    } else {
      try {
        localStorage.setItem(`pdocs_${doc.metadata.id}`, serialized);
      } catch (caught) {
        const name = typeof DOMException !== "undefined" && caught instanceof DOMException ? caught.name : "";
        localStorageFailure = { status: "failed", reason: name === "QuotaExceededError" ? "quota" : "io", message: "Local browser storage could not confirm this document write." };
      }
    }

    if (typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage.getDirectory === "function") {
      try {
        this.setActiveDocumentId(doc.metadata.id);
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        const fileHandle = await dir.getFileHandle(`${doc.metadata.id}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(serialized);
        await writable.close();
        return { status: "saved", medium: "opfs", savedAt: new Date().toISOString() };
      } catch (caught) {
        const name = typeof DOMException !== "undefined" && caught instanceof DOMException ? caught.name : "";
        if (!localStorageFailure) localStorageFailure = { status: "failed", reason: name === "QuotaExceededError" ? "quota" : "io", message: "The local document write could not be confirmed." };
      }
    }

    if (!localStorageFailure && typeof localStorage !== "undefined") {
      try { this.setActiveDocumentId(doc.metadata.id); } catch { /* The document payload was already confirmed. */ }
      return { status: "saved", medium: "localStorage", savedAt: new Date().toISOString() };
    }
    return localStorageFailure || { status: "failed", reason: "unsupported", message: "No supported local document storage medium is available." };
  }

  public static async loadDocumentLocally(id: string): Promise<UniversalDoc | null> {
    try {
      if (typeof window === "undefined" || !("storage" in navigator)) {
        const item = typeof localStorage !== "undefined" ? localStorage.getItem(`pdocs_${id}`) : null;
        return item ? normalizeDocumentSignatures(JSON.parse(item) as UniversalDoc) : null;
      }

      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
      const fileHandle = await dir.getFileHandle(`${id}.json`);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return normalizeDocumentSignatures(JSON.parse(text) as UniversalDoc);
    } catch {
      const item = typeof localStorage !== "undefined" ? localStorage.getItem(`pdocs_${id}`) : null;
      return item ? normalizeDocumentSignatures(JSON.parse(item) as UniversalDoc) : null;
    }
  }

  public static async deleteDocumentLocally(id: string): Promise<boolean> {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`pdocs_${id}`);
        if (this.getActiveDocumentId() === id) {
          localStorage.removeItem(this.ACTIVE_KEY);
        }
      }

      if (typeof window !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
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

    const computeWordCount = (doc: UniversalDoc): number => {
      let count = 0;
      for (const b of doc.blocks) {
        if (b.content) {
          count += b.content.trim().split(/\s+/).filter(Boolean).length;
        }
      }
      return count;
    };

    try {
      if (typeof window !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        // @ts-ignore
        for await (const [name, handle] of dir.entries()) {
          if (name.endsWith(".json")) {
            try {
              const file = await handle.getFile();
              const text = await file.text();
              const parsed = JSON.parse(text) as UniversalDoc;
              if (parsed?.metadata?.id) {
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

    // Also check localStorage
    try {
      if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("pdocs_") && key !== this.ACTIVE_KEY) {
            const item = localStorage.getItem(key);
            if (item) {
              try {
                const parsed = JSON.parse(item) as UniversalDoc;
                if (parsed?.metadata?.id && !list.some((d) => d.id === parsed.metadata.id)) {
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

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(updated));
      }

      if (typeof window !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        const fileHandle = await dir.getFileHandle(`${key}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(updated, null, 2));
        await writable.close();
      }
    } catch {}

    return snapshot;
  }

  public static async loadVersionSnapshots(docId: string): Promise<import("../types").DocVersionSnapshot[]> {
    const key = `${this.VERSIONS_PREFIX}${docId}`;
    try {
      if (typeof window !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        try {
          const fileHandle = await dir.getFileHandle(`${key}.json`);
          const file = await fileHandle.getFile();
          const text = await file.text();
          return (JSON.parse(text) as import("../types").DocVersionSnapshot[]).map((snapshot) => ({ ...snapshot, doc: normalizeDocumentSignatures(snapshot.doc) }));
        } catch {}
      }

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
