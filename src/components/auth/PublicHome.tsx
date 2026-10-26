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
import { CAPABILITY_STATE_LABELS, PILLAR_REGISTRY } from "../../lib/pillars";

const REGISTERED_PILLARS = PILLAR_REGISTRY.map((pillar) => ({
  id: pillar.id,
  name: pillar.name,
  category: pillar.category,
  logo: pillar.icon.path,
  status: CAPABILITY_STATE_LABELS[pillar.state],
  summary: pillar.summary,
  replaces: pillar.dependencyNote || "No additional dependency is stated.",
}));

const SHOWCASE_MODES = [
  {
    id: "mail",
    label: "P-Mail (Custom Domain Inbox)",
    logo: "/brand/pillars/p-mail.svg",
    url: "https://postveil.me/",
    badge: "Mail authentication status is shown after verification",
    title: "Your Sovereign Inbox — On postveil.me or Your Own Domain",
    description:
      "Start with the current account flow and connect a domain through the configured onboarding path.",
    replaces: "Replaces Google Workspace ($86/yr) & Proton Unlimited ($120/yr)",
    navItems: ["Focused Inbox (4)", "Cloaked Aliases", "Custom Domains", "Trust Lens Inspector", "Scheduled Outbox"],
    cards: [
      {
        title: "Wildcard Subdomain Aliases",
        body: "Receive mail at netflix@yourname.postveil.me or billing@yourdomain.com automatically without manual setup.",
      },
      {
        title: "1-Click & Guided DNS",
        body: "The mail setup can check configured authentication records; results depend on the connected domain.",
      },
      {
        title: "Trust Lens Security",
        body: "Inspect sender authentication and message safety indicators.",
      },
    ],
  },
  {
    id: "docs",
    label: "P-Docs (Sovereign Word Processor)",
    logo: "/brand/pillars/p-docs.svg",
    url: "https://docs.postveil.me/",
    badge: "OPFS local-first • open-format exports",
    title: "Document editing that runs on your device",
    description:
      "True A4/Letter paginated canvas, interactive margin ruler, 50+ live typefaces, KaTeX symbolic equations, version history diffs, and genuine binary exports.",
    replaces: "Replaces Microsoft 365 Word ($99/yr), Google Docs & Notion ($120/yr)",
    navItems: ["Print Layout & Flow Mode", "50+ Font Library", "KaTeX Math Engine", "Document hash preview", "10 Binary Exports"],
    cards: [
      {
        title: "Document editing and export",
        body: "P-Docs exports supported open formats locally; available formats depend on the current document path.",
      },
      {
        title: "LLM Chatbot Smart Paste",
        body: "Paste raw Markdown, tables, callouts, and LaTeX math from any AI assistant directly into rich formatted blocks.",
      },
      {
        title: "Document hash preview",
        body: "P-Docs can show document hashes and retain legacy signature metadata as unverified; signing is disabled until a verification service exists.",
      },
    ],
  },
  {
    id: "accounts",
    label: "Sovereign Account Settings",
    logo: "/brand/pillars/p-pass.svg",
    url: "https://accounts.postveil.me/",
    badge: "MFA available • credential service setup-required",
    title: "Account security and local storage settings",
    description:
      "Email authentication and MFA are available today. Credential storage and passkey enrollment require separate setup.",
    replaces: "Replaces 1Password ($96/yr), Dropbox ($120/yr) & Auth0",
    navItems: ["Account MFA", "Credential service setup-required", "Local browser storage", "Connected apps", "Domain health"],
    cards: [
      {
        title: "Local browser storage",
        body: "Supported local-first document features keep their data in the browser when the selected medium is available.",
      },
      {
        title: "External storage setup",
        body: "Cloud storage connectors are not configured in this deployment; local browser storage remains the available option.",
      },
      {
        title: "Optional local tooling",
        body: "No hosted AI connection is required or enabled by this shell.",
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
      ? REGISTERED_PILLARS
      : REGISTERED_PILLARS.filter((p) => p.category === activeCategory);

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
            <a href="#live-suite">Available surfaces</a>
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
          <a href="#live-suite" onClick={() => setMobileMenuOpen(false)}>Available surfaces</a>
          <a href="#pillars" onClick={() => setMobileMenuOpen(false)}>All 20 Sovereign Pillars</a>
          <a href="#architecture" onClick={() => setMobileMenuOpen(false)}>Architecture and boundaries</a>
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
              <strong>{cleanHandle}.postveil.me</strong> &amp; <strong>*@{cleanHandle}.postveil.me</strong> will be checked when you continue.
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
            <KeyRound size={15} /> Email sign-in and MFA are available; passkeys require setup
          </span>
          <span>
            <HardDrive size={15} /> Local browser storage for supported features
          </span>
          <span>
            <Globe2 size={15} /> Domain connection guidance
          </span>
        </div>
      </section>

      {/* 3. INTERACTIVE SUITE SHOWCASE */}
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
                      Open P-Docs Editor <ArrowRight size={14} />
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
            Instead of presenting every manifesto item as complete, Postveil lists 20 pillars with their current registry state and explicit boundaries.
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
                  <span className={`pv-pillar-status ${pillar.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                    {pillar.status}
                  </span>
                </div>
                <div className="pv-pillar-body" style={{ marginTop: 14 }}>
                  <h3>{pillar.name}</h3>
                  <p>{pillar.summary}</p>
                </div>
              </div>
              <div className="pv-pillar-replaces">
                Scope: <strong>{pillar.replaces}</strong>
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
              <span>LOCAL-FIRST • BOUNDED CAPABILITIES • AUTHENTICATED ACCESS</span>
            </div>
            <h2 id="arch-heading">Local-first features with explicit capability boundaries.</h2>
            <p>
              Traditional suites combine many services behind broad promises. Postveil shows each pillar's current state and keeps supported local data in the browser where possible.
            </p>

            <div className="pv-arch-points">
              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <HardDrive size={18} />
                </div>
                <div>
                  <h4>Local browser storage</h4>
                  <p>Supported local-first document features use browser storage when available. External storage connectors and managed vaults require setup.</p>
                </div>
              </div>

              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h4>Authentication and account security</h4>
                  <p>Email authentication and MFA are available. Passkey credentials and cryptographic signing require separate setup.</p>
                </div>
              </div>

              <div className="pv-arch-point">
                <div className="pv-arch-point-icon">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4>Optional integrations</h4>
                  <p>Provider connections and hosted AI tools are not enabled by this shell; unsupported integrations remain setup-required.</p>
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
                <small>Available surfaces follow the registry state</small>
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
                <li><Check size={16} /> Local browser storage where supported</li>
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
                <li><Check size={16} /> P-Mail, P-Docs, and P-Calendar availability follows their registry states</li>
                <li><Check size={16} /> Local storage where the browser medium is available</li>
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
                <li><Check size={16} /> Registry access to available beta surfaces</li>
                <li><Check size={16} /> Custom-domain and storage options remain subject to setup</li>
                <li><Check size={16} /> Signature metadata preview; signing remains disabled</li>
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
                <li><Check size={16} /> Available account and mail features depend on deployment configuration</li>
                <li><Check size={16} /> Team sharing and hosted storage require separate setup</li>
                <li><Check size={16} /> Local-first surfaces remain bounded to their registry state</li>
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
              Open P-Docs information
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
