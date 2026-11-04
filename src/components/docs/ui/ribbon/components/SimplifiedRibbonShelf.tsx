import React, { useState } from "react";
import { RibbonIcons } from "../icons";
import { useRibbonDispatcher } from "../RibbonContext";
import { RibbonSmallButton } from "./RibbonSmallButton";
import { RibbonSplitButton } from "./RibbonSplitButton";
import { FontPickerWidget, FontSizeWidget } from "./RibbonWidgets";
import { ColorPaletteDropdown } from "./ColorPaletteDropdown";
import { TableGridPicker } from "./TableGridPicker";
import { BlockType } from "../../../types";
import { RibbonTabDef } from "../types";

export interface SimplifiedRibbonShelfProps {
  currentTab: RibbonTabDef;
  fontFamily: string;
  fontSize: number;
  onFontChange: (f: string) => void;
  onFontSizeChange: (s: number) => void;
  currentBlockType?: BlockType;
  currentBlockLevel?: number;
  onSelectStyle?: (type: BlockType, level?: number) => void;
  activeMarks?: any;
}

export const SimplifiedRibbonShelf: React.FC<SimplifiedRibbonShelfProps> = ({
  currentTab,
  fontFamily,
  fontSize,
  onFontChange,
  onFontSizeChange,
  currentBlockType = "paragraph",
  currentBlockLevel = 1,
  onSelectStyle,
  activeMarks,
}) => {
  const dispatcher = useRibbonDispatcher();
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorMode, setColorMode] = useState<"textColor" | "highlightColor">("textColor");
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLElement | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [overflowAnchorEl, setOverflowAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpenColorPicker = (mode: "textColor" | "highlightColor", e: React.MouseEvent) => {
    setColorMode(mode);
    setColorAnchorEl(e.currentTarget as HTMLElement);
    setIsColorPickerOpen(true);
  };

  const MoreIcon = RibbonIcons.more;

  return (
    <div className="pdocs-simplified-shelf" role="toolbar" aria-label="Simplified Ribbon Tool Shelf">
      {/* HOME TAB (Simplified) */}
      {currentTab.id === "home" && (
        <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
          {/* Clipboard */}
          <RibbonSplitButton
            id="sim-paste"
            icon={RibbonIcons.paste}
            tooltip="Paste (Ctrl+V)"
            onAction={() => dispatcher.dispatch("edit.paste")}
            onDropdown={() => dispatcher.dispatch("edit.paste")}
          />
          <RibbonSmallButton
            id="sim-cut"
            icon={RibbonIcons.cut}
            tooltip="Cut (Ctrl+X)"
            onClick={() => dispatcher.dispatch("edit.cut")}
          />
          <RibbonSmallButton
            id="sim-copy"
            icon={RibbonIcons.copy}
            tooltip="Copy (Ctrl+C)"
            onClick={() => dispatcher.dispatch("edit.copy")}
          />

          <div className="pdocs-simplified-divider" />

          {/* Font & Sizing */}
          <FontPickerWidget
            currentFont={fontFamily}
            onFontChange={(f: string) => {
              onFontChange(f);
              dispatcher.dispatch("format.font", { name: f });
            }}
          />
          <FontSizeWidget
            currentSize={fontSize}
            onSizeChange={(s: number) => {
              onFontSizeChange(s);
              dispatcher.dispatch("format.size", { size: s });
            }}
          />

          {/* Quick Marks */}
          <RibbonSmallButton
            id="sim-bold"
            icon={RibbonIcons.bold}
            tooltip="Bold (Ctrl+B)"
            active={!!activeMarks?.bold}
            onClick={() => dispatcher.dispatch("format.bold")}
          />
          <RibbonSmallButton
            id="sim-italic"
            icon={RibbonIcons.italic}
            tooltip="Italic (Ctrl+I)"
            active={!!activeMarks?.italic}
            onClick={() => dispatcher.dispatch("format.italic")}
          />
          <RibbonSmallButton
            id="sim-underline"
            icon={RibbonIcons.underline}
            tooltip="Underline (Ctrl+U)"
            active={!!activeMarks?.underline}
            onClick={() => dispatcher.dispatch("format.underline")}
          />
          <RibbonSplitButton
            id="sim-text-color"
            customGlyph={<span className="text-[13px] font-bold leading-none" style={{ color: "var(--ribbon-text)" }}>A</span>}
            tooltip="Font Color"
            colorBar={activeMarks?.textColor || "#dc2626"}
            onAction={() => dispatcher.dispatch("format.textColor", { color: activeMarks?.textColor || "#dc2626" })}
            onDropdown={(e) => handleOpenColorPicker("textColor", e)}
          />
          <RibbonSplitButton
            id="sim-highlight-color"
            icon={RibbonIcons.highlightColor}
            tooltip="Highlight Color"
            onAction={() => dispatcher.dispatch("format.highlightColor", { color: activeMarks?.highlightColor || "#fef08a" })}
            onDropdown={(e) => handleOpenColorPicker("highlightColor", e)}
          />

          <div className="pdocs-simplified-divider" />

          {/* Paragraph Alignments & Lists */}
          <RibbonSmallButton
            id="sim-align-left"
            icon={RibbonIcons.alignLeft}
            tooltip="Align Left"
            active={!activeMarks?.align || activeMarks?.align === "left"}
            onClick={() => dispatcher.dispatch("para.align", { alignment: "left" })}
          />
          <RibbonSmallButton
            id="sim-align-center"
            icon={RibbonIcons.alignCenter}
            tooltip="Center"
            active={activeMarks?.align === "center"}
            onClick={() => dispatcher.dispatch("para.align", { alignment: "center" })}
          />
          <RibbonSmallButton
            id="sim-bullets"
            icon={RibbonIcons.bulletList}
            tooltip="Bullets"
            active={currentBlockType === "bulletList"}
            onClick={() => dispatcher.dispatch("para.blockType", { type: "bulletList" })}
          />
          <RibbonSmallButton
            id="sim-numbers"
            icon={RibbonIcons.orderedList}
            tooltip="Numbering"
            active={currentBlockType === "orderedList"}
            onClick={() => dispatcher.dispatch("para.blockType", { type: "orderedList" })}
          />

          <div className="pdocs-simplified-divider" />

          {/* Overflow Menu Button */}
          <div className="relative ml-auto flex-shrink-0">
            <button
              type="button"
              className={`pdocs-simplified-overflow-btn ${isOverflowOpen ? "active" : ""}`}
              title="More Options"
              onClick={(e) => {
                setOverflowAnchorEl(e.currentTarget);
                setIsOverflowOpen((prev) => !prev);
              }}
            >
              <MoreIcon size={16} />
            </button>

            {isOverflowOpen && (
              <div
                className="pdocs-simplified-overflow-menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("format.clear");
                    setIsOverflowOpen(false);
                  }}
                >
                  Clear All Formatting
                </button>
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("format.strikethrough");
                    setIsOverflowOpen(false);
                  }}
                >
                  Strikethrough
                </button>
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("format.subscript");
                    setIsOverflowOpen(false);
                  }}
                >
                  Subscript
                </button>
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("format.superscript");
                    setIsOverflowOpen(false);
                  }}
                >
                  Superscript
                </button>
                <div className="pdocs-context-menu-divider" />
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("para.align", { alignment: "right" });
                    setIsOverflowOpen(false);
                  }}
                >
                  Align Right
                </button>
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("para.align", { alignment: "justify" });
                    setIsOverflowOpen(false);
                  }}
                >
                  Justify
                </button>
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("para.blockType", { type: "taskList" });
                    setIsOverflowOpen(false);
                  }}
                >
                  Checklist
                </button>
                <div className="pdocs-context-menu-divider" />
                <button
                  type="button"
                  className="pdocs-context-menu-item"
                  onClick={() => {
                    dispatcher.dispatch("ui.dialog", { name: "findReplace" });
                    setIsOverflowOpen(false);
                  }}
                >
                  Find & Replace (Ctrl+H)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSERT TAB (Simplified) */}
      {currentTab.id === "insert" && (
        <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
          <div className="relative">
            <RibbonSmallButton
              id="sim-ins-table"
              icon={RibbonIcons.table}
              label="Table"
              tooltip="Insert Table"
              onClick={() => setIsTablePickerOpen(!isTablePickerOpen)}
            />
            {isTablePickerOpen && (
              <div className="absolute top-full left-0 mt-1 z-50">
                <TableGridPicker
                  onSelect={(rows, cols) => {
                    dispatcher.dispatch("insert.table", { rows, cols });
                    setIsTablePickerOpen(false);
                  }}
                  onClose={() => setIsTablePickerOpen(false)}
                />
              </div>
            )}
          </div>

          <RibbonSmallButton
            id="sim-ins-pic"
            icon={RibbonIcons.image}
            label="Picture"
            tooltip="Upload Picture"
            onClick={() => dispatcher.dispatch("insert.image")}
          />
          <RibbonSmallButton
            id="sim-ins-link"
            icon={RibbonIcons.link}
            label="Link"
            tooltip="Add Hyperlink"
            onClick={() => dispatcher.dispatch("insert.link")}
          />
          <RibbonSmallButton
            id="sim-ins-comment"
            icon={RibbonIcons.comment}
            label="Comment"
            tooltip="New Comment"
            onClick={() => dispatcher.dispatch("insert.comment")}
          />
          <RibbonSmallButton
            id="sim-ins-eq"
            icon={RibbonIcons.equation}
            label="Equation"
            tooltip="Insert Equation"
            onClick={() => dispatcher.dispatch("insert.equation")}
          />
          <RibbonSmallButton
            id="sim-ins-foot"
            icon={RibbonIcons.footnote}
            label="Footnote"
            tooltip="Insert Footnote"
            onClick={() => dispatcher.dispatch("insert.footnote")}
          />
        </div>
      )}

      {/* LAYOUT TAB (Simplified) */}
      {currentTab.id === "layout" && (
        <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
          <RibbonSmallButton
            id="sim-layout-orient"
            icon={RibbonIcons.pageSetup}
            label="Orientation"
            tooltip="Toggle Orientation"
            onClick={() => dispatcher.dispatch("layout.orientation", { value: "landscape" })}
          />
          <RibbonSmallButton
            id="sim-layout-size"
            icon={RibbonIcons.maximize}
            label="Page Size"
            tooltip="Page Setup Dialog"
            onClick={() => dispatcher.dispatch("ui.dialog", { name: "pageSetup" })}
          />
          <RibbonSmallButton
            id="sim-layout-cols"
            icon={RibbonIcons.columns}
            label="Columns"
            tooltip="Columns Setup"
            onClick={() => dispatcher.dispatch("layout.columns", { count: 2 })}
          />
        </div>
      )}

      {/* CONTEXTUAL TABS (Simplified fallback) */}
      {currentTab.id !== "home" && currentTab.id !== "insert" && currentTab.id !== "layout" && (
        <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
          {currentTab.groups.flatMap((g) => g.items).slice(0, 8).map((item) => (
            <RibbonSmallButton
              key={item.id}
              id={item.id}
              icon={item.icon as any}
              label={item.label}
              tooltip={item.tooltip}
              onClick={() => dispatcher.dispatch(item.commandId || "", item.defaultParams)}
            />
          ))}
        </div>
      )}

      {/* Universal Color Palette Dropdown */}
      <ColorPaletteDropdown
        isOpen={isColorPickerOpen}
        anchorEl={colorAnchorEl}
        mode={colorMode}
        currentColor={colorMode === "textColor" ? activeMarks?.textColor || "#000000" : activeMarks?.highlightColor || "transparent"}
        onSelectColor={(color) => {
          dispatcher.dispatch(colorMode === "textColor" ? "format.textColor" : "format.highlightColor", { color });
        }}
        onClose={() => setIsColorPickerOpen(false)}
      />
    </div>
  );
};
