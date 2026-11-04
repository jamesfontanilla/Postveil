import React from "react";
import { BlockType } from "../../../types";

export interface StyleOption {
  type: BlockType;
  level?: 1 | 2 | 3;
  label: string;
  subtitle: string;
  previewClass: string;
}

const STYLES: StyleOption[] = [
  { type: "paragraph", label: "Normal", subtitle: "Aptos, 12 pt", previewClass: "text-slate-800 dark:text-slate-200" },
  { type: "paragraph", label: "No Spacing", subtitle: "Aptos, 12 pt", previewClass: "text-slate-800 dark:text-slate-200" },
  { type: "heading", level: 1, label: "Heading 1", subtitle: "Aptos Display, 20 pt", previewClass: "text-blue-600 dark:text-blue-400 font-bold" },
  { type: "heading", level: 2, label: "Heading 2", subtitle: "Aptos Display, 16 pt", previewClass: "text-blue-600 dark:text-blue-400 font-semibold" },
  { type: "heading", level: 3, label: "Heading 3", subtitle: "Aptos, 13 pt", previewClass: "text-slate-700 dark:text-slate-300 font-medium" },
  { type: "heading", level: 1, label: "Title", subtitle: "Aptos Display, 28 pt", previewClass: "text-slate-900 dark:text-slate-100 font-extrabold" },
  { type: "blockquote", label: "Quote", subtitle: "Aptos, 12 pt italic", previewClass: "italic text-slate-600 dark:text-slate-400" },
  { type: "codeBlock", label: "Code", subtitle: "Kerneon Mono, 10 pt", previewClass: "font-mono text-emerald-600 dark:text-emerald-400" },
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
    <div className="flex items-center gap-1.5 h-[68px]">
      <div className="flex items-center gap-1.5 overflow-x-auto h-[64px] px-0.5 py-0.5 max-w-[340px] scrollbar-none">
        {STYLES.map((st) => {
          const isActive =
            st.type === currentType && (st.level === undefined || st.level === currentLevel);
          return (
            <button
              key={st.label}
              type="button"
              className={`flex flex-col justify-between text-left min-w-[76px] h-[58px] px-2 py-1.5 border rounded-[3px] transition-all select-none ${
                isActive
                  ? "border-[#2563eb] bg-[#2563eb]/10 text-[#2563eb] dark:text-[#38bdf8] font-semibold ring-1 ring-[#2563eb]"
                  : "border-[var(--ribbon-border)] hover:bg-[var(--ribbon-hover)] text-[var(--ribbon-text)] bg-[var(--ribbon-bg)]"
              }`}
              onClick={() => onSelectStyle(st.type, st.level)}
              title={`Apply ${st.label} (${st.subtitle})`}
            >
              <span className={`text-[12px] leading-tight truncate w-full ${st.previewClass}`}>
                {st.label}
              </span>
              <span className="text-[9px] leading-none truncate w-full text-[var(--ribbon-text-dim)] font-normal opacity-80">
                {st.subtitle}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="w-4 h-[58px] flex flex-col items-center justify-center border border-[var(--ribbon-border)] rounded-[3px] hover:bg-[var(--ribbon-hover)] text-[var(--ribbon-text-dim)]"
        title="More Styles Gallery"
      >
        <span className="text-[10px] leading-none">▾</span>
      </button>
    </div>
  );
};
