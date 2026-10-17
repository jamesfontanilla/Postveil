import { useState, useEffect, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import BrandMark from "../BrandMark";
import type { MfaFactor } from "../../types/mail";
import { requireSupabase } from "../../lib/auth";
import { qrImageSource } from "../../lib/qr";

export function MfaSetupRequiredScreen({ onVerified }: { onVerified: () => void }) {
  const [setup, setSetup] = useState<{ id: string; qrCode: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const result = await requireSupabase().auth.mfa.enroll({ factorType: "totp", friendlyName: "Postveil authenticator" });
      if (result.error) throw result.error;
      setSetup({ id: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret, uri: result.data.totp.uri });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Administrator MFA setup is unavailable");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void begin();
  }, []);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!setup || code.length !== 6) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const challenge = await requireSupabase().auth.mfa.challenge({ factorId: setup.id });
      if (challenge.error) throw challenge.error;
      const result = await requireSupabase().auth.mfa.verify({ factorId: setup.id, challengeId: challenge.data.id, code });
      if (result.error) throw result.error;
      const refreshed = await requireSupabase().auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      onVerified();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "That authenticator code was not accepted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <BrandMark />
        <p className="eyebrow">ADMINISTRATOR MFA</p>
        <h1>Protect workspace administration.</h1>
        <p className="auth-copy">
          Administrator access requires a verified authenticator app. Your mailbox stays available, but workspace changes remain locked until this one-time setup is complete.
        </p>
        {setup ? (
          <form onSubmit={verify} className="auth-form mfa-required-form">
            <div className="mfa-setup-key">
              <strong>1. Add Postveil to your authenticator</strong>
              <small>Scan the QR code if your authenticator supports it, or enter the setup key manually.</small>
              {setup.qrCode && qrImageSource(setup.qrCode) && (
                <img className="mfa-qr" src={qrImageSource(setup.qrCode)} alt="QR code for administrator MFA" />
              )}
              {!setup.qrCode && <div className="mfa-qr-fallback">Use the setup key below. It is shown only during this setup.</div>}
              <code>{setup.secret}</code>
              <details>
                <summary>Show authenticator URI</summary>
                <code>{setup.uri}</code>
              </details>
            </div>
            <label>
              2. Enter the six-digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify and protect admin access"}
            </button>
          </form>
        ) : (
          <>
            <div className="form-error" role="alert">
              {error || "Preparing your secure setup…"}
            </div>
            <button className="secondary-button" onClick={() => void begin()} disabled={busy}>
              {busy ? "Preparing…" : "Try again"}
            </button>
          </>
        )}
        <p className="auth-microcopy">
          <ShieldCheck size={14} aria-hidden="true" /> TOTP secrets are encrypted before storage and are never sent to a third party.
        </p>
      </section>
      <aside className="auth-aside">
        <div className="aside-note">
          <span className="status-dot" /> workspace protection
        </div>
        <p className="aside-quote">Your password is only the first lock.</p>
        <p className="aside-meta">
          Keep your authenticator available. Passkeys can be added later when the WebAuthn credential service is enabled.
        </p>
      </aside>
    </main>
  );
}

export function MfaChallengeScreen({ onVerified }: { onVerified: () => void }) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void requireSupabase()
      .auth.mfa.listFactors()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        const verified = ([...(data?.totp || []), ...(data?.phone || [])] as MfaFactor[]).filter(
          (item) => item.status === "verified",
        );
        setFactors(verified);
        setFactorId(verified[0]?.id || "");
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId || code.replace(/\D/g, "").length !== 6) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const challenge = await requireSupabase().auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await requireSupabase().auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.replace(/\D/g, "") });
      if (verified.error) throw verified.error;
      const refreshed = await requireSupabase().auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      onVerified();
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "That code was not accepted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <BrandMark />
        <p className="eyebrow">SECOND STEP</p>
        <h1>Confirm it’s you.</h1>
        <p className="auth-copy">Open your authenticator app and enter the six-digit code to continue to Postveil.</p>
        {factors.length > 1 && (
          <label>
            Authenticator
            <select value={factorId} onChange={(event) => setFactorId(event.target.value)}>
              {factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.friendly_name || "Authenticator app"}
                </option>
              ))}
            </select>
          </label>
        )}
        <form onSubmit={submit} className="auth-form">
          <label>
            Authentication code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={busy || !factorId}>
            {busy ? "Checking…" : "Verify and open mailbox"}
          </button>
        </form>
        <button className="text-button" onClick={() => void requireSupabase().auth.signOut()}>
          Sign out
        </button>
      </section>
      <aside className="auth-aside">
        <div className="aside-note">
          <span className="status-dot" /> two-step verification
        </div>
        <p className="aside-quote">Your password is only the first lock.</p>
        <p className="aside-meta">
          Keep your authenticator app available. Recovery email is for resetting access, not a replacement for the second factor.
        </p>
      </aside>
    </main>
  );
}
