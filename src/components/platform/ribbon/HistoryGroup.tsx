import React from "react";
import { Undo, Redo, Printer, Search } from "lucide-react";

export interface HistoryGroupProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPrint?: () => void;
  onSearch?: () => void;
  printTitle?: string;
}

export const HistoryGroup: React.FC<HistoryGroupProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPrint,
  onSearch,
  printTitle = "Print / PDF (Ctrl+P)",
}) => {
  return (
    <>
      <button
        className="pdocs-tool-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        style={{ opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo size={16} />
      </button>
      <button
        className="pdocs-tool-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        style={{ opacity: canRedo ? 1 : 0.4 }}
      >
        <Redo size={16} />
      </button>

      {onPrint && (
        <button className="pdocs-tool-btn" onClick={onPrint} title={printTitle}>
          <Printer size={16} />
        </button>
      )}

      {onSearch && (
        <button
          className="pdocs-tool-btn"
          onClick={onSearch}
          title="Find and replace (Ctrl+H)"
        >
          <Search size={16} />
        </button>
      )}
    </>
  );
};
