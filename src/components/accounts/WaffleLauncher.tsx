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
  Shield,
  Key,
  FolderLock,
  ExternalLink,
} from "lucide-react";

interface WaffleLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToMail: () => void;
}

export const WaffleLauncher: React.FC<WaffleLauncherProps> = ({
  isOpen,
  onClose,
  onSwitchToMail,
}) => {
  if (!isOpen) return null;

  const apps = [
    {
      id: "mail",
      name: "P-Mail",
      icon: Mail,
      bg: "#e8f5e9",
      color: "#0f5132",
      badge: "Active",
      onClick: () => {
        onSwitchToMail();
        onClose();
      },
    },
    {
      id: "docs",
      name: "P-Docs",
      icon: FileText,
      bg: "#e3f2fd",
      color: "#0d47a1",
      badge: "Local",
      onClick: () => {
        alert("P-Docs: Local-first collaborative living documents (Pillar 5).");
        onClose();
      },
    },
    {
      id: "sheets",
      name: "P-Sheets",
      icon: Table,
      bg: "#e8f5e9",
      color: "#1b5e20",
      badge: "WASM",
      onClick: () => {
        alert("P-Sheets: 120 FPS WebAssembly calculation grid (Pillar 6).");
        onClose();
      },
    },
    {
      id: "drive",
      name: "P-Drive",
      icon: HardDrive,
      bg: "#fff8e1",
      color: "#f57f17",
      badge: "BYOS",
      onClick: () => {
        alert("P-Drive: Decoupled sovereign file vault mounted on Google Drive/R2 (Pillar 10).");
        onClose();
      },
    },
    {
      id: "meet",
      name: "P-Meet",
      icon: Video,
      bg: "#ede7f6",
      color: "#4a148c",
      badge: "P2P",
      onClick: () => {
        alert("P-Meet: Serverless edge WebRTC video conferencing with zero install (Pillar 3).");
        onClose();
      },
    },
    {
      id: "calendar",
      name: "P-Calendar",
      icon: Calendar,
      bg: "#fce4ec",
      color: "#880e4f",
      badge: "RFC 5545",
      onClick: () => {
        alert("P-Calendar: High-density schedule grid & public booking links (Pillar 2).");
        onClose();
      },
    },
    {
      id: "draw",
      name: "P-Draw",
      icon: PenTool,
      bg: "#fff3e0",
      color: "#e65100",
      badge: "Vector",
      onClick: () => {
        alert("P-Draw: Infinite collaborative thinking & architecture whiteboard (Pillar 8).");
        onClose();
      },
    },
    {
      id: "cad",
      name: "P-CAD",
      icon: Box,
      bg: "#e0f2f1",
      color: "#004d40",
      badge: "WebGPU",
      onClick: () => {
        alert("P-CAD: Sovereign 3D parametric CAD engine running on local silicon (WASM B-Rep).");
        onClose();
      },
    },
    {
      id: "vault",
      name: "P-Pass",
      icon: Key,
      bg: "#efebe9",
      color: "#3e2723",
      badge: "Passkeys",
      onClick: () => {
        alert("P-Pass: WebAuthn hardware passkey & credential vault (Pillar 18).");
        onClose();
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
      <div className="pv-acc-waffle-popover" role="dialog" aria-label="Postveil Apps">
        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              className="pv-acc-waffle-app"
              onClick={app.onClick}
              style={{ background: "none", border: "none" }}
            >
              <div
                className="pv-acc-waffle-app-icon"
                style={{ backgroundColor: app.bg, color: app.color }}
              >
                <Icon size={24} />
              </div>
              <span className="pv-acc-waffle-app-name">{app.name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
