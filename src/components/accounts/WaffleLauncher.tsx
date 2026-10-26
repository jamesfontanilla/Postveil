import React from "react";
import { Layers, Shield } from "lucide-react";
import { CAPABILITY_STATE_LABELS, PILLAR_REGISTRY, type PillarDefinition } from "../../lib/pillars";
import { navigationForPillar, writeNavigation } from "../../lib/navigation";

export type PillarDetails = PillarDefinition;

export interface WaffleLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToMail?: () => void;
  onSwitchToAccounts?: () => void;
  onSwitchToCalendar?: () => void;
  onSwitchToDocs?: () => void;
  onSelectPillar?: (pillar: PillarDefinition) => void;
  anchorOrigin?: "left" | "right";
}

export const WaffleLauncher: React.FC<WaffleLauncherProps> = ({
  isOpen,
  onClose,
  onSwitchToMail,
  onSwitchToAccounts,
  onSwitchToCalendar,
  onSwitchToDocs,
  onSelectPillar,
  anchorOrigin = "right",
}) => {
  if (!isOpen) return null;
  const openPillar = (pillar: PillarDefinition) => {
    onClose();
    if (pillar.id === "p-mail") return onSwitchToMail?.();
    if (pillar.id === "p-calendar") return onSwitchToCalendar?.();
    if (pillar.id === "p-docs") return onSwitchToDocs?.();
    if (pillar.id === "p-pass") return onSwitchToAccounts?.();
    if (onSelectPillar) return onSelectPillar(pillar);
    writeNavigation(navigationForPillar(pillar.id));
  };
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 190 }} onClick={onClose} />
      <div className="pv-acc-waffle-popover" role="dialog" aria-label="Postveil Sovereign Apps" style={anchorOrigin === "left" ? { left: "0px", right: "auto" } : { right: "0px", left: "auto" }}>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "6px", padding: "0 4px 6px", borderBottom: "1px solid #f1f5f9", marginBottom: "4px", fontSize: "12px", fontWeight: 700, color: "#0f5132" }}>
          <Layers size={14} /> POSTVEIL SOVEREIGN SUITE
        </div>
        {PILLAR_REGISTRY.map((pillar) => (
          <button key={pillar.id} type="button" className="pv-acc-waffle-app" onClick={() => openPillar(pillar)} style={{ background: "none", border: "none", position: "relative" }} title={`${pillar.name}: ${CAPABILITY_STATE_LABELS[pillar.state]}`}>
            <div className="pv-acc-waffle-app-icon" style={{ backgroundColor: "#f0f7f3", color: "#0f5132" }}>
              <img src={pillar.icon.path} alt="" width="24" height="24" />
            </div>
            <span className="pv-acc-waffle-app-name">{pillar.name}</span>
            <span style={{ fontSize: "9px", color: "#64748b" }}>{CAPABILITY_STATE_LABELS[pillar.state]}</span>
          </button>
        ))}
        <button type="button" className="pv-acc-waffle-app" onClick={() => { onClose(); onSwitchToAccounts?.(); }} style={{ background: "none", border: "none" }} title="Account settings">
          <div className="pv-acc-waffle-app-icon" style={{ backgroundColor: "#e8f5e9", color: "#0f5132" }}><Shield size={24} /></div>
          <span className="pv-acc-waffle-app-name">Accounts</span>
        </button>
      </div>
    </>
  );
};
