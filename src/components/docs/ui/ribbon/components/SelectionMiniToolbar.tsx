import React, { useEffect, useState, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Highlighter,
  List,
  ListOrdered,
  Paintbrush,
  AArrowUp,
  AArrowDown,
} from "lucide-react";
import { ActiveMarks, BlockType } from "../../../types";
import { FontPickerWidget, FontSizeWidget } from "./RibbonWidgets";
import { ColorPaletteDropdown } from "./ColorPaletteDropdown";

export interface SelectionMiniToolbarProps {
  onFormat: (command: string, value?: string) => void;
  onAlign: (align: "left" | "center" | "right") => void;
  fontFamily: string;
  fontSize: number;
  onFontChange: (fontName: string) => void;
  onFontSizeChange: (size: number) => void;
  onChangeBlockType?: (type: BlockType) => void;
  activeMarks?: ActiveMarks;
}

export const SelectionMiniToolbar: React.FC<SelectionMiniToolbarProps> = ({
  onFormat,
  onAlign,
  fontFamily,
  fontSize,
  onFontChange,
  onFontSizeChange,
  onChangeBlockType,
  activeMarks,
}) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [opacity, setOpacity] = useState(0.35); // Two-stage proximity ghost opacity
  const [isHovered, setIsHovered] = useState(false);

  // Color palette dropdown states
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorMode, setColorMode] = useState<"textColor" | "highlightColor">("textColor");
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLElement | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setIsVisible(false);
        return;
      }

      // Ensure selection is inside document canvas
      const anchorNode = sel.anchorNode;
      const canvasEl = document.querySelector(".pdocs-canvas");
      if (!canvasEl || !anchorNode || !canvasEl.contains(anchorNode)) {
        setIsVisible(false);
        return;
      }

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          // Calculate safe position (place above, or flip below if too close to viewport top)
          const targetTop = rect.top >= 70 ? rect.top - 68 : rect.bottom + 12;
          const targetLeft = Math.max(160, Math.min(window.innerWidth - 160, rect.left + rect.width / 2));
          setPosition({ top: targetTop, left: targetLeft });
          setIsVisible(true);
          setOpacity(0.35); // Start at ambient ghost opacity
        }
      } catch {
        setIsVisible(false);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // Distance-based mouse proximity opacity calculation
  useEffect(() => {
    if (!isVisible || !position) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isHovered || isColorPickerOpen) {
        setOpacity(1.0);
        return;
      }
      if (!toolbarRef.current) return;

      const tbRect = toolbarRef.current.getBoundingClientRect();
      const centerX = tbRect.left + tbRect.width / 2;
      const centerY = tbRect.top + tbRect.height / 2;
      const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY);

      if (distance <= 45) {
        setOpacity(1.0);
      } else if (distance >= 120) {
        setOpacity(0.35);
      } else {
        // Linear interpolation between 0.35 and 1.0
        const factor = 1 - (distance - 45) / 75;
        setOpacity(0.35 + factor * 0.65);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isVisible, position, isHovered, isColorPickerOpen]);

  if (!isVisible || !position) return null;

  const handleOpenColor = (mode: "textColor" | "highlightColor", e: React.MouseEvent) => {
    setColorMode(mode);
    setColorAnchorEl(e.currentTarget as HTMLElement);
    setIsColorPickerOpen(true);
    setOpacity(1.0);
  };

  return (
    <div
      ref={toolbarRef}
      className="pdocs-selection-mini-toolbar"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translateX(-50%)",
        opacity: isColorPickerOpen ? 1 : opacity,
        zIndex: 500,
      }}
      onMouseEnter={() => {
        setIsHovered(true);
        setOpacity(1.0);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onMouseDown={(e) => {
        // Prevent losing canvas text selection on button clicks
        e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-0.5 p-1">
        {/* ROW 1: Typography, Font Size, Grow/Shrink, Painter */}
        <div className="flex items-center gap-1 pb-0.5 border-b border-slate-200/60 dark:border-slate-800/60">
          <div style={{ width: 110 }}>
            <FontPickerWidget
              currentFont={fontFamily}
              onFontChange={onFontChange}
            />
          </div>
          <FontSizeWidget
            currentSize={fontSize}
            onSizeChange={onFontSizeChange}
          />
          <button
            type="button"
            className="pdocs-mini-btn"
            title="Grow Font Size"
            onClick={() => onFontSizeChange(Math.min(72, fontSize + 1))}
          >
            <AArrowUp size={13} />
          </button>
          <button
            type="button"
            className="pdocs-mini-btn"
            title="Shrink Font Size"
            onClick={() => onFontSizeChange(Math.max(8, fontSize - 1))}
          >
            <AArrowDown size={13} />
          </button>
          <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button
            type="button"
            className="pdocs-mini-btn"
            title="Format Painter"
            onClick={() => onFormat("formatPainter")}
          >
            <Paintbrush size={12} />
          </button>
        </div>

        {/* ROW 2: Bold, Italic, Underline, Strikethrough, Colors, Alignments, Lists */}
        <div className="flex items-center gap-0.5 pt-0.5">
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.bold ? "active" : ""}`}
            onClick={() => onFormat("bold")}
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.italic ? "active" : ""}`}
            onClick={() => onFormat("italic")}
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.underline ? "active" : ""}`}
            onClick={() => onFormat("underline")}
            title="Underline (Ctrl+U)"
          >
            <Underline size={13} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.strike ? "active" : ""}`}
            onClick={() => onFormat("strikethrough")}
            title="Strikethrough"
          >
            <Strikethrough size={13} strokeWidth={2.2} />
          </button>

          <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Color Split Buttons */}
          <button
            type="button"
            className="pdocs-mini-btn"
            onClick={(e) => handleOpenColor("textColor", e)}
            title="Font Color"
          >
            <Palette size={13} className="text-blue-600" />
          </button>
          <button
            type="button"
            className="pdocs-mini-btn"
            onClick={(e) => handleOpenColor("highlightColor", e)}
            title="Highlight Color"
          >
            <Highlighter size={13} className="text-amber-500" />
          </button>

          <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Alignments */}
          <button
            type="button"
            className={`pdocs-mini-btn ${!activeMarks?.align || activeMarks?.align === "left" ? "active" : ""}`}
            onClick={() => onAlign("left")}
            title="Align Left"
          >
            <AlignLeft size={13} />
          </button>
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.align === "center" ? "active" : ""}`}
            onClick={() => onAlign("center")}
            title="Align Center"
          >
            <AlignCenter size={13} />
          </button>
          <button
            type="button"
            className={`pdocs-mini-btn ${activeMarks?.align === "right" ? "active" : ""}`}
            onClick={() => onAlign("right")}
            title="Align Right"
          >
            <AlignRight size={13} />
          </button>

          <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Lists */}
          <button
            type="button"
            className="pdocs-mini-btn"
            onClick={() => onChangeBlockType?.("bulletList")}
            title="Bullet List"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className="pdocs-mini-btn"
            onClick={() => onChangeBlockType?.("orderedList")}
            title="Numbered List"
          >
            <ListOrdered size={13} />
          </button>
        </div>
      </div>

      {/* Floating Color Palette Dropdown */}
      <ColorPaletteDropdown
        isOpen={isColorPickerOpen}
        anchorEl={colorAnchorEl}
        mode={colorMode}
        currentColor={colorMode === "textColor" ? activeMarks?.textColor || "#000000" : activeMarks?.highlightColor || "transparent"}
        onSelectColor={(color) => {
          onFormat(colorMode === "textColor" ? "foreColor" : "hiliteColor", color);
          setIsColorPickerOpen(false);
        }}
        onClose={() => setIsColorPickerOpen(false)}
      />
    </div>
  );
};
