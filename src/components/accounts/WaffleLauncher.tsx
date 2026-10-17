import React from "react";
import {
  Mail,
  FileText,
  Table,
  HardDrive,
  Video,
  Calendar,
  PenTool,
  Box,
  Key,
  Shield,
  Layers,
} from "lucide-react";
import { SOVEREIGN_PILLARS, type PillarDetails } from "./PillarPreviewModal";

export interface WaffleLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToMail?: () => void;
  onSwitchToAccounts?: () => void;
  onSwitchToCalendar?: () => void;
  onSelectPillar?: (pillar: PillarDetails) => void;
  anchorOrigin?: "left" | "right";
}

export const WaffleLauncher: React.FC<WaffleLauncherProps> = ({
  isOpen,
  onClose,
  onSwitchToMail,
  onSwitchToAccounts,
  onSwitchToCalendar,
  onSelectPillar,
  anchorOrigin = "right",
}) => {
  if (!isOpen) return null;

  const apps = [
    {
      id: "account",
      name: "Account",
      icon: Shield,
      bg: "#e8f5e9",
      color: "#0f5132",
      badge: "Sovereign Hub",
      isLive: true,
      onClick: () => {
        onClose();
        if (onSwitchToAccounts) {
          onSwitchToAccounts();
        } else {
          window.location.href = "https://accounts.postveil.jamesfontanilla.com/";
        }
      },
    },
    {
      id: "mail",
      name: "P-Mail",
      icon: Mail,
      bg: "#e8f5e9",
      color: "#0f5132",
      badge: "Live",
      isLive: true,
      onClick: () => {
        onClose();
        if (onSwitchToMail) {
          onSwitchToMail();
        } else {
          window.location.href = "https://postveil.jamesfontanilla.com/";
        }
      },
    },
    {
      id: "calendar",
      name: "P-Calendar",
      icon: Calendar,
      bg: "#fce4ec",
      color: "#880e4f",
      badge: "Built-in",
      isLive: true,
      onClick: () => {
        onClose();
        if (onSwitchToCalendar) {
          onSwitchToCalendar();
        } else if (onSwitchToMail) {
          onSwitchToMail();
        }
      },
    },
    {
      id: "cad",
      name: "P-CAD",
      icon: Box,
      bg: "#e0f2f1",
      color: "#004d40",
      badge: "WebGPU",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.cad);
      },
    },
    {
      id: "docs",
      name: "P-Docs",
      icon: FileText,
      bg: "#e3f2fd",
      color: "#0d47a1",
      badge: "Local",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.docs);
      },
    },
    {
      id: "sheets",
      name: "P-Sheets",
      icon: Table,
      bg: "#e8f5e9",
      color: "#1b5e20",
      badge: "WASM",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.sheets);
      },
    },
    {
      id: "drive",
      name: "P-Drive",
      icon: HardDrive,
      bg: "#fff8e1",
      color: "#f57f17",
      badge: "BYOS",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.drive);
      },
    },
    {
      id: "meet",
      name: "P-Meet",
      icon: Video,
      bg: "#ede7f6",
      color: "#4a148c",
      badge: "P2P",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.meet);
      },
    },
    {
      id: "draw",
      name: "P-Draw",
      icon: PenTool,
      bg: "#fff3e0",
      color: "#e65100",
      badge: "Vector",
      isLive: false,
      onClick: () => {
        onClose();
        onSelectPillar?.(SOVEREIGN_PILLARS.draw);
      },
    },
  ];

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 190,
        }}
        onClick={onClose}
      />
      <div
        className="pv-acc-waffle-popover"
        role="dialog"
        aria-label="Postveil Sovereign Apps"
        style={anchorOrigin === "left" ? { left: "0px", right: "auto" } : { right: "0px", left: "auto" }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px 6px",
            borderBottom: "1px solid #f1f5f9",
            marginBottom: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#0f5132", letterSpacing: "0.02em" }}>
            <Layers size={14} />
            POSTVEIL SOVEREIGN SUITE
          </div>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a", backgroundColor: "#f0fdf4", padding: "1px 6px", borderRadius: "8px" }}>
            P-Mail Live
          </span>
        </div>

        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              className="pv-acc-waffle-app"
              onClick={app.onClick}
              style={{ background: "none", border: "none", position: "relative" }}
              title={app.name}
            >
              <div
                className="pv-acc-waffle-app-icon"
                style={{ backgroundColor: app.bg, color: app.color }}
              >
                <Icon size={24} />
              </div>
              <span className="pv-acc-waffle-app-name">{app.name}</span>
              {app.isLive && (
                <span
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "12px",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "#16a34a",
                    boxShadow: "0 0 0 2px #ffffff",
                  }}
                  title="Operational Now"
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
