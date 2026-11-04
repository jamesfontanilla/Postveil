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
  const [coords, setCoords] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(window.innerWidth - 65, rect.left)),
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  const size = currentSize || 12;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: "48px", height: "24px" }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full h-full flex items-center justify-between px-2 rounded-[3px] border border-[var(--ribbon-border,#cbd5e1)] bg-[var(--ribbon-bg,#ffffff)] text-[var(--ribbon-text)] hover:bg-[var(--ribbon-hover,#f1f5f9)] transition-colors select-none text-[12px] font-medium"
        style={{ boxSizing: "border-box" }}
        title="Font Size"
      >
        <span className="leading-none">{size}</span>
        <ChevronDown size={11} className="text-[var(--ribbon-text-dim,#64748b)] flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          ref={containerRef}
          className="max-h-[220px] w-[56px] overflow-y-auto bg-[var(--ribbon-bg,#ffffff)] border border-[var(--ribbon-border,#cbd5e1)] rounded-[4px] shadow-lg py-1 text-[12px]"
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            scrollbarWidth: "thin",
            zIndex: 99999,
          }}
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
