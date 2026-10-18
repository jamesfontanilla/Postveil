import { type UniversalDoc, type DocBlock, type BlockType, type CalloutVariant } from "../types";

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
    return this.doc;
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

  public updatePaperSetup(paperSize: import("../types").PaperSize, orientation: import("../types").Orientation) {
    this.doc.metadata.paperSize = paperSize;
    this.doc.metadata.orientation = orientation;
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
}
