import { type UniversalDoc, type ExportOptions, type DocBlock } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const plainTextCodec: DocumentCodec = {
  id: "txt",
  spec: {
    id: "txt",
    name: "Plain Text",
    extension: ".txt",
    mimeType: "text/plain",
    category: "Plaintext",
    giantCompetitor: "Notepad & Vim",
    description: "Clean UTF-8 plain text with smart ASCII borders and indentation.",
    isLossless: false,
    supportsMath: false,
    supportsTables: false,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const title = paragraphs[0]?.slice(0, 50) || "Untitled Plain Text";
    const now = new Date().toISOString();

    const blocks: DocBlock[] = paragraphs.map((p, idx) => ({
      id: `b_txt_${idx}`,
      type: (idx === 0 ? "heading" : "paragraph") as "heading" | "paragraph",
      level: idx === 0 ? (1 as const) : undefined,
      content: p.trim(),
    }));

    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author: "Sovereign User",
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        charCount: text.length,
        readingTimeMinutes: 1,
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "JetBrains Mono",
        fontSize: 14,
        isEncrypted: false,
      },
      blocks,
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string; filename: string }> {
    const lines: string[] = [
      `${doc.metadata.title.toUpperCase()}`,
      `Author: ${doc.metadata.author}`,
      `Date: ${new Date(doc.metadata.updatedAt).toLocaleDateString()}`,
      "=".repeat(60),
      "",
    ];

    for (const block of doc.blocks) {
      if (block.type === "heading") {
        lines.push(`\n[${block.content || ""}]\n`);
      } else if (block.type === "bulletList" || block.type === "taskList") {
        lines.push(`* ${block.content || ""}`);
      } else if (block.type === "table" && block.rows) {
        for (const row of block.rows) {
          lines.push(row.cells.map((c) => c.content).join(" | "));
        }
        lines.push("");
      } else if (block.content) {
        lines.push(`${block.content}\n`);
      }
    }

    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    return { data: lines.join("\n"), filename };
  },
};
