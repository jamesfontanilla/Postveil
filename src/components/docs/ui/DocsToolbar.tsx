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
} from "lucide-react";
import { type BlockType } from "../types";

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

      {/* Inline Marks */}
      <button className="pdocs-tool-btn" title="Bold (Ctrl+B)">
        <Bold size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Italic (Ctrl+I)">
        <Italic size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Underline (Ctrl+U)">
        <Underline size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Strikethrough">
        <Strikethrough size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Inline Code">
        <Code size={16} />
      </button>

      <div className="pdocs-tool-separator" />

      {/* Alignment */}
      <button className="pdocs-tool-btn active" title="Align Left">
        <AlignLeft size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Align Center">
        <AlignCenter size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Align Right">
        <AlignRight size={16} />
      </button>
      <button className="pdocs-tool-btn" title="Justify">
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
    </div>
  );
};
