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
    <div className="pdocs-table-picker select-none">
      <div className="text-xs font-semibold text-[var(--ribbon-text)] mb-2 text-center">
        {hoveredRow > 0 && hoveredCol > 0
          ? `${hoveredRow} × ${hoveredCol} Table`
          : "Insert Table"}
      </div>

      <div
        className="pdocs-table-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1fr))`,
          gap: "4px",
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
                className={`pdocs-table-cell ${isHighlighted ? "highlighted" : ""}`}
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
