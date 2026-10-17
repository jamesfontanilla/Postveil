import React from "react";
import {
  Box,
  FileText,
  Table,
  HardDrive,
  Video,
  Calendar,
  PenTool,
  Key,
  Mail,
  Shield,
  X,
  Sparkles,
  Cpu,
  Lock,
  ArrowRight,
} from "lucide-react";

export interface PillarDetails {
  id: string;
  name: string;
  tagline: string;
  category: string;
  architecture: string;
  status: "live" | "preview" | "roadmap";
  badge: string;
  bg: string;
  color: string;
}

export const SOVEREIGN_PILLARS: Record<string, PillarDetails> = {
  cad: {
    id: "cad",
    name: "P-CAD",
    tagline: "Sovereign 3D Parametric CAD Engine",
    category: "Hardware OS & Silicon Engineering",
    architecture: "100% Client-Side WebGPU / WASM OpenCASCADE B-Rep Kernel. Zero cloud lock-in, runs entirely offline on local GPU.",
    status: "roadmap",
    badge: "WebGPU B-Rep",
    bg: "#e0f2f1",
    color: "#004d40",
  },
  docs: {
    id: "docs",
    name: "P-Docs",
    tagline: "Local-First Collaborative Living Documents",
    category: "Knowledge & Documentation",
    architecture: "Automerge CRDTs over peer-to-peer WebRTC and Origin Private File System. Markdown + rich block canvas.",
    status: "roadmap",
    badge: "CRDT Local-First",
    bg: "#e3f2fd",
    color: "#0d47a1",
  },
  sheets: {
    id: "sheets",
    name: "P-Sheets",
    tagline: "120 FPS WebAssembly Calculation Grid",
    category: "Data Analysis & Financial Modeling",
    architecture: "Custom Rust WASM execution engine supporting 1,000,000+ formulas at sub-4ms recalculation latency.",
    status: "roadmap",
    badge: "Rust WASM",
    bg: "#e8f5e9",
    color: "#1b5e20",
  },
  drive: {
    id: "drive",
    name: "P-Drive",
    tagline: "Decoupled Sovereign File Vault",
    category: "Storage & File Sovereignty",
    architecture: "Bring-Your-Own-Storage (Google Drive / Cloudflare R2 / S3) mounted with client-side AES-256-GCM zero-knowledge encryption.",
    status: "roadmap",
    badge: "BYOS Vault",
    bg: "#fff8e1",
    color: "#f57f17",
  },
  meet: {
    id: "meet",
    name: "P-Meet",
    tagline: "Serverless Edge WebRTC Conferencing",
    category: "Real-Time Communications",
    architecture: "P2P WebRTC mesh with AV1 video codec. Zero installs, zero tracking, end-to-end encrypted room keys.",
    status: "roadmap",
    badge: "P2P WebRTC",
    bg: "#ede7f6",
    color: "#4a148c",
  },
  draw: {
    id: "draw",
    name: "P-Draw",
    tagline: "Infinite Architecture & Thinking Whiteboard",
    category: "Spatial Ideation & Diagrams",
    architecture: "Hardware-accelerated HTML5 Canvas with smooth 120Hz Apple Pencil and stylus low-latency drawing pipeline.",
    status: "roadmap",
    badge: "Vector Canvas",
    bg: "#fff3e0",
    color: "#e65100",
  },
  pass: {
    id: "pass",
    name: "P-Pass",
    tagline: "FIDO2 Hardware Passkey & Secret Vault",
    category: "Identity & Cryptography",
    architecture: "Hardware enclave attestation via WebAuthn API. Passwords are obsolete; deterministic Ed25519 root keys.",
    status: "roadmap",
    badge: "WebAuthn Enclave",
    bg: "#efebe9",
    color: "#3e2723",
  },
};

interface PillarPreviewModalProps {
  pillar: PillarDetails | null;
  onClose: () => void;
  onExploreMail: () => void;
}

export const PillarPreviewModal: React.FC<PillarPreviewModalProps> = ({
  pillar,
  onClose,
  onExploreMail,
}) => {
  if (!pillar) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#ffffff",
          borderRadius: "24px",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          animation: "pvModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div
          style={{
            padding: "24px 24px 16px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "16px",
                backgroundColor: pillar.bg,
                color: pillar.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
              }}
            >
              <Box size={28} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                  {pillar.name}
                </h3>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: "#e8f5e9",
                    color: "#0f5132",
                  }}
                >
                  {pillar.badge}
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                {pillar.category}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px",
              borderRadius: "50%",
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#1e293b",
              marginBottom: "8px",
            }}
          >
            {pillar.tagline}
          </div>

          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "14px 16px",
              margin: "12px 0 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600, color: "#0f5132" }}>
              <Cpu size={15} />
              Sovereign Silicon Execution
            </div>
            <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
              {pillar.architecture}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "10px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontSize: "13px",
            }}
          >
            <Sparkles size={16} style={{ flexShrink: 0 }} />
            <span>
              Part of the Postveil 20-Pillar Sovereign Architecture. <strong>P-Mail</strong> and <strong>Postveil Account</strong> are live and operational now.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            backgroundColor: "#f8fafc",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: "20px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onExploreMail();
            }}
            style={{
              padding: "8px 20px",
              borderRadius: "20px",
              border: "none",
              backgroundColor: "#0f5132",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Explore P-Mail Inbox
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
