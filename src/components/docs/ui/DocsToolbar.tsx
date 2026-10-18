import React from "react";
import {
  Undo,
  Redo,
  Printer,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Table as TableIcon,
  Sigma,
  AlertCircle,
  Minus,
  Scissors,
  Compass,
} from "lucide-react";
import { type BlockType, type PaperSize, type Orientation } from "../types";

interface DocsToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onInsertBlock: (type: BlockType) => void;
  fontFamily: string;
  onFontFamilyChange: (font: "Schibsted Grotesk" | "Inter" | "Merriweather" | "JetBrains Mono") => void;
  fontSize: number;
  onFontSizeChange: (delta: number) => void;
  paperSize?: PaperSize;
  orientation?: Orientation;
  onPaperSetupChange?: (size: PaperSize, orientation: Orientation) => void;
}

export const DocsToolbar: React.FC<DocsToolbarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPrint,
  onInsertBlock,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  paperSize = "A4",
  orientation = "portrait",
  onPaperSetupChange,
}) => {
  return (
    <div className="pdocs-toolbar" role="toolbar" aria-label="Document editing tools">
      {/* Undo / Redo */}
      <button
        className="pdocs-tool-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        style={{ opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        style={{ opacity: canRedo ? 1 : 0.4 }}
      >
        <Redo size={16} />
      </button>

      <button className="pdocs-tool-btn" onClick={onPrint} title="Print / PDF (Ctrl+P)">
        <Printer size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Paragraph Style Picker */}
      <select
        className="pdocs-select"
        onChange={(e) => {
          const val = e.target.value;
          if (val.startsWith("heading-")) {
            onInsertBlock("heading");
          } else if (val === "quote") {
            onInsertBlock("blockquote");
          } else if (val === "code") {
            onInsertBlock("codeBlock");
          } else {
            onInsertBlock("paragraph");
          }
        }}
        defaultValue="paragraph"
        title="Styles"
      >
        <option value="paragraph">Normal text</option>
        <option value="heading-1">Title (Heading 1)</option>
        <option value="heading-2">Subtitle (Heading 2)</option>
        <option value="heading-3">Heading 3</option>
        <option value="quote">Quote Block</option>
        <option value="code">Code Block</option>
      </select>

      {/* Font Family */}
      <select
        className="pdocs-select"
        value={fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value as any)}
        title="Font Family"
      >
        <option value="Schibsted Grotesk">Schibsted Grotesk (Default)</option>
        <option value="Inter">Inter</option>
        <option value="Merriweather">Merriweather (Serif)</option>
        <option value="JetBrains Mono">JetBrains Mono (Code)</option>
      </select>

      {/* Font Size */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button
          className="pdocs-tool-btn"
          onClick={() => onFontSizeChange(-1)}
          title="Decrease font size"
          style={{ width: 24, padding: 0 }}
        >
          -
        </button>
        <span style={{ fontSize: "12px", fontWeight: 600, width: "22px", textAlign: "center" }}>
          {fontSize}
        </span>
        <button
          className="pdocs-tool-btn"
          onClick={() => onFontSizeChange(1)}
          title="Increase font size"
          style={{ width: 24, padding: 0 }}
        >
          +
        </button>
      </div>

      <div className="pdocs-tool-separator" />

      {/* Inline Marks with Selection Preservation */}
      <button
        className="pdocs-tool-btn"
        title="Bold (Ctrl+B)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("bold");
        }}
      >
        <Bold size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Italic (Ctrl+I)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("italic");
        }}
      >
        <Italic size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Underline (Ctrl+U)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("underline");
        }}
      >
        <Underline size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Strikethrough"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("strikeThrough");
        }}
      >
        <Strikethrough size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Inline Code"
        onMouseDown={(e) => {
          e.preventDefault();
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          const text = range.toString();
          if (!text) return;
          const code = document.createElement("code");
          code.style.backgroundColor = "#f1f5f9";
          code.style.padding = "2px 6px";
          code.style.borderRadius = "4px";
          code.style.fontFamily = "'JetBrains Mono', monospace";
          code.style.fontSize = "0.9em";
          code.style.color = "#0f5132";
          code.textContent = text;
          range.deleteContents();
          range.insertNode(code);
        }}
      >
        <Code size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Alignment */}
      <button
        className="pdocs-tool-btn"
        title="Align Left"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("justifyLeft");
        }}
      >
        <AlignLeft size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Align Center"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("justifyCenter");
        }}
      >
        <AlignCenter size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Align Right"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("justifyRight");
        }}
      >
        <AlignRight size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Justify"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("justifyFull");
        }}
      >
        <AlignJustify size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Lists */}
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("bulletList")}
        title="Bulleted List"
      >
        <List size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("orderedList")}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("taskList")}
        title="Interactive Checklist"
      >
        <CheckSquare size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Block Insertions */}
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("table")}
        title="Insert Table"
      >
        <TableIcon size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("mathBlock")}
        title="Insert LaTeX Math Equation"
      >
        <Sigma size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("callout")}
        title="Insert Sovereign Callout"
      >
        <AlertCircle size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("divider")}
        title="Insert Horizontal Rule"
      >
        <Minus size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("pageBreak")}
        title="Insert Page Break (New Page)"
      >
        <Scissors size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Paper Size Selector */}
      <select
        className="pdocs-select"
        value={paperSize}
        onChange={(e) => onPaperSetupChange?.(e.target.value as PaperSize, orientation)}
        title="Paper Size"
      >
        <option value="A4">A4 (210 × 297mm)</option>
        <option value="Letter">US Letter (8.5 × 11")</option>
        <option value="Legal">US Legal (8.5 × 14")</option>
        <option value="A3">A3 (297 × 420mm)</option>
        <option value="A5">A5 (148 × 210mm)</option>
        <option value="Tabloid">Tabloid (11 × 17")</option>
      </select>

      {/* Orientation Toggle */}
      <button
        className={`pdocs-tool-btn ${orientation === "landscape" ? "active" : ""}`}
        onClick={() =>
          onPaperSetupChange?.(paperSize, orientation === "portrait" ? "landscape" : "portrait")
        }
        title={`Orientation: ${orientation} (click to toggle)`}
        style={{
          backgroundColor: orientation === "landscape" ? "#e2e8f0" : "transparent",
        }}
      >
        <Compass size={16} />
      </button>
    </div>
  );
};
