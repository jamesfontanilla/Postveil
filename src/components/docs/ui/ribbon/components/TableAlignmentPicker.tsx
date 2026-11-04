import React from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

export type CellAlignment =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "centerLeft"
  | "center"
  | "centerRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

export interface TableAlignmentPickerProps {
  currentAlign?: CellAlignment;
  onSelectAlign: (align: CellAlignment) => void;
}

const ALIGN_GRID: { id: CellAlignment; label: string; icon: any }[][] = [
  [
    { id: "topLeft", label: "Top Left", icon: AlignLeft },
    { id: "topCenter", label: "Top Center", icon: AlignCenter },
    { id: "topRight", label: "Top Right", icon: AlignRight },
  ],
  [
    { id: "centerLeft", label: "Center Left", icon: AlignLeft },
    { id: "center", label: "Center", icon: AlignCenter },
    { id: "centerRight", label: "Center Right", icon: AlignRight },
  ],
  [
    { id: "bottomLeft", label: "Bottom Left", icon: AlignLeft },
    { id: "bottomCenter", label: "Bottom Center", icon: AlignCenter },
    { id: "bottomRight", label: "Bottom Right", icon: AlignRight },
  ],
];

export const TableAlignmentPicker: React.FC<TableAlignmentPickerProps> = ({
  currentAlign = "centerLeft",
  onSelectAlign,
}) => {
  return (
    <div className="flex flex-col gap-0.5 p-1 border border-[var(--ribbon-border)] rounded bg-transparent">
      {ALIGN_GRID.map((row, rIdx) => (
        <div key={rIdx} className="flex gap-0.5">
          {row.map((cell) => {
            const Icon = cell.icon;
            const isActive = currentAlign === cell.id;
            return (
              <button
                key={cell.id}
                type="button"
                className={`w-5 h-5 flex items-center justify-center rounded-xs transition-colors ${
                  isActive
                    ? "bg-blue-500/20 text-blue-600 border border-blue-500"
                    : "hover:bg-[var(--ribbon-hover)] text-[var(--ribbon-text)]"
                }`}
                onClick={() => onSelectAlign(cell.id)}
                title={cell.label}
              >
                <Icon size={11} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
