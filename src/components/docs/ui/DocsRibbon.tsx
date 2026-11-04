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
                    hasDropdown={!!item.items}
                    onClick={() => dispatcher.dispatch(item.commandId || "edit.paste")}
                  />
                ))}
              <div className="pdocs-ribbon-stack-3">
                {grp.items
                  .filter((i) => i.kind === "small")
                  .map((item) => (
                    <RibbonSmallButton
                      key={item.id}
                      id={item.id}
                      icon={item.icon as any}
                      label={item.label}
                      tooltip={item.tooltip}
                      shortcut={item.shortcut}
                      onClick={() => dispatcher.dispatch(item.commandId || "")}
                    />
                  ))}
              </div>
            </>
          )}

          {grp.id === "home.font" && (
            <div className="pdocs-ribbon-stack-3">
              {/* Row 1: Font Family + Font Size */}
              <div className="pdocs-ribbon-row">
                <FontPickerWidget currentFont={fontFamily} onFontChange={onFontChange} />
                <FontSizeWidget currentSize={fontSize} onSizeChange={onFontSizeChange} />
              </div>
              {/* Row 2: Inline Styles */}
              <div className="pdocs-ribbon-row">
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
                <RibbonSmallButton
                  id="underline"
                  icon={RibbonIcons.underline}
                  tooltip="Underline (Ctrl+U)"
                  shortcut="Ctrl+U"
                  active={activeMarks?.underline}
                  onClick={() => dispatcher.dispatch("format.underline")}
                />
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
                <RibbonSmallButton
                  id="clear"
                  icon={RibbonIcons.clearFormat}
                  tooltip="Clear Formatting"
                  onClick={() => dispatcher.dispatch("format.clear")}
                />
              </div>
              {/* Row 3: Colors */}
              <div className="pdocs-ribbon-row">
                <RibbonSplitButton
                  id="text-color"
                  icon={RibbonIcons.textColor}
                  tooltip="Font Color"
                  colorBar={activeMarks?.textColor || "#000000"}
                  onAction={() => dispatcher.dispatch("format.textColor", { color: "#000000" })}
                  onDropdown={(e) => handleOpenColorPicker("textColor", e)}
                />
                <RibbonSplitButton
                  id="highlight-color"
                  icon={RibbonIcons.highlightColor}
                  tooltip="Highlight Color"
                  colorBar={activeMarks?.highlightColor || "transparent"}
                  onAction={() => dispatcher.dispatch("format.highlightColor", { color: "#fef08a" })}
                  onDropdown={(e) => handleOpenColorPicker("highlightColor", e)}
                />
              </div>
            </div>
          )}

          {grp.id === "home.paragraph" && (
            <div className="pdocs-ribbon-stack-3">
              <div className="pdocs-ribbon-row">
                <RibbonSmallButton
                  id="bullet-list"
                  icon={RibbonIcons.bulletList}
                  tooltip="Bullet List"
                  active={currentBlockType === "bulletList"}
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "bulletList" })}
                />
                <RibbonSmallButton
                  id="numbered-list"
                  icon={RibbonIcons.orderedList}
                  tooltip="Numbered List"
                  active={currentBlockType === "orderedList"}
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "orderedList" })}
                />
                <RibbonSmallButton
                  id="check-list"
                  icon={RibbonIcons.checkList}
                  tooltip="Checklist"
                  active={currentBlockType === "taskList"}
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "taskList" })}
                />
              </div>
              <div className="pdocs-ribbon-row">
                <RibbonSmallButton
                  id="align-left"
                  icon={RibbonIcons.alignLeft}
                  tooltip="Align Left (Ctrl+L)"
                  active={activeMarks?.alignment === "left" || !activeMarks?.alignment}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "left" })}
                />
                <RibbonSmallButton
                  id="align-center"
                  icon={RibbonIcons.alignCenter}
                  tooltip="Center (Ctrl+E)"
                  active={activeMarks?.alignment === "center"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "center" })}
                />
                <RibbonSmallButton
                  id="align-right"
                  icon={RibbonIcons.alignRight}
                  tooltip="Align Right (Ctrl+R)"
                  active={activeMarks?.alignment === "right"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "right" })}
                />
                <RibbonSmallButton
                  id="align-justify"
                  icon={RibbonIcons.alignJustify}
                  tooltip="Justify (Ctrl+J)"
                  active={activeMarks?.alignment === "justify"}
                  onClick={() => dispatcher.dispatch("para.align", { alignment: "justify" })}
                />
              </div>
              <div className="pdocs-ribbon-row">
                {grp.items
                  .filter((i) => i.id === "line-spacing")
                  .map((item) => (
                    <div key={item.id} className="relative">
                      <RibbonSmallButton
                        id={item.id}
                        icon={item.icon as any}
                        label="1.15"
                        tooltip={item.tooltip}
                        onClick={() => {}}
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
                  ))}
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
                icon={RibbonIcons.aiSparkle}
                label="Find & Replace"
                tooltip="Find & Replace (Ctrl+H)"
                onClick={() => dispatcher.dispatch("ui.dialog", { name: "findReplace" })}
              />
              <RibbonSmallButton
                id="select-all"
                icon={RibbonIcons.check}
                label="Select All"
                tooltip="Select All (Ctrl+A)"
                onClick={() => document.execCommand("selectAll")}
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

          {/* Ribbon Pin / Collapse Button */}
          <RibbonPinButton
            isCollapsed={isRibbonCollapsed}
            onToggleCollapse={() => {
              handleSetRibbonCollapsed((prev) => !prev);
              setIsFlyoutOpen(false);
            }}
          />
        </div>

        {/* Shelf with Groups (Inline or Floating Flyout) */}
        <div
          ref={shelfWrapperRef}
          className={`pdocs-ribbon-shelf-wrapper tier-${tier} ${isRibbonCollapsed ? (isFlyoutOpen ? "flyout" : "collapsed") : ""}`}
        >
          {shouldRenderShelf && (
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
            />
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
