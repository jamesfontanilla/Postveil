import React from "react";
import { RibbonIcons } from "../icons";

export interface RibbonPinButtonProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const RibbonPinButton: React.FC<RibbonPinButtonProps> = ({
  isCollapsed,
  onToggleCollapse,
}) => {
  const Icon = isCollapsed ? RibbonIcons.pin : RibbonIcons.chevronUp;
  const tooltip = isCollapsed
    ? "Pin the ribbon (Ctrl+F1)"
    : "Collapse the ribbon (Ctrl+F1)";

  return (
    <button
      type="button"
      className="pdocs-ribbon-pin-btn"
      title={tooltip}
      aria-label={tooltip}
      onClick={onToggleCollapse}
    >
      <Icon size={13} />
    </button>
  );
};
