import React from "react";
import { LucideIcon } from "lucide-react";

export interface RibbonSmallButtonProps {
  id: string;
  icon: LucideIcon;
  label?: string;
  tooltip: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const RibbonSmallButton: React.FC<RibbonSmallButtonProps> = ({
  id,
  icon: Icon,
  label,
  tooltip,
  shortcut,
  active = false,
  disabled = false,
  onClick,
}) => {
  const fullTooltip = shortcut ? `${tooltip} (${shortcut})` : tooltip;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick();
  };

  return (
    <button
      type="button"
      className={`pdocs-ribbon-small-btn ${active ? "active" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      title={fullTooltip}
      data-command-id={id}
    >
      <Icon size={14} strokeWidth={2} />
      {label && <span className="small-label">{label}</span>}
    </button>
  );
};
