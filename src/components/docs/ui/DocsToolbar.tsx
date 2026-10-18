import React, { useState, useRef } from "react";
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
  Sliders,
  Settings2,
  Highlighter,
  Baseline,
  Subscript,
  Superscript,
  RemoveFormatting,
  MoveVertical,
  Search,
  Columns,
  Image as ImageIcon,
  ListTree,
  Check,
  Link2,
  Bookmark,
} from "lucide-react";
import {
  type BlockType,
  type PaperSize,
  type Orientation,
  type DocMargins,
  type MarginPreset,
} from "../types";

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
  lineSpacing?: "1.0" | "1.15" | "1.5" | "2.0";
  onLineSpacingChange?: (spacing: "1.0" | "1.15" | "1.5" | "2.0") => void;
  paperSize?: PaperSize;
  orientation?: Orientation;
  margins?: DocMargins;
  onPaperSetupChange?: (size: PaperSize, orientation: Orientation) => void;
  onMarginsChange?: (margins: DocMargins) => void;
  onOpenPageSetup?: () => void;
  onOpenFindReplace?: () => void;
  columns?: 1 | 2 | 3;
  columnSpacing?: number;
  columnDivider?: boolean;
  onColumnsChange?: (columns: 1 | 2 | 3, spacing?: number, divider?: boolean) => void;
  onInsertImageFile?: (file: File) => void;
  onOpenHyperlinkModal?: (text?: string, url?: string) => void;
  onAddFootnote?: () => void;
}

const TEXT_COLORS = [
  { name: "Black", color: "#000000" },
  { name: "Dark Slate", color: "#334155" },
  { name: "Gray", color: "#64748b" },
  { name: "Postveil Green", color: "#0f5132" },
  { name: "Emerald", color: "#16a34a" },
  { name: "Teal", color: "#0d9488" },
  { name: "Cyan", color: "#0891b2" },
  { name: "Blue", color: "#2563eb" },
  { name: "Indigo", color: "#4f46e5" },
  { name: "Purple", color: "#9333ea" },
  { name: "Pink", color: "#db2777" },
  { name: "Red", color: "#dc2626" },
  { name: "Orange", color: "#ea580c" },
  { name: "Amber", color: "#d97706" },
  { name: "Yellow", color: "#ca8a04" },
  { name: "Pure White", color: "#ffffff" },
];

