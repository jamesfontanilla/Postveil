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
  MessageSquare,
  PenSquare,
  Eye,
  ShieldCheck,
  Pipette,
} from "lucide-react";
import {
  type BlockType,
  type PaperSize,
  type Orientation,
  type DocMargins,
  type MarginPreset,
  type ReviewMode,
} from "../types";
import { FontPicker } from "./FontPicker";
import { ensureFontLoaded } from "../engine/FontCatalog";

interface DocsToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onInsertBlock: (type: BlockType) => void;
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
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
  reviewMode?: ReviewMode;
  onReviewModeChange?: (mode: ReviewMode) => void;
  onOpenNewCommentModal?: () => void;
  onOpenSignatureModal?: () => void;
}

// Microsoft Word-style Standard & Theme Palettes (10 columns x 6 shade tiers = 60 Theme Colors + 10 Standard Colors)
const THEME_COLOR_COLUMNS = [
  // 1: White to Black / Dark Gray
  [
    { name: "White", color: "#ffffff" },
    { name: "White, Darker 5%", color: "#f8fafc" },
    { name: "White, Darker 15%", color: "#f1f5f9" },
    { name: "White, Darker 25%", color: "#e2e8f0" },
    { name: "White, Darker 35%", color: "#cbd5e1" },
    { name: "White, Darker 50%", color: "#94a3b8" },
  ],
  // 2: Black to Lighter
  [
    { name: "Black", color: "#000000" },
    { name: "Black, Lighter 50%", color: "#64748b" },
    { name: "Black, Lighter 35%", color: "#475569" },
    { name: "Black, Lighter 25%", color: "#334155" },
    { name: "Black, Lighter 15%", color: "#1e293b" },
    { name: "Black, Lighter 5%", color: "#0f172a" },
  ],
  // 3: Warm Gray / Slate
  [
    { name: "Warm Gray", color: "#e7e5e4" },
    { name: "Warm Gray, Lighter 80%", color: "#fafaf9" },
    { name: "Warm Gray, Lighter 60%", color: "#f5f5f4" },
    { name: "Warm Gray, Darker 25%", color: "#a8a29e" },
    { name: "Warm Gray, Darker 50%", color: "#78716c" },
    { name: "Warm Gray, Darker 75%", color: "#44403c" },
  ],
  // 4: Navy / Dark Blue
  [
    { name: "Navy Blue", color: "#1e3a8a" },
    { name: "Navy, Lighter 80%", color: "#eff6ff" },
    { name: "Navy, Lighter 60%", color: "#dbeafe" },
    { name: "Navy, Lighter 40%", color: "#bfdbfe" },
    { name: "Navy, Darker 25%", color: "#172554" },
    { name: "Navy, Darker 50%", color: "#0f172a" },
  ],
  // 5: Cobalt / Accent Blue
  [
    { name: "Blue", color: "#2563eb" },
    { name: "Blue, Lighter 80%", color: "#dbeafe" },
    { name: "Blue, Lighter 60%", color: "#93c5fd" },
    { name: "Blue, Lighter 40%", color: "#60a5fa" },
    { name: "Blue, Darker 25%", color: "#1d4ed8" },
    { name: "Blue, Darker 50%", color: "#1e40af" },
  ],
  // 6: Orange / Copper
  [
    { name: "Orange", color: "#ea580c" },
    { name: "Orange, Lighter 80%", color: "#ffedd5" },
    { name: "Orange, Lighter 60%", color: "#fed7aa" },
    { name: "Orange, Lighter 40%", color: "#fdba74" },
    { name: "Orange, Darker 25%", color: "#c2410c" },
    { name: "Orange, Darker 50%", color: "#9a3412" },
  ],
  // 7: Gray / Slate Accent
  [
    { name: "Slate Gray", color: "#64748b" },
    { name: "Slate, Lighter 80%", color: "#f8fafc" },
    { name: "Slate, Lighter 60%", color: "#e2e8f0" },
    { name: "Slate, Lighter 40%", color: "#cbd5e1" },
    { name: "Slate, Darker 25%", color: "#475569" },
    { name: "Slate, Darker 50%", color: "#334155" },
  ],
  // 8: Gold / Amber
  [
    { name: "Gold / Amber", color: "#d97706" },
    { name: "Gold, Lighter 80%", color: "#fef3c7" },
    { name: "Gold, Lighter 60%", color: "#fde68a" },
    { name: "Gold, Lighter 40%", color: "#fcd34d" },
    { name: "Gold, Darker 25%", color: "#b45309" },
    { name: "Gold, Darker 50%", color: "#78350f" },
  ],
  // 9: Emerald / Forest Green (Postveil theme)
  [
    { name: "Emerald Green", color: "#0f5132" },
    { name: "Green, Lighter 80%", color: "#dcfce7" },
    { name: "Green, Lighter 60%", color: "#bbf7d0" },
    { name: "Green, Lighter 40%", color: "#86efac" },
    { name: "Green, Darker 25%", color: "#166534" },
    { name: "Green, Darker 50%", color: "#14532d" },
  ],
  // 10: Purple / Amethyst
  [
    { name: "Amethyst Purple", color: "#7e22ce" },
    { name: "Purple, Lighter 80%", color: "#f3e8ff" },
    { name: "Purple, Lighter 60%", color: "#e9d5ff" },
    { name: "Purple, Lighter 40%", color: "#d8b4fe" },
    { name: "Purple, Darker 25%", color: "#6b21a8" },
    { name: "Purple, Darker 50%", color: "#581c87" },
  ],
];

