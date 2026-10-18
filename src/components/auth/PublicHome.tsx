import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Cpu,
  Globe2,
  HardDrive,
  KeyRound,
  Lock,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./PublicHomeStyles.css";

interface PillarItem {
  id: string;
  name: string;
  category: "comms" | "office" | "media" | "ops";
  logo: string;
  status: string;
  isLive?: boolean;
  summary: string;
  replaces: string;
  href?: string;
}

const ALL_20_PILLARS: PillarItem[] = [
  {
    id: "p-mail",
    name: "P-Mail",
    category: "comms",
    logo: "/brand/pillars/p-mail.svg",
    status: "Live",
    isLive: true,
    summary: "Custom-domain & subdomain sovereign email with cloaked aliases, DKIM/DMARC automation, and Trust Lens verification.",
    replaces: "Google Workspace / Proton Mail",
  },
  {
    id: "p-docs",
    name: "P-Docs",
    category: "office",
    logo: "/brand/pillars/p-docs.svg",
    status: "Live",
    isLive: true,
    summary: "Paginated word processor with 50+ live typefaces, KaTeX symbolic math, Ed25519 digital signatures, and 10 native binary exports.",
    replaces: "Microsoft Word / Google Docs / Notion",
    href: "https://docs.postveil.me/",
  },
  {
    id: "p-calendar",
    name: "P-Calendar",
    category: "comms",
    logo: "/brand/pillars/p-calendar.svg",
    status: "Live",
    isLive: true,
    summary: "Zero-leak time-zone scheduling and instant public booking links hosted on your sovereign handle.",
    replaces: "Calendly ($144/yr) / Google Calendar",
  },
  {
    id: "p-pass",
    name: "P-Pass",
    category: "ops",
    logo: "/brand/pillars/p-pass.svg",
    status: "Live",
    isLive: true,
    summary: "FIDO2 hardware passkeys, Ed25519 cryptographic identity hub, and cloaked email alias generator.",
    replaces: "1Password ($96/yr) / SimpleLogin",
    href: "https://accounts.postveil.me/",
  },
  {
    id: "p-sheets",
    name: "P-Sheets",
    category: "office",
    logo: "/brand/pillars/p-sheets.svg",
    status: "WASM Engine",
    summary: "120 FPS local-first reactive spreadsheet and relational grid executing formulas directly on your device CPU.",
    replaces: "Microsoft Excel / Airtable ($240/yr)",
  },
  {
    id: "p-drive",
    name: "P-Drive",
    category: "office",
    logo: "/brand/pillars/p-drive.svg",
    status: "BYOS + R2",
    summary: "Client-side encrypted vault supporting Local OPFS, Bring-Your-Own S3/Google Drive, or zero-egress R2 cloud storage.",
    replaces: "Dropbox ($120/yr) / Google Drive",
  },
  {
    id: "p-meet",
    name: "P-Meet",
    category: "comms",
    logo: "/brand/pillars/p-meet.svg",
    status: "Edge WebRTC",
    summary: "Instant encrypted video rooms with zero time limits on 1-on-1 calls and no mandatory desktop bloatware.",
    replaces: "Zoom ($190/yr) / Microsoft Teams",
  },
  {
    id: "p-chat",
    name: "P-Chat",
    category: "comms",
    logo: "/brand/pillars/p-chat.svg",
    status: "Stateless Wire",
    summary: "High-speed team channels and direct messaging with full history ownership and zero message-retention ransom.",
    replaces: "Slack ($105/yr) / Discord Nitro",
  },
  {
    id: "p-sign",
    name: "P-Sign",
    category: "ops",
    logo: "/brand/pillars/p-sign.svg",
    status: "Live in P-Docs",
    isLive: true,
    summary: "Tamper-evident Ed25519 + SHA-256 cryptographic contract and document signing with verifiable public key fingerprints.",
    replaces: "DocuSign ($300/yr) / Adobe Sign",
    href: "https://docs.postveil.me/",
  },
  {
    id: "p-pdf",
    name: "P-PDF",
    category: "office",
    logo: "/brand/pillars/p-pdf.svg",
    status: "Native Codec",
    isLive: true,
    summary: "Client-side binary PDF 1.4 compiler, redaction engine, and layout inspector with zero server uploads.",
    replaces: "Adobe Acrobat Pro ($240/yr)",
    href: "https://docs.postveil.me/",
  },
  {
    id: "p-deck",
    name: "P-Deck",
    category: "office",
    logo: "/brand/pillars/p-deck.svg",
    status: "Suite Pillar",
    summary: "Markdown-native pitch deck and presentation studio with instant responsive slide layouts.",
    replaces: "PowerPoint / Pitch / Keynote",
  },
  {
    id: "p-draw",
    name: "P-Draw",
    category: "media",
    logo: "/brand/pillars/p-draw.svg",
    status: "Vector Canvas",
    summary: "Infinite collaborative whiteboard, architecture diagramming, and SVG vector illustration canvas.",
    replaces: "Miro ($120/yr) / FigJam / Illustrator",
  },
  {
    id: "p-studio",
    name: "P-Studio",
    category: "media",
    logo: "/brand/pillars/p-studio.svg",
    status: "WebGPU",
    summary: "Hardware-accelerated non-linear media, raster photo layers, and 3D/CAD creative workstation in the browser.",
    replaces: "Adobe Creative Cloud ($720/yr)",
  },
  {
    id: "p-record",
    name: "P-Record",
    category: "media",
    logo: "/brand/pillars/p-record.svg",
    status: "4K Local",
    summary: "Async screen, camera, and system audio recorder saving straight to local OPFS or instant share links.",
    replaces: "Loom ($150/yr) / Camtasia",
  },
  {
    id: "p-voice",
    name: "P-Voice",
    category: "media",
    logo: "/brand/pillars/p-voice.svg",
    status: "Local Whisper",
    summary: "Private audio notes, multi-track podcast capture, and on-device speech-to-text transcription.",
    replaces: "Otter.ai / Descript ($180/yr)",
  },
  {
    id: "p-forms",
    name: "P-Forms",
    category: "ops",
    logo: "/brand/pillars/p-forms.svg",
    status: "Zero-Track",
    summary: "Encrypted lead capture, surveys, and conditional intake forms without paywalling response counts.",
    replaces: "Typeform ($300/yr) / Tally",
  },
  {
    id: "p-books",
    name: "P-Books",
    category: "ops",
    logo: "/brand/pillars/p-books.svg",
    status: "Zero-Fee",
    summary: "Double-entry ledger, automated PDF invoicing, expense tracking, and tax-ready financial statements.",
    replaces: "QuickBooks ($360/yr) / Xero / FreshBooks",
  },
  {
    id: "p-crm",
    name: "P-CRM",
    category: "ops",
    logo: "/brand/pillars/p-crm.svg",
    status: "Inbox-Linked",
    summary: "Lightweight deal pipelines and client relationship timelines automatically hydrated from P-Mail threads.",
    replaces: "HubSpot / Pipedrive ($180/yr)",
  },
  {
    id: "p-sites",
    name: "P-Sites",
    category: "ops",
    logo: "/brand/pillars/p-sites.svg",
    status: "Edge Static",
    summary: "One-click personal portfolios, documentation hubs, and bio-links published to yourname.postveil.me or custom domain.",
    replaces: "Carrd / Linktree / Webflow ($168/yr)",
  },
  {
    id: "p-automate",
    name: "P-Automate",
    category: "ops",
    logo: "/brand/pillars/p-automate.svg",
    status: "Cron + MCP",
    summary: "Deterministic workflow webhooks paired with optional local Model Context Protocol (MCP) AI agents.",
    replaces: "Zapier ($240/yr) / Make / n8n Cloud",
  },
];

