import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
  type CalloutVariant,
  type DocComment,
  type DocSuggestion,
  type SignatureMetadata,
} from "../types";
import { SovereignEditorState } from "./SovereignEditorState";
import { SovereignTransaction } from "./SovereignDocTransform";
import { SovereignNode } from "./SovereignDocModel";

export interface DocOutlineItem {
  id: string;
  level: number;
  text: string;
}

/**
 * Sovereign Document Engine
 * Manages document hierarchy, state transitions, undo/redo transactions, and statistics
 */
export class DocumentEngine {
  private doc: UniversalDoc;
  private state: SovereignEditorState;

  constructor(initialDoc: UniversalDoc) {
    this.doc = {
      metadata: { ...initialDoc.metadata },
      blocks: [...initialDoc.blocks],
    };
    this.state = SovereignEditorState.fromUniversalDoc(this.doc);
    this.recalculateStats();
  }

  public getDocument(): UniversalDoc {
    return {
      metadata: { ...this.doc.metadata, ...this.state.doc.metadata },
      blocks: this.state.toDocBlocks(),
    };
  }

  public getState(): SovereignEditorState {
    return this.state;
  }

  public dispatch(tr: SovereignTransaction) {
    this.state = this.state.apply(tr);
    this.doc.blocks = this.state.toDocBlocks();
    this.doc.metadata = {
      ...this.doc.metadata,
      ...this.state.doc.metadata,
    };
    this.recalculateStats();
    this.doc.metadata.updatedAt = new Date().toISOString();
  }

  public setDocument(newDoc: UniversalDoc) {
    this.doc = {
      metadata: { ...newDoc.metadata },
      blocks: [...newDoc.blocks],
    };
    this.state = SovereignEditorState.fromUniversalDoc(this.doc);
    this.recalculateStats();
  }

  public updateTitle(title: string) {
    const tr = this.state.tr().updateDocMetadata({ title });
    this.dispatch(tr);
  }

  public updateBlockContent(id: string, content: string, html?: string) {
    const tr = this.state.tr().updateContent(id, content, html);
    this.state = this.state.apply(tr);
    this.doc.blocks = this.state.toDocBlocks();
    this.recalculateStats();
    this.doc.metadata.updatedAt = new Date().toISOString();
  }

  public toggleTaskItem(id: string) {
    const node = this.state.doc.findNode(id);
    if (node && node.type === "taskList") {
      const nextChecked = !node.checked;
      const tr = this.state.tr().updateAttrs(id, { checked: nextChecked });
      this.dispatch(tr);
    }
  }

  public insertBlockAfter(afterId: string, type: BlockType = "paragraph", content = ""): DocBlock {
    const newBlock: DocBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      level: type === "heading" ? 2 : undefined,
    };

