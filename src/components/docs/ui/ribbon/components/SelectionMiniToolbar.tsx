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
} from "lucide-react";
import { ActiveMarks } from "../../../types";

export interface SelectionMiniToolbarProps {
  onFormat: (command: string, value?: string) => void;
  onAlign: (align: "left" | "center" | "right") => void;
  activeMarks?: ActiveMarks;
}

export const SelectionMiniToolbar: React.FC<SelectionMiniToolbarProps> = ({
  onFormat,
  onAlign,
  activeMarks,
}) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
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
          setPosition({
            top: Math.max(10, rect.top - 46),
            left: Math.max(10, rect.left + rect.width / 2),
          });
          setIsVisible(true);
        }
      } catch {
        setIsVisible(false);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  if (!isVisible || !position) return null;

  return (
    <div
      ref={toolbarRef}
      className="pdocs-selection-mini-toolbar"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translateX(-50%)",
        zIndex: 500,
      }}
      onMouseDown={(e) => {
        // Prevent losing canvas text selection on button clicks
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-0.5 p-1">
        <button
          type="button"
          className={`pdocs-mini-btn ${activeMarks?.bold ? "active" : ""}`}
          onClick={() => onFormat("bold")}
          title="Bold (Ctrl+B)"
        >
          <Bold size={13} />
        </button>
        <button
          type="button"
          className={`pdocs-mini-btn ${activeMarks?.italic ? "active" : ""}`}
          onClick={() => onFormat("italic")}
          title="Italic (Ctrl+I)"
        >
          <Italic size={13} />
        </button>
        <button
          type="button"
          className={`pdocs-mini-btn ${activeMarks?.underline ? "active" : ""}`}
          onClick={() => onFormat("underline")}
          title="Underline (Ctrl+U)"
        >
          <Underline size={13} />
        </button>
        <button
          type="button"
          className={`pdocs-mini-btn ${activeMarks?.strike ? "active" : ""}`}
          onClick={() => onFormat("strikethrough")}
          title="Strikethrough"
        >
          <Strikethrough size={13} />
        </button>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

        <button
          type="button"
          className="pdocs-mini-btn"
          onClick={() => onFormat("foreColor", "#2563eb")}
          title="Primary Blue Text"
        >
          <Palette size={13} className="text-blue-600" />
        </button>
        <button
          type="button"
          className="pdocs-mini-btn"
          onClick={() => onFormat("hiliteColor", "#fef08a")}
          title="Yellow Highlight"
        >
          <Highlighter size={13} className="text-amber-500" />
        </button>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

        <button
          type="button"
          className={`pdocs-mini-btn ${activeMarks?.align === "left" ? "active" : ""}`}
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
      </div>
    </div>
  );
};
