import { type UniversalDoc, type ExportOptions, type DocBlock, type TableRow } from "../types";
import { type DocumentCodec } from "./UniversalFormatEngine";

export const markdownCodec: DocumentCodec = {
  id: "md",
  spec: {
    id: "md",
    name: "Markdown / GFM",
    extension: ".md",
    mimeType: "text/markdown",
    category: "Markup / Code",
    giantCompetitor: "Obsidian, Notion & Typora",
    description: "CommonMark + GFM with YAML frontmatter and LaTeX math.",
    isLossless: true,
    supportsMath: true,
    supportsTables: true,
  },

  async import(raw: string | ArrayBuffer): Promise<UniversalDoc> {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let title = "Imported Markdown";
    let author = "Postveil Sovereign User";
    let bodyText = text;

    // Parse YAML frontmatter if present
    if (text.startsWith("---")) {
      const parts = text.split("---");
      if (parts.length >= 3) {
        const yaml = parts[1];
        bodyText = parts.slice(2).join("---").trim();
        const titleMatch = yaml.match(/title:\s*["']?([^"'\n]+)["']?/i);
        if (titleMatch) title = titleMatch[1].trim();
        const authorMatch = yaml.match(/author:\s*["']?([^"'\n]+)["']?/i);
        if (authorMatch) author = authorMatch[1].trim();
      }
    }

    const lines = bodyText.split("\n");
    const blocks: DocBlock[] = [];
    let inCodeBlock = false;
    let codeLanguage = "";
    let codeContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeContent = [];
        } else {
          inCodeBlock = false;
          blocks.push({
            id: `b_${Date.now()}_${blocks.length}`,
            type: "codeBlock",
            language: codeLanguage || "text",
            content: codeContent.join("\n"),
          });
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        blocks.push({
          id: `b_${Date.now()}_${blocks.length}`,
          type: "heading",
          level,
          content: headingMatch[2].trim(),
        });
        continue;
      }

      // Task list item
      const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        blocks.push({
          id: `b_${Date.now()}_${blocks.length}`,
          type: "taskList",
          checked: taskMatch[1].toLowerCase() === "x",
          content: taskMatch[2].trim(),
        });
        continue;
      }

      // Bullet list item
      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        blocks.push({
          id: `b_${Date.now()}_${blocks.length}`,
          type: "bulletList",
          content: bulletMatch[1].trim(),
        });
        continue;
      }

      // Blockquote / Callout
      if (line.startsWith(">")) {
        const quoteContent = line.replace(/^>\s*/, "");
        if (quoteContent.startsWith("[!NOTE]") || quoteContent.startsWith("[!TIP]") || quoteContent.startsWith("[!WARNING]")) {
          const variant = quoteContent.includes("TIP") ? "tip" : quoteContent.includes("WARNING") ? "warning" : "note";
          blocks.push({
            id: `b_${Date.now()}_${blocks.length}`,
            type: "callout",
            calloutVariant: variant,
            calloutTitle: variant.toUpperCase(),
            content: quoteContent.replace(/\[![^\]]+\]\s*/, ""),
          });
        } else {
          blocks.push({
            id: `b_${Date.now()}_${blocks.length}`,
            type: "blockquote",
            content: quoteContent,
          });
        }
        continue;
      }

      // Math block ($$ ... $$)
      if (line.trim().startsWith("$$") && line.trim().endsWith("$$") && line.trim().length > 4) {
        blocks.push({
          id: `b_${Date.now()}_${blocks.length}`,
          type: "mathBlock",
          latex: line.trim().slice(2, -2).trim(),
        });
        continue;
      }

      // Regular paragraph
      if (line.trim().length > 0) {
        blocks.push({
          id: `b_${Date.now()}_${blocks.length}`,
          type: "paragraph",
          content: line.trim(),
        });
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
        wordCount: text.split(/\s+/).filter(Boolean).length,
        charCount: text.length,
        readingTimeMinutes: Math.ceil(text.split(/\s+/).filter(Boolean).length / 200),
        paperSize: "A4",
        orientation: "portrait",
        lineSpacing: "1.15",
        fontFamily: "Schibsted Grotesk",
        fontSize: 15,
        isEncrypted: false,
      },
      blocks: blocks.length > 0 ? blocks : [{ id: "b_1", type: "paragraph", content: "Empty document." }],
    };
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string; filename: string }> {
    const lines: string[] = [];

    // Optional YAML Frontmatter
    if (options?.includeMetadata !== false) {
      lines.push("---");
      lines.push(`title: "${doc.metadata.title}"`);
      lines.push(`author: "${doc.metadata.author}"`);
      lines.push(`date: "${doc.metadata.updatedAt}"`);
      lines.push(`generator: "Postveil P-Docs Sovereign Suite"`);
      lines.push("---\n");
    }

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const hashes = "#".repeat(block.level || 1);
          lines.push(`${hashes} ${block.content || ""}\n`);
          break;
        }
        case "paragraph": {
          lines.push(`${block.content || ""}\n`);
          break;
        }
        case "bulletList": {
          lines.push(`- ${block.content || ""}`);
          break;
        }
        case "orderedList": {
          lines.push(`1. ${block.content || ""}`);
          break;
        }
        case "taskList": {
          lines.push(`- [${block.checked ? "x" : " "}] ${block.content || ""}`);
          break;
        }
        case "blockquote": {
          lines.push(`> ${block.content || ""}\n`);
          break;
        }
        case "callout": {
          lines.push(`> [!${(block.calloutVariant || "NOTE").toUpperCase()}]`);
          lines.push(`> ${block.content || ""}\n`);
          break;
        }
        case "codeBlock": {
          lines.push(`\`\`\`${block.language || ""}`);
          lines.push(block.content || "");
          lines.push("```\n");
          break;
        }
        case "mathBlock": {
          lines.push(`$$\n${block.latex || block.content || ""}\n$$\n`);
          break;
        }
        case "divider": {
          lines.push("---\n");
          break;
        }
        case "table": {
          if (block.rows && block.rows.length > 0) {
            const headerRow = block.rows[0];
            lines.push(`| ${headerRow.cells.map((c) => c.content).join(" | ")} |`);
            lines.push(`| ${headerRow.cells.map(() => "---").join(" | ")} |`);
            for (let r = 1; r < block.rows.length; r++) {
              lines.push(`| ${block.rows[r].cells.map((c) => c.content).join(" | ")} |`);
            }
            lines.push("");
          }
          break;
        }
        default:
          if (block.content) lines.push(`${block.content}\n`);
      }
    }

    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    return {
      data: lines.join("\n"),
      filename,
    };
  },
};
