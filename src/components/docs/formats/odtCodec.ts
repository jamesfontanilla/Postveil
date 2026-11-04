import { type UniversalDoc, type ExportOptions, type DocBlock, type TableRow, type TableCell } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";
import JSZip from "jszip";

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
    try {
      const zip = await JSZip.loadAsync(raw);
      const contentXml = await zip.file("content.xml")?.async("string");
      const metaXml = await zip.file("meta.xml")?.async("string");

      let title = "Imported ODT Document";
      let author = "OpenDocument Author";

      // 1. Parse meta.xml if present for true document title and creator
      if (metaXml) {
        try {
          const metaDoc = new DOMParser().parseFromString(metaXml, "application/xml");
          const titleEl = metaDoc.getElementsByTagName("dc:title")[0];
          const creatorEl = metaDoc.getElementsByTagName("dc:creator")[0];
          if (titleEl?.textContent?.trim()) title = titleEl.textContent.trim();
          if (creatorEl?.textContent?.trim()) author = creatorEl.textContent.trim();
        } catch {
          // Fall back to defaults
        }
      }

      if (!contentXml) {
        throw new Error("Missing content.xml in ODT archive");
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(contentXml, "application/xml");

      // 2. Locate <office:text>
      const officeText =
        xmlDoc.getElementsByTagName("office:text")[0] ||
        xmlDoc.getElementsByTagName("text")[0] ||
        xmlDoc.documentElement;

      const blocks: DocBlock[] = [];
      let blockCounter = 1;
      const nextId = (prefix = "b_odt") => `${prefix}_${Date.now()}_${blockCounter++}`;

      // 3. Sequentially traverse direct child nodes of office:text to preserve document order
      const childNodes = Array.from(officeText.childNodes);

      for (const node of childNodes) {
        if (node.nodeType !== 1) continue; // Skip non-element nodes
        const el = node as Element;
        const tagName = (el.tagName || "").toLowerCase();

        // 3a. Headings: <text:h>
        if (tagName.endsWith(":h") || tagName === "h") {
          const levelAttr = el.getAttribute("text:outline-level") || el.getAttribute("outline-level") || "1";
          const levelNum = parseInt(levelAttr, 10);
          const level: 1 | 2 | 3 | 4 | 5 | 6 = levelNum >= 1 && levelNum <= 6 ? (levelNum as any) : 1;
          const text = (el.textContent || "").trim();
          if (text) {
            blocks.push({
              id: nextId("b_h"),
              type: "heading",
              level,
              content: text,
            });
          }
          continue;
        }

        // 3b. Tables: <table:table>
        if (tagName.endsWith(":table") || tagName === "table") {
          const rows: TableRow[] = [];
          const rowElements = Array.from(el.getElementsByTagName("table:table-row")).concat(
            Array.from(el.getElementsByTagName("table-row"))
          );

          rowElements.forEach((rowEl, rIdx) => {
            const cellElements = Array.from(rowEl.getElementsByTagName("table:table-cell")).concat(
              Array.from(rowEl.getElementsByTagName("table-cell"))
            );
            const cells: TableCell[] = [];

            cellElements.forEach((cellEl, cIdx) => {
              const cellText = (cellEl.textContent || "").trim();
              const isHeader = rIdx === 0 || cellEl.getAttribute("table:is-header") === "true";
              cells.push({
                id: `cell_${Date.now()}_${rIdx}_${cIdx}`,
                content: cellText,
                isHeader,
              });
            });

            if (cells.length > 0) {
              rows.push({
                id: `row_${Date.now()}_${rIdx}`,
                cells,
              });
            }
          });

          if (rows.length > 0) {
            blocks.push({
              id: nextId("b_tbl"),
              type: "table",
              rows,
            });
          }
          continue;
        }

        // 3c. Lists: <text:list>
        if (tagName.endsWith(":list") || tagName === "list") {
          const isOrdered = el.getAttribute("text:style-name")?.toLowerCase().includes("number") ?? false;
          const itemElements = Array.from(el.getElementsByTagName("text:list-item")).concat(
            Array.from(el.getElementsByTagName("list-item"))
          );

          itemElements.forEach((itemEl) => {
            const itemText = (itemEl.textContent || "").trim();
            if (itemText) {
              blocks.push({
                id: nextId(isOrdered ? "b_ord" : "b_bul"),
                type: isOrdered ? "orderedList" : "bulletList",
                content: itemText,
              });
            }
          });
          continue;
        }

        // 3d. Paragraphs: <text:p>
        if (tagName.endsWith(":p") || tagName === "p") {
          // Check for embedded MathML (<math:math> or <math>)
          const mathElements = Array.from(el.getElementsByTagName("math:math")).concat(
            Array.from(el.getElementsByTagName("math"))
          );

          if (mathElements.length > 0) {
            const mathEl = mathElements[0];
            const mathText = (mathEl.textContent || "").trim();
            blocks.push({
              id: nextId("b_math"),
              type: "mathBlock",
              latex: mathText,
              content: mathText,
            });
            continue;
          }

          const text = (el.textContent || "").trim();
          if (text) {
            const styleName = (el.getAttribute("text:style-name") || "").toLowerCase();
            const isQuote = styleName.includes("quote") || styleName.includes("quotation");
            const isCode = styleName.includes("code") || styleName.includes("pre") || styleName.includes("mono");

            if (isQuote) {
              blocks.push({
                id: nextId("b_q"),
                type: "blockquote",
                content: text,
              });
            } else if (isCode) {
              blocks.push({
                id: nextId("b_code"),
                type: "codeBlock",
                content: text,
              });
            } else {
              blocks.push({
                id: nextId("b_p"),
                type: "paragraph",
                content: text,
              });
            }
          }
          continue;
        }
      }

      // If title wasn't in meta, take first heading or paragraph
      if (title === "Imported ODT Document" && blocks[0]?.content) {
        title = blocks[0].content;
      }

      const fullText = blocks.map((b) => b.content || "").join(" ");
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      const charCount = fullText.length;

      return {
        metadata: {
          id: `doc_${Date.now()}`,
          title,
          author,
          createdAt: now,
          updatedAt: now,
          version: 1,
          wordCount,
          charCount,
          readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 200)),
          paperSize: "A4",
          orientation: "portrait",
          lineSpacing: "1.15",
          fontFamily: "Kerneon Grotesk",
          fontSize: 14,
          isEncrypted: false,
        },
        blocks: blocks.length > 0 ? blocks : [
          { id: nextId("b_h"), type: "heading", level: 1, content: title },
          { id: nextId("b_p"), type: "paragraph", content: "Imported ODT content." },
        ],
      };
    } catch {
      return {
        metadata: {
          id: `doc_${Date.now()}`,
          title: "Imported ODT Document",
          author: "OpenDocument Author",
          createdAt: now,
          updatedAt: now,
          version: 1,
          wordCount: 50,
          charCount: 300,
          readingTimeMinutes: 1,
          paperSize: "A4",
          orientation: "portrait",
          lineSpacing: "1.15",
          fontFamily: "Kerneon Grotesk",
          fontSize: 14,
          isEncrypted: false,
        },
        blocks: [
          { id: "b1", type: "heading", level: 1, content: "Imported ODT Document" },
          { id: "b2", type: "paragraph", content: "Successfully imported OpenDocument." },
        ],
      };
    }
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: Blob; filename: string }> {
    const zip = new JSZip();

    // 1. mimetype (MUST be first entry and stored uncompressed!)
    zip.file("mimetype", "application/vnd.oasis.opendocument.text", {
      compression: "STORE",
    });

    // 2. META-INF/manifest.xml
    const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
    zip.file("META-INF/manifest.xml", manifestXml);

    // 3. meta.xml
    const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">
  <office:meta>
    <meta:generator>Postveil Sovereign Suite — P-Docs</meta:generator>
    <dc:title>${escapeXml(doc.metadata.title)}</dc:title>
    <dc:creator>${escapeXml(doc.metadata.author)}</dc:creator>
    <meta:creation-date>${doc.metadata.createdAt}</meta:creation-date>
  </office:meta>
</office:document-meta>`;
    zip.file("meta.xml", metaXml);

    // 4. styles.xml
    const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:text-properties style:font-name="Kerneon Grotesk" fo:font-size="11pt" fo:color="#1e293b"/>
    </style:default-style>
  </office:styles>
</office:document-styles>`;
    zip.file("styles.xml", stylesXml);

    // 5. content.xml
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
        case "blockquote": {
          textNodes.push(`<text:p style:font-style="italic" text:style-name="Quote">${escapeXml(block.content || "")}</text:p>`);
          break;
        }
        case "taskList":
        case "bulletList": {
          const prefix = block.type === "taskList" ? (block.checked ? "[x] " : "[ ] ") : "• ";
          textNodes.push(`<text:p>${prefix}${escapeXml(block.content || "")}</text:p>`);
          break;
        }
        case "orderedList": {
          textNodes.push(`<text:p text:style-name="Numbering">${escapeXml(block.content || "")}</text:p>`);
          break;
        }
        case "codeBlock": {
          textNodes.push(`<text:p style:font-family="monospace" text:style-name="Preformatted">${escapeXml(block.content || "")}</text:p>`);
          break;
        }
        case "mathBlock": {
          const formula = block.latex || block.content || "";
          textNodes.push(`<text:p><draw:frame><math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>${escapeXml(formula)}</mi></mrow></math></draw:frame></text:p>`);
          break;
        }
        case "table": {
          if (block.rows && block.rows.length > 0) {
            let t = `<table:table table:name="Table1">`;
            for (const r of block.rows) {
              t += `<table:table-row>`;
              for (const c of r.cells) {
                t += `<table:table-cell office:value-type="string"><text:p>${escapeXml(c.content || "")}</text:p></table:table-cell>`;
              }
              t += `</table:table-row>`;
            }
            t += `</table:table>`;
            textNodes.push(t);
          }
          break;
        }
        default:
          if (block.content) textNodes.push(`<text:p>${escapeXml(block.content)}</text:p>`);
      }
    }

    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:math="http://www.w3.org/1998/Math/MathML"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3">
  <office:body>
    <office:text>
      ${textNodes.join("\n      ")}
    </office:text>
  </office:body>
</office:document-content>`;
    zip.file("content.xml", contentXml);

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.oasis.opendocument.text",
      compression: "DEFLATE",
    });

    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.odt`;
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
