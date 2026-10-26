import React, { useState, ReactNode } from "react";
import {
  LayoutGrid,
  Search,
  ShieldCheck,
  LogOut,
  Mail,
  ChevronDown,
  Sparkles,
  Command,
} from "lucide-react";
import BrandMark from "../../BrandMark";
import { WaffleLauncher } from "../../accounts/WaffleLauncher";
import { PILLAR_REGISTRY, type PillarDefinition, type PillarId } from "../../../lib/pillars";
import { navigationForPillar, writeNavigation } from "../../../lib/navigation";
import "./ParentSuiteRibbon.css";

export interface ParentSuiteRibbonProps {
  currentPillarId?: PillarId;
  userEmail?: string;
  userName?: string;
  searchPlaceholder?: string;
  onSearchChange?: (query: string) => void;
  onOpenCommandPalette?: () => void;
  onSwitchToMail?: () => void;
  onSwitchToAccounts?: () => void;
  onSignOut?: () => void;
  centerContent?: ReactNode;
  rightContent?: ReactNode;
}

export const ParentSuiteRibbon: React.FC<ParentSuiteRibbonProps> = ({
  currentPillarId = "p-mail",
  userEmail = "user@postveil.me",
  userName = "Postveil Sovereign",
  searchPlaceholder = "Search sovereign workspace (Ctrl+K)...",
  onSearchChange,
  onOpenCommandPalette,
  onSwitchToMail,
  onSwitchToAccounts,
  onSignOut,
  centerContent,
  rightContent,
}) => {
  const [isWaffleOpen, setIsWaffleOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const currentPillar =
    PILLAR_REGISTRY.find((p) => p.id === currentPillarId) || PILLAR_REGISTRY[0];

  const handlePillarSelect = (pillar: PillarDefinition) => {
    setIsWaffleOpen(false);
    if (pillar.id === "p-mail") return onSwitchToMail?.();
    if (pillar.id === "p-pass") return onSwitchToAccounts?.();
    writeNavigation(navigationForPillar(pillar.id));
  };

  return (
    <header className="pv-parent-ribbon" role="banner">
      {/* Left: 9-Dot Waffle Grid + Logo + Pillar Switcher */}
      <div className="pv-parent-ribbon-left">
        {/* The Universal 9-Dot Google-Style Waffle Launcher */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="pv-parent-waffle-btn"
            title="Postveil 20 Sovereign Pillars"
            onClick={() => {
              setIsWaffleOpen(!isWaffleOpen);
              setIsUserMenuOpen(false);
            }}
            aria-label="App Launcher"
          >
            <LayoutGrid size={18} />
          </button>
          <WaffleLauncher
            isOpen={isWaffleOpen}
            onClose={() => setIsWaffleOpen(false)}
            anchorOrigin="left"
            onSwitchToMail={onSwitchToMail}
            onSwitchToAccounts={onSwitchToAccounts}
            onSelectPillar={handlePillarSelect}
          />
        </div>

        {/* Brand Shield & Current Pillar Indicator */}
        <div
          className="pv-parent-brand-wrapper"
          onClick={() => setIsWaffleOpen(!isWaffleOpen)}
          title="Switch Sovereign Pillar"
        >
          <BrandMark small />
          <div className="pv-parent-pillar-badge">
            <span className="pv-parent-suite-title">Postveil</span>
            <span className="pv-parent-pillar-name">{currentPillar.name}</span>
          </div>
          <ChevronDown size={13} style={{ color: "#64748b", marginLeft: 2 }} />
        </div>
      </div>

      {/* Center: Global Search Bar or Custom Pillar Center Controls */}
      <div className="pv-parent-ribbon-center">
        {centerContent ? (
          centerContent
        ) : (
          <div className="pv-parent-search-bar" onClick={onOpenCommandPalette}>
            <Search size={15} className="pv-parent-search-icon" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchVal}
              onChange={(e) => {
                setSearchVal(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              className="pv-parent-search-input"
            />
            <div className="pv-parent-search-shortcut" title="Press Ctrl+K">
              <Command size={11} style={{ marginRight: 2 }} />K
            </div>
          </div>
        )}
      </div>

      {/* Right: Sovereign Edge Status + Actions + User Avatar */}
      <div className="pv-parent-ribbon-right">
        {rightContent}

        {/* Sovereign Edge Status Indicator */}
        <div className="pv-parent-edge-status" title="Running local-first with zero-knowledge cryptography">
          <span className="pv-parent-status-dot" />
          <span className="pv-parent-status-text">Sovereign Edge</span>
        </div>

        {/* User Account Popover */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="pv-parent-avatar-btn"
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsWaffleOpen(false);
            }}
            title={userEmail}
            aria-label="Account Settings"
          >
            <div className="pv-parent-avatar">
              {userName.charAt(0).toUpperCase()}
            </div>
          </button>

          {isUserMenuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 190 }}
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="pv-parent-user-dropdown" role="menu">
                <div className="pv-parent-dropdown-header">
                  <div className="pv-parent-dropdown-avatar">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="pv-parent-dropdown-user-details">
                    <strong style={{ fontSize: "14px", color: "#0f172a" }}>{userName}</strong>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{userEmail}</span>
                  </div>
                </div>

                <div className="pv-parent-dropdown-divider" />

                <button
                  type="button"
                  className="pv-parent-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSwitchToAccounts?.();
                  }}
                >
                  <ShieldCheck size={16} style={{ color: "#0f5132" }} />
                  <span>Sovereign Identity & BYOS Storage</span>
                </button>

                <button
                  type="button"
                  className="pv-parent-dropdown-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSwitchToMail?.();
                  }}
                >
                  <Mail size={16} style={{ color: "#2563eb" }} />
                  <span>Return to P-Mail Inbox</span>
                </button>

                {onSignOut && (
                  <>
                    <div className="pv-parent-dropdown-divider" />
                    <button
                      type="button"
                      className="pv-parent-dropdown-item pv-parent-dropdown-signout"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      <LogOut size={16} />
                      <span>Sign out of Postveil</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
