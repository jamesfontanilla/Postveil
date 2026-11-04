import React from "react";
import { LucideIcon, ChevronDown } from "lucide-react";

export interface RibbonSplitButtonProps {
  id: string;
  icon: LucideIcon;
  label?: string;
  tooltip: string;
  shortcut?: string;
  colorBar?: string;
  active?: boolean;
  disabled?: boolean;
  onAction: () => void;
  onDropdown: (e: React.MouseEvent) => void;
}

export const RibbonSplitButton: React.FC<RibbonSplitButtonProps> = ({
  id,
  icon: Icon,
  label,
  tooltip,
  shortcut,
  colorBar,
  active = false,
  disabled = false,
  onAction,
  onDropdown,
}) => {
  const fullTooltip = shortcut ? `${tooltip} (${shortcut})` : tooltip;

  return (
    <div
      className={`pdocs-ribbon-split-btn ${active ? "active" : ""}`}
      title={fullTooltip}
      data-command-id={id}
    >
      <button
        type="button"
        className="pdocs-ribbon-split-action"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onAction();
        }}
        disabled={disabled}
      >
        <Icon size={16} strokeWidth={1.85} />
        {label && <span className="small-label ml-1">{label}</span>}
        {colorBar && (
          <div
            className="pdocs-ribbon-color-bar"
            style={{ backgroundColor: colorBar }}
          />
        )}
      </button>
      <button
        type="button"
        className="pdocs-ribbon-split-trigger"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onDropdown(e);
        }}
        disabled={disabled}
      >
        <ChevronDown size={10} strokeWidth={2} />
      </button>
    </div>
  );
};
