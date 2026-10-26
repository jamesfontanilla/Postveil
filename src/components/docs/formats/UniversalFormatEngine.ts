import {
  type UniversalDoc,
  type SupportedFormat,
  type FormatSpecification,
  type ExportOptions,
  type DocumentCodec,
  type DocBlock,
  normalizeDocumentSignatures,
} from "../types.ts";

export type { DocumentCodec };
import { markdownCodec } from "./markdownCodec.ts";
import { htmlCodec } from "./htmlCodec.ts";
import { plainTextCodec } from "./plainTextCodec.ts";
import { latexCodec } from "./latexCodec.ts";
import { docxCodec } from "./docxCodec.ts";
import { odtCodec } from "./odtCodec.ts";
import { nativePdocCodec } from "./nativePdocCodec.ts";
import { pdfCodec } from "./pdfCodec.ts";
import { rtfCodec } from "./rtfCodec.ts";
import { epubCodec } from "./epubCodec.ts";

const SIGNATURE_MARKER = /<!-- postveil-signatures:([^>]+) -->/;

function signaturesMarker(doc: UniversalDoc): string {
  return doc.metadata.signatures?.length ? `\n<!-- postveil-signatures:${encodeURIComponent(JSON.stringify(doc.metadata.signatures))} -->` : "";
}

function signaturesFromContent(content: string): { content: string; signatures?: UniversalDoc["metadata"]["signatures"] } {
  const match = content.match(SIGNATURE_MARKER);
  if (!match) return { content };
  try { return { content: content.replace(match[0], ""), signatures: JSON.parse(decodeURIComponent(match[1])) }; } catch { return { content: content.replace(match[0], "") }; }
}

