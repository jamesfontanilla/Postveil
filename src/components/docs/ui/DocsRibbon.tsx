import React, { useState } from "react";
import {
  RibbonProvider,
  RibbonCommandContext,
  RibbonTabDef,
  DEFAULT_RIBBON_TABS,
  RibbonBigButton,
  RibbonSmallButton,
  RibbonSplitButton,
  RibbonGroup,
  RibbonDropdownMenu,
  FontPickerWidget,
  FontSizeWidget,
  RibbonIcons,
  useRibbonDispatcher,
} from "./ribbon";
import "./ribbon/DocsRibbon.css";

export interface DocsRibbonProps extends RibbonCommandContext {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  fontFamily: string;
  fontSize: number;
}

const RibbonShelf: React.FC<{
  currentTab: RibbonTabDef;
  fontFamily: string;
  fontSize: number;
  onFontChange: (f: string) => void;
  onFontSizeChange: (s: number) => void;
  activeMarks?: any;
}> = ({ currentTab, fontFamily, fontSize, onFontChange, onFontSizeChange, activeMarks }) => {
  const dispatcher = useRibbonDispatcher();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleDropdownClick = (itemId: string, e: React.MouseEvent) => {
    if (openMenuId === itemId) {
      setOpenMenuId(null);
      setAnchorEl(null);
    } else {
      setOpenMenuId(itemId);
      setAnchorEl(e.currentTarget as HTMLElement);
    }
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
              {/* Row 1: Font Picker + Font Size */}
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
                  onDropdown={(e) => handleDropdownClick("text-color", e)}
                />
                <RibbonSplitButton
                  id="highlight-color"
                  icon={RibbonIcons.highlightColor}
                  tooltip="Highlight Color"
                  colorBar={activeMarks?.highlightColor || "transparent"}
                  onAction={() => dispatcher.dispatch("format.highlightColor", { color: "#fef08a" })}
                  onDropdown={(e) => handleDropdownClick("highlight-color", e)}
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
                  tooltip="Bullets"
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "bullet-list" })}
                />
                <RibbonSmallButton
                  id="numbered-list"
                  icon={RibbonIcons.orderedList}
                  tooltip="Numbering"
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "numbered-list" })}
                />
                <RibbonSmallButton
                  id="check-list"
                  icon={RibbonIcons.checkList}
                  tooltip="Checklist"
                  onClick={() => dispatcher.dispatch("para.blockType", { type: "checklist" })}
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

          {/* Standard Group Fallback */}
          {grp.id !== "home.clipboard" && grp.id !== "home.font" && grp.id !== "home.paragraph" && (
            <div className="flex items-center gap-1">
              {grp.items.map((item) => {
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
    </div>
  );
};

export const DocsRibbon: React.FC<DocsRibbonProps> = (props) => {
  const [activeTabId, setActiveTabId] = useState<string>("home");

  const currentTab =
    DEFAULT_RIBBON_TABS.find((t) => t.id === activeTabId) || DEFAULT_RIBBON_TABS[0];

  return (
    <RibbonProvider context={props}>
      <div className="pdocs-ribbon-container">
        {/* Tab Strip */}
        <div className="pdocs-ribbon-tab-bar" role="tablist">
          {DEFAULT_RIBBON_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={`pdocs-ribbon-tab-btn ${activeTabId === tab.id ? "active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Shelf with Groups */}
        <RibbonShelf
          currentTab={currentTab}
          fontFamily={props.fontFamily}
          fontSize={props.fontSize}
          onFontChange={props.onFontChange}
          onFontSizeChange={props.onFontSizeChange}
          activeMarks={props.activeMarks}
        />
      </div>
    </RibbonProvider>
  );
};
