import React, { useRef, useState } from "react";
import { Pipette } from "lucide-react";
import {
  THEME_COLOR_COLUMNS,
  STANDARD_COLORS,
  HIGHLIGHT_PALETTE,
} from "./colorPalettes";

export interface ColorPickerPopoverProps {
  mode: "text" | "highlight";
  activeColor: string;
  onSelectColor: (color: string) => void;
  onClose: () => void;
  title?: string;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  mode,
  activeColor,
  onSelectColor,
  onClose,
  title,
}) => {
  const [customHex, setCustomHex] = useState(
    activeColor !== "transparent" && activeColor.startsWith("#")
      ? activeColor
      : mode === "text"
      ? "#000000"
      : "#ffff00"
  );
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleApplyHex = () => {
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(customHex)) {
      onSelectColor(customHex);
    }
  };

  return (
    <div
      className="pdocs-color-popover"
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: "6px",
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)",
        border: "1px solid #e2e8f0",
        padding: "12px",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "250px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Quick Action Button (Automatic or Transparent) */}
      {mode === "text" ? (
        <button
          onClick={() => onSelectColor("#000000")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 500,
            color: "#1e293b",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "3px",
              backgroundColor: "#000000",
            }}
          />
          Automatic (Black)
        </button>
      ) : (
        <button
          onClick={() => onSelectColor("transparent")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 500,
            color: "#64748b",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "3px",
              border: "1px dashed #94a3b8",
              backgroundColor: "#ffffff",
            }}
          />
          No Color (Clear Highlight)
        </button>
      )}

      {/* Palette Selection */}
      {mode === "text" ? (
        <>
          {/* Theme Colors Section */}
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "6px",
              }}
            >
              Theme Colors
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px" }}>
              {THEME_COLOR_COLUMNS.map((col, colIdx) => {
                const topShade = col[0];
                return (
                  <button
                    key={`theme-top-${colIdx}`}
                    onClick={() => onSelectColor(topShade.color)}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px", marginTop: "4px" }}>
              {[1, 2, 3, 4, 5].map((rowIdx) =>
                THEME_COLOR_COLUMNS.map((col, colIdx) => {
                  const shade = col[rowIdx];
                  return (
                    <button
                      key={`theme-shade-${colIdx}-${rowIdx}`}
                      onClick={() => onSelectColor(shade.color)}
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
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "6px",
              }}
            >
              Standard Colors
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px" }}>
              {STANDARD_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => onSelectColor(c.color)}
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
        </>
      ) : (
        /* Highlighter Colors Grid */
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "6px",
            }}
          >
            Highlighter Colors
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 32px)", gap: "5px" }}>
            {HIGHLIGHT_PALETTE.filter((h) => h.color !== "transparent").map((h) => (
              <button
                key={h.name}
                onClick={() => onSelectColor(h.color)}
                title={h.name}
                style={{
                  width: 32,
                  height: 24,
                  borderRadius: "4px",
                  backgroundColor: h.color,
                  border: h.color === activeColor ? "2px solid #0f172a" : "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ height: "1px", backgroundColor: "#e2e8f0", margin: "2px 0" }} />

      {/* Custom Hex Picker / Native Eyedropper Bar */}
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "6px",
          }}
        >
          {mode === "text" ? "Custom Hex Color" : "Custom Hex Highlight"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            onClick={() => colorInputRef.current?.click()}
            title="Open Color Wheel / Eye Dropper"
            style={{
              width: 28,
              height: 28,
              borderRadius: "6px",
              backgroundColor: customHex,
              border: "1px solid #cbd5e1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Pipette
              size={13}
              style={{
                color: customHex === "#ffffff" ? "#475569" : "#ffffff",
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
              }}
            />
          </div>
          <input
            type="color"
            ref={colorInputRef}
            value={customHex.startsWith("#") && customHex.length === 7 ? customHex : "#000000"}
            onChange={(e) => {
              setCustomHex(e.target.value);
              onSelectColor(e.target.value);
            }}
            style={{ display: "none" }}
          />
          <input
            type="text"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApplyHex();
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
            onClick={handleApplyHex}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: "6px",
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
