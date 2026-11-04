import React from "react";
import { ChevronDown } from "lucide-react";
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
    <div className="flex items-center" style={{ width: 140, height: 24 }}>
      <FontPicker
        currentFont={currentFont}
        onSelectFont={onFontChange}
        compact={true}
        width={140}
        height={24}
      />
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
    <div className="relative flex items-center">
      <select
        value={currentSize || 12}
        onChange={(e) => onSizeChange(Number(e.target.value))}
        className="pdocs-font-size-select text-[12px] font-medium h-[24px] pl-2 pr-5 rounded-[3px] border border-[var(--ribbon-border,#cbd5e1)] bg-[var(--ribbon-bg,#ffffff)] text-[var(--ribbon-text)] focus:outline-none appearance-none cursor-pointer hover:bg-[var(--ribbon-hover,#f1f5f9)] transition-colors"
        style={{ width: "48px" }}
        title="Font Size"
      >
        {COMMON_FONT_SIZES.map((size) => (
          <option key={size} value={size} className="bg-[var(--ribbon-bg,#ffffff)] text-[var(--ribbon-text)]">
            {size}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="absolute right-1.5 pointer-events-none text-[var(--ribbon-text-dim,#64748b)]"
      />
    </div>
  );
};
