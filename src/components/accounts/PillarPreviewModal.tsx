import React from "react";
import { ArrowRight, X } from "lucide-react";
import { CAPABILITY_STATE_LABELS, type PillarDefinition } from "../../lib/pillars";

export type PillarDetails = PillarDefinition;

interface PillarPreviewModalProps {
  pillar: PillarDetails | null;
  onClose: () => void;
  onExploreMail: () => void;
}

export const PillarPreviewModal: React.FC<PillarPreviewModalProps> = ({ pillar, onClose, onExploreMail }) => {
  if (!pillar) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: "480px", backgroundColor: "#ffffff", borderRadius: "24px", boxShadow: "0 20px 48px rgba(0, 0, 0, 0.2)", overflow: "hidden", border: "1px solid #e2e8f0" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "24px 24px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <img src={pillar.icon.path} alt={pillar.icon.alt} width="52" height="52" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{pillar.name}</h3>
                <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", backgroundColor: "#eef2f4", color: "#40515a" }}>{CAPABILITY_STATE_LABELS[pillar.state]}</span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>{pillar.category}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close pillar details" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", borderRadius: "50%" }}><X size={20} /></button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e293b", marginBottom: "8px" }}>{pillar.summary}</div>
          {pillar.dependencyNote && <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px 16px", margin: "12px 0 16px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>{pillar.dependencyNote}</div>}
          <div style={{ padding: "10px 14px", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", fontSize: "13px" }}>This status is shared with the Postveil suite registry. Unsupported integrations are not represented as completed features.</div>
        </div>
        <div style={{ padding: "16px 24px", backgroundColor: "#f8fafc", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: "20px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>Close</button>
          <button type="button" onClick={() => { onClose(); onExploreMail(); }} style={{ padding: "8px 20px", borderRadius: "20px", border: "none", backgroundColor: "#0f5132", color: "#ffffff", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>Explore P-Mail Inbox <ArrowRight size={14} /></button>
        </div>
      </div>
    </div>
  );
};
