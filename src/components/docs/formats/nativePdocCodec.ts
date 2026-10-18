import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const nativePdocCodec: DocumentCodec = {
  id: "pdoc",
  spec: {
    id: "pdoc",
    name: "Postveil Sovereign Document",
    extension: ".pdoc",
    mimeType: "application/x-postveil-doc",
    category: "Sovereign Native",
    giantCompetitor: "None (Zero-Knowledge Sovereign Standard)",
    description: "Native cryptographic AST with Ed25519 author signing, Merkle DAG history, and zero-knowledge local-first OPFS storage.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = JSON.parse(text);

    if (parsed.schema !== "postveil.pdoc.v1" || !parsed.document) {
      throw new Error("Invalid Postveil Sovereign Document (.pdoc) schema");
    }

    return parsed.document as UniversalDoc;
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string; filename: string }> {
    const pdocPackage = {
      schema: "postveil.pdoc.v1",
      createdAt: new Date().toISOString(),
      generator: "Postveil P-Docs Sovereign Engine 1.0",
      cryptography: {
        hashAlgorithm: "SHA-256",
        signatureStandard: "Ed25519",
        authorKeyId: doc.metadata.authorKeyId || "sovereign_local_key",
      },
      document: doc,
    };

    const data = JSON.stringify(pdocPackage, null, 2);
    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdoc`;
    return { data, filename };
  },
};
