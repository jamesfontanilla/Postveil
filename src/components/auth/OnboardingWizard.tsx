import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Globe2,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import BrandMark from "../BrandMark";
import type {
  DomainRecord,
  DomainStatusResponse,
  Mailbox,
  OnboardingState,
  OnboardingStep,
} from "../../types/mail";
import { apiFetch } from "../../lib/api";
import type { JsonRecord, Session } from "../../lib/auth";

const ONBOARDING_STEPS = [
  { label: "Purpose", note: "Choose your starting point" },
  { label: "Domain", note: "Claim handle or connect domain" },
  { label: "DNS check", note: "Connect mail safely" },
  { label: "Address", note: "Create your first mailbox" },
  { label: "Done", note: "Your next step is clear" },
];

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function canonicalDomain(value: string): string {
  return normalizeDomain(value).replace(/\.$/, "");
}

const DNS_PROVIDERS = [
  "Cloudflare",
  "GoDaddy",
  "Namecheap",
  "Squarespace Domains",
  "IONOS",
  "Hostinger",
  "Porkbun",
  "Dynadot",
  "Other",
] as const;

const DNS_PROVIDER_GUIDES: Record<string, { path: string; where: string; note: string }> = {
  Cloudflare: {
    path: "Cloudflare Dashboard → domain → DNS → Records",
    where: "Add the records in DNS Records",
    note: "Postveil no longer uses Cloudflare OAuth. You keep control of the DNS changes.",
  },
  GoDaddy: {
    path: "My Products → Domain → DNS → Manage DNS",
    where: "Add records under Records",
    note: "Use @ for the root domain. Leave existing web records alone.",
  },
  Namecheap: {
    path: "Domain List → Manage → Advanced DNS",
    where: "Add New Record under Host Records",
    note: "Use @ for the root domain. If Namecheap is using custom nameservers, edit DNS at that provider instead.",
  },
  "Squarespace Domains": {
    path: "Domains dashboard → select domain → DNS",
    where: "Add a custom record",
    note: "Use the Name, Type, Data, Priority, and TTL fields shown in the DNS panel.",
  },
  IONOS: {
    path: "Domains & SSL → domain → DNS",
    where: "Add record",
    note: "Choose the record type first, then enter the host and value exactly as shown.",
  },
  Hostinger: {
    path: "Domains → Manage → DNS / Nameservers",
    where: "Add a new record",
    note: "The DNS manager may be called DNS Zone Editor on older accounts.",
  },
  Porkbun: {
    path: "Account → Domain Management → Details → DNS Records",
    where: "Create record",
    note: "Use the root host field for @ and keep TTL on default unless you have a reason to change it.",
  },
  Dynadot: {
    path: "My Domains → Manage Domains → DNS Settings",
    where: "Add record",
    note: "Choose DNS Records, not nameservers, when keeping Dynadot DNS active.",
  },
  Other: {
    path: "Your registrar’s DNS, Advanced DNS, or Zone Editor page",
    where: "Add TXT and MX records",
    note: "Search the registrar’s help center for ‘add DNS records’ if the menu uses different wording.",
  },
};

