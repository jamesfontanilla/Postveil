import React, { useState } from "react";
import {
  RibbonProvider,
  RibbonCommandContext,
  RibbonTabDef,
  DEFAULT_RIBBON_TABS,
  CONTEXTUAL_RIBBON_TABS,
  RibbonBigButton,
  RibbonSmallButton,
  RibbonSplitButton,
  RibbonGroup,
  RibbonDropdownMenu,
  FontPickerWidget,
  FontSizeWidget,
  TableAlignmentPicker,
  QuickAccessToolbar,
  RibbonPinButton,
  KeyTipsOverlay,
  BackstageView,
  useRibbonReflow,
  CollapsedGroupButton,
  RibbonIcons,
  useRibbonDispatcher,
  EquationSymbolsGallery,
  SimplifiedRibbonShelf,
  RibbonMode,
} from "./ribbon";
import { TableGridPicker } from "./ribbon/components/TableGridPicker";
import { StylesGallery } from "./ribbon/components/StylesGallery";
import { ColorPaletteDropdown } from "./ribbon/components/ColorPaletteDropdown";
import { BlockType, UniversalDoc, SupportedFormat } from "../types";
import "./ribbon/DocsRibbon.css";

export interface DocsRibbonProps extends RibbonCommandContext {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  fontFamily: string;
  fontSize: number;
  currentBlockType?: BlockType;
  currentBlockLevel?: number;
  onSelectStyle?: (type: BlockType, level?: number) => void;
  hasTableSelected?: boolean;
  hasImageSelected?: boolean;
  hasMathSelected?: boolean;
  doc?: UniversalDoc;
  onNewDoc?: () => void;
  onOpenLibrary?: () => void;
  onExportFormat?: (format: SupportedFormat) => void;
  userEmail?: string;
  userName?: string;
}

