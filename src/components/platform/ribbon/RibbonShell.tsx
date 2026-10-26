import React, { ReactNode } from "react";

export interface RibbonTab {
  id: string;
  label: string;
}

export interface RibbonShellProps {
  tabs?: RibbonTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
  rightControls?: ReactNode;
  className?: string;
}

export const RibbonShell: React.FC<RibbonShellProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  children,
  rightControls,
  className = "",
}) => {
  return (
    <div className={`pdocs-ribbon-shell ${className}`} style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {/* Optional Tab Selector Bar (Home, Insert, Page Layout, View) */}
      {tabs && tabs.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            backgroundColor: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            gap: "2px",
            height: "28px",
          }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                style={{
                  height: "100%",
                  padding: "0 10px",
                  fontSize: "11px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#0f172a" : "#64748b",
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid #0f172a" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Ribbon Action Bar */}
      <div
        className="pdocs-toolbar"
        role="toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          overflowX: "auto",
          gap: "4px",
          padding: "4px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
          {children}
        </div>
        {rightControls && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            {rightControls}
          </div>
        )}
      </div>
    </div>
  );
};
