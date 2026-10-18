import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
  type CalloutVariant,
  type DocComment,
  type DocSuggestion,
  type CryptographicSignature,
} from "../types";

export interface DocOutlineItem {
  id: string;
  level: number;
  text: string;
}

export class DocumentEngine {
  private doc: UniversalDoc;
  private history: UniversalDoc[] = [];
  private historyIndex = -1;
  private maxHistory = 50;

  constructor(initialDoc: UniversalDoc) {
    this.doc = JSON.parse(JSON.stringify(initialDoc));
    this.recalculateStats();
    this.pushHistory();
  }

  public getDocument(): UniversalDoc {
    return {
      ...this.doc,
      metadata: { ...this.doc.metadata },
      blocks: [...this.doc.blocks],
    };
  }

  public setDocument(newDoc: UniversalDoc) {
    this.doc = JSON.parse(JSON.stringify(newDoc));
    this.recalculateStats();
    this.pushHistory();
  }

  public updateTitle(title: string) {
    this.doc.metadata.title = title;
    this.doc.metadata.updatedAt = new Date().toISOString();
  }

  public updateBlockContent(id: string, content: string) {
    const block = this.doc.blocks.find((b) => b.id === id);
    if (block) {
      block.content = content;
      this.recalculateStats();
      this.doc.metadata.updatedAt = new Date().toISOString();
    }
  }

  public toggleTaskItem(id: string) {
    const block = this.doc.blocks.find((b) => b.id === id);
    if (block && block.type === "taskList") {
      block.checked = !block.checked;
      this.pushHistory();
    }
  }

  public insertBlockAfter(afterId: string, type: BlockType = "paragraph", content = ""): DocBlock {
    const index = this.doc.blocks.findIndex((b) => b.id === afterId);
    const newBlock: DocBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      level: type === "heading" ? 2 : undefined,
    };

    if (index >= 0) {
      this.doc.blocks.splice(index + 1, 0, newBlock);
    } else {
      this.doc.blocks.push(newBlock);
    }