const HIGHLIGHT_COLORS = [
  { name: "None", color: "transparent" },
  { name: "Pastel Yellow", color: "#fef08a" },
  { name: "Pastel Green", color: "#bbf7d0" },
  { name: "Pastel Cyan", color: "#a5f3fc" },
  { name: "Pastel Blue", color: "#bfdbfe" },
  { name: "Pastel Purple", color: "#e9d5ff" },
  { name: "Pastel Pink", color: "#fbcfe8" },
  { name: "Pastel Orange", color: "#fed7aa" },
];

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
  lineSpacing = 1.6,
  onLineSpacingChange,
  paperSize = "A4",
  orientation = "portrait",
  margins = { preset: "normal", top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 },
  onPaperSetupChange,
  onMarginsChange,
  onOpenPageSetup,
  onOpenFindReplace,
  columns = 1,
  columnSpacing = 0.5,
  columnDivider = false,
  onColumnsChange,
  onInsertImageFile,
  onOpenHyperlinkModal,
  onAddFootnote,
}) => {
  const [activeTextColor, setActiveTextColor] = useState("#000000");
  const [activeHighlightColor, setActiveHighlightColor] = useState("transparent");
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);
  const [isLineSpacingOpen, setIsLineSpacingOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyTextColor = (color: string) => {
    setActiveTextColor(color);
    document.execCommand("foreColor", false, color);
    setIsTextColorOpen(false);
  };

  const applyHighlightColor = (color: string) => {
    setActiveHighlightColor(color);
    if (color === "transparent") {
      document.execCommand("removeFormat");
    } else {
      document.execCommand("hiliteColor", false, color);
    }
    setIsHighlightOpen(false);
  };

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

      {/* Find and Replace Trigger */}
      <button
        className="pdocs-tool-btn"
        onClick={onOpenFindReplace}
        title="Find and replace (Ctrl+H)"
      >
        <Search size={16} />
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

      {/* Text Color Dropdown */}
      <div style={{ position: "relative" }}>
        <button
          className="pdocs-tool-btn"
          title="Text color"
          onClick={() => {
            setIsTextColorOpen(!isTextColorOpen);
            setIsHighlightOpen(false);
            setIsLineSpacingOpen(false);
          }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        >
          <Baseline size={15} />
          <div
            style={{
              width: "14px",
              height: "3px",
              backgroundColor: activeTextColor,
              borderRadius: "1px",
            }}
          />
        </button>
        {isTextColorOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 120 }}
              onClick={() => setIsTextColorOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "34px",
                left: 0,
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                border: "1px solid #cbd5e1",
                padding: "8px",
                zIndex: 130,
                display: "grid",
                gridTemplateColumns: "repeat(4, 24px)",
                gap: "6px",
              }}
            >
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => applyTextColor(c.color)}
                  title={c.name}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "4px",
                    backgroundColor: c.color,
                    border: c.color === "#ffffff" ? "1px solid #cbd5e1" : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Highlight Color Dropdown */}
      <div style={{ position: "relative" }}>
        <button
          className="pdocs-tool-btn"
          title="Highlight color"
          onClick={() => {
            setIsHighlightOpen(!isHighlightOpen);
            setIsTextColorOpen(false);
            setIsLineSpacingOpen(false);
          }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        >
          <Highlighter size={15} />
          <div
            style={{
              width: "14px",
              height: "3px",
              backgroundColor:
                activeHighlightColor === "transparent" ? "#cbd5e1" : activeHighlightColor,
              borderRadius: "1px",
            }}
          />
        </button>
        {isHighlightOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 120 }}
              onClick={() => setIsHighlightOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "34px",
                left: 0,
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                border: "1px solid #cbd5e1",
                padding: "8px",
                zIndex: 130,
                display: "grid",
                gridTemplateColumns: "repeat(4, 24px)",
                gap: "6px",
              }}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => applyHighlightColor(c.color)}
                  title={c.name}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "4px",
                    backgroundColor: c.color,
                    border: c.color === "transparent" ? "1px dashed #94a3b8" : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Subscript & Superscript */}
      <button
        className="pdocs-tool-btn"
        title="Subscript (Ctrl+,)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("subscript");
        }}
      >
        <Subscript size={15} />
      </button>
      <button
        className="pdocs-tool-btn"
        title="Superscript (Ctrl+.)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("superscript");
        }}
      >
        <Superscript size={15} />
      </button>

      {/* Clear Formatting */}
      <button
        className="pdocs-tool-btn"
        title="Clear formatting (Ctrl+\)"
        onMouseDown={(e) => {
          e.preventDefault();
          document.execCommand("removeFormat");
        }}
      >
        <RemoveFormatting size={15} />
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

      {/* Line & Paragraph Spacing Dropdown */}
      <div style={{ position: "relative" }}>
        <button
          className="pdocs-tool-btn"
          title="Line & paragraph spacing"
          onClick={() => {
            setIsLineSpacingOpen(!isLineSpacingOpen);
            setIsTextColorOpen(false);
            setIsHighlightOpen(false);
          }}
        >
          <MoveVertical size={16} />
        </button>
        {isLineSpacingOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 120 }}
              onClick={() => setIsLineSpacingOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "34px",
                left: 0,
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                border: "1px solid #cbd5e1",
                padding: "6px",
                zIndex: 130,
                minWidth: "160px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {[
                { label: "Single (1.0)", value: "1.0" as const },
                { label: "1.15", value: "1.15" as const },
                { label: "1.5", value: "1.5" as const },
                { label: "Double (2.0)", value: "2.0" as const },
              ].map((opt) => (
                <button
                  key={opt.label}
                  className={`pdocs-tool-btn ${lineSpacing === opt.value ? "active" : ""}`}
                  style={{ justifyContent: "flex-start", width: "100%", padding: "6px 10px" }}
                  onClick={() => {
                    onLineSpacingChange?.(opt.value);
                    setIsLineSpacingOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

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

      {/* Hidden local image file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onInsertImageFile) {
            onInsertImageFile(file);
          }
          e.target.value = "";
        }}
      />
      <button
        className="pdocs-tool-btn"
        onClick={() => {
          const sel = window.getSelection()?.toString() || "";
          onOpenHyperlinkModal?.(sel, "");
        }}
        title="Insert Link (Ctrl+K)"
      >
        <Link2 size={16} />
      </button>

      <button
        className="pdocs-tool-btn"
        onClick={() => onAddFootnote?.()}
        title="Insert Footnote (Ctrl+Alt+F)"
      >
        <Bookmark size={16} />
      </button>

      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("toc")}
        title="Insert Table of contents"
      >
        <ListTree size={16} />
      </button>

      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("columnBreak")}
        title="Insert Column Break (Ctrl+Shift+Enter)"
      >
        <Scissors size={16} style={{ transform: "rotate(90deg)" }} />
      </button>

      <button
        className="pdocs-tool-btn"
        onClick={() => onInsertBlock("pageBreak")}
        title="Insert Page Break (Ctrl+Enter)"
      >
        <Scissors size={16} />
      </button>

      {/* Columns Layout Selector */}
      <div style={{ position: "relative" }}>
        <button
          className={`pdocs-tool-btn ${columns > 1 ? "active" : ""}`}
          title="Format columns (1, 2, 3 columns)"
          onClick={() => {
            setIsColumnsOpen(!isColumnsOpen);
            setIsLineSpacingOpen(false);
            setIsTextColorOpen(false);
            setIsHighlightOpen(false);
          }}
        >
          <Columns size={16} />
        </button>
        {isColumnsOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 120 }}
              onClick={() => setIsColumnsOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "34px",
                left: 0,
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                border: "1px solid #cbd5e1",
                padding: "6px",
                zIndex: 130,
                minWidth: "170px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <button
                className={`pdocs-tool-btn ${columns === 1 ? "active" : ""}`}
                style={{ justifyContent: "flex-start", width: "100%", padding: "6px 10px" }}
                onClick={() => {
                  onColumnsChange?.(1, columnSpacing, columnDivider);
                  setIsColumnsOpen(false);
                }}
              >
                1 Column (Standard)
              </button>
              <button
                className={`pdocs-tool-btn ${columns === 2 ? "active" : ""}`}
                style={{ justifyContent: "flex-start", width: "100%", padding: "6px 10px" }}
                onClick={() => {
                  onColumnsChange?.(2, columnSpacing || 0.5, columnDivider);
                  setIsColumnsOpen(false);
                }}
              >
                2 Columns (Dual)
              </button>
              <button
                className={`pdocs-tool-btn ${columns === 3 ? "active" : ""}`}
                style={{ justifyContent: "flex-start", width: "100%", padding: "6px 10px" }}
                onClick={() => {
                  onColumnsChange?.(3, columnSpacing || 0.5, columnDivider);
                  setIsColumnsOpen(false);
                }}
              >
                3 Columns (Newspaper)
              </button>
              <div style={{ height: 1, backgroundColor: "#e2e8f0", margin: "4px 0" }} />
              <button
                className="pdocs-tool-btn"
                style={{ justifyContent: "space-between", width: "100%", padding: "6px 10px" }}
                onClick={() => {
                  onColumnsChange?.(columns, columnSpacing, !columnDivider);
                  setIsColumnsOpen(false);
                }}
              >
                <span>Line between columns</span>
                {columnDivider && <Check size={14} color="#0f5132" />}
              </button>
            </div>
          </>
        )}
      </div>

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

      {/* Margins Selector */}
      <select
        className="pdocs-select"
        value={margins.preset}
        onChange={(e) => {
          const val = e.target.value as MarginPreset;
          if (val === "custom") {
            onOpenPageSetup?.();
          } else if (onMarginsChange) {
            const presets: Record<string, { top: number; bottom: number; left: number; right: number }> = {
              normal: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 },
              narrow: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
              moderate: { top: 1.0, bottom: 1.0, left: 0.75, right: 0.75 },
              wide: { top: 1.0, bottom: 1.0, left: 2.0, right: 2.0 },
            };
            const p = presets[val] || presets.normal;
            onMarginsChange({ preset: val, ...p });
          }
        }}
        title="Document Margins"
      >
        <option value="normal">Margins: Normal (1.0")</option>
        <option value="narrow">Margins: Narrow (0.5")</option>
        <option value="moderate">Margins: Moderate (0.75")</option>
        <option value="wide">Margins: Wide (2.0")</option>
        <option value="custom">Margins: Custom...</option>
      </select>

      {/* Page Setup Dialog Trigger */}
      <button
        className="pdocs-tool-btn"
        onClick={onOpenPageSetup}
        title="Page Setup (Paper, Margins & Background)"
      >
        <Settings2 size={16} />
      </button>
    </div>
  );
};
