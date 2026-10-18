import React, { useState, useMemo } from "react";
import { SovereignMathEngine } from "../engine/SovereignMathEngine";
import { SovereignInputRules } from "../engine/SovereignInputRules";
import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
  type TableRow,
  type TableCell,
  type CalloutVariant,
  type PaperSize,
  type Orientation,
  type DocMargins,
} from "../types";
import {
  CheckSquare,
  Square,
  AlertCircle,
  Lightbulb,
  AlertTriangle,
  Flame,
  Info,
  Plus,
  Trash2,
  Sigma,
  PlusCircle,
  MinusCircle,
  Edit2,
  X,
  Check,
  Scissors,
  RotateCw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  ListTree,
  Link2,
  Bookmark,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { DocsRuler } from "./DocsRuler";
import { LlmPasteParser } from "../engine/LlmPasteParser";
import { type ReviewMode } from "../types";

interface DocsCanvasProps {
  doc: UniversalDoc;
  viewMode: "paginated" | "continuous" | "markdown";
  showRuler?: boolean;
  onMarginsChange?: (margins: DocMargins) => void;
  onUpdateBlockContent: (blockId: string, content: string) => void;
  onToggleTask: (blockId: string) => void;
  onInsertBlockAfter: (afterId: string, type: BlockType) => void;
  onDeleteBlock: (blockId: string) => void;
  onSplitBlock?: (currentId: string, currentContent: string, newContent: string, newType?: BlockType) => void;
  onUpdateTableRows?: (blockId: string, rows: TableRow[]) => void;
  onUpdateCallout?: (blockId: string, variant?: CalloutVariant, title?: string) => void;
  onUpdateMathLatex?: (blockId: string, latex: string) => void;
  onInsertBlocksAfter?: (afterId: string, blocks: DocBlock[]) => void;
  onUpdateImage?: (blockId: string, url: string, alt?: string, width?: string, align?: "left" | "center" | "right") => void;
  onUpdateToc?: (blockId: string, style: "dotted" | "links") => void;
  onAddFootnote?: (blockId: string, text?: string) => void;
  onUpdateFootnote?: (id: string, text: string) => void;
  onDeleteFootnote?: (id: string) => void;
  onUpdateHeaderFooter?: (headerText?: string, footerText?: string, differentFirstPage?: boolean, pageNumberStyle?: "standard" | "pageOfTotal" | "none") => void;
  onOpenHyperlinkModal?: (initialText?: string, initialUrl?: string) => void;
  reviewMode?: ReviewMode;
  onOpenNewCommentModal?: (blockId: string, quotedText?: string) => void;
  onChangeBlockType?: (blockId: string, type: BlockType, level?: 1 | 2 | 3 | 4 | 5 | 6) => void;
}

// Paper dimensions in pixels at 96 DPI
const PAPER_DIMENSIONS: Record<PaperSize, { portrait: { width: number; height: number }; landscape: { width: number; height: number } }> = {
  A4: { portrait: { width: 794, height: 1123 }, landscape: { width: 1123, height: 794 } },
  Letter: { portrait: { width: 816, height: 1056 }, landscape: { width: 1056, height: 816 } },
  Legal: { portrait: { width: 816, height: 1344 }, landscape: { width: 1344, height: 816 } },
  A3: { portrait: { width: 1123, height: 1587 }, landscape: { width: 1587, height: 1123 } },
  A5: { portrait: { width: 559, height: 794 }, landscape: { width: 794, height: 559 } },
  Tabloid: { portrait: { width: 1056, height: 1632 }, landscape: { width: 1632, height: 1056 } },
};

function estimateBlockHeight(block: DocBlock): number {
  switch (block.type) {
    case "heading": {
      const lvl = block.level || 1;
      return lvl === 1 ? 105 : lvl === 2 ? 54 : 46;
    }
    case "paragraph": {
      const textLen = (block.content || "").length;
      return Math.max(38, 20 + Math.ceil(textLen / 65) * 24);
    }
    case "taskList":
    case "bulletList":
    case "orderedList":
      return 36;
    case "blockquote":
      return 80;
    case "callout":
      return 125;
    case "mathBlock":
      return 145;
    case "codeBlock": {
      const lines = (block.content || "").split("\n").length;
      return 66 + lines * 20;
    }
    case "table": {
      const rowCount = block.rows?.length || 2;
      return 40 + rowCount * 38 + 12;
    }
    case "divider":
      return 35;
    case "pageBreak":
      return 0; // Page break forces new page
    case "columnBreak":
      return 0; // Column break forces column break
    case "image":
      return 260;
    case "toc":
      return 150;
    default:
      return 40;
  }
}

export const DocsCanvas: React.FC<DocsCanvasProps> = ({
  doc,
  viewMode,
  showRuler = true,
  onMarginsChange,
  onUpdateBlockContent,
  onToggleTask,
  onInsertBlockAfter,
  onDeleteBlock,
  onSplitBlock,
  onUpdateTableRows,
  onUpdateCallout,
  onUpdateMathLatex,
  onInsertBlocksAfter,
  onUpdateImage,
  onUpdateToc,
  onAddFootnote,
  onUpdateFootnote,
  onDeleteFootnote,
  onUpdateHeaderFooter,
  onOpenHyperlinkModal,
  reviewMode = "editing",
  onOpenNewCommentModal,
  onChangeBlockType,
}) => {
  // Equation Editor state
  const [editingMathBlockId, setEditingMathBlockId] = useState<string | null>(null);
  const [mathLatexInput, setMathLatexInput] = useState("");
  // TOC refresh ticker to trigger re-index
  const [, setTocTicker] = useState(0);

  // Header & Footer inline editing
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [headerTextInput, setHeaderTextInput] = useState(doc.metadata.headerText || "");
  const [isEditingFooter, setIsEditingFooter] = useState(false);
  const [footerTextInput, setFooterTextInput] = useState(doc.metadata.footerText || "");

  const paperSize = doc.metadata.paperSize || "A4";
  const orientation = doc.metadata.orientation || "portrait";
  const dim = PAPER_DIMENSIONS[paperSize]?.[orientation] || PAPER_DIMENSIONS.A4.portrait;

  const margins = doc.metadata.margins || {
    preset: "normal",
    top: 1.0,
    bottom: 1.0,
    left: 1.0,
    right: 1.0,
  };
  // 1 inch = 96px in the standard 96 DPI screen CSS point scale (matching PAPER_DIMENSIONS and DocsRuler)
  const topMarginPx = Math.round(margins.top * 96);
  const bottomMarginPx = Math.round(margins.bottom * 96);
  const leftMarginPx = Math.round(margins.left * 96);
  const rightMarginPx = Math.round(margins.right * 96);

  // Multi-page partitioning for Paginated View
  const pages = useMemo(() => {
    if (viewMode === "continuous") {
      return [doc.blocks];
    }

    const colCount = doc.metadata.columns || 1;
    // Height budget: distance between top margin and bottom margin, with 16px safety buffer
    // Multiplied by column count for multi-column documents so columns flow naturally
    const usableHeight = (dim.height - topMarginPx - bottomMarginPx - 16) * colCount;
    const result: DocBlock[][] = [];
    let currentPage: DocBlock[] = [];
    let currentHeight = 0;

    // Helper: calculate total height of a heading plus its following content block
    // to strictly prevent "widow/orphan headings" from being stranded at page bottom
    const getHeadingLeadHeight = (startIndex: number): number => {
      let leadH = 0;
      for (let j = startIndex; j < Math.min(doc.blocks.length, startIndex + 3); j++) {
        const b = doc.blocks[j];
        if (b.type === "pageBreak") break;
        leadH += estimateBlockHeight(b);
        if (b.type !== "heading") break; // Included at least one content item
      }
      return leadH;
    };

    for (let i = 0; i < doc.blocks.length; i++) {
      const block = doc.blocks[i];
      if (block.type === "pageBreak") {
        currentPage.push(block);
        result.push(currentPage);
        currentPage = [];
        currentHeight = 0;
        continue;
      }

      const h = estimateBlockHeight(block);

      // Orphan Heading Prevention ("Keep with next"):
      // If this block is a heading, ensure it is NOT stranded alone at the bottom of the page
      let orphanHeadingBreak = false;
      if (block.type === "heading" && i + 1 < doc.blocks.length) {
        const leadHeight = getHeadingLeadHeight(i);
        if (currentHeight + leadHeight > usableHeight && currentPage.length > 0) {
          orphanHeadingBreak = true;
        }
      }

      if ((orphanHeadingBreak || currentHeight + h > usableHeight) && currentPage.length > 0) {
        result.push(currentPage);
        currentPage = [block];
        currentHeight = h;
      } else {
        currentPage.push(block);
        currentHeight += h;
      }
    }

    if (currentPage.length > 0 || result.length === 0) {
      result.push(currentPage);
    }

    return result;
  }, [doc.blocks, dim.height, viewMode, topMarginPx, bottomMarginPx]);

  const handleOpenMathEditor = (blockId: string, currentLatex: string) => {
    setEditingMathBlockId(blockId);
    setMathLatexInput(currentLatex);
  };

  const handleSaveMath = () => {
    if (editingMathBlockId && onUpdateMathLatex) {
      onUpdateMathLatex(editingMathBlockId, mathLatexInput);
    }
    setEditingMathBlockId(null);
  };

  const handlePaste = (e: React.ClipboardEvent, block: DocBlock) => {
    const text = e.clipboardData.getData("text/plain");
    const html = e.clipboardData.getData("text/html");

    if (LlmPasteParser.isLlmContent(text, html)) {
      e.preventDefault();
      const parsed = LlmPasteParser.parseToBlocks(text, html);
      if (onInsertBlocksAfter) {
        onInsertBlocksAfter(block.id, parsed);
      } else {
        let lastId = block.id;
        for (const pBlock of parsed) {
          onInsertBlockAfter(lastId, pBlock.type);
          lastId = pBlock.id;
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: DocBlock) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      const sel = window.getSelection()?.toString() || "";
      onOpenHyperlinkModal?.(sel, "");
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      onAddFootnote?.(block.id);
      return;
    }

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) {
        // Ctrl+Shift+Enter or Cmd+Shift+Enter: Insert Column Break!
        onInsertBlockAfter(block.id, "columnBreak");
      } else {
        // Ctrl+Enter or Cmd+Enter: Insert Page Break directly at caret!
        onInsertBlockAfter(block.id, "pageBreak");
      }
      return;
    }

    if (e.key === " " && block.type === "paragraph") {
      const text = e.currentTarget.innerText || "";
      const rule = SovereignInputRules.test(text);
      if (rule.matched && rule.targetType) {
        e.preventDefault();
        onUpdateBlockContent(block.id, rule.cleanText || "");
        if (rule.targetType === "heading" && rule.level) {
          onChangeBlockType?.(block.id, "heading", rule.level);
        } else if (rule.targetType) {
          onChangeBlockType?.(block.id, rule.targetType);
          if (rule.targetType === "callout" && onUpdateCallout) {
            onUpdateCallout(block.id, rule.calloutVariant, rule.calloutTitle);
          }
          if (rule.targetType === "mathBlock" && onUpdateMathLatex) {
            onUpdateMathLatex(block.id, rule.cleanText || "");
          }
        }
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      // Split block on Enter for paragraphs, headings, and lists
      if (
        block.type === "paragraph" ||
        block.type === "heading" ||
        block.type === "bulletList" ||
        block.type === "orderedList" ||
        block.type === "taskList"
      ) {
        e.preventDefault();
        const sel = window.getSelection();
        let contentBefore = block.content || "";
        let contentAfter = "";

        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const text = e.currentTarget.innerText || "";
          const offset = range.startOffset;
          contentBefore = text.slice(0, offset);
          contentAfter = text.slice(offset);
        }

        const newType: BlockType =
          block.type === "heading"
            ? "paragraph"
            : block.type;

        if (onSplitBlock) {
          onSplitBlock(block.id, contentBefore, contentAfter, newType);
        } else {
          onUpdateBlockContent(block.id, contentBefore);
          onInsertBlockAfter(block.id, newType);
        }
      }
    } else if (e.key === "Backspace") {
      const text = e.currentTarget.innerText || "";
      if (text.trim() === "" && doc.blocks.length > 1) {
        e.preventDefault();
        onDeleteBlock(block.id);
      }
    }
  };

  return (
    <main
      className={`pdocs-canvas-viewport ${
        viewMode === "continuous" ? "pdocs-canvas-continuous" : viewMode === "paginated" ? "pdocs-canvas-paginated" : ""
      }`}
      role="main"
      aria-label="Document editing surface"
    >
      {/* Interactive Drag Margin Ruler */}
      {viewMode !== "continuous" && showRuler && (
        <div style={{ marginBottom: 12 }}>
          <DocsRuler
            paperWidth={dim.width}
            margins={margins}
            onMarginsChange={onMarginsChange || (() => {})}
          />
        </div>
      )}

      {pages.map((pageBlocks, pageIdx) => {
        const isContinuous = viewMode === "continuous";
        return (
          <div
            key={`page-${pageIdx}`}
            className="pdocs-paper-sheet pdocs-paper-page"
            style={{
              width: isContinuous ? "100%" : `${dim.width}px`,
              height: isContinuous ? "auto" : `${dim.height}px`,
              minHeight: isContinuous ? "auto" : `${dim.height}px`,
              position: "relative",
              overflow: isContinuous ? "visible" : "hidden",
              backgroundColor: doc.metadata.pageColor || "#ffffff",
              fontFamily: doc.metadata.fontFamily,
              fontSize: `${doc.metadata.fontSize}px`,
              lineHeight: doc.metadata.lineSpacing,
              padding: isContinuous ? "24px 32px" : "0",
              boxSizing: "border-box",
            }}
          >
            {/* Page Header (anchored strictly inside the top margin zone) */}
            {!isContinuous && (
              <div
                className="pdocs-page-header"
                onDoubleClick={() => setIsEditingHeader(true)}
                title="Double click to edit Header"
                style={{
                  position: "absolute",
                  top: 0,
                  left: `${leftMarginPx}px`,
                  right: `${rightMarginPx}px`,
                  height: `${topMarginPx}px`,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  paddingBottom: "8px",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {isEditingHeader ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#f8fafc", padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132" }}>HEADER:</span>
                    <input
                      type="text"
                      value={headerTextInput}
                      onChange={(e) => setHeaderTextInput(e.target.value)}
                      onBlur={() => {
                        onUpdateHeaderFooter?.(headerTextInput, undefined, undefined, undefined);
                        setIsEditingHeader(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onUpdateHeaderFooter?.(headerTextInput, undefined, undefined, undefined);
                          setIsEditingHeader(false);
                        }
                      }}
                      placeholder="Custom running header text..."
                      autoFocus
                      style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: "12px", color: "#334155" }}
                    />
                    <label style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: 4, color: "#64748b", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={doc.metadata.differentFirstPage || false}
                        onChange={(e) => onUpdateHeaderFooter?.(undefined, undefined, e.target.checked, undefined)}
                      />
                      Different first page
                    </label>
                  </div>
                ) : (
                  <>
                    <span className="pdocs-page-header-title">
                      {pageIdx === 0 && doc.metadata.differentFirstPage ? "" : doc.metadata.headerText || doc.metadata.title}
                    </span>
                    <span className="pdocs-page-header-stamp">
                      {paperSize} {orientation} • Margins: {margins.preset.toUpperCase()} ({margins.top}" T/B, {margins.left}" L/R)
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Page Body (strictly bounded within the top, bottom, left, and right margins) */}
            <div
              className="pdocs-page-body"
              data-columns={doc.metadata.columns || 1}
              style={{
                position: isContinuous ? "static" : "absolute",
                top: isContinuous ? "auto" : `${topMarginPx}px`,
                bottom: isContinuous ? "auto" : `${bottomMarginPx}px`,
                left: isContinuous ? "auto" : `${leftMarginPx}px`,
                right: isContinuous ? "auto" : `${rightMarginPx}px`,
                overflow: isContinuous ? "visible" : "hidden",
                boxSizing: "border-box",
                columnCount: doc.metadata.columns && doc.metadata.columns > 1 ? doc.metadata.columns : undefined,
                columnGap: doc.metadata.columns && doc.metadata.columns > 1 ? `${(doc.metadata.columnSpacing || 0.5) * 96}px` : undefined,
                columnRule: doc.metadata.columnDivider ? "1px solid #cbd5e1" : undefined,
              }}
            >
              {pageBlocks.map((block) => (
                <div key={block.id} id={block.id} className="pdocs-block-row group" style={{ breakInside: "avoid" }}>
                  {renderBlock({
                    block,
                    allBlocks: doc.blocks,
                    footnotes: doc.metadata.footnotes || [],
                    onUpdate: onUpdateBlockContent,
                    onToggleTask,
                    onKeyDown: (e) => handleKeyDown(e, block),
                    onPaste: (e) => handlePaste(e, block),
                    onOpenMathEditor: () =>
                      handleOpenMathEditor(block.id, block.latex || block.content || ""),
                    onUpdateTableRows,
                    onUpdateCallout,
                    onDeleteBlock,
                    onUpdateImage,
                    onUpdateToc,
                    onRefreshToc: () => setTocTicker((prev) => prev + 1),
                  })}

                  {/* Active Comment Indicator Pill */}
                  {(() => {
                    const blockComments = (doc.metadata.comments || []).filter(
                      (c) => c.blockId === block.id && !c.resolved
                    );
                    if (blockComments.length === 0) return null;
                    return (
                      <div
                        onClick={() => {
                          onOpenNewCommentModal?.(block.id, (block.content || "").slice(0, 50));
                        }}
                        title={`${blockComments.length} active comment(s). Click to view.`}
                        style={{
                          position: "absolute",
                          right: "-32px",
                          top: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#1d4ed8",
                          borderRadius: "999px",
                          padding: "2px 6px",
                          fontSize: "10px",
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 1px 3px rgba(37,99,235,0.12)",
                          userSelect: "none",
                        }}
                      >
                        <MessageSquare size={10} />
                        <span>{blockComments.length}</span>
                      </div>
                    );
                  })()}

                  {/* Hover Quick Actions (strictly hidden until row hover) */}
                  <div className="hover-action-tools">
                    <button
                      onClick={() => onInsertBlockAfter(block.id, "paragraph")}
                      title="Add block below"
                      className="pdocs-block-add-btn"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => onAddFootnote?.(block.id)}
                      title="Add Footnote (Ctrl+Alt+F)"
                      className="pdocs-block-add-btn"
                      style={{ fontSize: "12px", fontWeight: 700, color: "#0f5132" }}
                    >
                      ¹
                    </button>
                    <button
                      onClick={() => {
                        const sel = window.getSelection()?.toString() || "";
                        onOpenHyperlinkModal?.(sel, "");
                      }}
                      title="Insert Link (Ctrl+K)"
                      className="pdocs-block-add-btn"
                    >
                      <Link2 size={13} />
                    </button>
                    <button
                      onClick={() => {
                        const sel = window.getSelection()?.toString() || "";
                        onOpenNewCommentModal?.(block.id, sel || (block.content || "").slice(0, 50));
                      }}
                      title="Add comment (Ctrl+Alt+M)"
                      className="pdocs-block-add-btn"
                    >
                      <MessageSquare size={13} color="#2563eb" />
                    </button>
                    {doc.blocks.length > 1 && (
                      <button
                        onClick={() => onDeleteBlock(block.id)}
                        title="Delete block"
                        className="pdocs-block-delete-btn"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Page Footnotes Section */}
            {(() => {
              const allFootnotes = doc.metadata.footnotes || [];
              if (allFootnotes.length === 0) return null;
              const pageBlockIds = new Set(pageBlocks.map((b) => b.id));
              const pageFootnotes = isContinuous
                ? allFootnotes
                : allFootnotes.filter((f) => !f.blockId || pageBlockIds.has(f.blockId));

              if (pageFootnotes.length === 0) return null;

              return (
                <div
                  className="pdocs-page-footnotes"
                  style={{
                    position: isContinuous ? "static" : "absolute",
                    bottom: `${bottomMarginPx + 4}px`,
                    left: `${leftMarginPx}px`,
                    right: `${rightMarginPx}px`,
                    borderTop: "1px solid #cbd5e1",
                    paddingTop: "6px",
                    marginTop: "12px",
                    fontSize: "11px",
                    lineHeight: "1.4",
                    color: "#475569",
                    backgroundColor: doc.metadata.pageColor || "#ffffff",
                    zIndex: 10,
                  }}
                >
                  <div style={{ width: "80px", borderTop: "1px solid #475569", marginBottom: "6px" }} />
                  {pageFootnotes.map((fn) => (
                    <div
                      key={fn.id}
                      id={`footnote-${fn.id}`}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "6px",
                        marginBottom: "3px",
                      }}
                    >
                      <sup
                        style={{
                          fontWeight: 700,
                          color: "#0f5132",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          if (fn.blockId) {
                            document.getElementById(fn.blockId)?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }
                        }}
                        title="Jump to reference in body"
                      >
                        {fn.number}
                      </sup>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        style={{ outline: "none", flex: 1 }}
                        onBlur={(e) => onUpdateFootnote?.(fn.id, e.currentTarget.textContent || "")}
                      >
                        {fn.text}
                      </span>
                      {onDeleteFootnote && (
                        <button
                          onClick={() => onDeleteFootnote(fn.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px",
                            color: "#94a3b8",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                          title="Delete footnote"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Page Footer (anchored strictly inside the bottom margin zone) */}
            {!isContinuous && (
              <div
                className="pdocs-page-footer"
                onDoubleClick={() => setIsEditingFooter(true)}
                title="Double click to edit Footer"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: `${leftMarginPx}px`,
                  right: `${rightMarginPx}px`,
                  height: `${bottomMarginPx}px`,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  paddingTop: "8px",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {isEditingFooter ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#f8fafc", padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132" }}>FOOTER:</span>
                    <input
                      type="text"
                      value={footerTextInput}
                      onChange={(e) => setFooterTextInput(e.target.value)}
                      onBlur={() => {
                        onUpdateHeaderFooter?.(undefined, footerTextInput, undefined, undefined);
                        setIsEditingFooter(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onUpdateHeaderFooter?.(undefined, footerTextInput, undefined, undefined);
                          setIsEditingFooter(false);
                        }
                      }}
                      placeholder="Custom footer text..."
                      autoFocus
                      style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: "12px", color: "#334155" }}
                    />
                  </div>
                ) : (
                  <>
                    <span>
                      {doc.metadata.footerText || `${paperSize} • ${orientation.toUpperCase()}`}
                    </span>
                    <span>
                      Page {pageIdx + 1} of {pages.length}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* LaTeX Equation Editor Modal */}
      {editingMathBlockId && (
        <div className="pdocs-modal-overlay">
          <div className="pdocs-modal" style={{ maxWidth: "560px", padding: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sigma size={20} color="#0f5132" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Edit LaTeX Math Formula
                </h3>
              </div>
              <button
                onClick={() => setEditingMathBlockId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>
              LaTeX Expression:
            </label>
            <textarea
              value={mathLatexInput}
              onChange={(e) => setMathLatexInput(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
              placeholder="e.g. \nabla \times \mathbf{B} = \mu_0 \mathbf{J}"
            />

            {/* Quick Math Symbols */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 6, fontWeight: 500 }}>
                Insert Symbol:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: "110px", overflowY: "auto", padding: "4px" }}>
                {SovereignMathEngine.getSymbolPalette().map((sym) => (
                  <button
                    key={sym.label}
                    onClick={() => setMathLatexInput((prev) => (prev ? prev + " " : "") + sym.symbol)}
                    title={sym.tooltip}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "serif",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "28px",
                    }}
                  >
                    {sym.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Symbolic Equation Preview */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
                Live Compiled Preview:
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  textAlign: "center",
                  minHeight: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                dangerouslySetInnerHTML={{
                  __html: SovereignMathEngine.renderDisplay(mathLatexInput || "\\text{Empty equation}"),
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setEditingMathBlockId(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#475569",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMath}
                style={{
                  background: "#0f5132",
                  border: "none",
                  padding: "8px 18px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={16} />
                Save Equation
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

interface RenderBlockParams {
  block: DocBlock;
  allBlocks: DocBlock[];
  footnotes?: import("../types").FootnoteItem[];
  onUpdate: (id: string, text: string) => void;
  onToggleTask: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onOpenMathEditor: () => void;
  onUpdateTableRows?: (blockId: string, rows: TableRow[]) => void;
  onUpdateCallout?: (blockId: string, variant?: CalloutVariant, title?: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onUpdateImage?: (blockId: string, url: string, alt?: string, width?: string, align?: "left" | "center" | "right") => void;
  onUpdateToc?: (blockId: string, style: "dotted" | "links") => void;
  onRefreshToc?: () => void;
}

function renderBlock({
  block,
  allBlocks,
  footnotes,
  onUpdate,
  onToggleTask,
  onKeyDown,
  onPaste,
  onOpenMathEditor,
  onUpdateTableRows,
  onUpdateCallout,
  onDeleteBlock,
  onUpdateImage,
  onUpdateToc,
  onRefreshToc,
}: RenderBlockParams) {
  switch (block.type) {
    case "heading": {
      const lvl = block.level || 1;
      const cls = `pdocs-heading-${lvl}`;
      const blockFootnotes = (footnotes || []).filter((f) => f.blockId === block.id);
      return (
        <div style={{ display: "flex", alignItems: "baseline", width: "100%" }}>
          <div
            contentEditable
            suppressContentEditableWarning
            className={`pdocs-block-content ${cls}`}
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder="Heading..."
            style={{ flex: 1 }}
          >
            {block.content}
          </div>
          {blockFootnotes.map((fn) => (
            <sup
              key={fn.id}
              onClick={() => {
                document.getElementById(`footnote-${fn.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              title={`Footnote ${fn.number}: ${fn.text}`}
              style={{
                color: "#0f5132",
                fontWeight: 700,
                cursor: "pointer",
                padding: "0 4px",
                fontSize: "0.75em",
                userSelect: "none",
              }}
            >
              [{fn.number}]
            </sup>
          ))}
        </div>
      );
    }

    case "paragraph": {
      const blockFootnotes = (footnotes || []).filter((f) => f.blockId === block.id);
      return (
        <div style={{ display: "flex", alignItems: "baseline", width: "100%" }}>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content pdocs-paragraph"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder="Type '/' or paste text/math/code from chatbot..."
            style={{ flex: 1 }}
          >
            {block.content}
          </div>
          {blockFootnotes.map((fn) => (
            <sup
              key={fn.id}
              onClick={() => {
                document.getElementById(`footnote-${fn.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              title={`Footnote ${fn.number}: ${fn.text}`}
              style={{
                color: "#0f5132",
                fontWeight: 700,
                cursor: "pointer",
                padding: "0 4px",
                fontSize: "0.75em",
                userSelect: "none",
              }}
            >
              [{fn.number}]
            </sup>
          ))}
        </div>
      );
    }

    case "taskList": {
      return (
        <div className={`pdocs-task-item ${block.checked ? "checked" : ""}`}>
          <button
            onClick={() => onToggleTask(block.id)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {block.checked ? (
              <CheckSquare size={18} color="#0f5132" />
            ) : (
              <Square size={18} color="#64748b" />
            )}
          </button>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "bulletList": {
      return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%" }}>
          <span style={{ fontSize: "16px", color: "#0f5132", lineHeight: 1.6 }}>•</span>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "orderedList": {
      return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f5132", minWidth: 20 }}>
            1.
          </span>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "blockquote": {
      return (
        <div className="pdocs-blockquote">
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "callout": {
      const variant = block.calloutVariant || "note";
      const icon =
        variant === "tip" ? (
          <Lightbulb size={16} color="#15803d" />
        ) : variant === "warning" ? (
          <AlertTriangle size={16} color="#d97706" />
        ) : variant === "danger" ? (
          <Flame size={16} color="#dc2626" />
        ) : (
          <Info size={16} color="#0284c7" />
        );

      return (
        <div className={`pdocs-callout callout-${variant}`}>
          <div className="pdocs-callout-header">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {icon}
              <span
                contentEditable
                suppressContentEditableWarning
                className="pdocs-callout-title"
                onBlur={(e) => onUpdateCallout?.(block.id, undefined, e.currentTarget.textContent || "")}
              >
                {block.calloutTitle || variant.toUpperCase()}
              </span>
            </div>
            {/* Variant Switcher */}
            <select
              className="pdocs-callout-variant-select"
              value={variant}
              onChange={(e) => onUpdateCallout?.(block.id, e.target.value as CalloutVariant)}
            >
              <option value="note">Note ℹ️</option>
              <option value="tip">Tip 💡</option>
              <option value="warning">Warning ⚠️</option>
              <option value="danger">Danger 🔥</option>
              <option value="info">Info 📘</option>
            </select>
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
            onKeyDown={onKeyDown}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "mathBlock": {
      const latex = block.latex || block.content || "";
      const compiledHtml = SovereignMathEngine.renderDisplay(latex);

      return (
        <div className="pdocs-math-block" onClick={onOpenMathEditor} title="Click to edit formula">
          <div className="pdocs-math-header">
            <span>Symbolic Mathematical Equation (Click to edit)</span>
            <Edit2 size={13} color="#64748b" />
          </div>
          <div dangerouslySetInnerHTML={{ __html: compiledHtml }} />
        </div>
      );
    }

    case "codeBlock": {
      return (
        <div className="pdocs-code-block">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "#94a3b8",
              marginBottom: 8,
              borderBottom: "1px solid #334155",
              paddingBottom: 4,
            }}
          >
            <span>{block.language || "code"}</span>
            <span>Local WASM Sandbox</span>
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            style={{ whiteSpace: "pre-wrap", outline: "none" }}
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "table": {
      if (!block.rows || block.rows.length === 0) return null;

      const handleAddRow = () => {
        if (!block.rows || !onUpdateTableRows) return;
        const colCount = block.rows[0].cells.length;
        const newRow: TableRow = {
          id: `r_${Date.now()}`,
          cells: Array.from({ length: colCount }).map((_, cIdx) => ({
            id: `c_${Date.now()}_${cIdx}`,
            content: "Cell",
            isHeader: false,
          })),
        };
        onUpdateTableRows(block.id, [...block.rows, newRow]);
      };

      const handleDeleteRow = () => {
        if (!block.rows || block.rows.length <= 1 || !onUpdateTableRows) return;
        onUpdateTableRows(block.id, block.rows.slice(0, -1));
      };

      const handleAddColumn = () => {
        if (!block.rows || !onUpdateTableRows) return;
        const newRows = block.rows.map((r, rIdx) => ({
          ...r,
          cells: [
            ...r.cells,
            {
              id: `c_${Date.now()}_${rIdx}`,
              content: rIdx === 0 ? "Header" : "Data",
              isHeader: rIdx === 0,
            },
          ],
        }));
        onUpdateTableRows(block.id, newRows);
      };

      const handleDeleteColumn = () => {
        if (!block.rows || block.rows[0].cells.length <= 1 || !onUpdateTableRows) return;
        const newRows = block.rows.map((r) => ({
          ...r,
          cells: r.cells.slice(0, -1),
        }));
        onUpdateTableRows(block.id, newRows);
      };

      const handleCellChange = (rIdx: number, cIdx: number, text: string) => {
        if (!block.rows || !onUpdateTableRows) return;
        const newRows = JSON.parse(JSON.stringify(block.rows)) as TableRow[];
        newRows[rIdx].cells[cIdx].content = text;
        onUpdateTableRows(block.id, newRows);
      };

      return (
        <div className="pdocs-table-container">
          {/* Table Action Toolbar */}
          <div className="pdocs-table-toolbar">
            <button className="pdocs-table-action-btn" onClick={handleAddRow} title="Add row at bottom">
              <PlusCircle size={13} /> + Row
            </button>
            {block.rows.length > 1 && (
              <button className="pdocs-table-action-btn" onClick={handleDeleteRow} title="Delete last row">
                <MinusCircle size={13} /> - Row
              </button>
            )}
            <button className="pdocs-table-action-btn" onClick={handleAddColumn} title="Add column at right">
              <PlusCircle size={13} /> + Col
            </button>
            {block.rows[0].cells.length > 1 && (
              <button className="pdocs-table-action-btn" onClick={handleDeleteColumn} title="Delete last column">
                <MinusCircle size={13} /> - Col
              </button>
            )}
          </div>

          <table className="pdocs-table">
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr key={row.id}>
                  {row.cells.map((cell, cIdx) => {
                    const Tag = cell.isHeader ? "th" : "td";
                    return (
                      <Tag key={cell.id}>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          style={{ outline: "none" }}
                          onBlur={(e) => handleCellChange(rIdx, cIdx, e.currentTarget.textContent || "")}
                        >
                          {cell.content}
                        </div>
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "divider": {
      return (
        <div style={{ width: "100%", margin: "14px 0" }}>
          <hr style={{ border: "none", borderTop: "1px solid #cbd5e1" }} />
        </div>
      );
    }

    case "pageBreak": {
      return (
        <div className="pdocs-page-break-indicator">
          <div className="pdocs-page-break-line" />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#f1f5f9",
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              userSelect: "none",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#0f5132",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Page Break
            </span>
            {onDeleteBlock && (
              <button
                onClick={() => onDeleteBlock(block.id)}
                title="Remove Page Break (Merge with Next Page)"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  display: "inline-flex",
                  alignItems: "center",
                  color: "#dc2626",
                  borderRadius: "3px",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="pdocs-page-break-line" />
        </div>
      );
    }

    case "columnBreak": {
      return (
        <div className="pdocs-column-break-indicator" style={{ breakAfter: "column" }}>
          <div className="pdocs-column-break-line" />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#eff6ff",
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px dashed #60a5fa",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              userSelect: "none",
            }}
          >
            <Scissors size={12} color="#2563eb" />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#1d4ed8",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Column Break
            </span>
            {onDeleteBlock && (
              <button
                onClick={() => onDeleteBlock(block.id)}
                title="Remove Column Break"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  display: "inline-flex",
                  alignItems: "center",
                  color: "#dc2626",
                  borderRadius: "3px",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="pdocs-column-break-line" />
        </div>
      );
    }

    case "image": {
      const width = block.imageWidth || "100%";
      const align = block.imageAlign || "center";
      const alignJustify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

      return (
        <div
          className="pdocs-image-block"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: alignJustify,
            width: "100%",
            margin: "14px 0",
            position: "relative",
          }}
        >
          {/* Image Toolbar on Hover / Focus */}
          <div className="pdocs-image-toolbar">
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginRight: 4 }}>
              Width:
            </span>
            {(["25%", "50%", "75%", "100%"] as const).map((w) => (
              <button
                key={w}
                className={`pdocs-image-btn ${width === w ? "active" : ""}`}
                onClick={() => onUpdateImage?.(block.id, block.imageUrl || "", block.imageAlt, w, align)}
              >
                {w}
              </button>
            ))}
            <div style={{ width: 1, height: 16, background: "#cbd5e1", margin: "0 4px" }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginRight: 4 }}>
              Align:
            </span>
            <button
              className={`pdocs-image-btn ${align === "left" ? "active" : ""}`}
              onClick={() => onUpdateImage?.(block.id, block.imageUrl || "", block.imageAlt, width, "left")}
              title="Align Left"
            >
              <AlignLeft size={13} />
            </button>
            <button
              className={`pdocs-image-btn ${align === "center" ? "active" : ""}`}
              onClick={() => onUpdateImage?.(block.id, block.imageUrl || "", block.imageAlt, width, "center")}
              title="Align Center"
            >
              <AlignCenter size={13} />
            </button>
            <button
              className={`pdocs-image-btn ${align === "right" ? "active" : ""}`}
              onClick={() => onUpdateImage?.(block.id, block.imageUrl || "", block.imageAlt, width, "right")}
              title="Align Right"
            >
              <AlignRight size={13} />
            </button>
            {onDeleteBlock && (
              <>
                <div style={{ width: 1, height: 16, background: "#cbd5e1", margin: "0 4px" }} />
                <button
                  className="pdocs-image-btn pdocs-image-btn-danger"
                  onClick={() => onDeleteBlock(block.id)}
                  title="Delete Image"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>

          {/* Rendered Image */}
          <div
            style={{
              width,
              maxWidth: "100%",
              borderRadius: "6px",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {block.imageUrl ? (
              <img
                src={block.imageUrl}
                alt={block.imageAlt || "Uploaded image"}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  objectFit: "contain",
                }}
              />
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                <ImageIcon size={32} style={{ margin: "0 auto 8px" }} />
                <p style={{ margin: 0, fontSize: "12px" }}>No image data available</p>
              </div>
            )}
          </div>

          {/* Caption */}
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-image-caption"
            style={{
              fontSize: "12px",
              color: "#64748b",
              fontStyle: "italic",
              marginTop: "6px",
              textAlign: align,
              width,
              outline: "none",
            }}
            data-placeholder="Add caption..."
            onBlur={(e) =>
              onUpdateImage?.(block.id, block.imageUrl || "", e.currentTarget.textContent || "", width, align)
            }
          >
            {block.imageAlt || block.content || ""}
          </div>
        </div>
      );
    }

    case "toc": {
      const style = block.tocStyle || "dotted";
      // Find all headings from allBlocks
      const headings = allBlocks.filter((b) => b.type === "heading" && b.content?.trim());

      const handleScrollToHeading = (headingId: string) => {
        const el = document.getElementById(headingId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };

      return (
        <div className="pdocs-toc-card">
          <div className="pdocs-toc-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ListTree size={16} color="#0f766e" />
              <span className="pdocs-toc-title">Table of contents</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Style selector */}
              <div className="pdocs-toc-style-toggle">
                <button
                  className={`pdocs-toc-style-btn ${style === "dotted" ? "active" : ""}`}
                  onClick={() => onUpdateToc?.(block.id, "dotted")}
                  title="With page numbers and dotted leaders"
                >
                  Numbers
                </button>
                <button
                  className={`pdocs-toc-style-btn ${style === "links" ? "active" : ""}`}
                  onClick={() => onUpdateToc?.(block.id, "links")}
                  title="Blue hyperlink style"
                >
                  Links
                </button>
              </div>

              {/* Refresh button */}
              <button
                className="pdocs-toc-action-btn"
                onClick={onRefreshToc}
                title="Update table of contents (↺)"
              >
                <RotateCw size={13} />
              </button>

              {/* Delete button */}
              {onDeleteBlock && (
                <button
                  className="pdocs-toc-action-btn pdocs-toc-action-delete"
                  onClick={() => onDeleteBlock(block.id)}
                  title="Delete Table of contents"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="pdocs-toc-entries">
            {headings.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                Add headings (H1, H2, H3) to automatically build the table of contents.
              </p>
            ) : (
              headings.map((h, idx) => {
                const level = h.level || 1;
                const indentPx = level === 1 ? 0 : level === 2 ? 16 : 28;

                if (style === "links") {
                  return (
                    <div
                      key={h.id}
                      className="pdocs-toc-item pdocs-toc-item-link"
                      style={{ paddingLeft: `${indentPx}px` }}
                      onClick={() => handleScrollToHeading(h.id)}
                    >
                      <span className="pdocs-toc-link-text">{h.content}</span>
                    </div>
                  );
                }

                // Dotted leader style
                return (
                  <div
                    key={h.id}
                    className="pdocs-toc-item pdocs-toc-item-dotted"
                    style={{ paddingLeft: `${indentPx}px` }}
                    onClick={() => handleScrollToHeading(h.id)}
                  >
                    <span className="pdocs-toc-label">{h.content}</span>
                    <span className="pdocs-toc-dots" />
                    <span className="pdocs-toc-page-num">{idx + 1}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    default:
      return (
        <div
          contentEditable
          suppressContentEditableWarning
          className="pdocs-block-content"
          onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
          onKeyDown={onKeyDown}
        >
          {block.content}
        </div>
      );
  }
}

