import { type UniversalDoc, type ExportOptions } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";
import DOMPurify from "dompurify";

export const htmlCodec: DocumentCodec = {
  id: "html",
  spec: {
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

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const rawHtml = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, "text/html");

    const title = doc.querySelector("title")?.textContent || doc.querySelector("h1")?.textContent || "Imported HTML Document";
    const author = doc.querySelector("meta[name='author']")?.getAttribute("content") || "Postveil Sovereign User";

    const blocks: any[] = [];
    const elements = doc.body.children;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const tag = el.tagName.toLowerCase();

      if (tag.startsWith("h") && tag.length === 2) {
        const level = parseInt(tag[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
        blocks.push({
          id: `b_html_${blocks.length}`,
          type: "heading",
          level,
          content: el.textContent?.trim() || "",
        });
      } else if (tag === "p") {
        blocks.push({
          id: `b_html_${blocks.length}`,
          type: "paragraph",
          content: el.textContent?.trim() || "",
        });
      } else if (tag === "blockquote") {
        blocks.push({
          id: `b_html_${blocks.length}`,
          type: "blockquote",
          content: el.textContent?.trim() || "",
        });
      } else if (tag === "pre") {
        blocks.push({
          id: `b_html_${blocks.length}`,
          type: "codeBlock",
          content: el.textContent || "",
        });
      } else if (tag === "ul" || tag === "ol") {
        const items = el.querySelectorAll("li");
        items.forEach((li) => {
          blocks.push({
            id: `b_html_${blocks.length}`,
            type: tag === "ul" ? "bulletList" : "orderedList",
            content: li.textContent?.trim() || "",
          });
        });
      } else if (tag === "table") {
        const rows: any[] = [];
        el.querySelectorAll("tr").forEach((tr, rIdx) => {
          const cells: any[] = [];
          tr.querySelectorAll("th, td").forEach((cell, cIdx) => {
            cells.push({
              id: `c_${rIdx}_${cIdx}`,
              content: cell.textContent?.trim() || "",
              isHeader: cell.tagName.toLowerCase() === "th",
            });
          });
          if (cells.length > 0) rows.push({ id: `r_${rIdx}`, cells });
        });
        if (rows.length > 0) {
          blocks.push({
            id: `b_html_${blocks.length}`,
            type: "table",
            rows,
          });
        }
      }
    }

    const now = new Date().toISOString();
    return {
      metadata: {
        id: `doc_${Date.now()}`,
        title,
        author,
        createdAt: now,
        updatedAt: now,
        version: 1,
        wordCount: (doc.body.textContent || "").split(/\s+/).filter(Boolean).length,
        charCount: (doc.body.textContent || "").length,
        readingTimeMinutes: Math.ceil((doc.body.textContent || "").split(/\s+/).filter(Boolean).length / 200),
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Schibsted Grotesk",
        fontSize: 15,
        isEncrypted: false,
      },
      blocks: blocks.length > 0 ? blocks : [{ id: "b_1", type: "paragraph", content: "Imported content" }],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string; filename: string }> {
    const isPdfMode = options?.format === "pdf";
    const bodyHtml: string[] = [];

    const renderInline = (block: import("../types").DocBlock) => {
      if (block.html) {
        return DOMPurify.sanitize(block.html, {
          ALLOWED_TAGS: ["font", "span", "b", "i", "u", "s", "strong", "em", "a", "sub", "sup", "mark", "code"],
          ALLOWED_ATTR: ["color", "style", "href", "target", "rel", "class"],
        });
      }
      return escapeHtml(block.content || "");
    };

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const level = block.level || 1;
          bodyHtml.push(`<h${level}>${renderInline(block)}</h${level}>`);
          break;
        }
        case "paragraph": {
          bodyHtml.push(`<p>${renderInline(block)}</p>`);
          break;
        }
        case "bulletList": {
          bodyHtml.push(`<ul><li>${renderInline(block)}</li></ul>`);
          break;
        }
        case "orderedList": {
          bodyHtml.push(`<ol><li>${renderInline(block)}</li></ol>`);
          break;
        }
        case "taskList": {
          bodyHtml.push(
            `<div class="task-item"><input type="checkbox" ${block.checked ? "checked" : ""} disabled /> <span>${renderInline(block)}</span></div>`
          );
          break;
        }
        case "blockquote": {
          bodyHtml.push(`<blockquote>${renderInline(block)}</blockquote>`);
          break;
        }
        case "callout": {
          const variant = block.calloutVariant || "note";
          bodyHtml.push(
            `<div class="callout callout-${variant}"><div class="callout-title">${escapeHtml(block.calloutTitle || variant.toUpperCase())}</div><p>${renderInline(block)}</p></div>`
          );
          break;
        }
        case "codeBlock": {
          bodyHtml.push(`<pre><code>${escapeHtml(block.content || "")}</code></pre>`);
          break;
        }
        case "mathBlock": {
          bodyHtml.push(
            `<div class="math-block"><code class="latex-eq">\\[${escapeHtml(block.latex || block.content || "")}\\]</code></div>`
          );
          break;
        }
        case "divider": {
          bodyHtml.push(`<hr />`);
          break;
        }
        case "table": {
          if (block.rows && block.rows.length > 0) {
            bodyHtml.push("<table><tbody>");
            for (const row of block.rows) {
              bodyHtml.push("<tr>");
              for (const cell of row.cells) {
                const tag = cell.isHeader ? "th" : "td";
                bodyHtml.push(`<${tag}>${escapeHtml(cell.content)}</${tag}>`);
              }
              bodyHtml.push("</tr>");
            }
            bodyHtml.push("</tbody></table>");
          }
          break;
        }
        default:
          if (block.content) bodyHtml.push(`<p>${escapeHtml(block.content)}</p>`);
      }
    }

    const m = doc.metadata.margins || { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 };
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.metadata.title)}</title>
  <meta name="author" content="${escapeHtml(doc.metadata.author)}">
  <meta name="generator" content="Postveil P-Docs Sovereign Suite">
  <style>
    @page {
      size: ${doc.metadata.paperSize || "A4"} ${doc.metadata.orientation || "portrait"};
      margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;
      @bottom-right {
        content: counter(page);
      }
    }
    body {
      font-family: "${escapeHtml(doc.metadata.fontFamily || "Schibsted Grotesk")}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 820px;
      margin: 40px auto;
      padding: 0 24px;
      color: #1a1a1a;
      line-height: ${doc.metadata.lineSpacing || "1.5"};
      background-color: #ffffff;
    }
    h1, h2, h3, h4 { color: #0f172a; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2.2rem; border-bottom: 2px solid #0f5132; padding-bottom: 0.3em; margin-top: 0; }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.25rem; }
    p { margin-bottom: 1em; }
    blockquote {
      border-left: 4px solid #0f5132;
      padding-left: 16px;
      margin: 1.5em 0;
      color: #475569;
      font-style: italic;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.9rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5em 0;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      text-align: left;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 600;
    }
    .callout {
      padding: 14px 18px;
      border-radius: 10px;
      margin: 1.5em 0;
      border-left: 4px solid #0f5132;
      background: #f0fdf4;
    }
    .callout-title { font-weight: 700; margin-bottom: 4px; font-size: 0.85rem; }
    .task-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .math-block {
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      margin: 1.5em 0;
      font-family: "SovereignMath_Main", "Times New Roman", serif;
      font-size: 1.2rem;
    }
    @media print {
      body { margin: 0; padding: 0; max-width: 100%; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
  ${bodyHtml.join("\n  ")}
</body>
</html>`;

    const extension = isPdfMode ? ".html" : ".html";
    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${extension}`;
    return { data: fullHtml, filename };
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
