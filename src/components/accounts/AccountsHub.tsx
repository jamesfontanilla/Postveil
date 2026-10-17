import React, { useState } from "react";
import {
  Home,
  User,
  Shield,
  Key,
  Globe,
  HardDrive,
  CreditCard,
  Search,
  HelpCircle,
  Grid,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  Lock,
  Smartphone,
  Laptop,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Plus,
  RefreshCw,
  LogOut,
  Mail,
  EyeOff,
  Eye,
  Sliders,
  Database,
  ArrowLeft,
} from "lucide-react";
import "./AccountsStyles.css";
import { WaffleLauncher } from "./WaffleLauncher";
import BrandMark from "../BrandMark";

interface AccountsHubProps {
  currentUserEmail?: string;
  currentUserName?: string;
  onBackToMail: () => void;
  onSignOut: () => void;
}

type TabKey = "home" | "personal" | "security" | "apps" | "storage" | "domains";

export const AccountsHub: React.FC<AccountsHubProps> = ({
  currentUserEmail = "james@jamesfontanilla.com",
  currentUserName = "James Fontanilla",
  onBackToMail,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isWaffleOpen, setIsWaffleOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Storage selection state
  const [storageTier, setStorageTier] = useState<"local" | "byos" | "managed">("local");

  // Passkeys state
  const [passkeys, setPasskeys] = useState([
    {
      id: "pk_1",
      name: "MacBook Pro (Touch ID)",
      created: "Oct 16, 2026",
      lastUsed: "Just now",
      icon: Laptop,
    },
    {
      id: "pk_2",
      name: "iPhone 15 Pro (Face ID)",
      created: "Oct 12, 2026",
      lastUsed: "2 days ago",
      icon: Smartphone,
    },
  ]);

  // Active sessions state
  const [sessions, setSessions] = useState([
    {
      id: "ses_1",
      device: "Chrome on macOS",
      location: "Manila, Philippines (Current session)",
      ip: "112.204.12.89",
      active: true,
    },
    {
      id: "ses_2",
      device: "Safari on iOS",
      location: "Manila, Philippines",
      ip: "112.204.12.94",
      active: false,
    },
  ]);

  // Cloaked Aliases (Hide My Email)
  const [aliases, setAliases] = useState([
    {
      id: "alias_1",
      app: "Figma",
      alias: "figma.shield92@postveil.app",
      target: currentUserEmail,
      muted: false,
      blockedSpamCount: 0,
    },
    {
      id: "alias_2",
      app: "Linear",
      alias: "linear.auth77@postveil.app",
      target: currentUserEmail,
      muted: false,
      blockedSpamCount: 0,
    },
    {
      id: "alias_3",
      app: "Sketch Cloud",
      alias: "sketch.k31p@postveil.app",
      target: currentUserEmail,
      muted: true,
      blockedSpamCount: 14,
    },
  ]);

  const ed25519PublicKey = "ed25519_pk_7fa39b01c4e8d2e5b9f1a043c8d1976a4b2e8f0c3d9a1b5e7";

  const handleCopyKey = () => {
    navigator.clipboard.writeText(ed25519PublicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleToggleMute = (aliasId: string) => {
    setAliases((prev) =>
      prev.map((a) => (a.id === aliasId ? { ...a, muted: !a.muted } : a))
    );
  };

  const handleAddPasskey = () => {
    const newName = prompt("Enter device name for this Passkey:", "Windows Hello");
    if (newName) {
      setPasskeys((prev) => [
        ...prev,
        {
          id: `pk_${Date.now()}`,
          name: newName,
          created: "Just now",
          lastUsed: "Never",
          icon: Laptop,
        },
      ]);
    }
  };

  const handleRevokeSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const navItems = [
    { key: "home" as TabKey, label: "Home", icon: Home },
    { key: "personal" as TabKey, label: "Personal info", icon: User },
    { key: "security" as TabKey, label: "Security & Passkeys", icon: Shield },
    { key: "apps" as TabKey, label: "Apps & Cloaked Aliases", icon: Globe },
    { key: "storage" as TabKey, label: "Storage & BYOS", icon: HardDrive },
    { key: "domains" as TabKey, label: "Subscriptions & Domains", icon: CreditCard },
  ];

  return (
    <div className="pv-acc-shell">
      {/* Topbar */}
      <header className="pv-acc-topbar">
        <div className="pv-acc-topbar-left">
          <button
            className="pv-acc-menu-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle navigation"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="pv-acc-brand" onClick={() => setActiveTab("home")}>
            <BrandMark size={28} />
            <span className="pv-acc-brand-title">Postveil</span>
            <span className="pv-acc-brand-subtitle">Account</span>
          </div>
        </div>

        {/* Center Search Bar */}
        <div className="pv-acc-search">
          <Search size={18} className="pv-acc-search-icon" />
          <input
            type="text"
            className="pv-acc-search-input"
            placeholder="Search Postveil Account (passkeys, apps, storage...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Right Action Icons */}
        <div className="pv-acc-topbar-right">
          <button
            className="pv-acc-icon-btn"
            title="Help & Sovereign Guides"
            onClick={() => alert("Postveil Sovereign Accounts Documentation: End-to-end WebCrypto & FIDO2 Passkeys.")}
          >
            <HelpCircle size={22} />
          </button>

          {/* Waffle App Launcher */}
          <div style={{ position: "relative" }}>
            <button
              className="pv-acc-icon-btn"
              title="Postveil Apps"
              onClick={() => {
                setIsWaffleOpen(!isWaffleOpen);
                setIsUserMenuOpen(false);
              }}
            >
              <Grid size={22} />
            </button>
            <WaffleLauncher
              isOpen={isWaffleOpen}
              onClose={() => setIsWaffleOpen(false)}
              onSwitchToMail={onBackToMail}
            />
          </div>

          {/* User Profile Avatar */}
          <div style={{ position: "relative" }}>
            <button
              className="pv-acc-avatar-btn"
              onClick={() => {
                setIsUserMenuOpen(!isUserMenuOpen);
                setIsWaffleOpen(false);
              }}
              title={currentUserEmail}
            >
              <div className="pv-acc-avatar">
                {currentUserName.charAt(0).toUpperCase()}
              </div>
            </button>

            {isUserMenuOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 190 }}
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="pv-acc-user-popover">
                  <div className="pv-acc-user-popover-avatar">
                    {currentUserName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600 }}>{currentUserName}</div>
                  <div style={{ fontSize: "14px", color: "var(--pv-acc-text-secondary)" }}>
                    {currentUserEmail}
                  </div>

                  <button
                    className="pv-acc-btn-manage"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onBackToMail();
                    }}
                  >
                    <Mail size={16} style={{ marginRight: 8 }} />
                    Open P-Mail Inbox
                  </button>

                  <button className="pv-acc-btn-signout" onClick={onSignOut}>
                    <LogOut size={16} />
                    Sign out of Postveil
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="pv-acc-body">
        {/* Left Sidebar */}
        <aside className={`pv-acc-sidebar ${isSidebarOpen ? "open" : ""}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                className={`pv-acc-nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(item.key);
                  setIsSidebarOpen(false);
                }}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <button
              className="pv-acc-nav-item"
              onClick={onBackToMail}
              style={{ color: "var(--pv-acc-primary)" }}
            >
              <ArrowLeft />
              <span>Back to P-Mail</span>
            </button>
          </div>
        </aside>

        {/* Content Canvas */}
        <main className="pv-acc-main">
          <div className="pv-acc-canvas">
            {/* TAB: HOME */}
            {activeTab === "home" && (
              <>
                <div className="pv-acc-hero">
                  <div className="pv-acc-hero-avatar">
                    {currentUserName.charAt(0).toUpperCase()}
                    <div className="pv-acc-hero-avatar-badge" title="Sovereign Shield Active">
                      <ShieldCheck size={18} />
                    </div>
                  </div>
                  <h1 className="pv-acc-hero-title">Welcome, {currentUserName}</h1>
                  <p className="pv-acc-hero-subtitle">
                    Manage your sovereign identity, cryptographic passkeys, cloaked aliases, and zero-knowledge storage vaults.
                  </p>
                </div>

                {/* Security Status Checkup */}
                <div className="pv-acc-section-title">
                  <ShieldCheck size={22} color="var(--pv-acc-primary)" />
                  <span>Security & Sovereignty Status</span>
                </div>

                <div className="pv-acc-card-group">
                  <div
                    className="pv-acc-card-row pos-first"
                    onClick={() => setActiveTab("security")}
                  >
                    <div className="pv-acc-card-leading">
                      <ShieldCheck size={24} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Account is Mathematically Protected</div>
                      <div className="pv-acc-card-subtitle">
                        2 hardware passkeys enrolled. Zero plaintext passwords stored on Postveil servers.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <span className="pv-acc-badge pv-acc-badge-success">Secured</span>
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-last"
                    onClick={() => setActiveTab("apps")}
                  >
                    <div className="pv-acc-card-leading">
                      <EyeOff size={24} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Cloaked Identity Shield Active</div>
                      <div className="pv-acc-card-subtitle">
                        3 third-party apps connected via Hide My Email aliases. 14 spam attempts blocked at the edge.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <span className="pv-acc-badge pv-acc-badge-success">3 Aliases</span>
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>

                {/* Storage & BYOS Quick Peek */}
                <div className="pv-acc-section-title">
                  <HardDrive size={22} color="var(--pv-acc-primary)" />
                  <span>Sovereign Storage Architecture</span>
                </div>

                <div className="pv-acc-card-group">
                  <div
                    className="pv-acc-card-row pos-single"
                    onClick={() => setActiveTab("storage")}
                  >
                    <div className="pv-acc-card-leading">
                      <Database size={24} color="#157347" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">
                        {storageTier === "local"
                          ? "Local-First Storage (Origin Private File System)"
                          : storageTier === "byos"
                          ? "Bring Your Own Storage (Google Drive / Cloudflare R2)"
                          : "Managed Cloud Vault (50 GB Encrypted)"}
                      </div>
                      <div className="pv-acc-card-subtitle">
                        Founder server liability: $0.00. 100% of documents & mail cache stored on your local silicon.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <span className="pv-acc-badge pv-acc-badge-neutral">
                        {storageTier === "local" ? "Local Only ($0)" : storageTier.toUpperCase()}
                      </span>
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>

                {/* Quick App Launchpad */}
                <div className="pv-acc-section-title">
                  <Grid size={22} color="var(--pv-acc-primary)" />
                  <span>Postveil Sovereign Suite</span>
                </div>

                <div className="pv-acc-card-group">
                  <div className="pv-acc-card-row pos-first" onClick={onBackToMail}>
                    <div className="pv-acc-card-leading">
                      <Mail size={22} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">P-Mail</div>
                      <div className="pv-acc-card-subtitle">Superhuman-speed email triage on custom domains</div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ExternalLink size={16} />
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-middle"
                    onClick={() => alert("P-CAD: Sovereign 3D parametric CAD engine running on local silicon.")}
                  >
                    <div className="pv-acc-card-leading">
                      <HardDrive size={22} color="#0d47a1" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">P-CAD</div>
                      <div className="pv-acc-card-subtitle">Hardware OS, 2D constraints & 3D WebGPU B-Rep modeling</div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ExternalLink size={16} />
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-last"
                    onClick={() => setActiveTab("domains")}
                  >
                    <div className="pv-acc-card-leading">
                      <CreditCard size={22} color="#f57f17" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Custom Domains & Registrars</div>
                      <div className="pv-acc-card-subtitle">Porkbun API wholesale domain automation</div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB: PERSONAL INFO */}
            {activeTab === "personal" && (
              <>
                <h1 className="pv-acc-hero-title" style={{ textAlign: "left", marginTop: 16 }}>
                  Personal Info & Cryptographic Identity
                </h1>
                <p className="pv-acc-hero-subtitle" style={{ textAlign: "left", marginBottom: 24 }}>
                  Info about you and your sovereign public cryptographic key used across Postveil services.
                </p>

                <div className="pv-acc-card-group">
                  <div className="pv-acc-card-row pos-first">
                    <div className="pv-acc-card-leading">
                      <User size={22} />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Display Name</div>
                      <div className="pv-acc-card-subtitle">{currentUserName}</div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  <div className="pv-acc-card-row pos-middle">
                    <div className="pv-acc-card-leading">
                      <Mail size={22} />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Primary Sovereign Email</div>
                      <div className="pv-acc-card-subtitle">{currentUserEmail}</div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <span className="pv-acc-badge pv-acc-badge-success">Verified</span>
                    </div>
                  </div>

                  <div className="pv-acc-card-row pos-last">
                    <div className="pv-acc-card-leading">
                      <Key size={22} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Ed25519 WebCrypto Identity Key</div>
                      <div
                        className="pv-acc-card-subtitle"
                        style={{ fontFamily: "monospace", fontSize: "12px" }}
                      >
                        {ed25519PublicKey.slice(0, 32)}...
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <button
                        onClick={handleCopyKey}
                        style={{
                          background: "none",
                          border: "1px solid #747775",
                          borderRadius: "16px",
                          padding: "4px 12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "12px",
                        }}
                      >
                        {copiedKey ? <Check size={14} color="#0f5132" /> : <Copy size={14} />}
                        {copiedKey ? "Copied" : "Copy Key"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Digital Permanence / Data Takeout */}
                <div className="pv-acc-section-title">
                  <Database size={22} color="var(--pv-acc-primary)" />
                  <span>Digital Permanence & Universal Export</span>
                </div>

                <div className="pv-acc-card-group">
                  <div
                    className="pv-acc-card-row pos-single"
                    onClick={() => alert("1-Click Sovereign Takeout: Exporting complete workspace in standard .eml, .sqlite, and .md files.")}
                  >
                    <div className="pv-acc-card-leading">
                      <HardDrive size={22} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Download Your Data (Postveil Takeout)</div>
                      <div className="pv-acc-card-subtitle">
                        Zero hostage formats. Instant 1-click export of all emails (.eml), documents (.md), and SQLite databases.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB: SECURITY & PASSKEYS */}
            {activeTab === "security" && (
              <>
                <h1 className="pv-acc-hero-title" style={{ textAlign: "left", marginTop: 16 }}>
                  Security & Hardware Passkeys
                </h1>
                <p className="pv-acc-hero-subtitle" style={{ textAlign: "left", marginBottom: 24 }}>
                  Postveil uses FIDO2 WebAuthn passkeys. Your private key stays inside your device's Secure Enclave.
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div className="pv-acc-section-title" style={{ margin: 0 }}>
                    <Key size={22} color="var(--pv-acc-primary)" />
                    <span>Enrolled Hardware Passkeys</span>
                  </div>
                  <button
                    onClick={handleAddPasskey}
                    style={{
                      background: "var(--pv-acc-primary)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "20px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Plus size={16} />
                    Add Passkey
                  </button>
                </div>

                <div className="pv-acc-card-group">
                  {passkeys.map((pk, idx) => {
                    const Icon = pk.icon;
                    const pos =
                      passkeys.length === 1
                        ? "pos-single"
                        : idx === 0
                        ? "pos-first"
                        : idx === passkeys.length - 1
                        ? "pos-last"
                        : "pos-middle";
                    return (
                      <div key={pk.id} className={`pv-acc-card-row ${pos}`}>
                        <div className="pv-acc-card-leading">
                          <Icon size={22} color="#0f5132" />
                        </div>
                        <div className="pv-acc-card-body">
                          <div className="pv-acc-card-title">{pk.name}</div>
                          <div className="pv-acc-card-subtitle">
                            Created: {pk.created} • Last used: {pk.lastUsed}
                          </div>
                        </div>
                        <div className="pv-acc-card-trailing">
                          <span className="pv-acc-badge pv-acc-badge-success">FIDO2 Active</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove passkey for ${pk.name}?`)) {
                                setPasskeys(passkeys.filter((p) => p.id !== pk.id));
                              }
                            }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#d32f2f" }}
                            title="Delete Passkey"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Active Sessions */}
                <div className="pv-acc-section-title">
                  <Laptop size={22} color="var(--pv-acc-primary)" />
                  <span>Your Devices & Active Sessions</span>
                </div>

                <div className="pv-acc-card-group">
                  {sessions.map((ses, idx) => {
                    const pos =
                      sessions.length === 1
                        ? "pos-single"
                        : idx === 0
                        ? "pos-first"
                        : idx === sessions.length - 1
                        ? "pos-last"
                        : "pos-middle";
                    return (
                      <div key={ses.id} className={`pv-acc-card-row ${pos}`}>
                        <div className="pv-acc-card-leading">
                          <Laptop size={22} />
                        </div>
                        <div className="pv-acc-card-body">
                          <div className="pv-acc-card-title">{ses.device}</div>
                          <div className="pv-acc-card-subtitle">
                            {ses.location} • IP: {ses.ip}
                          </div>
                        </div>
                        <div className="pv-acc-card-trailing">
                          {ses.active ? (
                            <span className="pv-acc-badge pv-acc-badge-success">This device</span>
                          ) : (
                            <button
                              onClick={() => handleRevokeSession(ses.id)}
                              style={{
                                background: "none",
                                border: "1px solid #d32f2f",
                                color: "#d32f2f",
                                borderRadius: "14px",
                                padding: "4px 10px",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              Sign out
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TAB: THIRD-PARTY APPS & CLOAKED ALIASES */}
            {activeTab === "apps" && (
              <>
                <h1 className="pv-acc-hero-title" style={{ textAlign: "left", marginTop: 16 }}>
                  Third-Party Apps & Cloaked Aliases
                </h1>
                <p className="pv-acc-hero-subtitle" style={{ textAlign: "left", marginBottom: 24 }}>
                  Every app where you used "Sign in with Postveil". You can mute any alias with 1 click to block tracking and spam.
                </p>

                <div className="pv-acc-section-title">
                  <EyeOff size={22} color="var(--pv-acc-primary)" />
                  <span>Hide My Email (Cloaked Aliases)</span>
                </div>

                <div className="pv-acc-card-group">
                  {aliases.map((al, idx) => {
                    const pos =
                      aliases.length === 1
                        ? "pos-single"
                        : idx === 0
                        ? "pos-first"
                        : idx === aliases.length - 1
                        ? "pos-last"
                        : "pos-middle";
                    return (
                      <div key={al.id} className={`pv-acc-card-row ${pos}`}>
                        <div className="pv-acc-card-leading">
                          {al.muted ? <EyeOff size={22} color="#d32f2f" /> : <Eye size={22} color="#0f5132" />}
                        </div>
                        <div className="pv-acc-card-body">
                          <div className="pv-acc-card-title">{al.app}</div>
                          <div className="pv-acc-card-subtitle" style={{ fontFamily: "monospace" }}>
                            {al.alias}
                          </div>
                          {al.muted && (
                            <div style={{ fontSize: "12px", color: "#d32f2f", marginTop: 2 }}>
                              Muted at edge. {al.blockedSpamCount} spam attempts dropped.
                            </div>
                          )}
                        </div>
                        <div className="pv-acc-card-trailing">
                          <button
                            onClick={() => handleToggleMute(al.id)}
                            style={{
                              background: al.muted ? "#ffebee" : "#ffffff",
                              border: `1px solid ${al.muted ? "#ffcdd2" : "#747775"}`,
                              color: al.muted ? "#d32f2f" : "#1f1f1f",
                              borderRadius: "16px",
                              padding: "6px 14px",
                              fontSize: "13px",
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            {al.muted ? "Unmute" : "Mute Alias"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TAB: STORAGE & BYOS */}
            {activeTab === "storage" && (
              <>
                <h1 className="pv-acc-hero-title" style={{ textAlign: "left", marginTop: 16 }}>
                  Sovereign Storage Architecture
                </h1>
                <p className="pv-acc-hero-subtitle" style={{ textAlign: "left", marginBottom: 24 }}>
                  Postveil never holds your files hostage. Choose between local-first silicon storage, BYOS (Bring Your Own Storage), or a managed vault.
                </p>

                <div className="pv-acc-card-group">
                  <div
                    className="pv-acc-card-row pos-first"
                    onClick={() => setStorageTier("local")}
                    style={{
                      borderLeft: storageTier === "local" ? "4px solid var(--pv-acc-primary)" : "none",
                    }}
                  >
                    <div className="pv-acc-card-leading">
                      <Laptop size={24} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Option 1: Local-Only (OPFS) — $0.00 Forever</div>
                      <div className="pv-acc-card-subtitle">
                        Stored strictly in your browser Origin Private File System. Zero cloud footprint. Zero telemetry.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      {storageTier === "local" && (
                        <span className="pv-acc-badge pv-acc-badge-success">Selected</span>
                      )}
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-middle"
                    onClick={() => setStorageTier("byos")}
                    style={{
                      borderLeft: storageTier === "byos" ? "4px solid var(--pv-acc-primary)" : "none",
                    }}
                  >
                    <div className="pv-acc-card-leading">
                      <HardDrive size={24} color="#0d47a1" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Option 2: Bring Your Own Storage (BYOS) — $0.00</div>
                      <div className="pv-acc-card-subtitle">
                        Connect your personal Google Drive or Cloudflare R2 bucket. Postveil charges $0 for storage.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      {storageTier === "byos" && (
                        <span className="pv-acc-badge pv-acc-badge-success">Selected</span>
                      )}
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-last"
                    onClick={() => setStorageTier("managed")}
                    style={{
                      borderLeft: storageTier === "managed" ? "4px solid var(--pv-acc-primary)" : "none",
                    }}
                  >
                    <div className="pv-acc-card-leading">
                      <Shield size={24} color="#f57f17" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Option 3: Postveil Managed Vault — $2.00 / month</div>
                      <div className="pv-acc-card-subtitle">
                        50 GB encrypted cloud sync across all your devices on Cloudflare R2 ($0 egress fees).
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      {storageTier === "managed" && (
                        <span className="pv-acc-badge pv-acc-badge-success">Selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB: SUBSCRIPTIONS & DOMAINS */}
            {activeTab === "domains" && (
              <>
                <h1 className="pv-acc-hero-title" style={{ textAlign: "left", marginTop: 16 }}>
                  Subscriptions & Custom Domains
                </h1>
                <p className="pv-acc-hero-subtitle" style={{ textAlign: "left", marginBottom: 24 }}>
                  Managed Porkbun registrar integration and Amazon SES deliverability subscriptions.
                </p>

                <div className="pv-acc-section-title">
                  <Globe size={22} color="var(--pv-acc-primary)" />
                  <span>Wholesale Domain Registrar (Porkbun API)</span>
                </div>

                <div className="pv-acc-card-group">
                  <div className="pv-acc-card-row pos-first">
                    <div className="pv-acc-card-leading">
                      <Globe size={24} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">jamesfontanilla.com</div>
                      <div className="pv-acc-card-subtitle">
                        Managed wholesale via Porkbun • Auto-renew active • MX & DKIM verified
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <span className="pv-acc-badge pv-acc-badge-success">Active ($9.73/yr)</span>
                    </div>
                  </div>

                  <div
                    className="pv-acc-card-row pos-last"
                    onClick={() => alert("Search wholesale domains via Porkbun API v3...")}
                  >
                    <div className="pv-acc-card-leading">
                      <Plus size={24} color="#0f5132" />
                    </div>
                    <div className="pv-acc-card-body">
                      <div className="pv-acc-card-title">Register a New Custom Domain</div>
                      <div className="pv-acc-card-subtitle">
                        Direct wholesale pricing ($9.73 for .com). Automated 1-click MX/DKIM injection.
                      </div>
                    </div>
                    <div className="pv-acc-card-trailing">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AccountsHub;
