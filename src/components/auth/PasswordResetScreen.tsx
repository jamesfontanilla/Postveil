import { useState, type FormEvent } from "react";
import BrandMark from "../BrandMark";
import { publicApiFetch } from "../../lib/api";
import { requireSupabase } from "../../lib/auth";

export default function PasswordResetScreen({ onComplete, token }: { onComplete: () => void; token?: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 12 characters with at least one letter and one number.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (token) {
        await publicApiFetch("/api/auth/complete-password-reset", { method: "POST", body: JSON.stringify({ token, password }) });
      } else {
        const result = await requireSupabase().auth.updateUser({ password });
        if (result.error) throw result.error;
      }
      setNotice("Password updated. Sign in again with your new password.");
      setCompleted(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <BrandMark />
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password.</h1>
        <p className="auth-copy">This link is temporary. Set a strong password, then sign in again on your other devices.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            New password
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="12+ characters with a number"
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              required
              minLength={12}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              placeholder="Type it again"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          {completed ? (
            <button type="button" className="primary-button" onClick={onComplete}>
              Continue to mailbox
            </button>
          ) : (
            <button className="primary-button" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>
          )}
        </form>
      </section>
      <aside className="auth-aside">
        <div className="aside-note">
          <span className="status-dot" /> protected recovery
        </div>
        <p className="aside-quote">One link. One new password. Back to your mailbox.</p>
        <p className="aside-meta">Postveil never reveals whether an email address has an account.</p>
      </aside>
    </main>
  );
}
