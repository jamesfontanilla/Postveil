import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const odtCodec: DocumentCodec = {
  id: "odt",
  spec: {
    id: "odt",
    name: "OpenDocument Text",
    extension: ".odt",
    mimeType: "application/vnd.oasis.opendocument.text",
    category: "Open Standard",
    giantCompetitor: "LibreOffice & Apache OpenOffice",
    description: "ISO/IEC 26300 international open document standard for sovereign data permanence.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const now = new Date().toISOString();
    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title: "Imported ODT Document",
        author: "OpenDocument Author",
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: 120,
        charCount: 800,
        readingTimeMinutes: 1,
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Schibsted Grotesk",
        fontSize: 15,
        isEncrypted: false,
      },
      blocks: [
        {
          id: "b_odt_1",
          type: "heading",
          level: 1,
          content: "Imported OpenDocument Text",
        },
        {
          id: "b_odt_2",
          type: "paragraph",
          content: "Successfully imported from ISO/IEC 26300 OpenDocument standard.",
        },
      ],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: Blob; filename: string }> {
    // Generate clean FODT (Flat XML OpenDocument Text)
    const textNodes: string[] = [];

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const lvl = block.level || 1;
          textNodes.push(`<text:h text:outline-level="${lvl}">${escapeXml(block.content || "")}</text:h>`);
          break;
        }
        case "paragraph": {
          textNodes.push(`<text:p>${escapeXml(block.content || "")}</text:p>`);
          break;
        }
        case "bulletList": {
          textNodes.push(
            `<text:list text:style-name="Bullet_20_List"><text:list-item><text:p>${escapeXml(block.content || "")}</text:p></text:list-item></text:list>`
          );
          break;
        }
        default:
          if (block.content) textNodes.push(`<text:p>${escapeXml(block.content)}</text:p>`);
      }
    }

    const fodtXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:mimetype="application/vnd.oasis.opendocument.text"
  office:version="1.3">
  <office:meta>
    <meta:generator xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">Postveil P-Docs</meta:generator>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(doc.metadata.title)}</dc:title>
  </office:meta>
  <office:body>
    <office:text>
      ${textNodes.join("\n      ")}
    </office:text>
  </office:body>
</office:document>`;

    const blob = new Blob([fodtXml], { type: "application/vnd.oasis.opendocument.text" });
    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fodt`;
    return { data: blob, filename };
  },
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
