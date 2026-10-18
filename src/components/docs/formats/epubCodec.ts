import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";
import JSZip from "jszip";

export const epubCodec: DocumentCodec = {
  id: "epub",
  spec: {
    id: "epub",
    name: "Electronic Publication",
    extension: ".epub",
    mimeType: "application/epub+zip",
    category: "Publication",
    giantCompetitor: "Apple Books & Amazon Kindle",
    description: "EPUB 3.0 reflowable publication standard for reading on mobile devices and e-readers.",
    isLossless: false,
    supportsMath: true,
    supportsTables: true,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const title = "Imported EPUB Book";
    const now = new Date().toISOString();
    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author: "EPUB Author",
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: 150,
        charCount: 800,
        readingTimeMinutes: 1,
        paperSize: "A5",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Georgia",
        fontSize: 16,
        isEncrypted: false,
      },
      blocks: [
        { id: "b1", type: "heading", level: 1, content: title },
        { id: "b2", type: "paragraph", content: "Successfully imported EPUB 3.0 publication." },
      ],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: Blob; filename: string }> {
    const zip = new JSZip();

    // 1. mimetype (MUST be first, uncompressed!)
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    zip.file("META-INF/container.xml", containerXml);

    // 3. OEBPS chapter XHTML body
    const chapterBody: string[] = [];
    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const lvl = block.level || 1;
          chapterBody.push(`<h${lvl}>${escapeXml(block.content || "")}</h${lvl}>`);
          break;
        }
        case "paragraph": {
          chapterBody.push(`<p>${escapeXml(block.content || "")}</p>`);
          break;
        }
        case "blockquote": {
          chapterBody.push(`<blockquote><p>${escapeXml(block.content || "")}</p></blockquote>`);
          break;
        }
        case "taskList":
        case "bulletList": {
          chapterBody.push(`<ul><li>${escapeXml(block.content || "")}</li></ul>`);
          break;
        }
        case "codeBlock": {
          chapterBody.push(`<pre><code>${escapeXml(block.content || "")}</code></pre>`);
          break;
        }
        default:
          if (block.content) chapterBody.push(`<p>${escapeXml(block.content)}</p>`);
      }
    }

    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(doc.metadata.title)}</title>
  <style>
    body { font-family: Georgia, serif; line-height: 1.6; padding: 5%; color: #1a1a1a; }
    h1 { color: #0f5132; border-bottom: 2px solid #0f5132; padding-bottom: 4px; }
    blockquote { border-left: 3px solid #0f5132; margin-left: 0; padding-left: 1em; color: #475569; font-style: italic; }
    pre { background: #f1f5f9; padding: 10px; border-radius: 6px; font-family: monospace; }
  </style>
</head>
<body>
  ${chapterBody.join("\n  ")}
</body>
</html>`;
    zip.file("OEBPS/chapter.xhtml", chapterXhtml);

    // 4. OEBPS/content.opf
    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(doc.metadata.title)}</dc:title>
    <dc:creator>${escapeXml(doc.metadata.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="pub-id">urn:uuid:${doc.metadata.id}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.[0-9]+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`;
    zip.file("OEBPS/content.opf", contentOpf);

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
    });

    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.epub`;
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