export default function OnboardingWizard({ session, onComplete }: { session: Session; onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [goal, setGoal] = useState<OnboardingState["goal"]>("personal");
  const [domainMode, setDomainMode] = useState<"sovereign" | "custom">("sovereign");
  const [sovereignHandle, setSovereignHandle] = useState(() => {
    try {
      const saved = sessionStorage.getItem("postveil_claimed_handle");
      if (saved) return saved.toLowerCase().replace(/[^a-z0-9-]/g, "");
    } catch {
      // ignore
    }
    const emailLocal = (session.user.email || "").split("@")[0] || "";
    return emailLocal.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  });
  const [handleStatus, setHandleStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });
  const [domain, setDomain] = useState("");
  const [mailboxLocal, setMailboxLocal] = useState("hello");
  const [displayName, setDisplayName] = useState(() =>
    String(session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "My mailbox"),
  );
  const [dnsProvider, setDnsProvider] = useState<string>("Namecheap");
  const [domainStatus, setDomainStatus] = useState<OnboardingState["domainStatus"]>("pending");
  const [mailboxAddress, setMailboxAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [dnsRefreshBusy, setDnsRefreshBusy] = useState(false);
  const [domainStatusData, setDomainStatusData] = useState<DomainStatusResponse | null>(null);
  const domainStatusRequest = useRef(0);
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (step !== 1 || domainMode !== "sovereign") return;
    const clean = sovereignHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean || clean.length < 2) {
      setHandleStatus({ checking: false, available: false, reason: "Handle must be at least 2 characters." });
      return;
    }
    setHandleStatus({ checking: true, available: null });
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-handle?handle=${encodeURIComponent(clean)}`);
        const data = (await res.json()) as { available?: boolean; reason?: string };
        if (!cancelled) {
          setHandleStatus({
            checking: false,
            available: Boolean(data.available),
            reason: data.reason,
          });
        }
      } catch {
        if (!cancelled) {
          setHandleStatus({ checking: false, available: true });
        }
      }
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, domainMode, sovereignHandle]);

  useEffect(() => {
    let active = true;
    void apiFetch<JsonRecord>("/api/settings")
      .then((settings) => {
        if (!active) return;
        const saved =
          settings.onboarding_state && typeof settings.onboarding_state === "object"
            ? (settings.onboarding_state as OnboardingState)
            : {};
        if (saved.step !== undefined) setStep(Math.max(0, Math.min(4, Number(saved.step))) as OnboardingStep);
        if (saved.goal) setGoal(saved.goal);
        if (saved.domain) setDomain(saved.domain);
        if (saved.mailboxLocal) setMailboxLocal(saved.mailboxLocal);
        if (saved.displayName) setDisplayName(saved.displayName);
        if (saved.dnsProvider) setDnsProvider(saved.dnsProvider);
        if (saved.mailboxAddress) setMailboxAddress(saved.mailboxAddress);
        if (saved.domainStatus) setDomainStatus(saved.domainStatus);
        if (saved.domain) {
          const requestId = ++domainStatusRequest.current;
          void apiFetch<DomainStatusResponse>(`/api/domains/dns-records?domain=${encodeURIComponent(saved.domain)}`)
            .then((status) => {
              if (!active || requestId !== domainStatusRequest.current) return;
              setDomainStatusData(status);
              setDomainStatus(status.verified ? "ready" : status.ownershipVerified ? "verified" : "pending");
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 2 || !domain) return;
    let active = true;
    const requestId = ++domainStatusRequest.current;
    void apiFetch<DomainStatusResponse>(
      `/api/domains/dns-records?domain=${encodeURIComponent(canonicalDomain(domain))}`,
    )
      .then((status) => {
        if (!active || requestId !== domainStatusRequest.current) return;
        setDomainStatusData(status);
        setDomainStatus(status.verified ? "ready" : status.ownershipVerified ? "verified" : "pending");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [domain, step]);

  const persist = useCallback(
    async (patch: Partial<OnboardingState>) => {
      const next = { step, goal, domain, mailboxLocal, displayName, dnsProvider, domainStatus, mailboxAddress, ...patch };
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ onboarding_state: next }) });
    },
    [step, goal, domain, mailboxLocal, displayName, dnsProvider, domainStatus, mailboxAddress],
  );

  async function advance(nextStep: OnboardingStep, patch: Partial<OnboardingState> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await persist({ ...patch, step: nextStep });
      if (patch.domain) setDomain(patch.domain);
      if (patch.goal) setGoal(patch.goal);
      if (patch.dnsProvider) setDnsProvider(patch.dnsProvider);
      if (patch.domainStatus) setDomainStatus(patch.domainStatus);
      setStep(nextStep);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your progress could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function skipSetup() {
    setBusy(true);
    setError("");
    try {
      await persist({ completed: true, skipped: true, step: 4 });
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Setup could not be skipped");
    } finally {
      setBusy(false);
    }
  }

  async function claimSovereignHandle() {
    const clean = sovereignHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean || clean.length < 2) {
      setError("Choose a handle with at least 2 characters (letters, numbers, or hyphens).");
      return;
    }
    if (handleStatus.available === false) {
      setError(handleStatus.reason || "That handle is already taken. Try another one.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await apiFetch<{ address?: string; sovereignDomain?: string }>("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify({
          sovereignHandle: clean,
          displayName: displayName.trim() || clean,
        }),
      });
      const createdAddress = created.address || `${clean}@postveil.me`;
      const createdDomain = created.sovereignDomain || `${clean}.postveil.me`;
      setMailboxAddress(createdAddress);
      setDomain(createdDomain);
      setDomainStatus("ready");
      await persist({
        step: 4,
        completed: true,
        goal,
        domain: createdDomain,
        mailboxLocal: clean,
        displayName: displayName.trim() || clean,
        mailboxAddress: createdAddress,
        domainStatus: "ready",
      });
      try {
        sessionStorage.removeItem("postveil_claimed_handle");
      } catch {
        // ignore
      }
      onComplete();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not claim sovereign handle");
    } finally {
      setBusy(false);
    }
  }

  async function createMailbox() {
    const cleanDomain = canonicalDomain(domain);
    const cleanLocal = mailboxLocal.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(cleanLocal)) {
      setError("Use letters, numbers, dots, hyphens, or underscores for the mailbox name.");
      return;
    }
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(cleanDomain)) {
      setError("Enter a domain such as yourcompany.com.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await apiFetch<{ address?: string }>("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify({ address: `${cleanLocal}@${cleanDomain}`, displayName }),
      });
      const createdAddress = created.address || `${cleanLocal}@${cleanDomain}`;
      setMailboxAddress(createdAddress);
      await persist({
        step: 4,
        domain: cleanDomain,
        mailboxLocal: cleanLocal,
        displayName,
        mailboxAddress: createdAddress,
        domainStatus: "pending",
      });
      setStep(4);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Mailbox could not be created");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDomain() {
    const cleanDomain = canonicalDomain(domain);
    if (!cleanDomain) return;
    setDnsRefreshBusy(true);
    setError("");
    const requestId = ++domainStatusRequest.current;
    try {
      const status = await apiFetch<DomainStatusResponse>("/api/domains/verification/refresh", {
        method: "POST",
        body: JSON.stringify({ domain: cleanDomain, provider: dnsProvider }),
      });
      if (requestId !== domainStatusRequest.current) return;
      setDomainStatusData(status);
      setDomainStatus(status.verified ? "ready" : status.ownershipVerified ? "verified" : "pending");
      setNotice(
        status.verified
          ? "Domain DNS and inbound routing are ready."
          : status.inboundRouteStatus === "pending"
          ? "The DNS is visible, but the inbound route is not connected yet."
          : "Postveil is still waiting for the required DNS records.",
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The domain could not be checked");
    } finally {
      setDnsRefreshBusy(false);
    }
  }

  async function copyRecord(record: DomainRecord) {
    const value = [
      record.type || "DNS",
      record.name || "@",
      record.content || "",
      record.priority ? `priority ${record.priority}` : "",
    ]
      .filter(Boolean)
      .join("\t");
    await navigator.clipboard.writeText(value);
    setCopiedRecord(value);
    window.setTimeout(() => setCopiedRecord((current) => (current === value ? null : current)), 1800);
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      // Re-run the promotion immediately before leaving onboarding. This
      // closes the race where verification succeeds while the mailbox list
      // still contains the pre-verification can_send=false snapshot.
      if (domain) await refreshDomain();
      await persist({ completed: true, step: 4 });
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Setup could not be completed");
    } finally {
      setBusy(false);
    }
  }

  const cleanDomain = canonicalDomain(domain);
  const registrarGuide = DNS_PROVIDER_GUIDES[dnsProvider] || DNS_PROVIDER_GUIDES.Other;

  return (
    <main className="onboarding-shell">
      <section className="onboarding-frame" aria-labelledby="onboarding-title">
        <aside className="onboarding-rail">
          <div className="onboarding-brand">
            <BrandMark />
            <div>
              <strong>Postveil</strong>
              <span>private mail</span>
            </div>
          </div>
          <div className="onboarding-rail-copy">
            <p className="eyebrow">FIRST RUN / {new Date().getFullYear()}</p>
            <h1 id="onboarding-title">
              Your domain,
              <br />
              <em>properly addressed.</em>
            </h1>
            <p>
              Claim your free <strong>username.postveil.me</strong> sovereign identity in one click, or connect a custom domain you already own.
            </p>
          </div>
          <div className="onboarding-rail-foot">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>No provider credentials appear here.</span>
          </div>
        </aside>
        <div className="onboarding-content">
          <header className="onboarding-header">
            <div>
              <span className="onboarding-step-count">0{step + 1} / 05</span>
              <strong>{ONBOARDING_STEPS[step].label}</strong>
              <small>{ONBOARDING_STEPS[step].note}</small>
            </div>
            <button
              type="button"
              className="text-button onboarding-save-later"
              onClick={() => void skipSetup()}
              disabled={busy}
            >
              Save and finish later <ArrowRight size={13} />
            </button>
          </header>
          <div className="onboarding-progress" aria-label={`Step ${step + 1} of 5`}>
            {ONBOARDING_STEPS.map((item, index) => (
              <span key={item.label} className={index <= step ? "complete" : ""} />
            ))}
          </div>
          <div className="onboarding-body">
            {step === 0 && (
              <>
                <p className="eyebrow">LET’S SET THE ROOM</p>
                <h2>What are you setting up?</h2>
                <p className="onboarding-lede">This only tunes the starting view. You can change everything later.</p>
                <div className="onboarding-choice-grid" role="radiogroup" aria-label="Setup goal">
                  <button
                    type="button"
                    className={`onboarding-choice${goal === "personal" ? " selected" : ""}`}
                    onClick={() => setGoal("personal")}
                  >
                    <Mail size={20} />
                    <span>
                      <strong>Personal address</strong>
                      <small>One domain, one focused inbox.</small>
                    </span>
                    {goal === "personal" && <Check size={17} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={`onboarding-choice${goal === "team" ? " selected" : ""}`}
                    onClick={() => setGoal("team")}
                  >
                    <Building2 size={20} />
                    <span>
                      <strong>Team mailbox</strong>
                      <small>Shared addresses and delegated access.</small>
                    </span>
                    {goal === "team" && <Check size={17} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={`onboarding-choice${goal === "explore" ? " selected" : ""}`}
                    onClick={() => setGoal("explore")}
                  >
                    <Globe2 size={20} />
                    <span>
                      <strong>Explore first</strong>
                      <small>See the shape before connecting a domain.</small>
                    </span>
                    {goal === "explore" && <Check size={17} aria-hidden="true" />}
                  </button>
                </div>
                <div className="onboarding-actions">
                  <button className="primary-button" type="button" onClick={() => void advance(1, { goal })} disabled={busy}>
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <p className="eyebrow">THE NAME PEOPLE WILL USE</p>
                <h2>Choose your address path</h2>
                <p className="onboarding-lede">
                  Claim a free <strong>.postveil.me</strong> sovereign subdomain instantly (zero DNS setup required), or connect a custom domain you control.
                </p>

                <div className="onboarding-choice-grid" role="radiogroup" aria-label="Domain path" style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    className={`onboarding-choice${domainMode === "sovereign" ? " selected" : ""}`}
                    onClick={() => {
                      setDomainMode("sovereign");
                      setError("");
                    }}
                  >
                    <Sparkles size={20} />
                    <span>
                      <strong>Free .postveil.me Identity (Instant)</strong>
                      <small>Includes username@postveil.me + *@username.postveil.me wildcard routing.</small>
                    </span>
                    {domainMode === "sovereign" && <Check size={17} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={`onboarding-choice${domainMode === "custom" ? " selected" : ""}`}
                    onClick={() => {
                      setDomainMode("custom");
                      setError("");
                    }}
                  >
                    <Globe2 size={20} />
                    <span>
                      <strong>Connect Custom Domain</strong>
                      <small>Bring yourcompany.com via guided MX, SPF, DKIM & DMARC records.</small>
                    </span>
                    {domainMode === "custom" && <Check size={17} aria-hidden="true" />}
                  </button>
                </div>

                {domainMode === "sovereign" ? (
                  <>
                    <label className="onboarding-field">
                      Claim your handle
                      <div className="email-composer">
                        <input
                          autoFocus
                          value={sovereignHandle}
                          onChange={(event) => {
                            setSovereignHandle(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32));
                            setError("");
                          }}
                          placeholder="yourname"
                          autoComplete="username"
                        />
                        <span>.postveil.me</span>
                      </div>
                    </label>
                    <label className="onboarding-field">
                      Display name
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value.slice(0, 120))}
                        placeholder="Your name or studio"
                        autoComplete="name"
                      />
                    </label>
                    <div className="onboarding-hint">
                      <ShieldCheck size={17} />
                      <span>
                        {handleStatus.checking ? (
                          <>Checking availability for <strong>{sovereignHandle || "yourname"}.postveil.me</strong>…</>
                        ) : handleStatus.available ? (
                          <>
                            <strong>{sovereignHandle}.postveil.me</strong> is available! You’ll immediately receive{" "}
                            <strong>{sovereignHandle}@postveil.me</strong> and wildcard{" "}
                            <strong>*@{sovereignHandle}.postveil.me</strong>.
                          </>
                        ) : (
                          <>{handleStatus.reason || "Enter at least 2 characters to check availability."}</>
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="onboarding-field">
                      Your domain
                      <input
                        autoFocus
                        value={domain}
                        onChange={(event) => {
                          setDomain(normalizeDomain(event.target.value));
                          setDomainStatusData(null);
                          setDomainStatus("pending");
                        }}
                        placeholder="yourcompany.com"
                        autoComplete="url"
                      />
                    </label>
                    <div className="onboarding-hint">
                      <Globe2 size={17} />
                      <span>
                        Example: if your address is <strong>hello@acme.com</strong>, enter <strong>acme.com</strong>.
                      </span>
                    </div>
                  </>
                )}

                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="onboarding-actions">
                  <button className="secondary-button" type="button" onClick={() => setStep(0)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  {domainMode === "sovereign" ? (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void claimSovereignHandle()}
                      disabled={busy || handleStatus.checking || handleStatus.available === false}
                    >
                      {busy ? "Provisioning inbox…" : `Claim ${sovereignHandle || "handle"}.postveil.me & Open Inbox`}{" "}
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        if (!cleanDomain || !cleanDomain.includes(".")) {
                          setError("Enter a domain such as yourcompany.com.");
                          return;
                        }
                        void advance(2, { domain: cleanDomain });
                      }}
                      disabled={busy}
                    >
                      Review connection <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <p className="eyebrow">A SAFE DNS HANDOFF</p>
                <h2>Connect {cleanDomain || "your domain"} to Postveil.</h2>
                <p className="onboarding-lede">
                  You keep your website, registrar, and passwords exactly where they are. Postveil only needs the mail records shown below.
                </p>
                <div className="onboarding-provider-row">
                  <label className="onboarding-label" htmlFor="dns-provider">
                    Where do you manage DNS?
                  </label>
                  <select
                    id="dns-provider"
                    name="dnsProvider"
                    value={dnsProvider}
                    onChange={(event) => {
                      setDnsProvider(event.target.value);
                      setDomainStatusData(null);
                      setDomainStatus("pending");
                    }}
                  >
                    {DNS_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="registrar-guide">
                  <div className="registrar-guide-head">
                    <div>
                      <span className="eyebrow">YOUR REGISTRAR GUIDE</span>
                      <h3>{dnsProvider}</h3>
                    </div>
                    <Globe2 size={20} aria-hidden="true" />
                  </div>
                  <p>
                    <strong>Open:</strong> {registrarGuide.path}
                  </p>
                  <p>
                    <strong>Then:</strong> {registrarGuide.where}. Add the TXT verification record and the mail records below.
                  </p>
                  <small>{registrarGuide.note}</small>
                  <div className="registrar-safety">
                    <ShieldCheck size={14} />
                    <span>
                      <strong>No nameserver change.</strong> Keep your current nameservers and website records.
                    </span>
                  </div>
                </div>
                <div className="dns-preview">
                  <div className="dns-preview-head">
                    <div>
                      <strong>Connection checklist</strong>
                      <small>Postveil checks ownership, receiving, and sender authentication separately.</small>
                    </div>
                    <span className={domainStatus === "ready" ? "verified-badge" : "pending-badge"}>
                      {domainStatus === "ready" ? "Ready" : domainStatus === "verified" ? "DNS found" : "Pending"}
                    </span>
                  </div>
                  <div className="dns-row">
                    <span className="dns-mark">
                      <Mail size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Domain records</strong>
                      <small>
                        {domainStatusData?.dnsReady
                          ? "Your public mail records are visible."
                          : "Add every MX, SPF, DKIM, and DMARC record shown below."}
                      </small>
                    </div>
                    <span>{domainStatusData?.dnsReady ? "Found" : "Next"}</span>
                  </div>
                  <div className="dns-row">
                    <span className="dns-mark">
                      <ShieldCheck size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Postveil receiving service</strong>
                      <small>
                        {domainStatusData?.routeReady
                          ? `Receiving is connected to ${domainStatusData.routeTarget || "Postveil"}.`
                          : "Still waiting for Postveil to activate receiving for this domain."}
                      </small>
                    </div>
                    <span>{domainStatusData?.routeReady ? "Ready" : "Needs activation"}</span>
                  </div>
                  {(domainStatusData?.records || domainStatusData?.manualRecords || []).slice(0, 8).map((record, index) => {
                    const recordText = [
                      record.type || "DNS",
                      record.name || "@",
                      record.content || "",
                      record.priority ? `priority ${record.priority}` : "",
                    ]
                      .filter(Boolean)
                      .join("\t");
                    return (
                      <div className="dns-record-row" key={`${record.type}-${record.name}-${record.content}-${index}`}>
                        <span>{record.purpose || record.type || "DNS"}</span>
                        <code>{record.name || "@"}</code>
                        <code>
                          {record.content || ""}
                          {record.priority ? ` · priority ${record.priority}` : ""}
                        </code>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Copy ${record.purpose || record.type || "DNS"} record`}
                          onClick={() => void copyRecord(record)}
                        >
                          {copiedRecord === recordText ? (
                            "Copied"
                          ) : (
                            <>
                              <Copy size={14} aria-hidden="true" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  <div className="dns-preview-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void refreshDomain()}
                      disabled={dnsRefreshBusy || busy}
                    >
                      {dnsRefreshBusy ? "Checking…" : "Check connection"}
                    </button>
                  </div>
                </div>
                <div className="onboarding-hint">
                  <ShieldAlert size={17} aria-hidden="true" />
                  <span>
                    DNS changes usually appear within minutes, but can take up to 24–48 hours. Postveil will not enable sending or receiving until its receiving service confirms the connection.
                  </span>
                </div>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="onboarding-actions">
                  <button className="secondary-button" type="button" onClick={() => setStep(1)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void advance(3, { dnsProvider, domainStatus })}
                    disabled={busy || dnsRefreshBusy || domainStatus !== "ready"}
                  >
                    Continue to mailbox <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <p className="eyebrow">MAKE IT YOURS</p>
                <h2>Choose your first address.</h2>
                <p className="onboarding-lede">You can add aliases and shared addresses after this one is working.</p>
                <label className="onboarding-field">
                  Mailbox name
                  <div className="email-composer">
                    <input
                      autoFocus
                      value={mailboxLocal}
                      onChange={(event) =>
                        setMailboxLocal(event.target.value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64))
                      }
                      placeholder="hello"
                      autoComplete="username"
                    />
                    <span>@{cleanDomain || "your-domain.com"}</span>
                  </div>
                </label>
                <label className="onboarding-field">
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value.slice(0, 120))}
                    placeholder="Your name or team"
                    autoComplete="organization"
                  />
                </label>
                <div className="onboarding-hint">
                  <Mail size={17} />
                  <span>
                    Your new address will be <strong>{mailboxLocal || "hello"}@{cleanDomain || "your-domain.com"}</strong>.
                  </span>
                </div>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="onboarding-actions">
                  <button className="secondary-button" type="button" onClick={() => setStep(2)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void createMailbox()}
                    disabled={busy || !mailboxLocal}
                  >
                    {busy ? "Creating…" : "Create address"} <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <div className="onboarding-success-mark">
                  <Check size={24} />
                </div>
                <p className="eyebrow">{domainStatus === "pending" ? "ADDRESS RESERVED" : "MAILBOX CREATED"}</p>
                <h2>{mailboxAddress || `${mailboxLocal}@${cleanDomain}`} is yours.</h2>
                <p className="onboarding-lede">
                  {domainStatus === "pending"
                    ? "The address is reserved, but sending and receiving stay disabled until the domain connection is complete."
                    : "Your mailbox is created. Postveil will enable mail only after DNS and receiving-service checks both pass."}
                </p>
                <div className="onboarding-next-list">
                  <div>
                    <Check size={16} />
                    <span>
                      <strong>{domainStatus === "pending" ? "Address reserved" : "Mailbox created"}</strong>
                      <small>
                        {domainStatus === "pending"
                          ? "Verification is required before mail can flow."
                          : "Your address is available in Postveil."}
                      </small>
                    </span>
                  </div>
                  <div className={domainStatus === "ready" ? "ready" : "pending"}>
                    <span className="onboarding-number">02</span>
                    <span>
                      <strong>Connect DNS</strong>
                      <small>{dnsProvider} · MX, SPF, DKIM, and DMARC</small>
                    </span>
                    <span className="pending-badge">{domainStatus === "ready" ? "Ready" : "Next"}</span>
                  </div>
                  <div>
                    <span className="onboarding-number">03</span>
                    <span>
                      <strong>Send your first message</strong>
                      <small>We’ll check delivery and authentication together.</small>
                    </span>
                  </div>
                </div>
                {notice && (
                  <div className="form-notice" role="status">
                    {notice}
                  </div>
                )}
                <div className="onboarding-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setNotice("DNS setup will remain on your checklist.");
                      setStep(2);
                    }}
                  >
                    <ArrowLeft size={16} /> Review DNS
                  </button>
                  <button className="primary-button" type="button" onClick={() => void finish()} disabled={busy}>
                    Open my mailbox <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
          <footer className="onboarding-footer">
            <span>Signed in as {session.user.email || "your account"}</span>
            <span>
              <ShieldCheck size={13} /> Private by default
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
