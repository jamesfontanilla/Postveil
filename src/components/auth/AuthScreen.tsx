import { useState, useRef, useEffect, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Globe2, Loader2, Mail, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import BrandMark from "../BrandMark";
import { TURNSTILE_SITE_KEY } from "../../types/mail";
import { publicApiFetch, recordExplicitSignIn } from "../../lib/api";
import { requireSupabase } from "../../lib/auth";

type SignupIdentityType = "sovereign" | "custom";

export default function AuthScreen({
  initialMode = "signin",
  initialNotice = "",
  onBack,
}: {
  initialMode?: "signin" | "signup";
  initialNotice?: string;
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "recovery">(initialMode);
  const [identityType, setIdentityType] = useState<SignupIdentityType>("sovereign");
  const [sovereignHandle, setSovereignHandle] = useState(() => {
    try {
      const claimed = sessionStorage.getItem("postveil_claimed_handle");
      if (claimed) {
        return claimed
          .replace(/\.postveil\.me$/i, "")
          .replace(/@postveil\.me$/i, "")
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "");
      }
    } catch {
      // Ignore storage access errors
    }
    return "";
  });
  const [displayName, setDisplayName] = useState("");
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [handleReason, setHandleReason] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetId = useRef<string | null>(null);

  const passwordChecks = {
    length: password.length >= 12,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (mode !== "signup" || identityType !== "sovereign") return undefined;
    const clean = sovereignHandle.trim().toLowerCase();
    if (!clean) {
      setHandleStatus("idle");
      setHandleReason("");
      return undefined;
    }
    if (clean.length < 3) {
      setHandleStatus("unavailable");
      setHandleReason("Handle must be at least 3 characters");
      return undefined;
    }
    setHandleStatus("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await publicApiFetch<{ available: boolean; reason?: string | null }>(
          `/api/auth/check-handle?handle=${encodeURIComponent(clean)}`,
        );
        if (cancelled) return;
        if (res.available) {
          setHandleStatus("available");
          setHandleReason("");
        } else {
          setHandleStatus("unavailable");
          setHandleReason(res.reason || `@${clean}.postveil.me is unavailable`);
        }
      } catch {
        if (!cancelled) {
          setHandleStatus("available");
          setHandleReason("");
        }
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sovereignHandle, mode, identityType]);

  useEffect(() => {
    if (mode !== "signup") return undefined;
    let disposed = false;
    const renderWidget = () => {
      if (disposed || !captchaRef.current || !window.turnstile || captchaWidgetId.current) return;
      captchaWidgetId.current = window.turnstile.render(captchaRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        size: "flexible",
        callback: (token) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => {
          setCaptchaToken("");
          setError("The security check is temporarily unavailable. Try again.");
        },
      });
    };
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-postveil-turnstile]");
    if (window.turnstile) renderWidget();
    else if (existingScript) existingScript.addEventListener("load", renderWidget, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.postveilTurnstile = "true";
      script.addEventListener("load", renderWidget, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      if (captchaWidgetId.current && window.turnstile?.remove) window.turnstile.remove(captchaWidgetId.current);
      captchaWidgetId.current = null;
      setCaptchaToken("");
    };
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = requireSupabase();
      if (mode === "forgot") {
        const redirectTo = window.location.origin;
        const reset = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (reset.error) throw reset.error;
        await publicApiFetch("/api/auth/recovery-request", {
          method: "POST",
          body: JSON.stringify({ email }),
        }).catch(() => undefined);
        setNotice("If that address is registered, a reset link will arrive shortly. Check your inbox and spam folder.");
      } else if (mode === "recovery") {
        await publicApiFetch("/api/auth/mfa-recovery", { method: "POST", body: JSON.stringify({ email, code: recoveryCode }) });
        setNotice("If the details are valid, a recovery link will arrive shortly. Check your inbox.");
      } else if (mode === "signin") {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        await recordExplicitSignIn(result.data.session, "password");
      } else {
        if (!captchaToken) throw new Error("Complete the security check before creating an account");
        if (identityType === "sovereign") {
          const clean = sovereignHandle.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
          if (clean.length < 3) throw new Error("Choose a handle of at least 3 characters");
          const targetEmail = `${clean}@postveil.me`;
          const result = await client.auth.signUp({
            email: targetEmail,
            password,
            options: {
              handle: clean,
              displayName: displayName.trim() || clean,
              captchaToken,
            },
          });
          if (result.error) throw result.error;
          try {
            sessionStorage.removeItem("postveil_claimed_handle");
          } catch {
            // ignore
          }
          if (result.data.session) {
            await recordExplicitSignIn(result.data.session, "password");
          }
        } else {
          const result = await client.auth.signUp({
            email: email.trim(),
            password,
            options: {
              displayName: displayName.trim(),
              captchaToken,
            },
          });
          if (result.error) throw result.error;
          if (!result.data.session) {
            setVerificationEmail(email.trim());
            setVerificationPending(true);
            setResendCooldown(45);
          }
        }
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (resendCooldown > 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await publicApiFetch<{ message?: string }>("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: verificationEmail || email, password }),
      });
      setNotice(result.message || "If the account can receive mail, a verification link will arrive shortly.");
      setResendCooldown(45);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not resend the verification email");
    } finally {
      setBusy(false);
    }
  }

  if (verificationPending && mode === "signup")
    return (
      <main className="auth-shell auth-shell-verification">
        <section className="auth-card auth-verification-card">
          <BrandMark />
          <div className="auth-journey" aria-label="Signup progress">
            <span className="active">Account</span>
            <span className="active">Verify</span>
            <span>Set up</span>
          </div>
          <div className="auth-verification-icon">
            <Mail size={24} aria-hidden="true" />
          </div>
          <p className="eyebrow">STEP 2 / 3 · CHECK YOUR INBOX</p>
          <h1>Confirm your email.</h1>
          <p className="auth-copy">
            We sent a verification link to <strong>{verificationEmail}</strong>. Confirm it before you choose a domain or create a mailbox.
          </p>
          <div className="auth-verification-next">
            <div>
              <span className="auth-verification-number">01</span>
              <span>
                <strong>Open the message</strong>
                <small>Look for “Verify your Postveil email address.”</small>
              </span>
            </div>
            <div>
              <span className="auth-verification-number">02</span>
              <span>
                <strong>Confirm the address</strong>
                <small>The link is single-use and stays valid for 24 hours.</small>
              </span>
            </div>
            <div>
              <span className="auth-verification-number">03</span>
              <span>
                <strong>Start your mailbox</strong>
                <small>We’ll take you straight into the five-step setup.</small>
              </span>
            </div>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="form-notice" role="status">
              {notice}
            </div>
          )}
          <button
            className="primary-button auth-wide-action"
            type="button"
            onClick={() => {
              setVerificationPending(false);
              setMode("signin");
              setEmail(verificationEmail);
              setPassword("");
              setError("");
              setNotice("After you confirm your email, sign in here to begin setup.");
            }}
          >
            I’ve confirmed — sign in <ArrowRight size={16} />
          </button>
          <button
            className="secondary-button auth-wide-action"
            type="button"
            onClick={() => {
              setVerificationPending(false);
              setEmail("");
              setPassword("");
              setError("");
              setNotice("");
            }}
          >
            Use a different email
          </button>
          <button
            className="text-button auth-link"
            type="button"
            onClick={() => void resendVerification()}
            disabled={busy || resendCooldown > 0}
          >
            {busy ? "Sending…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}
          </button>
          <p className="auth-microcopy">
            <ShieldCheck size={14} aria-hidden="true" /> Your domain setup starts only after your account is verified.
          </p>
        </section>
        <aside className="auth-aside">
          <div className="aside-note">
            <span className="status-dot" /> account first
          </div>
          <p className="aside-quote">A small gate before your domain.</p>
          <p className="aside-meta">
            Postveil asks you to confirm the address you’ll use to manage your private mailbox. No provider credentials are needed here.
          </p>
        </aside>
      </main>
    );

  const previewHandle = sovereignHandle.trim().toLowerCase() || "yourname";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        {onBack && (
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={14} /> Back to overview
          </button>
        )}
        <BrandMark />
        {mode === "signup" && (
          <div className="auth-journey" aria-label="Signup progress">
            <span className="active">Identity</span>
            <span className={identityType === "sovereign" ? "active" : ""}>
              {identityType === "sovereign" ? "Auto-Verified" : "Verify"}
            </span>
            <span className={identityType === "sovereign" ? "active" : ""}>Suite Ready</span>
          </div>
        )}
        <p className="eyebrow">SOVEREIGN SUITE / {new Date().getFullYear()}</p>
        <h1>
          {mode === "signup"
            ? identityType === "sovereign"
              ? "Claim your sovereign handle."
              : "Connect with an existing email."
            : mode === "forgot" || mode === "recovery"
            ? "Get back in safely."
            : "Sign in to your workspace."}
        </h1>
        <p className="auth-copy">
          {mode === "signup"
            ? identityType === "sovereign"
              ? "No external email required. Claim your free @postveil.me mailbox and wildcard *.postveil.me subdomain — provisioned and verified immediately."
              : "Use an existing email address to manage your account and connect a custom domain via DNS."
            : mode === "forgot"
            ? "We’ll send a one-time reset link to your sign-in address or a verified recovery email."
            : mode === "recovery"
            ? "Use one unused recovery code to request a one-time password reset link."
            : "Enter your sovereign handle (e.g. alex, alex@postveil.me, or alex.postveil.me) or custom domain email."}
        </p>

        {mode === "signup" && (
          <div
            role="tablist"
            aria-label="Identity type"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
              padding: "4px",
              background: "rgba(15, 41, 30, 0.06)",
              borderRadius: "10px",
              marginBottom: "16px",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={identityType === "sovereign"}
              onClick={() => {
                setIdentityType("sovereign");
                setError("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "9px 10px",
                borderRadius: "8px",
                border: identityType === "sovereign" ? "1px solid rgba(15, 41, 30, 0.14)" : "1px solid transparent",
                background: identityType === "sovereign" ? "#ffffff" : "transparent",
                color: identityType === "sovereign" ? "#0f291e" : "#52615b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: identityType === "sovereign" ? "0 2px 6px rgba(15, 41, 30, 0.06)" : "none",
              }}
            >
              <Sparkles size={14} />
              <span>Free .postveil.me Handle</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={identityType === "custom"}
              onClick={() => {
                setIdentityType("custom");
                setError("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "9px 10px",
                borderRadius: "8px",
                border: identityType === "custom" ? "1px solid rgba(15, 41, 30, 0.14)" : "1px solid transparent",
                background: identityType === "custom" ? "#ffffff" : "transparent",
                color: identityType === "custom" ? "#0f291e" : "#52615b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: identityType === "custom" ? "0 2px 6px rgba(15, 41, 30, 0.06)" : "none",
              }}
            >
              <Globe2 size={14} />
              <span>Bring Custom Email</span>
            </button>
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && identityType === "sovereign" ? (
            <>
              <label>
                Your Sovereign Handle
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid #c5d2cb",
                    borderRadius: "10px",
                    background: "#ffffff",
                    overflow: "hidden",
                    marginTop: "6px",
                  }}
                >
                  <input
                    type="text"
                    required
                    value={sovereignHandle}
                    onChange={(event) =>
                      setSovereignHandle(
                        event.target.value
                          .toLowerCase()
                          .replace(/\.postveil\.me$/i, "")
                          .replace(/@postveil\.me$/i, "")
                          .replace(/[^a-z0-9._-]/g, "")
                          .slice(0, 32),
                      )
                    }
                    placeholder="yourname"
                    autoComplete="username"
                    style={{
                      border: "none",
                      outline: "none",
                      flex: 1,
                      padding: "11px 12px",
                      fontSize: "15px",
                      fontWeight: 600,
                      background: "transparent",
                    }}
                  />
                  <span
                    style={{
                      padding: "0 12px",
                      color: "#3b5249",
                      fontSize: "13px",
                      fontWeight: 600,
                      background: "#f3f7f4",
                      borderLeft: "1px solid #dce6e0",
                      height: "42px",
                      display: "inline-flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    .postveil.me
                  </span>
                </div>
              </label>

              <div
                style={{
                  background: "#f4f8f5",
                  border: "1px solid #d7e4dc",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "12.5px",
                  color: "#2b3e36",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span>
                    Primary Inbox: <strong>{previewHandle}@postveil.me</strong>
                  </span>
                  {handleStatus === "checking" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#52615b" }}>
                      <Loader2 size={12} className="spin" /> Checking…
                    </span>
                  )}
                  {handleStatus === "available" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#15803d", fontWeight: 600 }}>
                      <Check size={13} /> Available
                    </span>
                  )}
                  {handleStatus === "unavailable" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#b91c1c", fontWeight: 600 }}>
                      <XCircle size={13} /> {handleReason || "Unavailable"}
                    </span>
                  )}
                </div>
                <span style={{ color: "#4d6158" }}>
                  Wildcard Subdomain: <strong>*@{previewHandle}.postveil.me</strong> (Unlimited aliases included)
                </span>
              </div>

              <label>
                Display Name (optional)
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value.slice(0, 80))}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                />
              </label>
            </>
          ) : (
            <label>
              {mode === "signin" ? "Sovereign handle or email address" : "Email address"}
              <input
                type={mode === "signin" ? "text" : "email"}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={mode === "signin" ? "alex, alex@postveil.me, or you@domain.com" : "you@yourdomain.com"}
                autoComplete="username"
              />
            </label>
          )}
          {mode !== "forgot" && mode !== "recovery" && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={mode === "signup" ? 12 : 6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "12+ characters with a number" : "Your password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              {mode === "signup" && (
                <span className="auth-password-checks" aria-live="polite">
                  <span className={passwordChecks.length ? "met" : ""}>
                    <Check size={12} /> 12+ characters
                  </span>
                  <span className={passwordChecks.letter ? "met" : ""}>
                    <Check size={12} /> One letter
                  </span>
                  <span className={passwordChecks.number ? "met" : ""}>
                    <Check size={12} /> One number
                  </span>
                </span>
              )}
            </label>
          )}
          {mode === "recovery" && (
            <label>
              Recovery code
              <input
                value={recoveryCode}
                onChange={(event) =>
                  setRecoveryCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9-]/g, "")
                      .slice(0, 14),
                  )
                }
                placeholder="ABCD-EFGH-JKLM"
                autoComplete="one-time-code"
              />
            </label>
          )}
          {mode === "signup" && (
            <div className="auth-turnstile">
              <div ref={captchaRef} />
              <small>Protected by Cloudflare Turnstile. We use it only to reduce automated signups.</small>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          <button
            className="primary-button"
            disabled={busy || (mode === "signup" && identityType === "sovereign" && handleStatus === "unavailable")}
          >
            {busy
              ? "Provisioning…"
              : mode === "forgot"
              ? "Send reset link"
              : mode === "recovery"
              ? "Request recovery link"
              : mode === "signin"
              ? "Open workspace"
              : identityType === "sovereign"
              ? `Claim ${previewHandle}.postveil.me & Open Suite`
              : "Create account"}
          </button>
          {mode === "signup" && notice && (
            <button type="button" className="text-button auth-link" onClick={() => void resendVerification()} disabled={busy}>
              Resend verification email
            </button>
          )}
        </form>
        {(mode === "signin" || mode === "signup") && (
          <>
            <div className="oauth-divider">
              <span>or</span>
            </div>
            <button
              type="button"
              className="google-button"
              onClick={() => {
                window.location.assign("/api/auth/google/start");
              }}
              disabled={busy}
            >
              <span className="google-g" aria-hidden="true">
                G
              </span>
              Continue with Google
            </button>
          </>
        )}
        {mode === "signin" && (
          <button
            className="text-button auth-link"
            onClick={() => {
              setMode("forgot");
              setError("");
              setNotice("");
            }}
          >
            Forgot your password?
          </button>
        )}
        {mode === "signin" && (
          <button
            className="text-button auth-link"
            onClick={() => {
              setMode("recovery");
              setError("");
              setNotice("");
            }}
          >
            Use a recovery code
          </button>
        )}
        {mode !== "forgot" && mode !== "recovery" && (
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
              setNotice("");
            }}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Claim a free .postveil.me handle"}
          </button>
        )}
        {(mode === "forgot" || mode === "recovery") && (
          <button
            className="text-button"
            onClick={() => {
              setMode("signin");
              setError("");
              setNotice("");
              setRecoveryCode("");
            }}
          >
            Back to sign in
          </button>
        )}
      </section>
      <aside className="auth-aside">
        <div className="aside-note">
          <span className="status-dot" /> sovereign edge ready
        </div>
        <p className="aside-quote">“One sovereign identity. Twenty private pillars. Zero corporate surveillance.”</p>
        <p className="aside-meta">
          Every <strong>username.postveil.me</strong> handle includes an instant primary inbox, unlimited wildcard aliases, and local-first OPFS encryption.
        </p>
      </aside>
    </main>
  );
}
