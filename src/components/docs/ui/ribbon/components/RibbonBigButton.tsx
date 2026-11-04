import React from "react";
import { LucideIcon, ChevronDown } from "lucide-react";

export interface RibbonBigButtonProps {
  id: string;
  icon: LucideIcon;
  label: string;
  tooltip: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  hasDropdown?: boolean;
  onClick: () => void;
  onDropdownClick?: () => void;
}

/**
 * Splits label into two lines if character count > 10, breaking at the nearest space to the middle
 * matching WordCraft's two_lines() in crates/ui-egui/src/ribbon/common.rs.
 */
function formatTwoLines(label: string): string {
  if (label.length <= 10) return label;
  const words = label.split(" ");
  if (words.length <= 1) return label;

  const mid = Math.floor(words.length / 2);
  return `${words.slice(0, mid).join(" ")}\n${words.slice(mid).join(" ")}`;
}

export const RibbonBigButton: React.FC<RibbonBigButtonProps> = ({
  id,
  icon: Icon,
  label,
  tooltip,
  shortcut,
  active = false,
  disabled = false,
  hasDropdown = false,
  onClick,
  onDropdownClick,
}) => {
  const fullTooltip = shortcut ? `${tooltip} (${shortcut})` : tooltip;
  const formattedLabel = formatTwoLines(label);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick();
  };

  return (
    <button
      type="button"
      className={`pdocs-ribbon-big-btn ${active ? "active" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      title={fullTooltip}
      data-command-id={id}
    >
      <div className="big-icon">
        <Icon size={26} strokeWidth={1.8} />
      </div>
      <span className="big-label">{formattedLabel}</span>
      {hasDropdown && (
        <span
          className="dropdown-chevron"
          onClick={(e) => {
            e.stopPropagation();
            if (onDropdownClick) onDropdownClick();
            else onClick();
          }}
        >
          <ChevronDown size={10} />
        </span>
      )}
    </button>
  );
};
