import React, { useState } from "react";
import { RibbonIcons } from "../icons";
import { RibbonGroupDef } from "../types";

export interface CollapsedGroupButtonProps {
  group: RibbonGroupDef;
  onLaunchDialog?: () => void;
  children: React.ReactNode;
}

export const CollapsedGroupButton: React.FC<CollapsedGroupButtonProps> = ({
  group,
  onLaunchDialog,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ChevronDown = RibbonIcons.chevronDown;

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        className={`pdocs-collapsed-group-btn ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={`${group.name} tools`}
        aria-expanded={isOpen}
      >
        <span className="font-semibold text-xs">{group.name}</span>
        <ChevronDown size={11} className="ml-1 opacity-70" />
      </button>

      {isOpen && (
        <div
          className="pdocs-collapsed-group-popover"
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[var(--ribbon-border)]">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ribbon-text-dim)]">
              {group.name}
            </span>
            {group.dialogCommand && onLaunchDialog && (
              <button
                type="button"
                className="text-[10px] text-blue-500 hover:underline"
                onClick={() => {
                  onLaunchDialog();
                  setIsOpen(false);
                }}
              >
                More...
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};