const SHOWCASE_MODES = [
  {
    id: "mail",
    label: "P-Mail (Custom Domain Inbox)",
    logo: "/brand/pillars/p-mail.svg",
    url: "https://postveil.me/",
    badge: "DKIM • SPF • DMARC Verified",
    title: "Your Sovereign Inbox — On postveil.me or Your Own Domain",
    description:
      "Start in 10 seconds with a free username.postveil.me identity and wildcard aliases, or connect any domain from Cloudflare, Spaceship, Porkbun, Namecheap, or GoDaddy.",
    replaces: "Replaces Google Workspace ($86/yr) & Proton Unlimited ($120/yr)",
    navItems: ["Focused Inbox (4)", "Cloaked Aliases", "Custom Domains", "Trust Lens Inspector", "Scheduled Outbox"],
    cards: [
      {
        title: "Wildcard Subdomain Aliases",
        body: "Receive mail at netflix@yourname.postveil.me or billing@yourdomain.com automatically without manual setup.",
      },
      {
        title: "1-Click & Guided DNS",
        body: "Live pre-flight DNS verifier checks your MX, SPF, DKIM, and DMARC records in real time.",
      },
      {
        title: "Trust Lens Security",
        body: "Inspect sender authentication, block remote tracking pixels, and verify cryptographic signatures.",
      },
    ],
  },
  {
    id: "docs",
    label: "P-Docs (Sovereign Word Processor)",
    logo: "/brand/pillars/p-docs.svg",
    url: "https://docs.postveil.me/",
    badge: "OPFS Local-First • 10 Native Codecs",
    title: "Enterprise Word Processing That Runs 100% on Your Silicon",
    description:
      "True A4/Letter paginated canvas, interactive margin ruler, 50+ live typefaces, KaTeX symbolic equations, version history diffs, and genuine binary exports.",
    replaces: "Replaces Microsoft 365 Word ($99/yr), Google Docs & Notion ($120/yr)",
    navItems: ["Print Layout & Flow Mode", "50+ Font Library", "KaTeX Math Engine", "Ed25519 Signing", "10 Binary Exports"],
    cards: [
      {
        title: "10 Genuine Export Formats",
        body: "Compile binary .docx, .pdf, .odt, .epub, .rtf, .tex, .md, .html, .txt, and .pdoc locally in milliseconds.",
      },
      {
        title: "LLM Chatbot Smart Paste",
        body: "Paste raw Markdown, tables, callouts, and LaTeX math from any AI assistant directly into rich formatted blocks.",
      },
      {
        title: "Ed25519 Digital Signatures",
        body: "Sign documents with your hardware-backed WebCrypto keypair and verify SHA-256 tamper-proof hashes.",
      },
    ],
  },
  {
    id: "accounts",
    label: "Sovereign Identity & BYOS",
    logo: "/brand/pillars/p-pass.svg",
    url: "https://accounts.postveil.me/",
    badge: "WebCrypto Ed25519 • FIDO2 Passkeys",
    title: "Zero-Knowledge Identity & Bring-Your-Own-Storage (BYOS)",
    description:
      "Authenticate with fingerprint/FaceID passkeys, generate cloaked aliases, and choose where your bytes live: Local OPFS, your own S3/Google Drive, or Postveil R2 Vault.",
    replaces: "Replaces 1Password ($96/yr), Dropbox ($120/yr) & Auth0",
    navItems: ["FIDO2 Passkey Vault", "3-Tier Storage Selector", "Cloaked Email Aliases", "Connected OAuth Apps", "Domain Health Hub"],
    cards: [
      {
        title: "Local OPFS ($0 Forever)",
        body: "Documents and assets stay inside your browser's Origin Private File System—zero cloud exposure.",
      },
      {
        title: "Bring Your Own Storage",
        body: "Plug in your own Cloudflare R2, AWS S3 bucket, or Google Drive with client-side encryption.",
      },
      {
        title: "Voluntary Local MCP AI",
        body: "100% offline by default. Optionally connect local Ollama models or your own API key with explicit consent.",
      },
    ],
  },
];

