import React, { useState, useRef, useEffect } from "react";
import { BlockType } from "../../../types";
import { ChevronUp, ChevronDown, MoreHorizontal } from "lucide-react";

export interface StyleOption {
  type: BlockType;
  level?: 1 | 2 | 3;
  label: string;
  previewSample: string;
  styleProps: React.CSSProperties;
}

const STYLES: StyleOption[] = [
  {
    type: "paragraph",
    label: "Normal",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "12px", fontWeight: 400, color: "var(--ribbon-text)" },
  },
  {
    type: "paragraph",
    label: "No Spacing",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "12px", fontWeight: 400, color: "var(--ribbon-text)", letterSpacing: "-0.02em" },
  },
  {
    type: "heading",
    level: 1,
    label: "Heading 1",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "14px", fontWeight: 700, color: "#2563eb" },
  },
  {
    type: "heading",
    level: 2,
    label: "Heading 2",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "13px", fontWeight: 600, color: "#2563eb" },
  },
  {
    type: "heading",
    level: 3,
    label: "Heading 3",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "12px", fontWeight: 600, color: "var(--ribbon-text)" },
  },
  {
    type: "heading",
    level: 1,
    label: "Title",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "15px", fontWeight: 800, color: "var(--ribbon-text)" },
  },
  {
    type: "blockquote",
    label: "Quote",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "12px", fontStyle: "italic", color: "var(--ribbon-text-dim)" },
  },
  {
    type: "codeBlock",
    label: "Code",
    previewSample: "AaBbCcDd",
    styleProps: { fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "#059669" },
  },
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
  const [startIndex, setStartIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // WordCraft visible count: 4 tiles in standard view
  const VISIBLE_COUNT = 4;
  const canScrollUp = startIndex > 0;
  const canScrollDown = startIndex + VISIBLE_COUNT < STYLES.length;

  const handleScrollUp = () => {
    setStartIndex((prev) => Math.max(0, prev - 2));
  };

  const handleScrollDown = () => {
    setStartIndex((prev) => Math.min(STYLES.length - VISIBLE_COUNT, prev + 2));
  };

  const handleToggleExpand = () => {
    if (!isExpanded && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopoverCoords({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(window.innerWidth - 370, rect.left)),
      });
    }
    setIsExpanded((prev) => !prev);
  };

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  const visibleStyles = STYLES.slice(startIndex, startIndex + VISIBLE_COUNT);

  return (
    <div ref={containerRef} className="pdocs-styles-gallery-container">
      {/* 4 Visible WordCraft Style Tiles */}
      <div className="pdocs-styles-viewport">
        {visibleStyles.map((st) => {
          const isActive =
            st.type === currentType && (st.level === undefined || st.level === currentLevel);
          return (
            <button
              key={st.label}
              type="button"
              className={`pdocs-style-tile ${isActive ? "active" : ""}`}
              onClick={() => onSelectStyle(st.type, st.level)}
              title={`Apply ${st.label}`}
            >
              <span className="pdocs-style-preview" style={st.styleProps}>
                {st.previewSample}
              </span>
              <span className="pdocs-style-label">{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* WordCraft 3-Button Vertical Navigation Strip */}
      <div className="pdocs-styles-nav-strip">
        <button
          type="button"
          className="pdocs-styles-nav-btn"
          title="Scroll Up"
          disabled={!canScrollUp}
          onClick={handleScrollUp}
        >
          <ChevronUp size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="pdocs-styles-nav-btn"
          title="Scroll Down"
          disabled={!canScrollDown}
          onClick={handleScrollDown}
        >
          <ChevronDown size={11} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="pdocs-styles-nav-btn"
          title="More Styles"
          onClick={handleToggleExpand}
        >
          <span style={{ fontSize: "9px", lineHeight: "1" }}>▾</span>
        </button>
      </div>

      {/* Expanded Styles Menu Popover */}
      {isExpanded && (
        <div
          ref={menuRef}
          className="pdocs-styles-expanded-menu"
          style={{
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--ribbon-text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
              paddingLeft: "4px",
            }}
          >
            Styles Gallery
          </div>
          <div className="pdocs-styles-grid">
            {STYLES.map((st) => {
              const isActive =
                st.type === currentType && (st.level === undefined || st.level === currentLevel);
              return (
                <button
                  key={st.label}
                  type="button"
                  className={`pdocs-style-tile ${isActive ? "active" : ""}`}
                  onClick={() => {
                    onSelectStyle(st.type, st.level);
                    setIsExpanded(false);
                  }}
                  title={`Apply ${st.label}`}
                >
                  <span className="pdocs-style-preview" style={st.styleProps}>
                    {st.previewSample}
                  </span>
                  <span className="pdocs-style-label">{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

