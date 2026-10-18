import { type UniversalDoc } from "../types";

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

  public static async saveDocumentLocally(doc: UniversalDoc): Promise<boolean> {
    try {
      this.setActiveDocumentId(doc.metadata.id);

      if (typeof window === "undefined" || !("storage" in navigator)) {
        localStorage.setItem(`pdocs_${doc.metadata.id}`, JSON.stringify(doc));
        return true;
      }

      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
      const fileHandle = await dir.getFileHandle(`${doc.metadata.id}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(doc, null, 2));
      await writable.close();
      return true;
    } catch {
      try {
        localStorage.setItem(`pdocs_${doc.metadata.id}`, JSON.stringify(doc));
        return true;
      } catch {
        return false;
      }
    }
  }

  public static async loadDocumentLocally(id: string): Promise<UniversalDoc | null> {
    try {
      if (typeof window === "undefined" || !("storage" in navigator)) {
        const item = localStorage.getItem(`pdocs_${id}`);
        return item ? JSON.parse(item) : null;
      }

      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
      const fileHandle = await dir.getFileHandle(`${id}.json`);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      const item = localStorage.getItem(`pdocs_${id}`);
      return item ? JSON.parse(item) : null;
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
}