const RibbonShelf: React.FC<{
  currentTab: RibbonTabDef;
  fontFamily: string;
  fontSize: number;
  onFontChange: (f: string) => void;
  onFontSizeChange: (s: number) => void;
  currentBlockType?: BlockType;
  currentBlockLevel?: number;
  onSelectStyle?: (type: BlockType, level?: number) => void;
  activeMarks?: any;
  canUndo?: boolean;
  canRedo?: boolean;
}> = ({
  currentTab,
  fontFamily,
  fontSize,
  onFontChange,
  onFontSizeChange,
  currentBlockType = "paragraph",
  currentBlockLevel = 1,
  onSelectStyle,
  activeMarks,
  canUndo = false,
  canRedo = false,
}) => {
  const dispatcher = useRibbonDispatcher();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Specialized dropdown states
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorMode, setColorMode] = useState<"textColor" | "highlightColor">("textColor");
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLElement | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [tableAnchorEl, setTableAnchorEl] = useState<HTMLElement | null>(null);
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const [caseAnchorEl, setCaseAnchorEl] = useState<HTMLElement | null>(null);
  const [isSpacingMenuOpen, setIsSpacingMenuOpen] = useState(false);
  const [spacingAnchorEl, setSpacingAnchorEl] = useState<HTMLElement | null>(null);

  const handleDropdownClick = (itemId: string, e: React.MouseEvent) => {
    if (openMenuId === itemId) {
      setOpenMenuId(null);
      setAnchorEl(null);
    } else {
      setOpenMenuId(itemId);
      setAnchorEl(e.currentTarget as HTMLElement);
    }
  };

  const handleOpenColorPicker = (mode: "textColor" | "highlightColor", e: React.MouseEvent) => {
    setColorMode(mode);
    setColorAnchorEl(e.currentTarget as HTMLElement);
    setIsColorPickerOpen(true);
  };

  return (
    <div className="pdocs-ribbon-shelf" role="toolbar" aria-label="Ribbon tool shelf">
      {/* FAR-LEFT SHELF UNDO / REDO STACK (Home Tab) */}
      {currentTab.id === "home" && (
        <div className="pdocs-shelf-undo-stack">
          <div className="flex flex-col gap-1 justify-center h-full">
            <RibbonSmallButton
              id="shelf-undo"
              icon={RibbonIcons.undo}
              tooltip="Undo (Ctrl+Z)"
              shortcut="Ctrl+Z"
              disabled={!canUndo}
              onClick={() => dispatcher.dispatch("edit.undo")}
            />
            <RibbonSmallButton
              id="shelf-redo"
              icon={RibbonIcons.redo}
              tooltip="Redo (Ctrl+Y)"
              shortcut="Ctrl+Y"
              disabled={!canRedo}
              onClick={() => dispatcher.dispatch("edit.redo")}
            />
          </div>
        </div>
      )}

      {currentTab.groups.map((grp) => (
        <RibbonGroup
          key={grp.id}
          id={grp.id}
          title={grp.name}
          dialogLauncherId={grp.dialogCommand}
          onLaunchDialog={() => grp.dialogCommand && dispatcher.dispatch(grp.dialogCommand)}
        >
          {/* HOME TAB GROUPS */}
          {grp.id === "home.clipboard" && (
            <>
              {grp.items
                .filter((i) => i.kind === "split")
                .map((item) => (
                  <RibbonBigButton
                    key={item.id}
                    id={item.id}
                    icon={item.icon as any}
                    label={item.label}
                    tooltip={item.tooltip}
                    shortcut={item.shortcut}
                    hasDropdown={true}
                    onClick={() => dispatcher.dispatch(item.commandId || "edit.paste")}
                  />
                ))}
              <div className="pdocs-ribbon-stack-3">
                <RibbonSmallButton
                  id="cut"
                  icon={RibbonIcons.cut}
                  label="Cut"
                  tooltip="Cut (Ctrl+X)"
                  shortcut="Ctrl+X"
                  onClick={() => dispatcher.dispatch("edit.cut")}
                />
                <RibbonSmallButton
                  id="copy"
                  icon={RibbonIcons.copy}
                  label="Copy"
                  tooltip="Copy (Ctrl+C)"
                  shortcut="Ctrl+C"
                  onClick={() => dispatcher.dispatch("edit.copy")}
                />
                <RibbonSmallButton
                  id="painter"
                  icon={RibbonIcons.formatPainter}
                  label="Format Painter"
                  tooltip="Format Painter"
                  onClick={() => dispatcher.dispatch("edit.formatPainter")}
                />
              </div>
            </>
          )}

          {grp.id === "home.font" && (
            <div className="pdocs-ribbon-stack-2">
              {/* Row 1: Font Family + Font Size + Grow/Shrink + Case + Clear */}
              <div className="pdocs-ribbon-row-28">
                <FontPickerWidget currentFont={fontFamily} onFontChange={onFontChange} />
                <FontSizeWidget currentSize={fontSize} onSizeChange={onFontSizeChange} />
                <button
                  type="button"
                  className="pdocs-ribbon-small-btn px-1"
                  title="Increase Font Size (Ctrl+Shift+>)"
                  onClick={() => onFontSizeChange(Math.min(72, (fontSize || 12) + 1))}
                >
                  <span className="flex items-center gap-0.5 leading-none">
                    <span className="text-[13px] font-bold">A</span>
                    <span className="text-[8px] font-black text-[var(--ribbon-text-dim)]">▲</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="pdocs-ribbon-small-btn px-1"
                  title="Decrease Font Size (Ctrl+Shift+<)"
                  onClick={() => onFontSizeChange(Math.max(8, (fontSize || 12) - 1))}
                >
                  <span className="flex items-center gap-0.5 leading-none">
                    <span className="text-[11px] font-bold">A</span>
                    <span className="text-[8px] font-black text-[var(--ribbon-text-dim)]">▼</span>
                  </span>
                </button>
                <div className="relative inline-block">
                  <button
                    type="button"
                    className="pdocs-ribbon-small-btn px-1"
                    title="Change Case"
                    onClick={(e) => {
                      setCaseAnchorEl(e.currentTarget);
                      setIsCaseMenuOpen((prev) => !prev);
                    }}
                  >
                    <span className="flex items-center gap-0.5 text-[12px] font-semibold">
                      <span>Aa</span>
                      <span className="text-[8px] text-[var(--ribbon-text-dim)]">▾</span>
                    </span>
                  </button>
                  {isCaseMenuOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded shadow-lg py-1 z-50 text-[12px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                        onClick={() => {
                          dispatcher.dispatch("format.case", { type: "sentence" });
                          setIsCaseMenuOpen(false);
                        }}
                      >
                        Sentence case
                      </button>
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                        onClick={() => {
                          dispatcher.dispatch("format.case", { type: "lowercase" });
                          setIsCaseMenuOpen(false);
                        }}
                      >
                        lowercase
                      </button>
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                        onClick={() => {
                          dispatcher.dispatch("format.case", { type: "uppercase" });
                          setIsCaseMenuOpen(false);
                        }}
                      >
                        UPPERCASE
                      </button>
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                        onClick={() => {
                          dispatcher.dispatch("format.case", { type: "capitalize" });
                          setIsCaseMenuOpen(false);
                        }}
                      >
                        Capitalize Each Word
                      </button>
                    </div>
                  )}
                </div>
                <RibbonSmallButton
                  id="clear"
                  icon={RibbonIcons.clearFormat}
                  tooltip="Clear All Formatting"
                  onClick={() => dispatcher.dispatch("format.clear")}
                />
              </div>

              {/* Row 2: B, I, U ▾, Strike, Sub, Super, Text Effects, Highlight ▾, Font Color ▾ */}
              <div className="pdocs-ribbon-row-28">
                <RibbonSmallButton
                  id="bold"
                  icon={RibbonIcons.bold}
                  tooltip="Bold (Ctrl+B)"
                  shortcut="Ctrl+B"
                  active={activeMarks?.bold}
                  onClick={() => dispatcher.dispatch("format.bold")}
                />
                <RibbonSmallButton
                  id="italic"
                  icon={RibbonIcons.italic}
                  tooltip="Italic (Ctrl+I)"
                  shortcut="Ctrl+I"
                  active={activeMarks?.italic}
                  onClick={() => dispatcher.dispatch("format.italic")}
                />
                <button
                  type="button"
                  className={`pdocs-ribbon-small-btn px-1 ${activeMarks?.underline ? "active" : ""}`}
                  title="Underline (Ctrl+U)"
                  onClick={() => dispatcher.dispatch("format.underline")}
                >
                  <span className="flex items-center">
                    <RibbonIcons.underline size={15} strokeWidth={2} />
                    <span className="text-[8px] text-[var(--ribbon-text-dim)] ml-0.5">▾</span>
                  </span>
                </button>
                <RibbonSmallButton
                  id="strike"
                  icon={RibbonIcons.strike}
                  tooltip="Strikethrough"
                  active={activeMarks?.strikethrough}
                  onClick={() => dispatcher.dispatch("format.strikethrough")}
                />
                <RibbonSmallButton
                  id="subscript"
                  icon={RibbonIcons.subscript}
                  tooltip="Subscript"
                  active={activeMarks?.subscript}
                  onClick={() => dispatcher.dispatch("format.subscript")}
                />
                <RibbonSmallButton
                  id="superscript"
                  icon={RibbonIcons.superscript}
                  tooltip="Superscript"
                  active={activeMarks?.superscript}
                  onClick={() => dispatcher.dispatch("format.superscript")}
                />
                <button
                  type="button"
                  className="pdocs-ribbon-small-btn px-1"
                  title="Text Effects and Typography"
                >
                  <span className="flex items-center text-[13px] font-bold text-blue-600 dark:text-blue-400">
                    <span>A</span>
                    <span className="text-[8px] text-[var(--ribbon-text-dim)] ml-0.5 font-normal">▾</span>
                  </span>
                </button>
                <RibbonSplitButton
                  id="highlight-color"
                  icon={RibbonIcons.highlightColor}
                  tooltip="Text Highlight Color"
                  colorBar={activeMarks?.highlightColor || "#fef08a"}
                  onAction={() => dispatcher.dispatch("format.highlightColor", { color: "#fef08a" })}
                  onDropdown={(e) => handleOpenColorPicker("highlightColor", e)}
                />
                <RibbonSplitButton
                  id="text-color"
                  customGlyph={<span className="text-[13px] font-bold leading-none" style={{ color: "var(--ribbon-text)" }}>A</span>}
                  tooltip="Font Color"
                  colorBar={activeMarks?.textColor || "#dc2626"}
                  onAction={() => dispatcher.dispatch("format.textColor", { color: activeMarks?.textColor || "#dc2626" })}
                  onDropdown={(e) => handleOpenColorPicker("textColor", e)}
                />
              </div>
            </div>
          )}

          {grp.id === "home.paragraph" && (
            <div className="pdocs-ribbon-stack-2">
              {/* Row 1: Bullets ▾, Numbering ▾, Multilevel ▾, Decrease Indent, Increase Indent, Sort, Show/Hide */}
              <div className="pdocs-ribbon-row-28">
                <div className="flex items-center">
                  <RibbonSmallButton
                    id="bullet-list"
                    icon={RibbonIcons.bulletList}
                    tooltip="Bullets"
                    active={currentBlockType === "bulletList"}
                    onClick={() => dispatcher.dispatch("para.blockType", { type: "bulletList" })}
                  />
                  <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer">▾</span>
                </div>
                <div className="flex items-center">
                  <RibbonSmallButton
                    id="numbered-list"
                    icon={RibbonIcons.orderedList}
                    tooltip="Numbering"
                    active={currentBlockType === "orderedList"}
                    onClick={() => dispatcher.dispatch("para.blockType", { type: "orderedList" })}
                  />
                  <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer">▾</span>
                </div>
                <div className="flex items-center">
                  <RibbonSmallButton
                    id="multilevel-list"
                    icon={RibbonIcons.checkList}
                    tooltip="Multilevel List"
                    active={currentBlockType === "taskList"}
                    onClick={() => dispatcher.dispatch("para.blockType", { type: "taskList" })}
                  />
                  <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer">▾</span>
                </div>
                <RibbonSmallButton
                  id="decrease-indent"
                  icon={RibbonIcons.outdent}
                  tooltip="Decrease Indent"
                  onClick={() => dispatcher.dispatch("para.indent", { delta: -1 })}
                />
                <RibbonSmallButton
                  id="increase-indent"
                  icon={RibbonIcons.indent}
                  tooltip="Increase Indent"
                  onClick={() => dispatcher.dispatch("para.indent", { delta: 1 })}
                />
                <RibbonSmallButton
                  id="sort-paras"
                  icon={RibbonIcons.sort}
                  tooltip="Sort"
                  onClick={() => {}}
                />
                <RibbonSmallButton
                  id="show-hide-marks"
                  icon={RibbonIcons.pilcrow}
                  tooltip="Show/Hide ¶"
                  onClick={() => dispatcher.dispatch("para.showFormattingMarks")}
                />
              </div>

              {/* Row 2: Align Left, Center, Right, Justify, Line Spacing ▾, Shading ▾, Borders ▾ */}
              <div className="pdocs-ribbon-row-28">
                <RibbonSmallButton
                  id="align-left"
                  icon={RibbonIcons.alignLeft}
                  tooltip="Align Left (Ctrl+L)"
                  shortcut="Ctrl+L"
                  active={activeMarks?.alignment === "left" || !activeMarks?.alignment}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "left" })}
                />
                <RibbonSmallButton
                  id="align-center"
                  icon={RibbonIcons.alignCenter}
                  tooltip="Center (Ctrl+E)"
                  shortcut="Ctrl+E"
                  active={activeMarks?.alignment === "center"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "center" })}
                />
                <RibbonSmallButton
                  id="align-right"
                  icon={RibbonIcons.alignRight}
                  tooltip="Align Right (Ctrl+R)"
                  shortcut="Ctrl+R"
                  active={activeMarks?.alignment === "right"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "right" })}
                />
                <RibbonSmallButton
                  id="align-justify"
                  icon={RibbonIcons.alignJustify}
                  tooltip="Justify (Ctrl+J)"
                  shortcut="Ctrl+J"
                  active={activeMarks?.alignment === "justify"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "justify" })}
                />
                <div className="relative inline-flex items-center">
                  <RibbonSmallButton
                    id="line-spacing"
                    icon={RibbonIcons.lineSpacing}
                    tooltip="Line and Paragraph Spacing"
                    onClick={() => {
                      setIsSpacingMenuOpen((prev) => !prev);
                    }}
                  />
                  <span
                    className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer"
                    onClick={() => {
                      setIsSpacingMenuOpen((prev) => !prev);
                    }}
                  >
                    ▾
                  </span>
                  {isSpacingMenuOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded shadow-lg py-1 z-50 text-[12px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {["1.0", "1.15", "1.5", "2.0"].map((sp) => (
                        <button
                          key={sp}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                          onClick={() => {
                            dispatcher.dispatch("para.lineSpacing", { spacing: parseFloat(sp) });
                            setIsSpacingMenuOpen(false);
                          }}
                        >
                          <span>{sp}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center">
                  <RibbonSmallButton
                    id="shading-bucket"
                    icon={RibbonIcons.shadingBucket}
                    tooltip="Shading"
                    onClick={() => {}}
                  />
                  <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer">▾</span>
                </div>
                <div className="flex items-center">
                  <RibbonSmallButton
                    id="borders-menu"
                    icon={RibbonIcons.borders}
                    tooltip="Borders"
                    onClick={() => {}}
                  />
                  <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1 cursor-pointer">▾</span>
                </div>
              </div>
            </div>
          )}

          {grp.id === "home.styles" && (
            <StylesGallery
              currentType={currentBlockType}
              currentLevel={currentBlockLevel}
              onSelectStyle={(type, level) => {
                if (onSelectStyle) onSelectStyle(type, level);
                else dispatcher.dispatch("para.blockType", { type, level });
              }}
            />
          )}

          {grp.id === "home.editing" && (
            <div className="pdocs-ribbon-stack-3">
              <RibbonSmallButton
                id="find"
                icon={RibbonIcons.find}
                label="Find"
                tooltip="Find (Ctrl+F)"
                shortcut="Ctrl+F"
                onClick={() => dispatcher.dispatch("ui.dialog", { name: "findReplace" })}
              />
              <RibbonSmallButton
                id="replace"
                icon={RibbonIcons.replace}
                label="Replace"
                tooltip="Replace (Ctrl+H)"
                shortcut="Ctrl+H"
                onClick={() => dispatcher.dispatch("ui.dialog", { name: "findReplace" })}
              />
              <div className="flex items-center">
                <RibbonSmallButton
                  id="select"
                  icon={RibbonIcons.selectPointer}
                  label="Select"
                  tooltip="Select All (Ctrl+A)"
                  shortcut="Ctrl+A"
                  onClick={() => document.execCommand("selectAll")}
                />
                <span className="text-[8px] text-[var(--ribbon-text-dim)] -ml-1 mr-1">▾</span>
              </div>
            </div>
          )}

          {grp.id === "home.voice" && (
            <div className="flex items-center">
              <RibbonBigButton
                id="dictate"
                icon={RibbonIcons.dictate}
                label="Dictate"
                tooltip="Dictate (Voice typing)"
                hasDropdown={true}
                onClick={() => dispatcher.dispatch("voice.dictate")}
              />
            </div>
          )}

          {grp.id === "home.editor" && (
            <div className="flex items-center">
              <RibbonBigButton
                id="editor-proofing"
                icon={RibbonIcons.editorProofing}
                label="Editor"
                tooltip="Grammar & Proofing Editor"
                hasDropdown={true}
                onClick={() => dispatcher.dispatch("review.proofing")}
              />
            </div>
          )}

          {grp.id === "home.addins" && (
            <div className="flex items-center">
              <RibbonBigButton
                id="addins-store"
                icon={RibbonIcons.addins}
                label="Add-ins"
                tooltip="Office Add-ins"
                hasDropdown={true}
                onClick={() => dispatcher.dispatch("ui.dialog", { name: "addins" })}
              />
            </div>
          )}

          {/* INSERT TAB GROUPS */}
          {grp.id === "insert.tables" && (
            <div className="relative">
              <RibbonBigButton
                id="table"
                icon={RibbonIcons.table}
                label="Table"
                tooltip="Add a Table"
                hasDropdown={true}
                onClick={() => {
                  setIsTablePickerOpen(!isTablePickerOpen);
                }}
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
          )}

          {/* FALLBACK RENDERING FOR OTHER STANDARD GROUPS */}
          {grp.id !== "home.clipboard" &&
            grp.id !== "home.font" &&
            grp.id !== "home.paragraph" &&
            grp.id !== "home.styles" &&
            grp.id !== "home.editing" &&
            grp.id !== "home.voice" &&
            grp.id !== "home.editor" &&
            grp.id !== "home.addins" &&
            grp.id !== "insert.tables" && (
              <div className="flex items-center gap-1">
                {grp.items.map((item) => {
                  if (item.customRender === "TableAlignmentPicker") {
                    return (
                      <div key={item.id} className="flex flex-col items-center">
                        <TableAlignmentPicker
                          onSelectAlign={(align) => dispatcher.dispatch("table.cellAlign", { align })}
                        />
                      </div>
                    );
                  }
                  if (item.customRender === "EquationSymbolsGallery") {
                    return (
                      <div key={item.id} className="flex items-center">
                        <EquationSymbolsGallery />
                      </div>
                    );
                  }
                  if (item.kind === "menu" && item.items) {
                    return (
                      <div key={item.id} className="relative">
                        <RibbonSmallButton
                          id={item.id}
                          icon={item.icon as any}
                          label={item.label}
                          tooltip={item.tooltip}
                          onClick={() => {
                            if (openMenuId === item.id) {
                              setOpenMenuId(null);
                              setAnchorEl(null);
                            } else {
                              setOpenMenuId(item.id);
                              const el = document.querySelector(`[data-command-id="${item.id}"]`) as HTMLElement;
                              setAnchorEl(el);
                            }
                          }}
                        />
                        {openMenuId === item.id && (
                          <RibbonDropdownMenu
                            isOpen={true}
                            anchorEl={anchorEl}
                            items={item.items}
                            onSelect={(cmd, params) => {
                              dispatcher.dispatch(cmd, params);
                              setOpenMenuId(null);
                            }}
                            onClose={() => setOpenMenuId(null)}
                          />
                        )}
                      </div>
                    );
                  }
                  if (item.kind === "big") {
                    return (
                      <RibbonBigButton
                        key={item.id}
                        id={item.id}
                        icon={item.icon as any}
                        label={item.label}
                        tooltip={item.tooltip}
                        onClick={() => dispatcher.dispatch(item.commandId || "", item.defaultParams)}
                      />
                    );
                  }
                  if (item.kind === "split") {
                    return (
                      <RibbonSplitButton
                        key={item.id}
                        id={item.id}
                        icon={item.icon as any}
                        label={item.label}
                        tooltip={item.tooltip}
                        onAction={() => dispatcher.dispatch(item.commandId || "", item.defaultParams)}
                        onDropdown={(e: React.MouseEvent) => {
                          if (item.id === "td-shading") {
                            handleOpenColorPicker("highlightColor", e);
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <div key={item.id} className="relative">
                      <RibbonSmallButton
                        key={item.id}
                        id={item.id}
                        icon={item.icon as any}
                        label={item.label}
                        tooltip={item.tooltip}
                        onClick={() => {
                          dispatcher.dispatch(item.commandId || "", item.defaultParams);
                        }}
                      />
                      {openMenuId === item.id && item.items && (
                        <RibbonDropdownMenu
                          isOpen={true}
                          anchorEl={anchorEl}
                          items={item.items}
                          onSelect={(cmd, params) => dispatcher.dispatch(cmd, params)}
                          onClose={() => setOpenMenuId(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </RibbonGroup>
      ))}

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

export const DocsRibbon: React.FC<DocsRibbonProps> = (props) => {
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      return localStorage.getItem("pdocs_ribbon_active_tab") || "home";
    } catch {
      return "home";
    }
  });
  const [isBackstageOpen, setIsBackstageOpen] = useState(false);
  const [isKeyTipsActive, setIsKeyTipsActive] = useState(false);
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pdocs_ribbon_minimized") === "true";
    } catch {
      return false;
    }
  });
  const [ribbonMode, setRibbonMode] = useState<RibbonMode>(() => {
    try {
      return (localStorage.getItem("pdocs_ribbon_mode") as RibbonMode) || "classic";
    } catch {
      return "classic";
    }
  });
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [isQatBelowRibbon, setIsQatBelowRibbon] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pdocs_qat_position") === "below";
    } catch {
      return false;
    }
  });

  const shelfWrapperRef = React.useRef<HTMLDivElement>(null);
  const { tier } = useRibbonReflow(shelfWrapperRef);

  // Synchronize state preferences to localStorage
  const handleSetRibbonMode = (mode: RibbonMode) => {
    setRibbonMode(mode);
    try {
      localStorage.setItem("pdocs_ribbon_mode", mode);
    } catch {}
  };
  const handleSetRibbonCollapsed = (collapsed: boolean | ((prev: boolean) => boolean)) => {
    setIsRibbonCollapsed((prev) => {
      const next = typeof collapsed === "function" ? collapsed(prev) : collapsed;
      try {
        localStorage.setItem("pdocs_ribbon_minimized", next ? "true" : "false");
      } catch {}
      return next;
    });
  };

  const handleSetActiveTab = (tabId: string) => {
    setActiveTabId(tabId);
    try {
      if (tabId !== "file") {
        localStorage.setItem("pdocs_ribbon_active_tab", tabId);
      }
    } catch {}
  };

  const handleSetQatBelow = (below: boolean) => {
    setIsQatBelowRibbon(below);
    try {
      localStorage.setItem("pdocs_qat_position", below ? "below" : "above");
    } catch {}
  };

  // Track contextual tab states & auto-switching
  const prevTableSelected = React.useRef(false);
  const prevImageSelected = React.useRef(false);
  const prevMathSelected = React.useRef(false);

  React.useEffect(() => {
    if (props.hasTableSelected && !prevTableSelected.current) {
      handleSetActiveTab("table-layout");
      if (isRibbonCollapsed) setIsFlyoutOpen(true);
    } else if (!props.hasTableSelected && prevTableSelected.current) {
      if (activeTabId === "table-layout" || activeTabId === "table-design") {
        handleSetActiveTab("home");
      }
    }
    prevTableSelected.current = !!props.hasTableSelected;
  }, [props.hasTableSelected, activeTabId, isRibbonCollapsed]);

  React.useEffect(() => {
    if (props.hasImageSelected && !prevImageSelected.current) {
      handleSetActiveTab("picture-format");
      if (isRibbonCollapsed) setIsFlyoutOpen(true);
    } else if (!props.hasImageSelected && prevImageSelected.current) {
      if (activeTabId === "picture-format") {
        handleSetActiveTab("home");
      }
    }
    prevImageSelected.current = !!props.hasImageSelected;
  }, [props.hasImageSelected, activeTabId, isRibbonCollapsed]);

  React.useEffect(() => {
    if (props.hasMathSelected && !prevMathSelected.current) {
      handleSetActiveTab("equation-design");
      if (isRibbonCollapsed) setIsFlyoutOpen(true);
    } else if (!props.hasMathSelected && prevMathSelected.current) {
      if (activeTabId === "equation-design") {
        handleSetActiveTab("home");
      }
    }
    prevMathSelected.current = !!props.hasMathSelected;
  }, [props.hasMathSelected, activeTabId, isRibbonCollapsed]);

  // Global hotkeys: Ctrl+F1 for collapse, Alt for KeyTips
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "F1") {
        e.preventDefault();
        handleSetRibbonCollapsed((prev) => !prev);
        setIsFlyoutOpen(false);
      } else if (e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Toggle KeyTips
        e.preventDefault();
        setIsKeyTipsActive((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Compute all visible tabs (core + active contextual)
  const visibleTabs: RibbonTabDef[] = [...DEFAULT_RIBBON_TABS];
  if (props.hasTableSelected) {
    visibleTabs.push(CONTEXTUAL_RIBBON_TABS["table-design"]);
    visibleTabs.push(CONTEXTUAL_RIBBON_TABS["table-layout"]);
  }
  if (props.hasImageSelected) {
    visibleTabs.push(CONTEXTUAL_RIBBON_TABS["picture-format"]);
  }
  if (props.hasMathSelected) {
    visibleTabs.push(CONTEXTUAL_RIBBON_TABS["equation-design"]);
  }

  const currentTab =
    visibleTabs.find((t) => t.id === activeTabId) || visibleTabs[1] || visibleTabs[0];

  const handleTabClick = (tabId: string) => {
    if (tabId === "file") {
      setIsBackstageOpen(true);
      return;
    }
    if (isRibbonCollapsed) {
      if (activeTabId === tabId && isFlyoutOpen) {
        setIsFlyoutOpen(false);
      } else {
        handleSetActiveTab(tabId);
        setIsFlyoutOpen(true);
      }
    } else {
      handleSetActiveTab(tabId);
    }
  };

  const handleTabDoubleClick = (tabId: string) => {
    if (tabId === "file") return;
    handleSetRibbonCollapsed((prev) => !prev);
    setIsFlyoutOpen(false);
  };

  const shouldRenderShelf = !isRibbonCollapsed || isFlyoutOpen;

  return (
    <RibbonProvider context={props}>
      <div className="pdocs-ribbon-container">
        {/* Quick Access Toolbar (Above Ribbon) */}
        {!isQatBelowRibbon && (
          <QuickAccessToolbar
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            isBelowRibbon={false}
            onTogglePlacement={handleSetQatBelow}
          />
        )}

        {/* Tab Strip */}
        <div className="pdocs-ribbon-tab-bar" role="tablist">
          {visibleTabs.map((tab) => {
            const isContextual = !!tab.isContextual;
            const isFile = tab.id === "file";
            const isActive = !isFile && activeTabId === tab.id;
            const contextualClass = isContextual
              ? tab.contextualType === "math"
                ? "contextual math"
                : tab.contextualType === "image"
                ? "contextual pic"
                : "contextual"
              : "";

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`pdocs-ribbon-tab-btn ${isFile ? "bg-blue-600! text-white! font-bold" : ""} ${contextualClass} ${isActive ? "active" : ""}`}
                onClick={() => handleTabClick(tab.id)}
                onDoubleClick={() => handleTabDoubleClick(tab.id)}
                data-keytip={tab.keyTip}
              >
                {tab.label}
              </button>
            );
          })}

          {/* Header Right Utilities: Comments, Catch up, Editing mode, Share */}
          <div className="pdocs-header-utility-strip hidden md:flex">
            <button
              type="button"
              className="pdocs-util-btn"
              title="Comments & Annotations"
              onClick={() => props.onOpenNewCommentModal?.()}
            >
              <RibbonIcons.comment size={14} />
              <span>Comments</span>
            </button>
            <button
              type="button"
              className="pdocs-util-btn"
              title="Catch up with changes"
              onClick={() => {}}
            >
              <RibbonIcons.aiSparkle size={14} className="text-blue-500" />
              <span>Catch up</span>
            </button>
            <button
              type="button"
              className="pdocs-util-btn"
              title="Editing Mode"
              onClick={() => {}}
            >
              <RibbonIcons.suggesting size={14} />
              <span>Editing</span>
              <span className="text-[9px]">▾</span>
            </button>
            <button
              type="button"
              className="pdocs-util-btn share"
              title="Share Document"
              onClick={() => {}}
            >
              <RibbonIcons.share size={13} />
              <span>Share</span>
              <span className="text-[9px] ml-0.5">▾</span>
            </button>
          </div>

          {/* Ribbon Controls: Mode Switcher & Pin / Collapse Button */}
          <div className="flex items-center gap-0.5 ml-1 mr-1.5">
            <button
              type="button"
              className="pdocs-ribbon-mode-btn"
              title={ribbonMode === "classic" ? "Switch to Simplified Ribbon" : "Switch to Classic Ribbon"}
              onClick={() => handleSetRibbonMode(ribbonMode === "classic" ? "simplified" : "classic")}
            >
              {ribbonMode === "classic" ? (
                <RibbonIcons.chevronDown size={13} />
              ) : (
                <RibbonIcons.chevronUp size={13} />
              )}
            </button>
            <RibbonPinButton
              isCollapsed={isRibbonCollapsed}
              onToggleCollapse={() => {
                handleSetRibbonCollapsed((prev) => !prev);
                setIsFlyoutOpen(false);
              }}
            />
          </div>
        </div>

        {/* Shelf with Groups (Inline or Floating Flyout) */}
        <div
          ref={shelfWrapperRef}
          className={`pdocs-ribbon-shelf-wrapper tier-${tier} ${isRibbonCollapsed ? (isFlyoutOpen ? "flyout" : "collapsed") : ""}`}
        >
          {shouldRenderShelf && (
            ribbonMode === "simplified" ? (
              <SimplifiedRibbonShelf
                currentTab={currentTab}
                fontFamily={props.fontFamily}
                fontSize={props.fontSize}
                onFontChange={props.onFontChange}
                onFontSizeChange={props.onFontSizeChange}
                currentBlockType={props.currentBlockType}
                currentBlockLevel={props.currentBlockLevel}
                onSelectStyle={props.onSelectStyle}
                activeMarks={props.activeMarks}
              />
            ) : (
              <RibbonShelf
                currentTab={currentTab}
                fontFamily={props.fontFamily}
                fontSize={props.fontSize}
                onFontChange={props.onFontChange}
                onFontSizeChange={props.onFontSizeChange}
                currentBlockType={props.currentBlockType}
                currentBlockLevel={props.currentBlockLevel}
                onSelectStyle={props.onSelectStyle}
                activeMarks={props.activeMarks}
                canUndo={props.canUndo}
                canRedo={props.canRedo}
              />
            )
          )}
        </div>

        {/* Quick Access Toolbar (Below Ribbon if configured) */}
        {isQatBelowRibbon && (
          <QuickAccessToolbar
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            isBelowRibbon={true}
            onTogglePlacement={handleSetQatBelow}
          />
        )}

        {/* KeyTips Floating Badges Overlay */}
        <KeyTipsOverlay
          isActive={isKeyTipsActive}
          activeTabId={activeTabId}
          onSelectTab={(tabId) => {
            if (tabId === "file") {
              setIsBackstageOpen(true);
            } else {
              setActiveTabId(tabId);
              if (isRibbonCollapsed) setIsFlyoutOpen(true);
            }
          }}
          onExecuteCommand={(cmd) => {
            if (cmd === "format.bold") props.onFormatCommand("bold");
            else if (cmd === "format.italic") props.onFormatCommand("italic");
            else if (cmd === "format.underline") props.onFormatCommand("underline");
            else if (cmd === "file.save") props.onSave?.();
            else if (cmd === "edit.undo") props.onUndo();
            else if (cmd === "edit.redo") props.onRedo();
          }}
          onDismiss={() => setIsKeyTipsActive(false)}
        />

        {/* Backstage View Modal Overlay */}
        {props.doc && (
          <BackstageView
            isOpen={isBackstageOpen}
            doc={props.doc}
            onClose={() => setIsBackstageOpen(false)}
            onNewDoc={props.onNewDoc || (() => {})}
            onOpenLibrary={props.onOpenLibrary || (() => {})}
            onSaveDoc={props.onSave || (() => {})}
            onExportFormat={props.onExportFormat || (() => {})}
            onPrint={() => window.print()}
            onOpenSignatureModal={props.onOpenSignatureModal}
            userEmail={props.userEmail}
            userName={props.userName}
          />
        )}
      </div>
    </RibbonProvider>
  );
};
