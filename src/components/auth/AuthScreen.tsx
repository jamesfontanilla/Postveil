import { useState, useRef, useEffect, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
import BrandMark from "../BrandMark";
import { TURNSTILE_SITE_KEY } from "../../types/mail";
import { publicApiFetch, recordExplicitSignIn } from "../../lib/api";
import { requireSupabase } from "../../lib/supabase";

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
      } else {
        if (mode === "signup" && !captchaToken) throw new Error("Complete the security check before creating an account");
        const result =
          mode === "signin"
            ? await client.auth.signInWithPassword({ email, password })
            : await client.auth.signUp({ email, password, options: { captchaToken } });
        if (result.error) throw result.error;
        if (mode === "signin") await recordExplicitSignIn(result.data.session, "password");
        if (mode === "signup" && !result.data.session) {
          setVerificationEmail(email.trim());
          setVerificationPending(true);
          setResendCooldown(45);
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
        body: JSON.stringify({ email, password }),
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
            <span className="active">Account</span>
            <span>Verify</span>
            <span>Set up</span>
          </div>
        )}
        <p className="eyebrow">PRIVATE MAIL / {new Date().getFullYear()}</p>
        <h1>{mode === "signup" ? "Start with your account." : mode === "forgot" || mode === "recovery" ? "Get back in safely." : "Keep your address close."}</h1>
        <p className="auth-copy">
          {mode === "signup"
            ? "Create your Postveil account first. We’ll verify your email, then guide you through connecting a domain."
            : mode === "forgot"
            ? "We’ll send a one-time reset link to your sign-in address or a verified recovery email."
            : mode === "recovery"
            ? "Use one unused recovery code to request a one-time password reset link."
            : "A focused mailbox for your custom domain. Sign in to open messages across desktop and mobile."}
        </p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
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
          <button className="primary-button" disabled={busy}>
            {busy ? "Working…" : mode === "forgot" ? "Send reset link" : mode === "recovery" ? "Request recovery link" : mode === "signin" ? "Open mailbox" : "Create account"}
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
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
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
          <span className="status-dot" /> system ready
        </div>
        <p className="aside-quote">“The inbox is the room where your attention either gathers or scatters.”</p>
        <p className="aside-meta">Your messages stay private, organized, and addressed to the names you chose.</p>
      </aside>
    </main>
  );
}
