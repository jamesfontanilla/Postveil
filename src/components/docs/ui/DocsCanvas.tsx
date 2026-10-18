import React, { useState, useMemo } from "react";
import katex from "katex";
import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
  type TableRow,
  type TableCell,
  type CalloutVariant,
  type PaperSize,
  type Orientation,
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
} from "lucide-react";

interface DocsCanvasProps {
  doc: UniversalDoc;
  viewMode: "paginated" | "continuous" | "markdown";
  onUpdateBlockContent: (blockId: string, content: string) => void;
  onToggleTask: (blockId: string) => void;
  onInsertBlockAfter: (afterId: string, type: BlockType) => void;
  onDeleteBlock: (blockId: string) => void;
  onSplitBlock?: (currentId: string, currentContent: string, newContent: string, newType?: BlockType) => void;
  onUpdateTableRows?: (blockId: string, rows: TableRow[]) => void;
  onUpdateCallout?: (blockId: string, variant?: CalloutVariant, title?: string) => void;
  onUpdateMathLatex?: (blockId: string, latex: string) => void;
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
      return lvl === 1 ? 80 : lvl === 2 ? 60 : 45;
    }
    case "paragraph": {
      const textLen = (block.content || "").length;
      return Math.max(34, 28 + Math.ceil(textLen / 75) * 22);
    }
    case "taskList":
    case "bulletList":
    case "orderedList":
      return 36;
    case "blockquote":
      return 75;
    case "callout":
      return 110;
    case "mathBlock":
      return 100;
    case "codeBlock": {
      const lines = (block.content || "").split("\n").length;
      return Math.max(70, 40 + lines * 20);
    }
    case "table": {
      const rowCount = block.rows?.length || 2;
      return 45 + rowCount * 38;
    }
    case "divider":
      return 35;
    case "pageBreak":
      return 0; // Page break forces new page
    default:
      return 40;
  }
}

