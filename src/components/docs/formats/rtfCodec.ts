import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const rtfCodec: DocumentCodec = {
  id: "rtf",
  spec: {
    id: "rtf",
    name: "Rich Text Format",
    extension: ".rtf",
    mimeType: "application/rtf",
    category: "Word Processor",
    giantCompetitor: "WordPad & Apple TextEdit",
    description: "Cross-platform universal rich text format compatible with 1990-2026 legacy word processors.",
    isLossless: false,
    supportsMath: false,
    supportsTables: true,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    // Strip RTF control codes for clean import
    const clean = text
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\tab/g, "  ")
      .replace(/\\[a-z0-9\-]+/gi, "")
      .replace(/[{}]/g, "")
      .trim();

    const title = "Imported RTF Document";
    const now = new Date().toISOString();

    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author: "RTF Author",
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: clean.split(/\s+/).length,
        charCount: clean.length,
        readingTimeMinutes: 1,
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Times New Roman",
        fontSize: 14,
        isEncrypted: false,
      },
      blocks: [
        { id: "b1", type: "heading", level: 1, content: title },
        { id: "b2", type: "paragraph", content: clean || "Successfully imported RTF content." },
      ],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: Blob; filename: string }> {
    // Standard RTF 1.5 Header with font table and color table
    let rtf = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033\n";
    rtf += "{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}{\\f1\\fnil\\fcharset0 Consolas;}}\n";
    rtf += "{\\colortbl ;\\red15\\green81\\blue50;\\red30\\green41\\blue59;\\red100\\green116\\blue139;}\n";
    rtf += "\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs22 ";

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const lvl = block.level || 1;
          const fs = lvl === 1 ? 36 : lvl === 2 ? 28 : 24; // half-points: 18pt, 14pt, 12pt
          rtf += `\\par\\sb240\\sa120\\b\\cf1\\fs${fs} ${escapeRtf(block.content || "")}\\b0\\cf0\\fs22\\par\n`;
          break;
        }

        case "paragraph": {
          rtf += `\\sa160 ${escapeRtf(block.content || "")}\\par\n`;
          break;
        }

        case "blockquote": {
          rtf += `\\li360\\i\\cf3 ${escapeRtf(block.content || "")}\\i0\\cf0\\li0\\par\n`;
          break;
        }

        case "taskList":
        case "bulletList": {
          const prefix = block.type === "taskList" ? (block.checked ? "[x] " : "[ ] ") : "\\bullet  ";
          rtf += `\\li360\\b ${prefix}\\b0 ${escapeRtf(block.content || "")}\\li0\\par\n`;
          break;
        }

        case "codeBlock": {
          rtf += `\\f1\\fs18\\shading1000\\cb2 ${escapeRtf(block.content || "")}\\f0\\fs22\\par\n`;
          break;
        }

        case "table": {
          if (block.rows && block.rows.length > 0) {
            for (const row of block.rows) {
              rtf += "\\trowd\\trgaph108\\trleft-108";
              let x = 0;
              const colW = 2400; // twips per column
              for (let i = 0; i < row.cells.length; i++) {
                x += colW;
                rtf += `\\cellx${x}`;
              }
              for (const cell of row.cells) {
                rtf += `\\pard\\intbl ${cell.isHeader ? "\\b " : ""}${escapeRtf(cell.content || "")}${cell.isHeader ? "\\b0 " : ""}\\cell `;
              }
              rtf += "\\row\n";
            }
            rtf += "\\pard\\par\n";
          }
          break;
        }

        default:
          if (block.content) {
            rtf += `${escapeRtf(block.content)}\\par\n`;
          }
      }
    }

    rtf += "}\n";

    const blob = new Blob([rtf], { type: "application/rtf" });
    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.rtf`;
    return { data: blob, filename };
  },
};

function escapeRtf(str: string): string {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (str[i] === "\\") out += "\\\\";
    else if (str[i] === "{") out += "\\{";
    else if (str[i] === "}") out += "\\}";
    else if (c > 127) out += `\\u${c}?`;
    else out += str[i];
  }
  return out;
}