// Microsoft Word Standard Colors Row (10 universal colors)
const STANDARD_COLORS = [
  { name: "Dark Red", color: "#c00000" },
  { name: "Red", color: "#ff0000" },
  { name: "Orange", color: "#ffc000" },
  { name: "Yellow", color: "#ffff00" },
  { name: "Light Green", color: "#92d050" },
  { name: "Green", color: "#00b050" },
  { name: "Light Blue", color: "#00b0f0" },
  { name: "Blue", color: "#0070c0" },
  { name: "Dark Blue", color: "#002060" },
  { name: "Purple", color: "#7030a0" },
];

// Microsoft Word 15 Highlighters + Transparent (No Color)
const HIGHLIGHT_PALETTE = [
  { name: "No Color", color: "transparent" },
  { name: "Yellow", color: "#ffff00" },
  { name: "Bright Green", color: "#00ff00" },
  { name: "Turquoise", color: "#00ffff" },
  { name: "Pink", color: "#ff00ff" },
  { name: "Blue", color: "#0000ff" },
  { name: "Red", color: "#ff0000" },
  { name: "Dark Blue", color: "#000080" },
  { name: "Teal", color: "#008080" },
  { name: "Green", color: "#008000" },
  { name: "Violet", color: "#800080" },
  { name: "Dark Red", color: "#800000" },
  { name: "Dark Yellow", color: "#808000" },
  { name: "Gray 50%", color: "#808080" },
  { name: "Gray 25%", color: "#c0c0c0" },
  { name: "Black", color: "#000000" },
  // Modern Soft Pastel Highlighters
  { name: "Pastel Lemon", color: "#fef08a" },
  { name: "Pastel Mint", color: "#bbf7d0" },
  { name: "Pastel Sky", color: "#bae6fd" },
  { name: "Pastel Lavender", color: "#e9d5ff" },
  { name: "Pastel Rose", color: "#fbcfe8" },
  { name: "Pastel Peach", color: "#fed7aa" },
  { name: "Pastel Coral", color: "#fecdd3" },
  { name: "Pastel Butter", color: "#fef9c3" },
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
  reviewMode = "editing",
  onReviewModeChange,
  onOpenNewCommentModal,
  onOpenSignatureModal,
}) => {
  const [activeTextColor, setActiveTextColor] = useState("#000000");
  const [activeHighlightColor, setActiveHighlightColor] = useState("transparent");
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);
  const [customHexText, setCustomHexText] = useState("#000000");
  const [customHexHighlight, setCustomHexHighlight] = useState("#ffff00");
  const textColorInputRef = useRef<HTMLInputElement>(null);
  const highlightColorInputRef = useRef<HTMLInputElement>(null);
  const [isLineSpacingOpen, setIsLineSpacingOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [isModeOpen, setIsModeOpen] = useState(false);
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

      {/* Font Family Rich Picker with Live Typography Preview */}
      <FontPicker
        currentFont={fontFamily}
        onSelectFont={(font) => {
          void ensureFontLoaded(font);
          onFontFamilyChange(font);
          // Also apply font to selected text in contenteditable if selection exists
          try {
            document.execCommand("fontName", false, font);
          } catch (_) {
            // Ignore if no selection active
          }
        }}
      />

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
                borderRadius: "10px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.08)",
                border: "1px solid #cbd5e1",
                padding: "12px",
                zIndex: 130,
                width: "248px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* Automatic / Default Button */}
              <button
                onClick={() => applyTextColor("#000000")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ width: 14, height: 14, backgroundColor: "#000000", borderRadius: 3, border: "1px solid #cbd5e1" }} />
                Automatic (Black)
              </button>

              {/* Theme Colors Section */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Theme Colors
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px" }}>
                  {/* Top Header Row of 10 Accent Colors */}
                  {THEME_COLOR_COLUMNS.map((col, colIdx) => {
                    const topShade = col[0];
                    return (
                      <button
                        key={`theme-top-${colIdx}`}
                        onClick={() => applyTextColor(topShade.color)}
                        title={topShade.name}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "3px",
                          backgroundColor: topShade.color,
                          border: topShade.color === "#ffffff" ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.1)",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
                {/* 5 Rows of Tint/Shade Variations */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px", marginTop: "4px" }}>
                  {[1, 2, 3, 4, 5].map((rowIdx) =>
                    THEME_COLOR_COLUMNS.map((col, colIdx) => {
                      const shade = col[rowIdx];
                      return (
                        <button
                          key={`theme-shade-${colIdx}-${rowIdx}`}
                          onClick={() => applyTextColor(shade.color)}
                          title={shade.name}
                          style={{
                            width: 18,
                            height: 16,
                            borderRadius: "2px",
                            backgroundColor: shade.color,
                            border: shade.color === "#ffffff" ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.06)",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Standard Colors Section */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Standard Colors
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px" }}>
                  {STANDARD_COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => applyTextColor(c.color)}
                      title={c.name}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "3px",
                        backgroundColor: c.color,
                        border: "1px solid rgba(0,0,0,0.1)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ height: "1px", backgroundColor: "#e2e8f0", margin: "2px 0" }} />

              {/* Custom Hex Picker / Native Eyedropper Bar */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Custom Hex Color
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {/* Color Swatch Trigger for Native Color Picker */}
                  <div
                    onClick={() => textColorInputRef.current?.click()}
                    title="Open Color Wheel / Eye Dropper"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "6px",
                      backgroundColor: customHexText,
                      border: "1px solid #cbd5e1",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Pipette size={13} style={{ color: customHexText === "#ffffff" ? "#475569" : "#ffffff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }} />
                  </div>
                  <input
                    type="color"
                    ref={textColorInputRef}
                    value={customHexText.startsWith("#") && customHexText.length === 7 ? customHexText : "#000000"}
                    onChange={(e) => {
                      setCustomHexText(e.target.value);
                      applyTextColor(e.target.value);
                    }}
                    style={{ display: "none" }}
                  />
                  {/* Hex Text Input */}
                  <input
                    type="text"
                    value={customHexText}
                    onChange={(e) => setCustomHexText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && /^#([0-9A-Fa-f]{3}){1,2}$/.test(customHexText)) {
                        applyTextColor(customHexText);
                      }
                    }}
                    placeholder="#2563eb"
                    style={{
                      flex: 1,
                      height: 28,
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      outline: "none",
                      color: "#1e293b",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(customHexText)) {
                        applyTextColor(customHexText);
                      }
                    }}
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "6px",
                      backgroundColor: "#0f5132",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
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
                borderRadius: "10px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.08)",
                border: "1px solid #cbd5e1",
                padding: "12px",
                zIndex: 130,
                width: "230px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* No Color / Stop Highlighting Button */}
              <button
                onClick={() => applyHighlightColor("transparent")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ width: 14, height: 14, backgroundColor: "transparent", borderRadius: 3, border: "1px dashed #94a3b8" }} />
                No Color (Clear Highlight)
              </button>

              {/* Standard & Pastel Highlighter Palette */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Highlighter Colors
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 26px)", gap: "6px" }}>
                  {HIGHLIGHT_PALETTE.filter((c) => c.color !== "transparent").map((c) => (
                    <button
                      key={c.name}
                      onClick={() => applyHighlightColor(c.color)}
                      title={c.name}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "4px",
                        backgroundColor: c.color,
                        border: "1px solid rgba(0,0,0,0.12)",
                        cursor: "pointer",
                        padding: 0,
                        transition: "transform 0.1s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
                    />
                  ))}
                </div>
              </div>

              <div style={{ height: "1px", backgroundColor: "#e2e8f0", margin: "2px 0" }} />

              {/* Custom Hex Highlight Picker */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Custom Hex Highlight
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div
                    onClick={() => highlightColorInputRef.current?.click()}
                    title="Open Color Wheel / Eye Dropper"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "6px",
                      backgroundColor: customHexHighlight,
                      border: "1px solid #cbd5e1",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Pipette size={13} style={{ color: "#475569" }} />
                  </div>
                  <input
                    type="color"
                    ref={highlightColorInputRef}
                    value={customHexHighlight.startsWith("#") && customHexHighlight.length === 7 ? customHexHighlight : "#ffff00"}
                    onChange={(e) => {
                      setCustomHexHighlight(e.target.value);
                      applyHighlightColor(e.target.value);
                    }}
                    style={{ display: "none" }}
                  />
                  <input
                    type="text"
                    value={customHexHighlight}
                    onChange={(e) => setCustomHexHighlight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && /^#([0-9A-Fa-f]{3}){1,2}$/.test(customHexHighlight)) {
                        applyHighlightColor(customHexHighlight);
                      }
                    }}
                    placeholder="#fef08a"
                    style={{
                      flex: 1,
                      height: 28,
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      outline: "none",
                      color: "#1e293b",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(customHexHighlight)) {
                        applyHighlightColor(customHexHighlight);
                      }
                    }}
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "6px",
                      backgroundColor: "#0f5132",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
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

      {/* Page Setup Dialog Trigger (Paper Size, Orientation, Margins & Background) */}
      <button
        className="pdocs-tool-btn"
        onClick={onOpenPageSetup}
        title={`Page setup: ${paperSize} (${orientation}), Margins: ${margins.preset} (Click to customize)`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          color: "#334155",
        }}
      >
        <Sliders size={16} />
        <span style={{ fontSize: "12px", fontWeight: 500 }}>Page setup</span>
      </button>

      <div className="pdocs-toolbar-divider" />

      {/* Add Comment Button */}
      <button
        className="pdocs-tool-btn"
        onClick={onOpenNewCommentModal}
        title="Add comment (Ctrl+Alt+M)"
      >
        <MessageSquare size={16} color="#2563eb" />
      </button>

      {/* Sovereign Digital Signature Button */}
      <button
        className="pdocs-tool-btn"
        onClick={onOpenSignatureModal}
        title="Sovereign Digital Signature (Ed25519)"
        style={{ color: "#059669" }}
      >
        <ShieldCheck size={16} />
      </button>

      {/* Review Mode Selector (Editing / Suggesting / Viewing) */}
      <div style={{ position: "relative", marginLeft: "auto" }}>
        <button
          className="pdocs-tool-btn"
          onClick={() => setIsModeOpen(!isModeOpen)}
          title={`Mode: ${reviewMode} (click to switch)`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: 600,
            color:
              reviewMode === "editing"
                ? "#0f5132"
                : reviewMode === "suggesting"
                ? "#2563eb"
                : "#64748b",
            backgroundColor: "#f1f5f9",
            borderRadius: "6px",
          }}
        >
          {reviewMode === "editing" ? (
            <PenSquare size={14} />
          ) : reviewMode === "suggesting" ? (
            <MessageSquare size={14} />
          ) : (
            <Eye size={14} />
          )}
          <span style={{ textTransform: "capitalize" }}>{reviewMode}</span>
        </button>
        {isModeOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 120 }}
              onClick={() => setIsModeOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "28px",
                right: 0,
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                padding: "4px",
                zIndex: 130,
                minWidth: "160px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <button
                className={`pdocs-tool-btn ${reviewMode === "editing" ? "active" : ""}`}
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                }}
                onClick={() => {
                  onReviewModeChange?.("editing");
                  setIsModeOpen(false);
                }}
              >
                <PenSquare size={14} style={{ marginRight: 6, color: "#0f5132" }} />
                <span>Editing</span>
              </button>
              <button
                className={`pdocs-tool-btn ${reviewMode === "suggesting" ? "active" : ""}`}
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                }}
                onClick={() => {
                  onReviewModeChange?.("suggesting");
                  setIsModeOpen(false);
                }}
              >
                <MessageSquare size={14} style={{ marginRight: 6, color: "#2563eb" }} />
                <span>Suggesting</span>
              </button>
              <button
                className={`pdocs-tool-btn ${reviewMode === "viewing" ? "active" : ""}`}
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                }}
                onClick={() => {
                  onReviewModeChange?.("viewing");
                  setIsModeOpen(false);
                }}
              >
                <Eye size={14} style={{ marginRight: 6, color: "#64748b" }} />
                <span>Viewing</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