    this.recalculateStats();
    this.pushHistory();
    return newBlock;
  }

  public deleteBlock(id: string) {
    if (this.doc.blocks.length <= 1) return; // Keep at least one block
    this.doc.blocks = this.doc.blocks.filter((b) => b.id !== id);
    this.recalculateStats();
    this.pushHistory();
  }

  public splitBlock(currentId: string, currentContent: string, newContent: string, newType: BlockType = "paragraph"): DocBlock {
    const blockIndex = this.doc.blocks.findIndex((b) => b.id === currentId);
    if (blockIndex >= 0) {
      this.doc.blocks[blockIndex].content = currentContent;
    }
    const newBlock: DocBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: newType,
      content: newContent,
    };
    if (blockIndex >= 0) {
      this.doc.blocks.splice(blockIndex + 1, 0, newBlock);
    } else {
      this.doc.blocks.push(newBlock);
    }
    this.recalculateStats();
    this.pushHistory();
    return newBlock;
  }

  public updateTableRows(blockId: string, rows: import("../types").TableRow[]) {
    const block = this.doc.blocks.find((b) => b.id === blockId);
    if (block) {
      block.rows = rows;
      this.recalculateStats();
      this.pushHistory();
    }
  }

  public updateCallout(blockId: string, variant?: CalloutVariant, title?: string) {
    const block = this.doc.blocks.find((b) => b.id === blockId);
    if (block) {
      if (variant) block.calloutVariant = variant;
      if (title !== undefined) block.calloutTitle = title;
      this.pushHistory();
    }
  }

  public updateMathLatex(blockId: string, latex: string) {
    const block = this.doc.blocks.find((b) => b.id === blockId);
    if (block) {
      block.latex = latex;
      block.content = latex;
      this.pushHistory();
    }
  }

  public insertBlocksAfter(afterId: string, newBlocks: DocBlock[]): DocBlock[] {
    const index = this.doc.blocks.findIndex((b) => b.id === afterId);
    if (index >= 0) {
      this.doc.blocks.splice(index + 1, 0, ...newBlocks);
    } else {
      this.doc.blocks.push(...newBlocks);
    }
    this.recalculateStats();
    this.pushHistory();
    return newBlocks;
  }

  public updateColumns(columns: 1 | 2 | 3, spacing = 0.5, divider = false) {
    this.doc.metadata.columns = columns;
    this.doc.metadata.columnSpacing = spacing;
    this.doc.metadata.columnDivider = divider;
    this.doc.metadata.updatedAt = new Date().toISOString();
    this.pushHistory();
  }

  public updateImage(
    blockId: string,
    imageUrl: string,
    imageAlt?: string,
    imageWidth?: string,
    imageAlign?: "left" | "center" | "right"
  ) {
    const block = this.doc.blocks.find((b) => b.id === blockId);
    if (block) {
      block.imageUrl = imageUrl;
      if (imageAlt !== undefined) block.imageAlt = imageAlt;
      if (imageWidth !== undefined) block.imageWidth = imageWidth;
      if (imageAlign !== undefined) block.imageAlign = imageAlign;
      this.pushHistory();
    }
  }

  public updateTocStyle(blockId: string, tocStyle: "dotted" | "links") {
    const block = this.doc.blocks.find((b) => b.id === blockId);
    if (block) {
      block.tocStyle = tocStyle;
      this.pushHistory();
    }
  }

  public updatePaperSetup(
    paperSize: import("../types").PaperSize,
    orientation: import("../types").Orientation,
    margins?: import("../types").DocMargins,
    pageColor?: string
  ) {
    this.doc.metadata.paperSize = paperSize;
    this.doc.metadata.orientation = orientation;
    if (margins) this.doc.metadata.margins = margins;
    if (pageColor) this.doc.metadata.pageColor = pageColor;
    this.doc.metadata.updatedAt = new Date().toISOString();
    this.pushHistory();
  }

  public changeBlockType(id: string, newType: BlockType, level?: 1 | 2 | 3 | 4 | 5 | 6) {
    const block = this.doc.blocks.find((b) => b.id === id);
    if (block) {
      block.type = newType;
      if (newType === "heading") {
        block.level = level || 2;
      }
      if (newType === "taskList") {
        block.checked = false;
      }
      if (newType === "callout") {
        block.calloutVariant = "note";
        block.calloutTitle = "NOTE";
      }
      this.pushHistory();
    }
  }

  public getOutline(): DocOutlineItem[] {
    const items: DocOutlineItem[] = [];
    for (const b of this.doc.blocks) {
      if (b.type === "heading" && b.content?.trim()) {
        items.push({
          id: b.id,
          level: b.level || 1,
          text: b.content.trim(),
        });
      }
    }
    return items;
  }

  public canUndo(): boolean {
    return this.historyIndex > 0;
  }

  public canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  public undo(): UniversalDoc | null {
    if (this.canUndo()) {
      this.historyIndex--;
      this.doc = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      return this.doc;
    }
    return null;
  }

  public redo(): UniversalDoc | null {
    if (this.canRedo()) {
      this.historyIndex++;
      this.doc = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      return this.doc;
    }
    return null;
  }

  private pushHistory() {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(JSON.parse(JSON.stringify(this.doc)));
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  private recalculateStats() {
    let words = 0;
    let chars = 0;

    for (const b of this.doc.blocks) {
      const text = b.content || b.latex || "";
      chars += text.length;
      words += text.split(/\s+/).filter(Boolean).length;
      if (b.type === "table" && b.rows) {
        for (const r of b.rows) {
          for (const c of r.cells) {
            chars += c.content.length;
            words += c.content.split(/\s+/).filter(Boolean).length;
          }
        }
      }
    }

    this.doc.metadata.wordCount = words;
    this.doc.metadata.charCount = chars;
    this.doc.metadata.readingTimeMinutes = Math.max(1, Math.ceil(words / 200));
  }

  public addFootnote(blockId: string, text: string = "Footnote citation or reference text"): import("../types").FootnoteItem {
    if (!this.doc.metadata.footnotes) {
      this.doc.metadata.footnotes = [];
    }
    const nextNumber = this.doc.metadata.footnotes.length + 1;
    const footnote: import("../types").FootnoteItem = {
      id: `fn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      number: nextNumber,
      text,
      blockId,
    };
    this.doc.metadata.footnotes.push(footnote);
    this.pushHistory();
    return footnote;
  }

  public updateFootnote(id: string, text: string) {
    if (!this.doc.metadata.footnotes) return;
    const fn = this.doc.metadata.footnotes.find((f) => f.id === id);
    if (fn) {
      fn.text = text;
      this.pushHistory();
    }
  }

  public deleteFootnote(id: string) {
    if (!this.doc.metadata.footnotes) return;
    this.doc.metadata.footnotes = this.doc.metadata.footnotes.filter((f) => f.id !== id);
    // Renumber remaining footnotes
    this.doc.metadata.footnotes.forEach((f, idx) => {
      f.number = idx + 1;
    });
    this.pushHistory();
  }

  public updateHeaderFooter(
    headerText?: string,
    footerText?: string,
    differentFirstPage?: boolean,
    pageNumberStyle?: "standard" | "pageOfTotal" | "none"
  ) {
    if (headerText !== undefined) this.doc.metadata.headerText = headerText;
    if (footerText !== undefined) this.doc.metadata.footerText = footerText;
    if (differentFirstPage !== undefined) this.doc.metadata.differentFirstPage = differentFirstPage;
    if (pageNumberStyle !== undefined) this.doc.metadata.pageNumberStyle = pageNumberStyle;
    this.pushHistory();
  }

  public addComment(
    blockId: string,
    text: string,
    author: string,
    authorEmail?: string,
    quotedText?: string
  ): DocComment {
    if (!this.doc.metadata.comments) this.doc.metadata.comments = [];
    const comment: DocComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      blockId,
      quotedText,
      author,
      authorEmail,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
      text,
      resolved: false,
      replies: [],
    };
    this.doc.metadata.comments.push(comment);
    this.pushHistory();
    return comment;
  }

  public addCommentReply(commentId: string, text: string, author: string, authorEmail?: string) {
    if (!this.doc.metadata.comments) return;
    const c = this.doc.metadata.comments.find((item) => item.id === commentId);
    if (c) {
      c.replies.push({
        id: `r_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        author,
        authorEmail,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        text,
      });
      this.pushHistory();
    }
  }

  public resolveComment(commentId: string) {
    if (!this.doc.metadata.comments) return;
    const c = this.doc.metadata.comments.find((item) => item.id === commentId);
    if (c) {
      c.resolved = !c.resolved;
      this.pushHistory();
    }
  }

  public deleteComment(commentId: string) {
    if (!this.doc.metadata.comments) return;
    this.doc.metadata.comments = this.doc.metadata.comments.filter((item) => item.id !== commentId);
    this.pushHistory();
  }

  public addSuggestion(
    blockId: string,
    type: "insert" | "delete" | "replace",
    suggestedText: string,
    originalText: string = "",
    author: string = "Reviewer",
    authorEmail?: string
  ): DocSuggestion {
    if (!this.doc.metadata.suggestions) this.doc.metadata.suggestions = [];
    const suggestion: DocSuggestion = {
      id: `s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      blockId,
      author,
      authorEmail,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
      type,
      originalText,
      suggestedText,
      status: "pending",
    };
    this.doc.metadata.suggestions.push(suggestion);
    this.pushHistory();
    return suggestion;
  }

  public acceptSuggestion(suggestionId: string) {
    if (!this.doc.metadata.suggestions) return;
    const s = this.doc.metadata.suggestions.find((item) => item.id === suggestionId);
    if (!s) return;

    const block = this.doc.blocks.find((b) => b.id === s.blockId);
    if (block) {
      if (s.type === "insert") {
        block.content = block.content ? `${block.content} ${s.suggestedText}` : s.suggestedText;
      } else if (s.type === "delete" && s.originalText) {
        block.content = (block.content || "").replace(s.originalText, "");
      } else if (s.type === "replace") {
        if (s.originalText && (block.content || "").includes(s.originalText)) {
          block.content = (block.content || "").replace(s.originalText, s.suggestedText);
        } else {
          block.content = s.suggestedText;
        }
      }
    }
    s.status = "accepted";
    this.pushHistory();
  }

  public rejectSuggestion(suggestionId: string) {
    if (!this.doc.metadata.suggestions) return;
    const s = this.doc.metadata.suggestions.find((item) => item.id === suggestionId);
    if (s) {
      s.status = "rejected";
      this.pushHistory();
    }
  }

  public addSignature(sig: CryptographicSignature) {
    if (!this.doc.metadata.signatures) this.doc.metadata.signatures = [];
    this.doc.metadata.signatures.push(sig);
    this.pushHistory();
  }
}