export default function PublicHome({
  onSignIn,
  onSignUp,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const [handleInput, setHandleInput] = useState("alex");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeShowcase, setActiveShowcase] = useState<string>("mail");
  const [activeCategory, setActiveCategory] = useState<"all" | "comms" | "office" | "media" | "ops">("all");

  const cleanHandle = handleInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "yourname";
  const currentShowcase = SHOWCASE_MODES.find((m) => m.id === activeShowcase) || SHOWCASE_MODES[0];

  const filteredPillars =
    activeCategory === "all"
      ? ALL_20_PILLARS
      : ALL_20_PILLARS.filter((p) => p.category === activeCategory);

  function handleClaimSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem("postveil_claimed_handle", `${cleanHandle}.postveil.me`);
    } catch {
      // Ignore storage errors in restricted modes
    }
    onSignUp();
  }

  return (
    <main className="pv-home-root" id="top">
      {/* 1. STICKY GLASSMORPHISM NAVBAR */}
      <header className="pv-nav-header">
        <div className="pv-nav-container">
          <a className="pv-brand-link" href="#top" aria-label="Postveil Sovereign Suite home">
            <span className="pv-brand-logo-wrap">
              <img src="/postveil-logo.svg" alt="Postveil Logo" />
            </span>
            <span className="pv-brand-text">
              <strong>Postveil</strong>
              <small>Sovereign Suite</small>
            </span>
          </a>

          <nav className="pv-nav-links" aria-label="Primary navigation">
            <a href="#live-suite">Live Workspace</a>
            <a href="#pillars">20 Pillars</a>
            <a href="#architecture">Sovereign Architecture</a>
            <a href="#pricing">Pricing</a>
            <a href="https://docs.postveil.me/">Launch P-Docs</a>
            <a href="https://accounts.postveil.me/">Accounts Hub</a>
          </nav>

          <div className="pv-nav-actions">
            <button type="button" className="pv-btn-ghost" onClick={onSignIn}>
              Sign in
            </button>
            <button type="button" className="pv-btn-primary" onClick={onSignUp}>
              Claim Identity <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className="pv-mobile-toggle"
              aria-label="Toggle mobile menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <div className={`pv-mobile-drawer ${mobileMenuOpen ? "open" : ""}`}>
          <a href="#live-suite" onClick={() => setMobileMenuOpen(false)}>Live Workspace</a>
          <a href="#pillars" onClick={() => setMobileMenuOpen(false)}>All 20 Sovereign Pillars</a>
          <a href="#architecture" onClick={() => setMobileMenuOpen(false)}>Zero-Knowledge Architecture</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing & Welcome Gift</a>
          <a href="https://docs.postveil.me/">Open P-Docs Editor</a>
          <a href="https://accounts.postveil.me/">Open Accounts Hub</a>
          <div className="pv-mobile-drawer-actions">
            <button type="button" className="pv-btn-ghost" onClick={onSignIn}>
              Sign in
            </button>
            <button type="button" className="pv-btn-primary" onClick={onSignUp}>
              Claim Free Handle
            </button>
          </div>
        </div>
      </header>

      {/* 2. ABOVE-THE-FOLD HERO WITH INTERACTIVE HANDLE CLAIM */}
      <section className="pv-hero" aria-labelledby="pv-hero-heading">
        <div className="pv-eyebrow-pill">
          <ShieldCheck size={15} />
          <span>POSTVEIL SOVEREIGN SUITE • 20 PILLARS • ZERO CLOUD RENT</span>
        </div>

        <h1 id="pv-hero-heading" className="pv-hero-title">
          One Sovereign Identity.
          <br />
          <em>20 Private Pillars.</em> Zero Subscriptions.
        </h1>

        <p className="pv-hero-subtitle">
          Replace Google Workspace, Microsoft 365, DocuSign, Notion, and Adobe with a fast, local-first productivity ecosystem. Start in 10 seconds with your own <strong>.postveil.me</strong> subdomain or bring any custom domain you own.
        </p>

        {/* Interactive Handle Claim Bar */}
        <form className="pv-claim-card" onSubmit={handleClaimSubmit} aria-label="Claim your Postveil handle">
          <div className="pv-claim-row">
            <div className="pv-claim-input-group">
              <span className="pv-claim-prefix">https://</span>
              <input
                type="text"
                className="pv-claim-input"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder="yourname"
                aria-label="Choose your sovereign handle"
                maxLength={32}
              />
              <span className="pv-claim-suffix">.postveil.me</span>
            </div>
            <button type="submit" className="pv-claim-submit">
              Claim Free Handle <ArrowRight size={17} />
            </button>
          </div>
          <div className="pv-claim-status-bar">
            <span className="pv-claim-available">
              <Check size={15} />
              <strong>{cleanHandle}.postveil.me</strong> &amp; <strong>*@{cleanHandle}.postveil.me</strong> are available!
            </span>
            <button type="button" className="pv-claim-custom-domain-link" onClick={onSignUp}>
              Already own a custom domain (e.g. acme.com)? Connect it here →
            </button>
          </div>
        </form>

        <div className="pv-hero-trust-pills">
          <span>
            <Check size={15} /> No existing email required to sign up
          </span>
          <span>
            <KeyRound size={15} /> FIDO2 Passkey &amp; Ed25519 Cryptography
          </span>
          <span>
            <HardDrive size={15} /> Local OPFS + Bring Your Own Storage (BYOS)
          </span>
          <span>
            <Globe2 size={15} /> 1-Click Cloudflare &amp; Registrar DNS
          </span>
        </div>
      </section>

      {/* 3. INTERACTIVE LIVE SUITE SWITCHER */}
      <section className="pv-showcase-section" id="live-suite" aria-label="Interactive Suite Preview">
        <div className="pv-showcase-tabs" role="tablist">
          {SHOWCASE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={activeShowcase === mode.id}
              className={`pv-showcase-tab ${activeShowcase === mode.id ? "active" : ""}`}
              onClick={() => setActiveShowcase(mode.id)}
            >
              <img src={mode.logo} alt="" />
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        <div className="pv-showcase-window">
          <div className="pv-window-topbar">
            <div className="pv-window-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="pv-window-url">
              <Lock size={12} />
              <span>{currentShowcase.url}</span>
            </div>
            <div className="pv-window-badge">{currentShowcase.badge}</div>
          </div>

          <div className="pv-window-body">
            <aside className="pv-window-sidebar">
              <div className="pv-window-sidebar-header">
                <img src={currentShowcase.logo} alt="" />
                <div>
                  <strong>{currentShowcase.label.split(" ")[0]}</strong>
                  <small>{cleanHandle}.postveil.me</small>
                </div>
              </div>
              {currentShowcase.navItems.map((item, idx) => (
                <div key={item} className={`pv-window-nav-item ${idx === 0 ? "active" : ""}`}>
                  <span>{item}</span>
                  {idx === 0 && <Check size={14} />}
                </div>
              ))}
            </aside>

            <div className="pv-window-main">
              <div className="pv-window-feature-header">
                <h3>{currentShowcase.title}</h3>
                <p>{currentShowcase.description}</p>
              </div>

              <div className="pv-window-cards-grid">
                {currentShowcase.cards.map((card) => (
                  <div key={card.title} className="pv-window-mini-card">
                    <strong>{card.title}</strong>
                    <p>{card.body}</p>
                  </div>
                ))}
              </div>

              <div className="pv-window-footer-bar">
                <span className="pv-replaces-tag">{currentShowcase.replaces}</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {currentShowcase.id === "docs" && (
                    <a
                      href="https://docs.postveil.me/"
                      className="pv-btn-ghost"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      Try Live P-Docs Editor <ArrowRight size={14} />
                    </a>
                  )}
                  {currentShowcase.id === "accounts" && (
                    <a
                      href="https://accounts.postveil.me/"
                      className="pv-btn-ghost"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      Inspect Accounts Hub <ArrowRight size={14} />
                    </a>
                  )}
                  <button type="button" className="pv-btn-primary" onClick={onSignUp}>
                    Start Free with {cleanHandle}.postveil.me <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. THE 20 SOVEREIGN PILLARS BENTO GRID (ALL 20 SVG LOGOS) */}
      <section className="pv-pillars-section" id="pillars" aria-labelledby="pillars-heading">
        <div className="pv-section-header">
          <div className="pv-eyebrow-pill">
            <Sparkles size={14} />
            <span>THE 20-PILLAR ECOSYSTEM</span>
          </div>
          <h2 id="pillars-heading">Every tool your life and business run on. Unbundled from Big Tech.</h2>
          <p>
            Instead of paying 15 separate monthly SaaS subscriptions that scrape your private documents, Postveil unifies 20 cryptographically sovereign pillars under one roof.
          </p>
        </div>

        <div className="pv-category-filter" role="tablist" aria-label="Filter pillars by category">
          {[
            { key: "all", label: "All 20 Pillars" },
            { key: "comms", label: "Communication & Mail (4)" },
            { key: "office", label: "Office & Documents (5)" },
            { key: "media", label: "Creative, Video & CAD (4)" },
            { key: "ops", label: "Business, Legal & Finance (7)" },
          ].map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`pv-cat-btn ${activeCategory === cat.key ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.key as any)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="pv-pillars-grid">
          {filteredPillars.map((pillar) => (
            <article key={pillar.id} className="pv-pillar-card">
              <div>
                <div className="pv-pillar-top">
                  <div className="pv-pillar-icon">
                    <img src={pillar.logo} alt={`${pillar.name} logo`} loading="lazy" />
                  </div>
                  <span className={`pv-pillar-status ${pillar.isLive ? "live" : ""}`}>
                    {pillar.status}
                  </span>
                </div>
                <div className="pv-pillar-body" style={{ marginTop: 14 }}>
                  <h3>{pillar.name}</h3>
                  <p>{pillar.summary}</p>
                </div>
              </div>
              <div className="pv-pillar-replaces">
                Replaces: <strong>{pillar.replaces}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 5. SOVEREIGN ARCHITECTURE & SAAS TAX RECEIPT */}
      <section className="pv-arch-section" id="architecture" aria-labelledby="arch-heading">
        <div className="pv-arch-container">
          <div className="pv-arch-copy">
            <div className="pv-eyebrow-pill">
              <Cpu size={14} />
              <span>LOCAL-FIRST • ZERO-KNOWLEDGE • IaaS EDGE</span>
            </div>
            <h2 id="arch-heading">Engineered so your files never become training fodder.</h2>
            <p>
              Traditional cloud suites hold your data hostage on multi-tenant servers and charge recurring rent. Postveil pushes computing to your local device silicon and gives you total ownership of your storage and keys.
            </p>

            <div className="pv-arch-points">
              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <HardDrive size={18} />
                </div>
                <div>
                  <h4>3-Way Sovereign Storage (OPFS, BYOS, or R2 Vault)</h4>
                  <p>
                    Store documents for $0 in your browser’s Origin Private File System (OPFS), connect your own AWS S3 / Cloudflare R2 / Google Drive, or use our encrypted zero-egress Vault.
                  </p>
                </div>
              </div>

              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h4>Asymmetric Ed25519 &amp; Hardware Passkeys</h4>
                  <p>
                    Every Postveil identity derives a deterministic WebCrypto keypair on your device. Sign contracts in P-Docs and authenticate across apps without passwords.
                  </p>
                </div>
              </div>

              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4>100% Voluntary MCP AI (Zero Forced Cloud Scraping)</h4>
                  <p>
                    AI is disabled by default. Power users can voluntarily attach local offline models (via Ollama) or their own API keys via the Model Context Protocol (MCP) with biometric confirmation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SaaS Tax Receipt Comparison */}
          <div className="pv-receipt-card" aria-label="Annual SaaS Cost Comparison">
            <div className="pv-receipt-header">
              <span>THE CORPORATE SAAS TAX RECEIPT</span>
              <h3>What a 10-Person Team Pays Every Year</h3>
            </div>

            <div className="pv-receipt-rows">
              <div className="pv-receipt-row">
                <span>Google Workspace Business ($12/seat)</span>
                <s>$1,440 / yr</s>
              </div>
              <div className="pv-receipt-row">
                <span>Slack Pro ($8.75/seat)</span>
                <s>$1,050 / yr</s>
              </div>
              <div className="pv-receipt-row">
                <span>Zoom Pro ($15.99/seat)</span>
                <s>$1,918 / yr</s>
              </div>
              <div className="pv-receipt-row">
                <span>DocuSign Business Pro ($40/seat)</span>
                <s>$4,800 / yr</s>
              </div>
              <div className="pv-receipt-row">
                <span>Notion Plus + Calendly + 1Password</span>
                <s>$3,360 / yr</s>
              </div>
              <div className="pv-receipt-row">
                <span>Adobe Acrobat &amp; Creative Tools</span>
                <s>$1,368 / yr</s>
              </div>
            </div>

            <div className="pv-receipt-total-old">
              <span>TRADITIONAL SAAS RENT (10 SEATS):</span>
              <span>$13,936 / year</span>
            </div>

            <div className="pv-receipt-total-new">
              <div>
                <strong>Postveil Sovereign Suite</strong>
                <small>All 20 Pillars • Custom Domains • Zero Lock-in</small>
              </div>
              <span className="pv-receipt-price">$48 / yr</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRANSPARENT PRICING & WELCOME GIFT */}
      <section className="pv-pricing-section" id="pricing" aria-labelledby="pricing-heading">
        <div className="pv-section-header">
          <div className="pv-eyebrow-pill">
            <Globe2 size={14} />
            <span>FAIR UTILITY PRICING</span>
          </div>
          <h2 id="pricing-heading">Start free forever. Upgrade for less than a cup of coffee.</h2>
          <p>
            Whether you are self-hosting on your homelab, claiming a free <strong>.postveil.me</strong> handle, or running a 50-person agency on your own custom domain.
          </p>
        </div>

        <div className="pv-pricing-grid">
          {/* Tier 1: Community Self-Hosted */}
          <div className="pv-price-card">
            <div>
              <h3 className="pv-price-tier">Community</h3>
              <p className="pv-price-desc">For homelabbers, developers &amp; privacy purists.</p>
              <div className="pv-price-amount">
                <strong>$0</strong>
                <span>/ forever (Self-Hosted)</span>
              </div>
              <ul className="pv-price-features">
                <li><Check size={16} /> Deploy on your own Cloudflare / Docker</li>
                <li><Check size={16} /> Bring your own AWS SES &amp; R2/S3</li>
                <li><Check size={16} /> Unlimited custom domains (own DNS)</li>
                <li><Check size={16} /> Full local OPFS &amp; WebCrypto engine</li>
              </ul>
            </div>
            <button type="button" className="pv-btn-ghost pv-price-btn" onClick={onSignUp}>
              Start Self-Hosted
            </button>
          </div>

          {/* Tier 2: Personal Free Cloud */}
          <div className="pv-price-card">
            <div>
              <h3 className="pv-price-tier">Personal</h3>
              <p className="pv-price-desc">Instant sovereign handle with zero setup friction.</p>
              <div className="pv-price-amount">
                <strong>$0</strong>
                <span>/ forever</span>
              </div>
              <ul className="pv-price-features">
                <li><Check size={16} /> Free <strong>yourname.postveil.me</strong> identity</li>
                <li><Check size={16} /> Connect 1 custom domain you own</li>
                <li><Check size={16} /> Core pillars (P-Mail, P-Docs, P-Cal, P-Pass)</li>
                <li><Check size={16} /> 2 GB Cloud Vault + Unlimited Local OPFS</li>
              </ul>
            </div>
            <button type="button" className="pv-btn-ghost pv-price-btn" onClick={onSignUp}>
              Claim Free Handle
            </button>
          </div>

          {/* Tier 3: Pro Solo Founder (Featured) */}
          <div className="pv-price-card featured">
            <span className="pv-price-badge">MOST POPULAR • WELCOME GIFT</span>
            <div>
              <h3 className="pv-price-tier">Pro Sovereign</h3>
              <p className="pv-price-desc">For freelancers, solo founders, creators &amp; domain owners.</p>
              <div className="pv-price-amount">
                <strong>$4</strong>
                <span>/ mo ($48 billed annually)</span>
              </div>
              <div className="pv-gift-callout">
                🎁 <strong>Includes 1 Welcome Gift:</strong> Choose a <strong>Free Custom Domain</strong> (1st yr), a <strong>Free Domain Transfer-In</strong> (+1 yr renewal), or <strong>+25 GB Bonus Vault</strong>!
              </div>
              <ul className="pv-price-features">
                <li><Check size={16} /> <strong>All 20 Sovereign Pillars</strong> unlocked</li>
                <li><Check size={16} /> <strong>Unlimited</strong> custom domains &amp; aliases</li>
                <li><Check size={16} /> 50 GB Zero-Egress R2 Cloud Vault</li>
                <li><Check size={16} /> 25,000 emails/mo + Remove viral badges</li>
                <li><Check size={16} /> Unlimited Ed25519 P-Sign signatures</li>
              </ul>
            </div>
            <button type="button" className="pv-btn-primary pv-price-btn" onClick={onSignUp}>
              Get Pro + Welcome Gift <ArrowRight size={15} />
            </button>
          </div>

          {/* Tier 4: Teams & Agencies */}
          <div className="pv-price-card">
            <div>
              <h3 className="pv-price-tier">Teams &amp; Legal</h3>
              <p className="pv-price-desc">For startups, agencies, law firms &amp; remote teams.</p>
              <div className="pv-price-amount">
                <strong>$5</strong>
                <span>/ seat / mo ($60/yr)</span>
              </div>
              <ul className="pv-price-features">
                <li><Check size={16} /> Everything in Pro for every team member</li>
                <li><Check size={16} /> Shared team mailboxes &amp; split-domain routing</li>
                <li><Check size={16} /> 250 GB pooled zero-knowledge Vault / seat</li>
                <li><Check size={16} /> Role-based access control (RBAC) &amp; audit logs</li>
                <li><Check size={16} /> Priority SLA &amp; dedicated sending pools</li>
              </ul>
            </div>
            <button type="button" className="pv-btn-ghost pv-price-btn" onClick={onSignUp}>
              Create Team Workspace
            </button>
          </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="pv-final-cta" aria-label="Get started">
        <div className="pv-final-cta-box">
          <h2>Declare your digital sovereignty in 10 seconds.</h2>
          <p>
            Claim <strong>{cleanHandle}.postveil.me</strong> for free, or connect the custom domain you already own. No credit card, no existing email required.
          </p>
          <div className="pv-final-cta-actions">
            <button type="button" className="pv-btn-white" onClick={onSignUp}>
              Claim {cleanHandle}.postveil.me <ArrowRight size={16} />
            </button>
            <a href="https://docs.postveil.me/" className="pv-btn-outline-light">
              Test P-Docs Live Without Signing Up
            </a>
          </div>
        </div>
      </section>

      {/* 8. CLEAN FOOTER */}
      <footer className="pv-footer">
        <div className="pv-footer-container">
          <div className="pv-footer-left">
            <span className="pv-brand-logo-wrap" style={{ width: 28, height: 28, borderRadius: 8 }}>
              <img src="/postveil-logo.svg" alt="" style={{ width: 18, height: 18 }} />
            </span>
            <span>
              <strong>Postveil™ Sovereign Suite</strong> · Private Mail &amp; 20-Pillar Workspace · postveil.me
            </span>
          </div>
          <div className="pv-footer-links">
            <a href="#live-suite">Workspace</a>
            <a href="#pillars">20 Pillars</a>
            <a href="#pricing">Pricing</a>
            <a href="https://docs.postveil.me/">P-Docs</a>
            <a href="https://accounts.postveil.me/">Accounts</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <button type="button" onClick={onSignIn}>
              Sign in →
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
