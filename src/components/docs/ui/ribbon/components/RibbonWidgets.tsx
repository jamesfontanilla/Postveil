import React from "react";
import { FontPicker } from "../../FontPicker";

export interface FontPickerWidgetProps {
  currentFont: string;
  onFontChange: (fontName: string) => void;
}

export const FontPickerWidget: React.FC<FontPickerWidgetProps> = ({
  currentFont,
  onFontChange,
}) => {
  return (
    <div className="flex items-center" style={{ width: 140 }}>
      <FontPicker currentFont={currentFont} onSelectFont={onFontChange} />
    </div>
  );
};

export interface FontSizeWidgetProps {
  currentSize: number;
  onSizeChange: (size: number) => void;
}

const COMMON_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export const FontSizeWidget: React.FC<FontSizeWidgetProps> = ({
  currentSize,
  onSizeChange,
}) => {
  return (
    <div className="flex items-center">
      <select
        value={currentSize || 11}
        onChange={(e) => onSizeChange(Number(e.target.value))}
        className="pdocs-font-size-select text-xs h-[22px] px-1 rounded border border-[var(--ribbon-border)] bg-[var(--ribbon-bg)] text-[var(--ribbon-text)] focus:outline-none"
        title="Font Size"
      >
        {COMMON_FONT_SIZES.map((size) => (
          <option key={size} value={size} className="bg-[var(--ribbon-bg)] text-[var(--ribbon-text)]">
            {size}
          </option>
        ))}
      </select>
    </div>
  );
};
