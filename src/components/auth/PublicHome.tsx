import {
  Archive,
  ArrowRight,
  Check,
  Globe2,
  Inbox,
  Mail,
  PenLine,
  Search,
  Send,
  ShieldCheck,
  Star,
} from "lucide-react";

export default function PublicHome({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <main className="public-home landing-home">
      <nav className="home-nav landing-nav" aria-label="Postveil navigation">
        <a className="home-brand" href="#top" aria-label="Postveil home">
          <span className="home-brand-mark">
            <img src="/postveil-logo.svg" alt="" />
          </span>
          <span>
            <strong>Postveil</strong>
            <small>private mail</small>
          </span>
        </a>
        <div className="home-nav-links">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <button type="button" className="home-signin" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="landing-nav-cta" onClick={onSignUp}>
            Create account
          </button>
        </div>
      </nav>
      <section className="landing-hero" id="top">
        <div className="landing-poster">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <ShieldCheck size={15} aria-hidden="true" /> Private email for the domain you own
            </p>
            <h1>
              <span className="landing-wordmark">Postveil</span>
              <span className="landing-hero-title">
                A calmer inbox for your <em>own domain.</em>
              </span>
            </h1>
            <p className="landing-lede">
              A private, capable mailbox for the name you already own—without sending you through a maze of provider consoles.
            </p>
            <div className="landing-actions">
              <button type="button" className="landing-primary" onClick={onSignUp}>
                Get started free <ArrowRight size={17} />
              </button>
              <button type="button" className="landing-secondary" onClick={onSignIn}>
                Sign in
              </button>
            </div>
            <p className="landing-microcopy">
              <Check size={14} /> Guided domain setup · privacy-first defaults · built for desktop and mobile
            </p>
          </div>
          <p className="landing-poster-caption">
            <span>POSTVEIL / 01</span>
            <span>Private mail for the domain you own</span>
          </p>
        </div>
      </section>
      <section className="landing-product-proof" id="product" aria-labelledby="product-proof-title">
        <div className="landing-product-proof-copy">
          <p className="landing-eyebrow">Inside your mailbox</p>
          <h2 id="product-proof-title">A familiar room for the address you chose.</h2>
          <p>Your domain stays yours. The everyday work—reading, replying, searching, and keeping things moving—stays in one calm place.</p>
        </div>
        <div className="landing-product-shot" aria-label="Postveil inbox preview">
          <div className="mock-window-bar">
            <span className="mock-window-brand">
              <span className="mock-window-mark">
                <img src="/postveil-logo.svg" alt="" />
              </span>{" "}
              Postveil
            </span>
            <span className="mock-window-status">
              <span /> private mailbox
            </span>
          </div>
          <div className="mock-mail-app">
            <aside className="mock-sidebar">
              <button type="button" className="mock-compose">
                Compose <PenLine size={13} />
              </button>
              <p className="mock-section-label">Mailbox</p>
              <div className="mock-folder active">
                <Inbox size={15} /> Inbox <b>4</b>
              </div>
              <div className="mock-folder">
                <Star size={15} /> Starred
              </div>
              <div className="mock-folder">
                <Send size={15} /> Sent
              </div>
              <div className="mock-folder">
                <Archive size={15} /> Archive
              </div>
              <p className="mock-section-label">Your domain</p>
              <div className="mock-domain">
                <span>hello</span>@yourdomain.com
              </div>
            </aside>
            <section className="mock-inbox">
              <div className="mock-inbox-head">
                <div>
                  <span>Mailbox</span>
                  <strong>Inbox</strong>
                </div>
                <div className="mock-search">
                  <Search size={14} /> Search mail
                </div>
              </div>
              <div className="mock-tabs">
                <span className="selected">Focused</span>
                <span>Other</span>
                <span className="mock-count">4 unread</span>
              </div>
              <div className="mock-message unread">
                <span className="mock-avatar">A</span>
                <div>
                  <b>Alex Morgan</b>
                  <strong>Project notes for Thursday</strong>
                  <p>Here are the details we discussed...</p>
                </div>
                <time>9:42</time>
              </div>
              <div className="mock-message">
                <span className="mock-avatar olive">N</span>
                <div>
                  <b>Northline Studio</b>
                  <strong>Welcome to the team</strong>
                  <p>Your workspace is ready to review.</p>
                </div>
                <time>Yesterday</time>
              </div>
              <div className="mock-message">
                <span className="mock-avatar rose">J</span>
                <div>
                  <b>James Fontanilla</b>
                  <strong>Re: domain setup</strong>
                  <p>Everything is connected and verified.</p>
                </div>
                <time>Aug 30</time>
              </div>
            </section>
          </div>
        </div>
      </section>
      <section className="landing-trust" aria-label="Postveil highlights">
        <span>
          <ShieldCheck size={16} /> Privacy-first by default
        </span>
        <span>
          <Globe2 size={16} /> Bring any domain you control
        </span>
        <span>
          <Mail size={16} /> One familiar inbox
        </span>
      </section>
      <section className="landing-features" id="how-it-works">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">A better starting point</p>
          <h2>Everything you need to feel at home in your inbox.</h2>
          <p>Postveil keeps the familiar parts of email and makes the domain setup feel human.</p>
        </div>
        <div className="landing-feature-grid">
          <article>
            <span className="landing-feature-number">01</span>
            <h3>Bring the name</h3>
            <p>Connect a domain you already own with a guided DNS checklist in plain language.</p>
            <a href="#top">
              See how it works <ArrowRight size={14} />
            </a>
          </article>
          <article>
            <span className="landing-feature-number">02</span>
            <h3>Make the address</h3>
            <p>Create hello@, you@, or a shared address without opening a deployment console.</p>
            <a href="#top">
              Create your mailbox <ArrowRight size={14} />
            </a>
          </article>
          <article id="privacy">
            <span className="landing-feature-number">03</span>
            <h3>Keep the room yours</h3>
            <p>Provider credentials stay behind Postveil, with clear privacy controls around your mail.</p>
            <a href="/privacy">
              Read our privacy promise <ArrowRight size={14} />
            </a>
          </article>
        </div>
      </section>
      <section className="landing-process">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">The setup, made simple</p>
          <h2>From a domain name to a working mailbox in a few clear steps.</h2>
          <p>You stay in control of the domain. Postveil handles the handoff, the checks, and the everyday mail desk.</p>
        </div>
        <div className="landing-process-grid">
          <article>
            <span>01</span>
            <div>
              <h3>Connect your domain</h3>
              <p>Tell us which address you own. We show the exact records to add and explain what each one does.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Choose your mailbox</h3>
              <p>Pick a local address for yourself, your team, or a shared purpose like hello@ or support@.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Open the inbox</h3>
              <p>Once the records are verified, your mailbox is ready for sending, receiving, searching, and organizing.</p>
            </div>
          </article>
        </div>
      </section>
      <section className="landing-capabilities">
        <div className="landing-capabilities-intro">
          <p className="landing-eyebrow">Made for daily work</p>
          <h2>Quiet on the surface. Thoughtful underneath.</h2>
          <p>Postveil gives your address a proper home, with the details that make email dependable day after day.</p>
        </div>
        <div className="landing-capability-panel">
          <div className="landing-capability-row">
            <strong>Inbox organization</strong>
            <span>Focused views, folders, labels, stars, and bulk actions.</span>
            <Check size={16} />
          </div>
          <div className="landing-capability-row">
            <strong>Safe reading</strong>
            <span>Protected rendering, remote-image controls, and link inspection.</span>
            <Check size={16} />
          </div>
          <div className="landing-capability-row">
            <strong>Clear delivery</strong>
            <span>Delivery status, authentication results, and understandable failures.</span>
            <Check size={16} />
          </div>
          <div className="landing-capability-row">
            <strong>Built to grow</strong>
            <span>Quotas, shared addresses, account security, and domain controls.</span>
            <Check size={16} />
          </div>
        </div>
      </section>
      <section className="landing-privacy" id="privacy-overview">
        <div>
          <p className="landing-eyebrow">A private place for your mail</p>
          <h2>Your address should feel like yours from the first message.</h2>
        </div>
        <p>
          Search, organize, compose, and read without learning a new mental model. Postveil is deliberately familiar where it should be—and deliberate about your domain, data, and control where it matters.
        </p>
      </section>
      <section className="landing-final-cta">
        <div>
          <p className="landing-eyebrow">Start with the name you already own</p>
          <h2>Give your domain a quieter inbox.</h2>
        </div>
        <button type="button" className="landing-primary" onClick={onSignUp}>
          Create your mailbox <ArrowRight size={17} />
        </button>
      </section>
      <footer className="home-footer">
        <span>
          Postveil / private mail for the domains you own · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
        </span>
        <button type="button" onClick={onSignUp}>
          Start with your domain <ArrowRight size={14} />
        </button>
      </footer>
    </main>
  );
}
