import React from "react";
import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
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
} from "lucide-react";

interface DocsCanvasProps {
  doc: UniversalDoc;
  viewMode: "paginated" | "continuous" | "markdown";
  onUpdateBlockContent: (blockId: string, content: string) => void;
  onToggleTask: (blockId: string) => void;
  onInsertBlockAfter: (afterId: string, type: BlockType) => void;
  onDeleteBlock: (blockId: string) => void;
}

export const DocsCanvas: React.FC<DocsCanvasProps> = ({
  doc,
  viewMode,
  onUpdateBlockContent,
  onToggleTask,
  onInsertBlockAfter,
  onDeleteBlock,
}) => {
  return (
    <main
      className={`pdocs-canvas-viewport ${viewMode === "continuous" ? "pdocs-canvas-continuous" : ""}`}
      role="main"
      aria-label="Document editing surface"
    >
      <div
        className="pdocs-paper-sheet"
        style={{
          fontFamily: doc.metadata.fontFamily,
          fontSize: `${doc.metadata.fontSize}px`,
          lineHeight: doc.metadata.lineSpacing,
        }}
      >
        {doc.blocks.map((block, index) => {
          return (
            <div key={block.id} id={block.id} className="pdocs-block-row group">
              {/* Block Type Rendering */}
              {renderBlock(block, onUpdateBlockContent, onToggleTask)}

              {/* Hover Quick Actions */}
              <div
                style={{
                  position: "absolute",
                  right: "-32px",
                  top: "2px",
                  display: "flex",
                  gap: "2px",
                  opacity: 0.15,
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
          );
        })}
      </div>
    </main>
  );
};

function renderBlock(
  block: DocBlock,
  onUpdate: (id: string, text: string) => void,
  onToggleTask: (id: string) => void
) {
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
        ) : (
          <Info size={16} color="#0f5132" />
        );

      return (
        <div className={`pdocs-callout callout-${variant}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {icon}
            <span className="pdocs-callout-title">{block.calloutTitle || variant.toUpperCase()}</span>
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="pdocs-block-content"
            onBlur={(e) => onUpdate(block.id, e.currentTarget.textContent || "")}
          >
            {block.content}
          </div>
        </div>
      );
    }

    case "mathBlock": {
      return (
        <div className="pdocs-math-block">
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 6, fontFamily: "sans-serif" }}>
            LaTeX Equation:
          </div>
          <div style={{ fontFamily: "KaTeX_Main, Times New Roman, serif", fontSize: "20px" }}>
            {block.latex || block.content}
          </div>
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
      return (
        <table className="pdocs-table">
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell) => {
                  const Tag = cell.isHeader ? "th" : "td";
                  return (
                    <Tag key={cell.id}>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        style={{ outline: "none" }}
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
      );
    }

    case "divider": {
      return (
        <div style={{ width: "100%", margin: "16px 0" }}>
          <hr style={{ border: "none", borderTop: "1px solid #cbd5e1" }} />
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
        >
          {block.content}
        </div>
      );
  }
}
