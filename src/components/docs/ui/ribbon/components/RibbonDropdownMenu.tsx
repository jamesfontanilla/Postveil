import React, { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { RibbonMenuItemDef } from "../types";

export interface RibbonDropdownMenuProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  items: RibbonMenuItemDef[];
  onSelect: (commandId: string, params?: Record<string, any>) => void;
  onClose: () => void;
}

export const RibbonDropdownMenu: React.FC<RibbonDropdownMenuProps> = ({
  isOpen,
  anchorEl,
  items,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, anchorEl, onClose]);

  if (!isOpen || !anchorEl) return null;

  return (
    <div ref={menuRef} className="pdocs-ribbon-dropdown">
      {items.map((item, idx) => (
        <React.Fragment key={item.id || idx}>
          {item.separatorBefore && <div className="pdocs-ribbon-menu-separator" />}
          <button
            type="button"
            className={`pdocs-ribbon-menu-item ${item.checked ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.commandId, item.params);
              onClose();
            }}
          >
            <div className="flex items-center gap-2">
              {item.icon && <item.icon size={14} />}
              <span>{item.label}</span>
            </div>
            {item.checked && <Check size={12} className="text-blue-500" />}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