export const FORMAT_REGISTRY: Record<SupportedFormat, FormatSpecification> = {
  docx: {
    id: "docx",
    name: "Microsoft Word",
    extension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "Word Processor",
    giantCompetitor: "Microsoft Word (Office 365) & Google Docs",
    description: "Office Open XML document standard with full styling, tables, headers, and comments.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },
  odt: {
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
  pdf: {
    id: "pdf",
    name: "Portable Document Format",
    extension: ".pdf",
    mimeType: "application/pdf",
    category: "Publication",
    giantCompetitor: "Adobe Acrobat & macOS Preview",
    description: "Vector paginated PDF export with exact typography margins, headers, and page numbers.",
    isLossless: false,
    supportsMath: true,
    supportsTables: true,
  },
  md: {
    id: "md",
    name: "Markdown / GFM",
    extension: ".md",
    mimeType: "text/markdown",
    category: "Markup / Code",
    giantCompetitor: "Obsidian, Notion & Typora",
    description: "CommonMark + GitHub Flavored Markdown with YAML metadata frontmatter and LaTeX math.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },
  html: {
    id: "html",
    name: "Standalone Web Document",
    extension: ".html",
    mimeType: "text/html",
    category: "Publication",
    giantCompetitor: "Google Docs Web Publish & Quip",
    description: "Single-file semantic HTML5 with self-contained CSS, readable on any browser in the world.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },
  epub: {
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
  latex: {
    id: "latex",
    name: "LaTeX Academic Document",
    extension: ".tex",
    mimeType: "application/x-latex",
    category: "Markup / Code",
    giantCompetitor: "Overleaf & arXiv Submission",
    description: "Clean academic LaTeX source code ready for pdflatex compilation and journal submission.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },
  rtf: {
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
  txt: {
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
  pdoc: {
    id: "pdoc",
    name: "Postveil Sovereign Document",
    extension: ".pdoc",
    mimeType: "application/x-postveil-doc",
    category: "Sovereign Native",
    giantCompetitor: "None (local Postveil format)",
    description: "Native Postveil document format with local metadata and SHA-256 hash previews.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },
};

export class UniversalFormatEngine {
  private static codecs: Record<SupportedFormat, DocumentCodec> = {
    md: markdownCodec,
    html: htmlCodec,
    txt: plainTextCodec,
    latex: latexCodec,
    docx: docxCodec,
    odt: odtCodec,
    pdoc: nativePdocCodec,
    pdf: pdfCodec,
    epub: epubCodec,
    rtf: rtfCodec,
  };

  public static getSupportedFormats(): FormatSpecification[] {
    return Object.values(FORMAT_REGISTRY);
  }

  public static getFormatSpec(format: SupportedFormat): FormatSpecification {
    return FORMAT_REGISTRY[format];
  }

  public static async exportDocument(
    doc: UniversalDoc,
    options: ExportOptions
  ): Promise<{ data: string | Blob; filename: string }> {
    const codec = this.codecs[options.format] || markdownCodec;
    const result = await codec.export(doc, options);
    return typeof result.data === "string" && options.format !== "pdoc" ? { ...result, data: `${result.data}${signaturesMarker(doc)}` } : result;
  }

  public static async importDocument(
    content: string | ArrayBuffer,
    formatGuess: SupportedFormat
  ): Promise<UniversalDoc> {
    const codec = this.codecs[formatGuess] || markdownCodec;
    const extracted = typeof content === "string" ? signaturesFromContent(content) : { content };
    const imported = await codec.import(extracted.content);
    return normalizeDocumentSignatures({ ...imported, metadata: { ...imported.metadata, ...((extracted as { signatures?: UniversalDoc["metadata"]["signatures"] }).signatures ? { signatures: (extracted as { signatures: UniversalDoc["metadata"]["signatures"] }).signatures } : {}) } });
  }

  public static detectFormatFromFilename(filename: string): SupportedFormat {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "docx":
      case "doc":
        return "docx";
      case "odt":
        return "odt";
      case "pdf":
        return "pdf";
      case "md":
      case "markdown":
        return "md";
      case "html":
      case "htm":
        return "html";
      case "epub":
        return "epub";
      case "tex":
      case "latex":
        return "latex";
      case "rtf":
        return "rtf";
      case "pdoc":
        return "pdoc";
      default:
        return "txt";
    }
  }

  public static createBlankDocument(title = "Untitled Document", author = "Postveil Sovereign User"): UniversalDoc {
    const now = new Date().toISOString();
    return {
      metadata: {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        author,
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: 0,
        charCount: 0,
        readingTimeMinutes: 0,
        paperSize: "A4",
        orientation: "portrait",
        margins: {
          preset: "normal",
          top: 1.0,
          bottom: 1.0,
          left: 1.0,
          right: 1.0,
        },
        pageColor: "#ffffff",
        lineSpacing: "1.15",
        fontFamily: "Schibsted Grotesk",
        fontSize: 15,
        isEncrypted: false,
      },
      blocks: [
        {
          id: `b_${Date.now()}_1`,
          type: "heading",
          level: 1,
          content: title,
        },
        {
          id: `b_${Date.now()}_2`,
          type: "paragraph",
          content: "Welcome to P-Docs. A sovereign, local-first document suite that refuses to hold your intellectual property hostage.",
        },
      ],
    };
  }

  public static createDemoDocument(): UniversalDoc {
    const now = new Date().toISOString();
    const blocks: DocBlock[] = [
      {
        id: "b_demo_title",
        type: "heading",
        level: 1,
        content: "Postveil Sovereign Suite — P-Docs Architecture Specification",
      },
      {
        id: "b_demo_callout",
        type: "callout",
        calloutVariant: "tip",
        calloutTitle: "Sovereign Silicon Execution",
        content: "P-Docs executes entirely on client-side WebAssembly. Zero cloud telemetry, zero word-processor subscriptions, zero data lock-in.",
      },
      {
        id: "b_demo_h2_1",
        type: "heading",
        level: 2,
        content: "1. Universal File Interoperability Matrix",
      },
      {
        id: "b_demo_p_1",
        type: "paragraph",
        content: "Unlike legacy monopolies that force proprietary formats, P-Docs provides native round-trip conversion for all major industry standards:",
      },
      {
        id: "b_demo_table",
        type: "table",
        rows: [
          {
            id: "r1",
            cells: [
              { id: "c1_1", content: "Format", isHeader: true },
              { id: "c1_2", content: "Standard / Origin", isHeader: true },
              { id: "c1_3", content: "Target Competitor", isHeader: true },
              { id: "c1_4", content: "Postveil Advantage", isHeader: true },
            ],
          },
          {
            id: "r2",
            cells: [
              { id: "c2_1", content: "DOCX (.docx)" },
              { id: "c2_2", content: "Office Open XML (ECMA-376)" },
              { id: "c2_3", content: "Microsoft Word 365" },
              { id: "c2_4", content: "Sub-4ms load, zero license fee" },
            ],
          },
          {
            id: "r3",
            cells: [
              { id: "c3_1", content: "ODT (.odt)" },
              { id: "c3_2", content: "OASIS OpenDocument (ISO 26300)" },
              { id: "c3_3", content: "LibreOffice / OpenOffice" },
              { id: "c3_4", content: "Instant browser native editing" },
            ],
          },
          {
            id: "r4",
            cells: [
              { id: "c4_1", content: "Markdown (.md)" },
              { id: "c4_2", content: "CommonMark + GFM" },
              { id: "c4_3", content: "Obsidian / Notion" },
              { id: "c4_4", content: "YAML frontmatter + Symbolic math" },
            ],
          },
          {
            id: "r5",
            cells: [
              { id: "c5_1", content: "LaTeX (.tex)" },
              { id: "c5_2", content: "AMS / TeX Foundation" },
              { id: "c5_3", content: "Overleaf / arXiv" },
              { id: "c5_4", content: "Instant IEEE & academic export" },
            ],
          },
          {
            id: "r6",
            cells: [
              { id: "c6_1", content: "PDF / Print" },
              { id: "c6_2", content: "ISO 32000 Vector" },
              { id: "c6_3", content: "Adobe Acrobat" },
              { id: "c6_4", content: "Pixel-accurate A4/Letter pagination" },
            ],
          },
        ],
      },
      {
        id: "b_demo_h2_2",
        type: "heading",
        level: 2,
        content: "2. Mathematical & Mathematical Proofs",
      },
      {
        id: "b_demo_p_2",
        type: "paragraph",
        content: "Academic research and engineering specifications require first-class mathematical expressions. P-Docs renders LaTeX inline and block math natively:",
      },
      {
        id: "b_demo_math",
        type: "mathBlock",
        latex: "\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}",
        content: "Maxwell-Ampere Law in Differential Form",
      },
      {
        id: "b_demo_h2_3",
        type: "heading",
        level: 2,
        content: "3. Interactive Checklists & Action Items",
      },
      {
        id: "b_demo_task_1",
        type: "taskList",
        content: "Implement Universal AST block schema with 10 format codecs",
        checked: true,
      },
      {
        id: "b_demo_task_2",
        type: "taskList",
        content: "Integrate Origin Private File System (OPFS) local storage engine",
        checked: true,
      },
      {
        id: "b_demo_task_3",
        type: "taskList",
        content: "Connect 3x3 Sovereign App Launcher and Google-style Profile Popover",
        checked: true,
      },
      {
        id: "b_demo_task_4",
        type: "taskList",
        content: "Deploy to Cloudflare Workers custom domain docs.postveil.jamesfontanilla.com",
        checked: false,
      },
      {
        id: "b_demo_quote",
        type: "blockquote",
        content: "Software monopolies run on local machines anyway. By decoupling the document engine from cloud surveillance, Postveil returns total data sovereignty to the creator.",
      },
      {
        id: "b_demo_code",
        type: "codeBlock",
        language: "typescript",
        content: `// Document hash preview (SHA-256)\nconst documentHashPreview = await window.crypto.subtle.digest(\n  "SHA-256",\n  new TextEncoder().encode(JSON.stringify(docAst))\n);\nconsole.log("Document hash preview:", documentHashPreview);`,
      },
    ];

    return {
      metadata: {
        id: "doc_demo_spec_2026",
        title: "Postveil Sovereign Suite — P-Docs Architecture Specification",
        author: "Postveil Architecture Team",
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: 284,
        charCount: 1980,
        readingTimeMinutes: 1,
        paperSize: "A4",
        orientation: "portrait",
        margins: {
          preset: "normal",
          top: 1.0,
          bottom: 1.0,
          left: 1.0,
          right: 1.0,
        },
        pageColor: "#ffffff",
        lineSpacing: "1.15",
        fontFamily: "Schibsted Grotesk",
        fontSize: 15,
        isEncrypted: false,
      },
      blocks,
    };
  }
}
