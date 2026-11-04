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
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const size = currentSize || 12;

  return (
    <div
      ref={containerRef}
      className="relative flex-shrink-0"
      style={{ width: "48px", height: "24px" }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-full flex items-center justify-between px-2 rounded-[3px] border border-[var(--ribbon-border,#cbd5e1)] bg-[var(--ribbon-bg,#ffffff)] text-[var(--ribbon-text)] hover:bg-[var(--ribbon-hover,#f1f5f9)] transition-colors select-none text-[12px] font-medium"
        style={{ boxSizing: "border-box" }}
        title="Font Size"
      >
        <span className="leading-none">{size}</span>
        <ChevronDown size={11} className="text-[var(--ribbon-text-dim,#64748b)] flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 max-h-[220px] w-[56px] overflow-y-auto bg-[var(--ribbon-bg,#ffffff)] border border-[var(--ribbon-border,#cbd5e1)] rounded-[4px] shadow-lg py-1 z-50 text-[12px]"
          style={{ scrollbarWidth: "thin" }}
        >
          {COMMON_FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onSizeChange(s);
                setIsOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1 flex items-center justify-between transition-colors ${
                s === size
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-[var(--ribbon-text)] hover:bg-[var(--ribbon-hover,#f1f5f9)]"
              }`}
            >
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
