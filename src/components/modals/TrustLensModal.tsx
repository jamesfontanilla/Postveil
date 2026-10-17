import { ShieldAlert, X } from "lucide-react";
import type { TrustData } from "../../types/mail";

export default function TrustLensModal({
  open,
  onClose,
  trustData,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  trustData: TrustData | null;
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="outlook-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-lens-modal-title"
    >
      <div className="outlook-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="outlook-modal-header">
          <h3 id="trust-lens-modal-title">
            <ShieldAlert size={18} color="#1f6b57" /> Trust Lens · Sender Authentication & Evidence
          </h3>
          <button className="icon-button" onClick={onClose} aria-label="Close Trust Lens">
            <X size={18} />
          </button>
        </div>
        {trustData ? (
          (() => {
            const auth = trustData.auth_results || {};
            const evidence = trustData.trust_evidence || {};
            const status = (key: "spf" | "dkim" | "dmarc" | "arc" | "tls") =>
              String(trustData[`auth_${key}` as keyof TrustData] || auth[key] || "missing");
            const statusClass = (value: string) =>
              value === "pass"
                ? "trust-status-pass"
                : value === "missing" || value === "none"
                  ? "trust-status-missing"
                  : "trust-status-fail";
            const hosts = Array.isArray(evidence.link_hosts)
              ? (evidence.link_hosts as Array<{ host?: string; count?: number }>)
              : [];
            const history = trustData.screening_history || [];
            return (
              <div className="trust-lens-body">
                <p className="trust-lens-note">
                  Advisory signals only. Authentication results describe what the receiving server observed; they do
                  not guarantee that a message is safe.
                </p>
                <div className="trust-lens-grid">
                  {(["spf", "dkim", "dmarc", "arc", "tls"] as const).map((key) => (
                    <div className="trust-lens-item" key={key}>
                      <strong>{key.toUpperCase()}</strong>
                      <span className={statusClass(status(key))}>{status(key)}</span>
                    </div>
                  ))}
                </div>
                <div className="trust-lens-grid">
                  <div className="trust-lens-item">
                    <strong>Sender history</strong>
                    <span>{trustData.sender_first_seen ? "First seen sender" : "Seen before"}</span>
                  </div>
                  <div className="trust-lens-item">
                    <strong>Contact</strong>
                    <span>{trustData.known_contact ? "Known contact" : "Not in contacts"}</span>
                  </div>
                  <div className="trust-lens-item">
                    <strong>Reply-To</strong>
                    <span className={trustData.reply_to_mismatch ? "trust-status-fail" : "trust-status-pass"}>
                      {trustData.reply_to_mismatch ? "Different address" : "Matches sender"}
                    </span>
                  </div>
                  <div className="trust-lens-item">
                    <strong>Tracking pixels</strong>
                    <span>{trustData.tracking_pixel_count || 0} detected</span>
                  </div>
                </div>
                <div className="trust-lens-section">
                  <strong>Link hosts · {trustData.link_count || 0} links</strong>
                  {hosts.length ? (
                    <div className="trust-host-list">
                      {hosts.map((item) => (
                        <span className="trust-host" key={item.host}>
                          {item.host}
                          {item.count && item.count > 1 ? ` · ${item.count}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="trust-lens-note">No web links detected.</p>
                  )}
                </div>
                {history.length > 0 && (
                  <div className="trust-lens-section">
                    <strong>Screening history</strong>
                    <p className="trust-lens-note">
                      {history
                        .slice(0, 3)
                        .map((item) => `${item.decision} · ${new Date(item.created_at).toLocaleString()}`)
                        .join("  |  ")}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="trust-lens-body">
            <p className="trust-lens-note">{busy ? "Loading sender evidence…" : "No evidence available."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
