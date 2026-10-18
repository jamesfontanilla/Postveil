import React, { useState } from "react";
import { X, Check, FileText, Compass, Sliders, Palette } from "lucide-react";
import { type PaperSize, type Orientation, type DocMargins, type MarginPreset } from "../types";

interface PageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPaperSize: PaperSize;
  currentOrientation: Orientation;
  currentMargins?: DocMargins;
  currentPageColor?: string;
  onApply: (paperSize: PaperSize, orientation: Orientation, margins: DocMargins, pageColor: string) => void;
}

const MARGIN_PRESETS: Record<Exclude<MarginPreset, "custom">, { top: number; bottom: number; left: number; right: number; label: string }> = {
  normal: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0, label: "Normal (1.0 in)" },
  narrow: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5, label: "Narrow (0.5 in)" },
  moderate: { top: 1.0, bottom: 1.0, left: 0.75, right: 0.75, label: "Moderate (1.0 in T/B, 0.75 in L/R)" },
  wide: { top: 1.0, bottom: 1.0, left: 2.0, right: 2.0, label: "Wide (1.0 in T/B, 2.0 in L/R)" },
};

export const PageSetupModal: React.FC<PageSetupModalProps> = ({
  isOpen,
  onClose,
  currentPaperSize,
  currentOrientation,
  currentMargins,
  currentPageColor = "#ffffff",
  onApply,
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>(currentPaperSize);
  const [orientation, setOrientation] = useState<Orientation>(currentOrientation);
  const [preset, setPreset] = useState<MarginPreset>(currentMargins?.preset || "normal");
  const [topMargin, setTopMargin] = useState<number>(currentMargins?.top ?? 1.0);
  const [bottomMargin, setBottomMargin] = useState<number>(currentMargins?.bottom ?? 1.0);
  const [leftMargin, setLeftMargin] = useState<number>(currentMargins?.left ?? 1.0);
  const [rightMargin, setRightMargin] = useState<number>(currentMargins?.right ?? 1.0);
  const [pageColor, setPageColor] = useState<string>(currentPageColor);

  if (!isOpen) return null;

  const handlePresetChange = (newPreset: MarginPreset) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const vals = MARGIN_PRESETS[newPreset];
      setTopMargin(vals.top);
      setBottomMargin(vals.bottom);
      setLeftMargin(vals.left);
      setRightMargin(vals.right);
    }
  };

  const handleApply = () => {
    onApply(
      paperSize,
      orientation,
      {
        preset,
        top: topMargin,
        bottom: bottomMargin,
        left: leftMargin,
        right: rightMargin,
      },
      pageColor
    );
    onClose();
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose}>
      <div
        className="pdocs-modal"
        style={{ maxWidth: "520px", padding: "24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={20} color="#0f5132" />
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Page setup</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Orientation */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "block", marginBottom: 8 }}>
            Orientation
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setOrientation("portrait")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: orientation === "portrait" ? "2px solid #0f5132" : "1px solid #cbd5e1",
                background: orientation === "portrait" ? "#f0fdf4" : "#ffffff",
                fontWeight: 600,
                fontSize: "13px",
                color: orientation === "portrait" ? "#0f5132" : "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Compass size={16} />
              Portrait
            </button>
            <button
              onClick={() => setOrientation("landscape")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: orientation === "landscape" ? "2px solid #0f5132" : "1px solid #cbd5e1",
                background: orientation === "landscape" ? "#f0fdf4" : "#ffffff",
                fontWeight: 600,
                fontSize: "13px",
                color: orientation === "landscape" ? "#0f5132" : "#334155",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Compass size={16} style={{ transform: "rotate(90deg)" }} />
              Landscape
            </button>
          </div>
        </div>

        {/* Paper Size */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "block", marginBottom: 8 }}>
            Paper size
          </label>
          <select
            className="pdocs-select"
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as PaperSize)}
            style={{ width: "100%", height: 38, fontSize: "13px", borderRadius: 8 }}
          >
            <option value="A4">A4 (210 × 297 mm / 8.27 × 11.69 in)</option>
            <option value="Letter">Letter (8.5 × 11.0 in)</option>
            <option value="Legal">Legal (8.5 × 14.0 in)</option>
            <option value="A3">A3 (297 × 420 mm / 11.69 × 16.54 in)</option>
            <option value="A5">A5 (148 × 210 mm / 5.83 × 8.27 in)</option>
            <option value="Tabloid">Tabloid / Ledger (11.0 × 17.0 in)</option>
          </select>
        </div>

        {/* Margins */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b" }}>
              Margins (inches)
            </label>
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value as MarginPreset)}
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <option value="normal">Normal (1.0")</option>
              <option value="narrow">Narrow (0.5")</option>
              <option value="moderate">Moderate (0.75")</option>
              <option value="wide">Wide (2.0")</option>
              <option value="custom">Custom...</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: 3 }}>Top:</span>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="3.0"
                value={topMargin}
                onChange={(e) => {
                  setTopMargin(parseFloat(e.target.value) || 0);
                  setPreset("custom");
                }}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: 3 }}>Bottom:</span>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="3.0"
                value={bottomMargin}
                onChange={(e) => {
                  setBottomMargin(parseFloat(e.target.value) || 0);
                  setPreset("custom");
                }}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: 3 }}>Left:</span>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="3.0"
                value={leftMargin}
                onChange={(e) => {
                  setLeftMargin(parseFloat(e.target.value) || 0);
                  setPreset("custom");
                }}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: 3 }}>Right:</span>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="3.0"
                value={rightMargin}
                onChange={(e) => {
                  setRightMargin(parseFloat(e.target.value) || 0);
                  setPreset("custom");
                }}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </div>
          </div>
        </div>

        {/* Page Color */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "block", marginBottom: 8 }}>
            Page color
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {[
              { color: "#ffffff", label: "Pure White" },
              { color: "#fafafa", label: "Snow" },
              { color: "#fefcf6", label: "Warm Ivory" },
              { color: "#f8fafc", label: "Cool Gray" },
              { color: "#fef2f2", label: "Soft Rose" },
              { color: "#f0fdf4", label: "Mint Tint" },
            ].map((c) => (
              <button
                key={c.color}
                onClick={() => setPageColor(c.color)}
                title={c.label}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: c.color,
                  border: pageColor === c.color ? "3px solid #0f5132" : "1px solid #cbd5e1",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                {pageColor === c.color && <Check size={14} color="#0f5132" />}
              </button>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: "8px 22px",
              borderRadius: "8px",
              border: "none",
              background: "#0f5132",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Check size={16} />
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