export const DocsCanvas: React.FC<DocsCanvasProps> = ({
  doc,
  viewMode,
  onUpdateBlockContent,
  onToggleTask,
  onInsertBlockAfter,
  onDeleteBlock,
  onSplitBlock,
  onUpdateTableRows,
  onUpdateCallout,
  onUpdateMathLatex,
}) => {
  // Equation Editor state
  const [editingMathBlockId, setEditingMathBlockId] = useState<string | null>(null);
  const [mathLatexInput, setMathLatexInput] = useState("");

  const paperSize = doc.metadata.paperSize || "A4";
  const orientation = doc.metadata.orientation || "portrait";
  const dim = PAPER_DIMENSIONS[paperSize]?.[orientation] || PAPER_DIMENSIONS.A4.portrait;

  // Multi-page partitioning for Paginated View
  const pages = useMemo(() => {
    if (viewMode === "continuous") {
      return [doc.blocks];
    }

    const usableHeight = dim.height - 180; // Accounting for 56px top + 56px bottom + headers/footers
    const result: DocBlock[][] = [];
    let currentPage: DocBlock[] = [];
    let currentHeight = 0;

    for (const block of doc.blocks) {
      if (block.type === "pageBreak") {
        if (currentPage.length > 0) {
          result.push(currentPage);
          currentPage = [];
          currentHeight = 0;
        }
        continue;
      }

      const h = estimateBlockHeight(block);
      if (currentHeight + h > usableHeight && currentPage.length > 0) {
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
  }, [doc.blocks, dim.height, viewMode]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: DocBlock) => {
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
      className={`pdocs-canvas-viewport ${viewMode === "continuous" ? "pdocs-canvas-continuous" : ""}`}
      role="main"
      aria-label="Document editing surface"
    >
      {pages.map((pageBlocks, pageIdx) => {
        return (
          <div
            key={`page-${pageIdx}`}
            className="pdocs-paper-sheet pdocs-paper-page"
            style={{
              width: viewMode === "continuous" ? "100%" : `min(${dim.width}px, 100%)`,
              minHeight: viewMode === "continuous" ? "auto" : `${dim.height}px`,
              fontFamily: doc.metadata.fontFamily,
              fontSize: `${doc.metadata.fontSize}px`,
              lineHeight: doc.metadata.lineSpacing,
            }}
          >
            {/* Page Header */}
            {viewMode !== "continuous" && (
              <div className="pdocs-page-header">
                <span className="pdocs-page-header-title">{doc.metadata.title}</span>
                <span className="pdocs-page-header-stamp">
                  Postveil Sovereign Suite • {paperSize} {orientation}
                </span>
              </div>
            )}

            {/* Page Body */}
            <div className="pdocs-page-body">
              {pageBlocks.map((block) => (
                <div key={block.id} id={block.id} className="pdocs-block-row group">
                  {renderBlock({
                    block,
                    onUpdate: onUpdateBlockContent,
                    onToggleTask,
                    onKeyDown: (e) => handleKeyDown(e, block),
                    onOpenMathEditor: () =>
                      handleOpenMathEditor(block.id, block.latex || block.content || ""),
                    onUpdateTableRows,
                    onUpdateCallout,
                  })}

                  {/* Hover Quick Actions */}
                  <div
                    style={{
                      position: "absolute",
                      right: "-36px",
                      top: "2px",
                      display: "flex",
                      gap: "2px",
                      opacity: 0.18,
                      transition: "opacity 0.2s ease",
                    }}
                    className="hover-action-tools"
                  >
                    <button
                      onClick={() => onInsertBlockAfter(block.id, "paragraph")}
                      title="Add block below"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        color: "#64748b",
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    {doc.blocks.length > 1 && (
                      <button
                        onClick={() => onDeleteBlock(block.id)}
                        title="Delete block"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                          color: "#dc2626",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Page Footer */}
            {viewMode !== "continuous" && (
              <div className="pdocs-page-footer">
                <span>
                  {paperSize} • {orientation.toUpperCase()}
                </span>
                <span>
                  Page {pageIdx + 1} of {pages.length}
                </span>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { label: "∂", code: "\\partial " },
                  { label: "∇", code: "\\nabla " },
                  { label: "×", code: "\\times " },
                  { label: "∫", code: "\\int " },
                  { label: "∑", code: "\\sum " },
                  { label: "a/b", code: "\\frac{a}{b} " },
                  { label: "√x", code: "\\sqrt{x} " },
                  { label: "π", code: "\\pi " },
                  { label: "∞", code: "\\infty " },
                  { label: "±", code: "\\pm " },
                  { label: "≈", code: "\\approx " },
                  { label: "ε₀", code: "\\varepsilon_0 " },
                  { label: "μ₀", code: "\\mu_0 " },
                ].map((sym) => (
                  <button
                    key={sym.label}
                    onClick={() => setMathLatexInput((prev) => prev + sym.code)}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "serif",
                    }}
                  >
                    {sym.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live KaTeX Preview */}
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
                  __html: (() => {
                    try {
                      return katex.renderToString(mathLatexInput || "\\text{Empty equation}", {
                        displayMode: true,
                        throwOnError: false,
                      });
                    } catch {
                      return `<span style="color:#dc2626;">Invalid LaTeX</span>`;
                    }
                  })(),
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
  onUpdate: (id: string, text: string) => void;
  onToggleTask: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onOpenMathEditor: () => void;
  onUpdateTableRows?: (blockId: string, rows: TableRow[]) => void;
  onUpdateCallout?: (blockId: string, variant?: CalloutVariant, title?: string) => void;
}

function renderBlock({
  block,
  onUpdate,
  onToggleTask,
  onKeyDown,
  onOpenMathEditor,
  onUpdateTableRows,
  onUpdateCallout,
}: RenderBlockParams) {
  switch (block.type) {
    case "heading": {
      const lvl = block.level || 1;
      const cls = `pdocs-heading-${lvl}`;
      return (
        <div
          contentEditable
          suppressContentEditableWarning
          className={`pdocs-block-content ${cls}`}
          onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
          onKeyDown={onKeyDown}
          data-placeholder="Heading..."
        >
          {block.content}
        </div>
      );
    }

    case "paragraph": {
      return (
        <div
          contentEditable
          suppressContentEditableWarning
          className="pdocs-block-content pdocs-paragraph"
          onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
          onKeyDown={onKeyDown}
          data-placeholder="Type '/' or click toolbar to insert content..."
        >
          {block.content}
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
      let compiledHtml = "";
      try {
        compiledHtml = katex.renderToString(latex, { displayMode: true, throwOnError: false });
      } catch {
        compiledHtml = `<span style="color:#dc2626;">${latex}</span>`;
      }

      return (
        <div className="pdocs-math-block" onClick={onOpenMathEditor} title="Click to edit formula">
          <div className="pdocs-math-header">
            <span>LaTeX Math Equation (Click to edit)</span>
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
          <span className="pdocs-page-break-label">--- Page Break ---</span>
          <div className="pdocs-page-break-line" />
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