    const node = new SovereignNode(newBlock);
    const tr = this.state.tr().insertNode(afterId, node);
    this.dispatch(tr);
    return newBlock;
  }

  public deleteBlock(id: string) {
    if (this.doc.blocks.length <= 1) return; // Keep at least one block
    const tr = this.state.tr().deleteNode(id);
    this.dispatch(tr);
  }

  public splitBlock(currentId: string, currentContent: string, newContent: string, newType: BlockType = "paragraph", currentHtml?: string): DocBlock {
    const newBlock: DocBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: newType,
      content: newContent,
    };

    const node = new SovereignNode(newBlock);
    const tr = this.state.tr()
      .updateContent(currentId, currentContent, currentHtml)
      .insertNode(currentId, node);

    this.dispatch(tr);
    return newBlock;
  }

  public updateTableRows(blockId: string, rows: import("../types").TableRow[]) {
    const tr = this.state.tr().updateAttrs(blockId, { rows });
    this.dispatch(tr);
  }

  public updateCallout(blockId: string, variant?: CalloutVariant, title?: string) {
    const attrs: Partial<DocBlock> = {};
    if (variant) attrs.calloutVariant = variant;
    if (title !== undefined) attrs.calloutTitle = title;
    const tr = this.state.tr().updateAttrs(blockId, attrs);
    this.dispatch(tr);
  }

  public updateMathLatex(blockId: string, latex: string) {
    const tr = this.state.tr().updateAttrs(blockId, { latex, content: latex });
    this.dispatch(tr);
  }

  public insertBlocksAfter(afterId: string, newBlocks: DocBlock[]): DocBlock[] {
    const tr = this.state.tr();
    let currentAfter = afterId;
    for (const b of newBlocks) {
      tr.insertNode(currentAfter, new SovereignNode(b));
      currentAfter = b.id;
    }
    this.dispatch(tr);
    return newBlocks;
  }

  public updateColumns(columns: 1 | 2 | 3, spacing = 0.5, divider = false) {
    const tr = this.state.tr().updateDocMetadata({
      columns,
      columnSpacing: spacing,
      columnDivider: divider,
    });
    this.dispatch(tr);
  }

  public updateImage(
    blockId: string,
    imageUrl: string,
    imageAlt?: string,
    imageWidth?: string,
    imageAlign?: "left" | "center" | "right"
  ) {
    const attrs: Partial<DocBlock> = { imageUrl };
    if (imageAlt !== undefined) attrs.imageAlt = imageAlt;
    if (imageWidth !== undefined) attrs.imageWidth = imageWidth;
    if (imageAlign !== undefined) attrs.imageAlign = imageAlign;
    const tr = this.state.tr().updateAttrs(blockId, attrs);
    this.dispatch(tr);
  }

  public updateTocStyle(blockId: string, tocStyle: "dotted" | "links") {
    const tr = this.state.tr().updateAttrs(blockId, { tocStyle });
    this.dispatch(tr);
  }

  public updatePaperSetup(
    paperSize: import("../types").PaperSize,
    orientation: import("../types").Orientation,
    margins?: import("../types").DocMargins,
    pageColor?: string
  ) {
    const patch: Partial<import("../types").DocumentMetadata> = {
      paperSize,
      orientation,
    };
    if (margins) patch.margins = margins;
    if (pageColor) patch.pageColor = pageColor;
    const tr = this.state.tr().updateDocMetadata(patch);
    this.dispatch(tr);
  }

  public updateFontFamily(fontFamily: string) {
    const tr = this.state.tr().updateDocMetadata({ fontFamily });
    this.dispatch(tr);
  }

  public changeBlockType(id: string, newType: BlockType, level?: 1 | 2 | 3 | 4 | 5 | 6) {
    const attrs: Partial<DocBlock> = { type: newType };
    if (newType === "heading") {
      attrs.level = level || 2;
    }
    if (newType === "taskList") {
      attrs.checked = false;
    }
    if (newType === "callout") {
      attrs.calloutVariant = "note";
      attrs.calloutTitle = "NOTE";
    }
    const tr = this.state.tr().updateAttrs(id, attrs);
    this.dispatch(tr);
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
    return this.state.canUndo();
  }

  public canRedo(): boolean {
    return this.state.canRedo();
  }

  public undo(): UniversalDoc | null {
    const undoneState = this.state.undo();
    if (undoneState) {
      this.state = undoneState;
      this.doc.blocks = this.state.toDocBlocks();
      this.doc.metadata = {
        ...this.doc.metadata,
        ...this.state.doc.metadata,
      };
      this.recalculateStats();
      return this.doc;
    }
    return null;
  }

  public redo(): UniversalDoc | null {
    const redoneState = this.state.redo();
    if (redoneState) {
      this.state = redoneState;
      this.doc.blocks = this.state.toDocBlocks();
      this.doc.metadata = {
        ...this.doc.metadata,
        ...this.state.doc.metadata,
      };
      this.recalculateStats();
      return this.doc;
    }
    return null;
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
    const footnotes = [...(this.doc.metadata.footnotes || [])];
    const nextNumber = footnotes.length + 1;
    const footnote: import("../types").FootnoteItem = {
      id: `fn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      number: nextNumber,
      text,
      blockId,
    };
    footnotes.push(footnote);
    const tr = this.state.tr().updateDocMetadata({ footnotes });
    this.dispatch(tr);
    return footnote;
  }

  public updateFootnote(id: string, text: string) {
    if (!this.doc.metadata.footnotes) return;
    const footnotes = this.doc.metadata.footnotes.map((f) =>
      f.id === id ? { ...f, text } : f
    );
    const tr = this.state.tr().updateDocMetadata({ footnotes });
    this.dispatch(tr);
  }

  public deleteFootnote(id: string) {
    if (!this.doc.metadata.footnotes) return;
    const footnotes = this.doc.metadata.footnotes
      .filter((f) => f.id !== id)
      .map((f, idx) => ({ ...f, number: idx + 1 }));
    const tr = this.state.tr().updateDocMetadata({ footnotes });
    this.dispatch(tr);
  }

  public updateHeaderFooter(
    headerText?: string,
    footerText?: string,
    differentFirstPage?: boolean,
    pageNumberStyle?: "standard" | "pageOfTotal" | "none"
  ) {
    const patch: Partial<import("../types").DocumentMetadata> = {};
    if (headerText !== undefined) patch.headerText = headerText;
    if (footerText !== undefined) patch.footerText = footerText;
    if (differentFirstPage !== undefined) patch.differentFirstPage = differentFirstPage;
    if (pageNumberStyle !== undefined) patch.pageNumberStyle = pageNumberStyle;
    const tr = this.state.tr().updateDocMetadata(patch);
    this.dispatch(tr);
  }

  public addComment(
    blockId: string,
    text: string,
    author: string,
    authorEmail?: string,
    quotedText?: string
  ): DocComment {
    const comments = [...(this.doc.metadata.comments || [])];
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
    comments.push(comment);
    const tr = this.state.tr().updateDocMetadata({ comments });
    this.dispatch(tr);
    return comment;
  }

  public addCommentReply(commentId: string, text: string, author: string, authorEmail?: string) {
    if (!this.doc.metadata.comments) return;
    const comments = this.doc.metadata.comments.map((c) => {
      if (c.id !== commentId) return c;
      const replies = [
        ...(c.replies || []),
        {
          id: `r_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          author,
          authorEmail,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
          text,
        },
      ];
      return { ...c, replies };
    });
    const tr = this.state.tr().updateDocMetadata({ comments });
    this.dispatch(tr);
  }

  public resolveComment(commentId: string) {
    if (!this.doc.metadata.comments) return;
    const comments = this.doc.metadata.comments.map((c) =>
      c.id === commentId ? { ...c, resolved: !c.resolved } : c
    );
    const tr = this.state.tr().updateDocMetadata({ comments });
    this.dispatch(tr);
  }

  public deleteComment(commentId: string) {
    if (!this.doc.metadata.comments) return;
    const comments = this.doc.metadata.comments.filter((item) => item.id !== commentId);
    const tr = this.state.tr().updateDocMetadata({ comments });
    this.dispatch(tr);
  }

  public addSuggestion(
    blockId: string,
    type: "insert" | "delete" | "replace",
    suggestedText: string,
    originalText: string = "",
    author: string = "Reviewer",
    authorEmail?: string
  ): DocSuggestion {
    const suggestions = [...(this.doc.metadata.suggestions || [])];
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
    suggestions.push(suggestion);
    const tr = this.state.tr().updateDocMetadata({ suggestions });
    this.dispatch(tr);
    return suggestion;
  }

  public acceptSuggestion(suggestionId: string) {
    if (!this.doc.metadata.suggestions) return;
    const s = this.doc.metadata.suggestions.find((item) => item.id === suggestionId);
    if (!s) return;

    const tr = this.state.tr();
    const block = this.doc.blocks.find((b) => b.id === s.blockId);
    if (block) {
      let nextContent = block.content || "";
      if (s.type === "insert") {
        nextContent = nextContent ? `${nextContent} ${s.suggestedText}` : s.suggestedText;
      } else if (s.type === "delete" && s.originalText) {
        nextContent = nextContent.replace(s.originalText, "");
      } else if (s.type === "replace") {
        if (s.originalText && nextContent.includes(s.originalText)) {
          nextContent = nextContent.replace(s.originalText, s.suggestedText);
        } else {
          nextContent = s.suggestedText;
        }
      }
      tr.updateContent(block.id, nextContent);
    }

    const suggestions = this.doc.metadata.suggestions.map((item) =>
      item.id === suggestionId ? { ...item, status: "accepted" as const } : item
    );
    tr.updateDocMetadata({ suggestions });
    this.dispatch(tr);
  }

  public rejectSuggestion(suggestionId: string) {
    if (!this.doc.metadata.suggestions) return;
    const suggestions = this.doc.metadata.suggestions.map((item) =>
      item.id === suggestionId ? { ...item, status: "rejected" as const } : item
    );
    const tr = this.state.tr().updateDocMetadata({ suggestions });
    this.dispatch(tr);
  }

  public addSignature(sig: SignatureMetadata) {
    const signatures = [...(this.doc.metadata.signatures || []), sig];
    const tr = this.state.tr().updateDocMetadata({ signatures });
    this.dispatch(tr);
  }
}
