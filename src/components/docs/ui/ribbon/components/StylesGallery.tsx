import React from "react";
import { BlockType } from "../../../types";

export interface StyleOption {
  type: BlockType;
  level?: 1 | 2 | 3;
  label: string;
  previewClass: string;
}

const STYLES: StyleOption[] = [
  { type: "paragraph", label: "Normal", previewClass: "text-xs font-normal" },
  { type: "heading", level: 1, label: "Heading 1", previewClass: "text-sm font-bold text-blue-600 dark:text-blue-400" },
  { type: "heading", level: 2, label: "Heading 2", previewClass: "text-xs font-semibold text-slate-800 dark:text-slate-200" },
  { type: "heading", level: 3, label: "Heading 3", previewClass: "text-xs font-medium text-slate-600 dark:text-slate-400" },
  { type: "blockquote", label: "Quote", previewClass: "text-xs italic border-l-2 border-blue-500 pl-1" },
  { type: "codeBlock", label: "Code", previewClass: "text-xs font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded" },
];

export interface StylesGalleryProps {
  currentType?: BlockType;
  currentLevel?: number;
  onSelectStyle: (type: BlockType, level?: number) => void;
}

export const StylesGallery: React.FC<StylesGalleryProps> = ({
  currentType = "paragraph",
  currentLevel = 1,
  onSelectStyle,
}) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto h-[66px] px-1 py-1 max-w-[280px] scrollbar-none">
      {STYLES.map((st) => {
        const isActive =
          st.type === currentType && (st.level === undefined || st.level === currentLevel);
        return (
          <button
            key={st.label}
            type="button"
            className={`flex flex-col items-center justify-center min-w-[56px] h-[58px] p-1 border rounded transition-all select-none ${
              isActive
                ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                : "border-[var(--ribbon-border)] hover:bg-[var(--ribbon-hover)] text-[var(--ribbon-text)]"
            }`}
            onClick={() => onSelectStyle(st.type, st.level)}
            title={`Apply ${st.label} Style`}
          >
            <span className={`leading-none truncate max-w-[50px] mb-1 ${st.previewClass}`}>
              Aa
            </span>
            <span className="text-[10px] truncate max-w-[50px] text-[var(--ribbon-text-dim)]">
              {st.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
