import React, { useState } from "react";

export interface TableGridPickerProps {
  maxRows?: number;
  maxCols?: number;
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}

export const TableGridPicker: React.FC<TableGridPickerProps> = ({
  maxRows = 8,
  maxCols = 8,
  onSelect,
  onClose,
}) => {
  const [hoveredRow, setHoveredRow] = useState<number>(0);
  const [hoveredCol, setHoveredCol] = useState<number>(0);

  const handleCellClick = (r: number, c: number) => {
    onSelect(r + 1, c + 1);
    onClose();
  };

  return (
    <div className="pdocs-table-picker p-3 bg-[var(--ribbon-bg)] border border-[var(--ribbon-border)] rounded-lg shadow-xl select-none">
      <div className="text-xs font-semibold text-[var(--ribbon-text)] mb-2 text-center">
        {hoveredRow > 0 && hoveredCol > 0
          ? `${hoveredRow} × ${hoveredCol} Table`
          : "Insert Table"}
      </div>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1fr))`,
        }}
        onMouseLeave={() => {
          setHoveredRow(0);
          setHoveredCol(0);
        }}
      >
        {Array.from({ length: maxRows }).map((_, r) =>
          Array.from({ length: maxCols }).map((_, c) => {
            const isHighlighted = r < hoveredRow && c < hoveredCol;
            return (
              <div
                key={`${r}-${c}`}
                className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                  isHighlighted
                    ? "bg-blue-500/20 border-blue-500"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-transparent"
                }`}
                onMouseEnter={() => {
                  setHoveredRow(r + 1);
                  setHoveredCol(c + 1);
                }}
                onClick={() => handleCellClick(r, c)}
              />
            );
          })
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-[var(--ribbon-border)] flex justify-between items-center text-[11px] text-[var(--ribbon-text-dim)]">
        <span>Drag to select dimensions</span>
      </div>
    </div>
  );
};
