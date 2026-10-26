import React from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Baseline,
  Highlighter,
  ChevronDown,
} from "lucide-react";
import { ColorPickerPopover } from "./ColorPickerPopover";

export interface TextStyleGroupProps {
  onFormatText?: (command: string, value?: string) => void;
  activeTextColor: string;
  onTextColorChange: (color: string) => void;
  isTextColorOpen: boolean;
  onToggleTextColor: () => void;
  onCloseTextColor: () => void;
  activeHighlightColor?: string;
  onHighlightColorChange?: (color: string) => void;
  isHighlightOpen?: boolean;
  onToggleHighlight?: () => void;
  onCloseHighlight?: () => void;
  showHighlight?: boolean;
  showStrikethrough?: boolean;
}

export const TextStyleGroup: React.FC<TextStyleGroupProps> = ({
  onFormatText = (cmd, val) => document.execCommand(cmd, false, val),
  activeTextColor,
  onTextColorChange,
  isTextColorOpen,
  onToggleTextColor,
  onCloseTextColor,
  activeHighlightColor = "transparent",
  onHighlightColorChange,
  isHighlightOpen = false,
  onToggleHighlight,
  onCloseHighlight,
  showHighlight = true,
  showStrikethrough = true,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <button
        className="pdocs-tool-btn"
        onClick={() => onFormatText("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onFormatText("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={() => onFormatText("underline")}
        title="Underline (Ctrl+U)"
      >
        <Underline size={16} />
      </button>
      {showStrikethrough && (
        <button
          className="pdocs-tool-btn"
          onClick={() => onFormatText("strikeThrough")}
          title="Strikethrough (Alt+Shift+5)"
        >
          <Strikethrough size={16} />
        </button>
      )}

      {/* Text Color Dropdown */}
      <div style={{ position: "relative" }}>
        <button
          className="pdocs-tool-btn"
          onClick={onToggleTextColor}
          title="Text color"
          style={{
            display: "flex",
            alignItems: "center",
            padding: "2px 4px",
            gap: "2px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Baseline size={15} style={{ marginBottom: "-2px" }} />
            <div
              style={{
                width: 14,
                height: 3,
                backgroundColor: activeTextColor,
                borderRadius: "1px",
              }}
            />
          </div>
          <ChevronDown size={10} style={{ opacity: 0.6 }} />
        </button>

        {isTextColorOpen && (
          <ColorPickerPopover
            mode="text"
            activeColor={activeTextColor}
            onSelectColor={onTextColorChange}
            onClose={onCloseTextColor}
          />
        )}
      </div>

      {/* Highlighter Color Dropdown */}
      {showHighlight && onHighlightColorChange && onToggleHighlight && onCloseHighlight && (
        <div style={{ position: "relative" }}>
          <button
            className="pdocs-tool-btn"
            onClick={onToggleHighlight}
            title="Highlight color"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "2px 4px",
              gap: "2px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Highlighter size={15} style={{ marginBottom: "-2px" }} />
              <div
                style={{
                  width: 14,
                  height: 3,
                  backgroundColor:
                    activeHighlightColor === "transparent" ? "#ffff00" : activeHighlightColor,
                  borderRadius: "1px",
                  border: activeHighlightColor === "transparent" ? "1px dashed #cbd5e1" : "none",
                }}
              />
            </div>
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          </button>

          {isHighlightOpen && (
            <ColorPickerPopover
              mode="highlight"
              activeColor={activeHighlightColor}
              onSelectColor={onHighlightColorChange}
              onClose={onCloseHighlight}
            />
          )}
        </div>
      )}
    </div>
  );
};
