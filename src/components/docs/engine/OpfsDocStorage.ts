import { type UniversalDoc } from "../types";

export class OpfsDocStorage {
  private static DIRECTORY_NAME = "pdocs_vault";

  public static async isOpfsSupported(): Promise<boolean> {
    return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
  }

  public static async saveDocumentLocally(doc: UniversalDoc): Promise<boolean> {
    try {
      if (typeof window === "undefined" || !("storage" in navigator)) {
        // Fallback to localStorage if OPFS not present
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
    } catch (err) {
      // Graceful fallback to localStorage
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

  public static async listLocalDocuments(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const list: { id: string; title: string; updatedAt: string }[] = [];
    try {
      if (typeof window !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(this.DIRECTORY_NAME, { create: true });
        // @ts-ignore
        for await (const [name, handle] of dir.entries()) {
          if (name.endsWith(".json")) {
            const file = await handle.getFile();
            const text = await file.text();
            try {
              const parsed = JSON.parse(text);
              if (parsed?.metadata) {
                list.push({
                  id: parsed.metadata.id,
                  title: parsed.metadata.title,
                  updatedAt: parsed.metadata.updatedAt,
                });
              }
            } catch {}
          }
        }
      }
    } catch {}

    // Also check localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("pdocs_")) {
          const item = localStorage.getItem(key);
          if (item) {
            try {
              const parsed = JSON.parse(item);
              if (parsed?.metadata && !list.some((d) => d.id === parsed.metadata.id)) {
                list.push({
                  id: parsed.metadata.id,
                  title: parsed.metadata.title,
                  updatedAt: parsed.metadata.updatedAt,
                });
              }
            } catch {}
          }
        }
      }
    } catch {}

    return list;
  }
}
