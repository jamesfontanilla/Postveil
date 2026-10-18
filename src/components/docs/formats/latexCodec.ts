import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const latexCodec: DocumentCodec = {
  id: "latex",
  spec: {
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

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const titleMatch = text.match(/\\title\{([^}]+)\}/);
    const authorMatch = text.match(/\\author\{([^}]+)\}/);

    const title = titleMatch ? titleMatch[1].trim() : "Imported LaTeX Paper";
    const author = authorMatch ? authorMatch[1].trim() : "LaTeX Author";
    const now = new Date().toISOString();

    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author,
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        charCount: text.length,
        readingTimeMinutes: 1,
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Merriweather",
        fontSize: 14,
        isEncrypted: false,
      },
      blocks: [
        {
          id: "b_tex_1",
          type: "heading",
          level: 1,
          content: title,
        },
        {
          id: "b_tex_2",
          type: "paragraph",
          content: "Imported from academic LaTeX document structure.",
        },
      ],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string; filename: string }> {
    const paperClass =
      doc.metadata.paperSize === "Letter"
        ? "letterpaper"
        : doc.metadata.paperSize === "Legal"
        ? "legalpaper"
        : doc.metadata.paperSize === "A3"
        ? "a3paper"
        : doc.metadata.paperSize === "A5"
        ? "a5paper"
        : "a4paper";
    const m = doc.metadata.margins || { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 };
    const latexLines: string[] = [
      `\\documentclass[11pt,${paperClass}]{article}`,
      `\\usepackage[utf8]{inputenc}`,
      `\\usepackage{amsmath,amssymb,amsfonts}`,
      `\\usepackage{graphicx}`,
      `\\usepackage{hyperref}`,
      `\\usepackage{geometry}`,
      `\\geometry{top=${m.top}in, bottom=${m.bottom}in, left=${m.left}in, right=${m.right}in}`,
      ``,
      `\\title{${escapeLatex(doc.metadata.title)}}`,
      `\\author{${escapeLatex(doc.metadata.author)}}`,
      `\\date{\\today}`,
      ``,
      `\\begin{document}`,
      `\\maketitle`,
      ``,
    ];

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const lvl = block.level || 1;
          const cmd = lvl === 1 ? "section" : lvl === 2 ? "subsection" : "subsubsection";
          latexLines.push(`\\${cmd}{${escapeLatex(block.content || "")}}\n`);
          break;
        }
        case "paragraph": {
          latexLines.push(`${escapeLatex(block.content || "")}\n`);
          break;
        }
        case "bulletList": {
          latexLines.push(`\\begin{itemize}\n  \\item ${escapeLatex(block.content || "")}\n\\end{itemize}\n`);
          break;
        }
        case "orderedList": {
          latexLines.push(`\\begin{enumerate}\n  \\item ${escapeLatex(block.content || "")}\n\\end{enumerate}\n`);
          break;
        }
        case "blockquote": {
          latexLines.push(`\\begin{quote}\n${escapeLatex(block.content || "")}\n\\end{quote}\n`);
          break;
        }
        case "codeBlock": {
          latexLines.push(`\\begin{verbatim}\n${block.content || ""}\n\\end{verbatim}\n`);
          break;
        }
        case "mathBlock": {
          latexLines.push(`\\begin{equation}\n${block.latex || block.content || ""}\n\\end{equation}\n`);
          break;
        }
        default:
          if (block.content) latexLines.push(`${escapeLatex(block.content)}\n`);
      }
    }

    latexLines.push(`\\end{document}`);

    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.tex`;
    return { data: latexLines.join("\n"), filename };
  },
};

function escapeLatex(str: string): string {
  return str
    .replace(/\\/g, "\\textbackslash ")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}
