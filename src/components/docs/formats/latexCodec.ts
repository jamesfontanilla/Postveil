import { type UniversalDoc, type ExportOptions, type DocBlock, type TableRow, type TableCell } from "../types";
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

    // 1. Extract metadata from preamble
    const titleMatch = text.match(/\\title\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
    const authorMatch = text.match(/\\author\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);

    const title = titleMatch ? cleanLatexText(titleMatch[1].trim()) : "Imported Academic Paper";
    const author = authorMatch ? cleanLatexText(authorMatch[1].trim()) : "LaTeX Author";
    const now = new Date().toISOString();

    // Paper size detection from \documentclass or \geometry
    let paperSize: UniversalDoc["metadata"]["paperSize"] = "A4";
    if (/letterpaper/i.test(text)) paperSize = "Letter";
    else if (/legalpaper/i.test(text)) paperSize = "Legal";
    else if (/a3paper/i.test(text)) paperSize = "A3";
    else if (/a5paper/i.test(text)) paperSize = "A5";

    // 2. Isolate body content between \begin{document} and \end{document}
    let bodyContent = text;
    const docStartMatch = text.match(/\\begin\{document\}/);
    if (docStartMatch && docStartMatch.index !== undefined) {
      bodyContent = text.slice(docStartMatch.index + docStartMatch[0].length);
    }
    const docEndMatch = bodyContent.match(/\\end\{document\}/);
    if (docEndMatch && docEndMatch.index !== undefined) {
      bodyContent = bodyContent.slice(0, docEndMatch.index);
    }

    // 3. Parse AST blocks
    const blocks = parseLatexBodyToBlocks(bodyContent, title);

    const fullPlainText = blocks.map((b) => b.content || "").join(" ");
    const words = fullPlainText.split(/\s+/).filter(Boolean).length;
    const chars = fullPlainText.length;

    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author,
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: words,
        charCount: chars,
        readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
        paperSize,
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Kerneon Grotesk",
        fontSize: 14,
        isEncrypted: false,
      },
      blocks: blocks.length > 0 ? blocks : [
        {
          id: `b_tex_init_${Date.now()}`,
          type: "heading",
          level: 1,
          content: title,
        },
        {
          id: `b_tex_p_${Date.now()}`,
          type: "paragraph",
          content: "",
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
      `\\usepackage{booktabs}`,
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
          const cmd = lvl === 1 ? "section" : lvl === 2 ? "subsection" : lvl === 3 ? "subsubsection" : "paragraph";
          latexLines.push(`\\${cmd}{${escapeLatex(block.content || "")}}\n`);
          break;
        }
        case "paragraph": {
          if (block.content?.trim()) {
            latexLines.push(`${formatInlineContent(block)}\n`);
          }
          break;
        }
        case "bulletList": {
          latexLines.push(`\\begin{itemize}\n  \\item ${formatInlineContent(block)}\n\\end{itemize}\n`);
          break;
        }
        case "orderedList": {
          latexLines.push(`\\begin{enumerate}\n  \\item ${formatInlineContent(block)}\n\\end{enumerate}\n`);
          break;
        }
        case "taskList": {
          const checkMark = block.checked ? "[X]" : "[ ]";
          latexLines.push(`\\begin{itemize}\n  \\item ${checkMark} ${formatInlineContent(block)}\n\\end{itemize}\n`);
          break;
        }
        case "blockquote": {
          latexLines.push(`\\begin{quote}\n${formatInlineContent(block)}\n\\end{quote}\n`);
          break;
        }
        case "codeBlock": {
          latexLines.push(`\\begin{verbatim}\n${block.content || ""}\n\\end{verbatim}\n`);
          break;
        }
        case "mathBlock": {
          const math = (block.latex || block.content || "").trim();
          latexLines.push(`\\begin{equation}\n${math}\n\\end{equation}\n`);
          break;
        }
        case "table": {
          if (block.rows && block.rows.length > 0) {
            const colCount = Math.max(...block.rows.map((r) => r.cells.length), 1);
            const colsAlign = "l".repeat(colCount);
            latexLines.push(`\\begin{table}[h]`);
            latexLines.push(`\\centering`);
            latexLines.push(`\\begin{tabular}{${colsAlign}}`);
            latexLines.push(`\\toprule`);
            block.rows.forEach((row, rIdx) => {
              const rowText = row.cells.map((c) => escapeLatex(c.content || "")).join(" & ");
              latexLines.push(`  ${rowText} \\\\`);
              if (rIdx === 0 && row.cells.some((c) => c.isHeader)) {
                latexLines.push(`\\midrule`);
              }
            });
            latexLines.push(`\\bottomrule`);
            latexLines.push(`\\end{tabular}`);
            latexLines.push(`\\end{table}\n`);
          }
          break;
        }
        case "divider": {
          latexLines.push(`\\hrulefill\n`);
          break;
        }
        case "pageBreak": {
          latexLines.push(`\\newpage\n`);
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

function formatInlineContent(block: DocBlock): string {
  if (block.content) {
    return escapeLatex(block.content);
  }
  return "";
}

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

function cleanLatexText(str: string): string {
  return str
    .replace(/\\textbf\{([^}]+)\}/g, "<b>$1</b>")
    .replace(/\\textit\{([^}]+)\}/g, "<i>$1</i>")
    .replace(/\\underline\{([^}]+)\}/g, "<u>$1</u>")
    .replace(/\\emph\{([^}]+)\}/g, "<em>$1</em>")
    .replace(/\\texttt\{([^}]+)\}/g, "<code>$1</code>")
    .replace(/\\textbackslash\s?/g, "\\")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/~+/g, " ")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\quad/g, "  ")
    .trim();
}

function stripLatexHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "");
}

/**
 * Robust AST parser for LaTeX document bodies.
 * Handles headings, equation environments, verbatim/code, itemize/enumerate lists,
 * tabular arrays, and standard paragraphs with inline formatting preservation.
 */
function parseLatexBodyToBlocks(body: string, documentTitle: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let blockCounter = 1;

  const nextId = (prefix = "b_tex") => `${prefix}_${Date.now()}_${blockCounter++}`;

  // Normalize newlines
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("%")) {
      i++;
      continue;
    }

    // Skip \maketitle
    if (trimmed === "\\maketitle") {
      i++;
      continue;
    }

    // 1. Math Display Environments: \begin{equation}, \begin{align}, \begin{gather}, $$...$$
    if (/^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}/.test(trimmed) || trimmed.startsWith("$$")) {
      const isDoubleDollar = trimmed.startsWith("$$");
      const envNameMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
      const endMarker = isDoubleDollar ? "$$" : `\\end{${envNameMatch ? envNameMatch[1] : "equation"}}`;

      let mathBody = isDoubleDollar ? trimmed.slice(2) : "";
      if (isDoubleDollar && mathBody.endsWith("$$") && mathBody.length > 2) {
        mathBody = mathBody.slice(0, -2);
      } else {
        i++;
        const mathLines: string[] = isDoubleDollar && mathBody ? [mathBody] : [];
        while (i < lines.length) {
          const l = lines[i];
          if (l.includes(endMarker)) {
            const upTo = l.indexOf(endMarker);
            if (upTo > 0) mathLines.push(l.slice(0, upTo));
            break;
          }
          mathLines.push(l);
          i++;
        }
        mathBody = mathLines.join("\n").trim();
      }

      blocks.push({
        id: nextId("b_math"),
        type: "mathBlock",
        latex: mathBody,
        content: mathBody,
      });
      i++;
      continue;
    }

    // 2. Verbatim / Code Blocks: \begin{verbatim} ... \end{verbatim} or \begin{lstlisting}
    if (/^\\begin\{(verbatim\*?|lstlisting)\}/.test(trimmed)) {
      const envMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
      const endTag = `\\end{${envMatch ? envMatch[1] : "verbatim"}}`;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].includes(endTag)) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        id: nextId("b_code"),
        type: "codeBlock",
        language: "latex",
        content: codeLines.join("\n"),
      });
      i++;
      continue;
    }

    // 3. Tabular / Tables: \begin{table} ... or \begin{tabular}
    if (/^\\begin\{(table\*?|tabular)\}/.test(trimmed)) {
      const isTableEnv = trimmed.startsWith("\\begin{table");
      const endTag = isTableEnv ? "\\end{table}" : "\\end{tabular}";
      i++;
      const tableLines: string[] = [];
      while (i < lines.length && !lines[i].includes(endTag)) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Extract rows from tabular inside tableLines
      const rows: TableRow[] = [];
      const tabularContent = tableLines
        .filter((l) => !l.startsWith("\\begin{tabular") && !l.startsWith("\\end{tabular}") && !l.startsWith("\\toprule") && !l.startsWith("\\midrule") && !l.startsWith("\\bottomrule") && !l.startsWith("\\hline") && !l.startsWith("\\centering") && !l.startsWith("\\caption"))
        .join(" ")
        .split("\\\\");

      let rowIdx = 0;
      for (const rowRaw of tabularContent) {
        const rowTrimmed = rowRaw.trim();
        if (!rowTrimmed) continue;
        const cellStrings = rowTrimmed.split("&").map((c) => cleanLatexText(c.trim()));
        const cells: TableCell[] = cellStrings.map((content, colIdx) => ({
          id: `cell_${Date.now()}_${rowIdx}_${colIdx}`,
          content: stripLatexHtml(content),
          isHeader: rowIdx === 0,
        }));
        rows.push({
          id: `row_${Date.now()}_${rowIdx}`,
          cells,
        });
        rowIdx++;
      }

      if (rows.length > 0) {
        blocks.push({
          id: nextId("b_tbl"),
          type: "table",
          rows,
        });
      }
      i++;
      continue;
    }

    // 4. Itemize / Lists: \begin{itemize} or \begin{enumerate}
    if (/^\\begin\{(itemize|enumerate)\}/.test(trimmed)) {
      const isOrdered = trimmed.includes("enumerate");
      const endTag = isOrdered ? "\\end{enumerate}" : "\\end{itemize}";
      i++;
      while (i < lines.length && !lines[i].includes(endTag)) {
        const itemLine = lines[i].trim();
        if (itemLine.startsWith("\\item")) {
          const rawItem = itemLine.slice(5).trim();
          const cleanHtml = cleanLatexText(rawItem);
          blocks.push({
            id: nextId(isOrdered ? "b_ord" : "b_bul"),
            type: isOrdered ? "orderedList" : "bulletList",
            content: stripLatexHtml(cleanHtml),
            html: cleanHtml,
          });
        }
        i++;
      }
      i++;
      continue;
    }

    // 5. Quote: \begin{quote} ... \end{quote}
    if (/^\\begin\{quote\}/.test(trimmed)) {
      i++;
      const quoteLines: string[] = [];
      while (i < lines.length && !lines[i].includes("\\end{quote}")) {
        quoteLines.push(lines[i].trim());
        i++;
      }
      const quoteHtml = cleanLatexText(quoteLines.join(" "));
      blocks.push({
        id: nextId("b_q"),
        type: "blockquote",
        content: stripLatexHtml(quoteHtml),
        html: quoteHtml,
      });
      i++;
      continue;
    }

    // 6. Section Headings: \section{}, \subsection{}, \subsubsection{}, \paragraph{}
    const sectionMatch = trimmed.match(/^\\(section|subsection|subsubsection|paragraph)\*?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
    if (sectionMatch) {
      const cmd = sectionMatch[1];
      const rawHeading = sectionMatch[2];
      const cleanH = cleanLatexText(rawHeading);
      const level: 1 | 2 | 3 | 4 =
        cmd === "section" ? 1 : cmd === "subsection" ? 2 : cmd === "subsubsection" ? 3 : 4;

      blocks.push({
        id: nextId("b_h"),
        type: "heading",
        level,
        content: stripLatexHtml(cleanH),
        html: cleanH,
      });
      i++;
      continue;
    }

    // 7. Standalone Equation ($$ ... $$) inline single-line check
    const singleLineMath = trimmed.match(/^\$\$([^$]+)\$\$$/);
    if (singleLineMath) {
      blocks.push({
        id: nextId("b_math"),
        type: "mathBlock",
        latex: singleLineMath[1].trim(),
        content: singleLineMath[1].trim(),
      });
      i++;
      continue;
    }

    // 8. Horizontal Rule / Divider
    if (trimmed === "\\hrule" || trimmed === "\\hrulefill") {
      blocks.push({
        id: nextId("b_div"),
        type: "divider",
      });
      i++;
      continue;
    }

    // 9. Page Break
    if (trimmed === "\\newpage" || trimmed === "\\clearpage") {
      blocks.push({
        id: nextId("b_pb"),
        type: "pageBreak",
      });
      i++;
      continue;
    }

    // 10. Standard Paragraph: accumulate consecutive non-empty lines
    const paraLines: string[] = [rawLine];
    i++;
    while (i < lines.length) {
      const nextL = lines[i].trim();
      if (
        !nextL ||
        nextL.startsWith("%") ||
        nextL.startsWith("\\section") ||
        nextL.startsWith("\\subsection") ||
        nextL.startsWith("\\subsubsection") ||
        nextL.startsWith("\\begin{") ||
        nextL.startsWith("$$") ||
        nextL === "\\newpage" ||
        nextL === "\\clearpage" ||
        nextL === "\\hrule" ||
        nextL === "\\hrulefill"
      ) {
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }

    const fullParaText = paraLines.join(" ").trim();
    if (fullParaText) {
      const cleanHtml = cleanLatexText(fullParaText);
      blocks.push({
        id: nextId("b_p"),
        type: "paragraph",
        content: stripLatexHtml(cleanHtml),
        html: cleanHtml,
      });
    }
  }

  return blocks;
}
