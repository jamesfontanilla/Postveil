import { type DocBlock, type BlockType, type TableRow, type CalloutVariant } from "../types";

export class LlmPasteParser {
  /**
   * Detects if clipboard content contains LLM chatbot markdown or math/table signatures
   */
  public static isLlmContent(text: string, html?: string): boolean {
    if (!text && !html) return false;

    // Check for LaTeX math delimiters ($$...$$, \[...\], \begin{equation})
    if (/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{(?:align|equation|matrix)\}/.test(text)) {
      return true;
    }

    // Check for fenced code blocks (```lang ... ```)
    if (/```[a-zA-Z0-9_-]*\n[\s\S]+?```/.test(text)) {
      return true;
    }

    // Check for GFM pipe tables (| header | header |)
    if (/\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n\|[^\n]+\|/.test(text)) {
      return true;
    }

    // Check for GFM callouts (> [!NOTE], > [!TIP], > [!WARNING])
    if (/^>\s*\[!(NOTE|TIP|INFO|WARNING|DANGER|CAUTION)\]/im.test(text)) {
      return true;
    }

    // Check for task lists (- [ ] or - [x])
    if (/^[\t ]*[-*]\s*\[[ xX]\]\s+/m.test(text)) {
      return true;
    }

    // Check for multiple Markdown headings (# Title, ## Subtitle)
    if (/^#{1,6}\s+.+/m.test(text)) {
      return true;
    }

    // Check HTML signatures for KaTeX or code blocks
    if (html && (html.includes("class=\"katex\"") || html.includes("<pre><code") || html.includes("<table"))) {
      return true;
    }

    return false;
  }

  /**
   * Parses clipboard text into native P-Docs AST blocks
   */
  public static parseToBlocks(text: string, _html?: string): DocBlock[] {
    const blocks: DocBlock[] = [];
    const idGen = () => `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Normalize line endings
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip pure blank lines between blocks
      if (!trimmed) {
        i++;
        continue;
      }

      // 1. Check for Fenced Code Block: ```lang ... ```
      if (trimmed.startsWith("```")) {
        const langMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)/);
        const language = langMatch ? langMatch[1] : "typescript";
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        blocks.push({
          id: idGen(),
          type: "codeBlock",
          content: codeLines.join("\n"),
          language: language || "text",
        });
        continue;
      }

      // 2. Check for Display LaTeX Math Block: $$ ... $$ or \[ ... \]
      if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
        let latex = "";
        if ((trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 2) ||
            (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 2)) {
          latex = trimmed.replace(/^\$\$|^\\\[/, "").replace(/\$\$$|\\\]$/, "").trim();
          i++;
        } else {
          const mathLines: string[] = [];
          mathLines.push(trimmed.replace(/^\$\$|^\\\[/, ""));
          i++;
          while (i < lines.length && !lines[i].trim().endsWith("$$") && !lines[i].trim().endsWith("\\]")) {
            mathLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) {
            mathLines.push(lines[i].trim().replace(/\$\$$|\\\]$/, ""));
            i++;
          }
          latex = mathLines.join("\n").trim();
        }

        blocks.push({
          id: idGen(),
          type: "mathBlock",
          latex: latex || "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
        });
        continue;
      }

      // 3. Check for GFM Callout: > [!NOTE] or > [!TIP]
      const calloutMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|INFO|WARNING|DANGER|CAUTION)\](?:\s+(.*))?$/i);
      if (calloutMatch) {
        const variantStr = calloutMatch[1].toLowerCase();
        const variant: CalloutVariant = 
          variantStr === "warning" || variantStr === "caution" ? "warning" :
          variantStr === "danger" ? "danger" :
          variantStr === "tip" ? "tip" :
          variantStr === "info" ? "info" : "note";
        const title = calloutMatch[2]?.trim() || `${calloutMatch[1]} Note`;
        const calloutLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          calloutLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        blocks.push({
          id: idGen(),
          type: "callout",
          calloutVariant: variant,
          calloutTitle: title,
          content: calloutLines.join("\n").trim(),
        });
        continue;
      }

      // 4. Check for GFM Table: | Col 1 | Col 2 |
      if (trimmed.startsWith("|") && trimmed.endsWith("|") && i + 1 < lines.length && lines[i + 1].includes("---")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }

        const rows: TableRow[] = [];
        tableLines.forEach((tLine, rowIndex) => {
          if (tLine.replace(/[\s|:-]/g, "").length === 0) return; // separator row |---|---|
          const rawCells = tLine.split("|").slice(1, -1);
          rows.push({
            id: `row_${rowIndex}_${idGen()}`,
            cells: rawCells.map((c, cIdx) => ({
              id: `cell_${rowIndex}_${cIdx}_${idGen()}`,
              content: c.trim(),
              isHeader: rowIndex === 0,
            })),
          });
        });

        if (rows.length > 0) {
          blocks.push({
            id: idGen(),
            type: "table",
            rows,
          });
          continue;
        }
      }

      // 5. Check for Task Lists: - [ ] or - [x]
      const taskMatch = line.match(/^[\t ]*[-*]\s*\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === "x";
        const content = taskMatch[2];
        blocks.push({
          id: idGen(),
          type: "taskList",
          content,
          checked,
        });
        i++;
        continue;
      }

      // 6. Check for Headings: #, ##, ###
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = Math.min(6, headingMatch[1].length) as 1 | 2 | 3 | 4 | 5 | 6;
        blocks.push({
          id: idGen(),
          type: "heading",
          level,
          content: headingMatch[2],
        });
        i++;
        continue;
      }

      // 7. Check for Bullet List: - item or * item
      const bulletMatch = line.match(/^[\t ]*[-*]\s+(.*)$/);
      if (bulletMatch) {
        blocks.push({
          id: idGen(),
          type: "bulletList",
          content: bulletMatch[1],
        });
        i++;
        continue;
      }

      // 8. Check for Ordered List: 1. item
      const orderedMatch = line.match(/^[\t ]*\d+\.\s+(.*)$/);
      if (orderedMatch) {
        blocks.push({
          id: idGen(),
          type: "orderedList",
          content: orderedMatch[1],
        });
        i++;
        continue;
      }

      // 9. Check for Blockquote: > text
      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        blocks.push({
          id: idGen(),
          type: "blockquote",
          content: quoteLines.join("\n"),
        });
        continue;
      }

      // 10. Default: Standard Paragraph
      blocks.push({
        id: idGen(),
        type: "paragraph",
        content: line,
      });
      i++;
    }

    return blocks.length > 0 ? blocks : [{ id: idGen(), type: "paragraph", content: text }];
  }
}
