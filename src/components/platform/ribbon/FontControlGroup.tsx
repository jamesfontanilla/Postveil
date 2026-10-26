import React from "react";
import { FontPicker } from "../../docs/ui/FontPicker";

export interface FontControlGroupProps {
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onFontSizeChange: (delta: number) => void;
}

export const FontControlGroup: React.FC<FontControlGroupProps> = ({
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <FontPicker currentFont={fontFamily} onSelectFont={onFontFamilyChange} />

      {/* Font Size Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: "1px" }}>
        <button
          className="pdocs-tool-btn pdocs-btn-xs"
          onClick={() => onFontSizeChange(-1)}
          title="Decrease font size"
        >
          -
        </button>
        <span
          style={{
            fontSize: "12px",
            minWidth: "22px",
            textAlign: "center",
            fontWeight: 500,
            color: "#334155",
            userSelect: "none",
          }}
        >
          {fontSize}
        </span>
        <button
          className="pdocs-tool-btn pdocs-btn-xs"
          onClick={() => onFontSizeChange(1)}
          title="Increase font size"
        >
          +
        </button>
      </div>
    </div>
  );
};
