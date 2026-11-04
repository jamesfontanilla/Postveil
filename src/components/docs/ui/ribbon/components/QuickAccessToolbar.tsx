import React, { useState } from "react";
import { RibbonIcons } from "../icons";
import { QatItemDef } from "../types";
import { useRibbonDispatcher } from "../RibbonContext";

export const DEFAULT_QAT_ITEMS: QatItemDef[] = [
  { id: "qat.save", label: "Save", iconName: "save", commandId: "file.save", defaultVisible: true, shortcut: "Ctrl+S", keyTip: "1" },
  { id: "qat.undo", label: "Undo", iconName: "undo", commandId: "edit.undo", defaultVisible: true, shortcut: "Ctrl+Z", keyTip: "2" },
  { id: "qat.redo", label: "Redo", iconName: "redo", commandId: "edit.redo", defaultVisible: true, shortcut: "Ctrl+Y", keyTip: "3" },
  { id: "qat.print", label: "Quick Print", iconName: "print", commandId: "file.print", defaultVisible: false, shortcut: "Ctrl+P", keyTip: "4" },
  { id: "qat.seal", label: "Digital Seal", iconName: "digitalSeal", commandId: "review.sign", defaultVisible: false, keyTip: "5" },
];

export interface QuickAccessToolbarProps {
  canUndo?: boolean;
  canRedo?: boolean;
  isBelowRibbon?: boolean;
  onTogglePlacement?: (isBelow: boolean) => void;
}

export const QuickAccessToolbar: React.FC<QuickAccessToolbarProps> = ({
  canUndo = true,
  canRedo = true,
  isBelowRibbon = false,
  onTogglePlacement,
}) => {
  const dispatcher = useRibbonDispatcher();
  const [items, setItems] = useState<QatItemDef[]>(() => {
    try {
      const saved = localStorage.getItem("pdocs_qat_items");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_QAT_ITEMS;
  });

  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  const toggleItemVisibility = (id: string) => {
    setItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, defaultVisible: !item.defaultVisible } : item
      );
      try {
        localStorage.setItem("pdocs_qat_items", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleAction = (item: QatItemDef) => {
    if (item.commandId === "edit.undo" && !canUndo) return;
    if (item.commandId === "edit.redo" && !canRedo) return;
    dispatcher.dispatch(item.commandId, item.defaultParams);
  };

  const ChevronDown = RibbonIcons.chevronDown;

  return (
    <div
      className={`pdocs-qat-strip ${isBelowRibbon ? "below-ribbon" : "top-window"}`}
      role="toolbar"
      aria-label="Quick Access Toolbar"
    >
      <div className="flex items-center gap-0.5">
        {items
          .filter((item) => item.defaultVisible)
          .map((item) => {
            const Icon = (RibbonIcons as any)[item.iconName] || RibbonIcons.save;
            const isDisabled =
              (item.commandId === "edit.undo" && !canUndo) ||
              (item.commandId === "edit.redo" && !canRedo);

            return (
              <button
                key={item.id}
                type="button"
                id={item.id}
                className={`pdocs-qat-btn ${isDisabled ? "disabled" : ""}`}
                title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                disabled={isDisabled}
                onClick={() => handleAction(item)}
                data-keytip={item.keyTip}
              >
                <Icon size={14} />
              </button>
            );
          })}

        {/* Customize Chevron */}
        <div className="relative">
          <button
            type="button"
            className="pdocs-qat-btn customize-btn"
            title="Customize Quick Access Toolbar"
            onClick={() => setIsCustomizeOpen((prev) => !prev)}
            aria-expanded={isCustomizeOpen}
          >
            <ChevronDown size={11} />
          </button>

          {isCustomizeOpen && (
            <div
              className="pdocs-qat-dropdown"
              onMouseLeave={() => setIsCustomizeOpen(false)}
            >
              <div className="pdocs-qat-dropdown-title">Customize Quick Access Toolbar</div>
              <div className="pdocs-qat-dropdown-divider" />
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pdocs-qat-dropdown-item"
                  onClick={() => toggleItemVisibility(item.id)}
                >
                  <span className="w-4 text-center">
                    {item.defaultVisible ? "✓" : ""}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
              {onTogglePlacement && (
                <>
                  <div className="pdocs-qat-dropdown-divider" />
                  <button
                    type="button"
                    className="pdocs-qat-dropdown-item"
                    onClick={() => {
                      onTogglePlacement(!isBelowRibbon);
                      setIsCustomizeOpen(false);
                    }}
                  >
                    <span className="w-4" />
                    <span>{isBelowRibbon ? "Show Above the Ribbon" : "Show Below the Ribbon"}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
