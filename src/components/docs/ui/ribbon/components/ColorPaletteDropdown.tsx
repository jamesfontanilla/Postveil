import React, { useEffect, useRef } from "react";

export interface ColorPaletteDropdownProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  mode: "textColor" | "highlightColor";
  currentColor: string;
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

const THEME_PALETTES = [
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#a61c1c", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79"],
  ["#852020", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
];

export const ColorPaletteDropdown: React.FC<ColorPaletteDropdownProps> = ({
  isOpen,
  anchorEl,
  mode,
  currentColor,
  onSelectColor,
  onClose,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, anchorEl, onClose]);

  if (!isOpen || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 4;
  const left = Math.max(10, Math.min(window.innerWidth - 220, rect.left + window.scrollX));

  return (
    <div
      ref={dropdownRef}
      className="pdocs-ribbon-dropdown p-2 bg-[var(--ribbon-bg)] border border-[var(--ribbon-border)] rounded-lg shadow-2xl z-50 min-w-[200px]"
      style={{
        position: "fixed",
        top: `${rect.bottom + 4}px`,
        left: `${left}px`,
      }}
    >
      <div className="text-[11px] font-semibold text-[var(--ribbon-text-dim)] uppercase tracking-wider mb-2">
        {mode === "textColor" ? "Font Colors" : "Highlight Colors"}
      </div>

      {/* None / Automatic Option */}
      <button
        type="button"
        className="w-full text-left text-xs py-1 px-2 rounded mb-2 hover:bg-[var(--ribbon-hover)] text-[var(--ribbon-text)] border border-[var(--ribbon-border)] flex items-center gap-2"
        onClick={() => {
          onSelectColor(mode === "textColor" ? "#000000" : "transparent");
          onClose();
        }}
      >
        <div className="w-3.5 h-3.5 border border-slate-400 rounded-xs bg-transparent" />
        <span>{mode === "textColor" ? "Automatic (Black)" : "No Color"}</span>
      </button>

      {/* Swatches Matrix */}
      <div className="flex flex-col gap-1">
        {THEME_PALETTES.map((row, rIdx) => (
          <div key={rIdx} className="flex gap-1 justify-between">
            {row.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`w-4 h-4 rounded-xs border transition-transform hover:scale-125 hover:z-10 ${
                  currentColor.toLowerCase() === hex.toLowerCase()
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-black/10 dark:border-white/10"
                }`}
                style={{ backgroundColor: hex }}
                onClick={() => {
                  onSelectColor(hex);
                  onClose();
                }}
                title={hex}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
