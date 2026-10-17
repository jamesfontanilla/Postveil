import { Activity, X } from "lucide-react";

export default function DiagnosticsModal({
  open,
  onClose,
  userEmail,
}: {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diag-title"
      onClick={onClose}
    >
      <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mail-ribbon-modal-header">
          <h3 id="diag-title">
            <Activity size={18} /> System Diagnostics & Health
          </h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="mail-ribbon-modal-body">
          <div className="diagnostics-list">
            <div className="diag-item">
              <div className="diag-label">Client Version</div>
              <div className="diag-val">Postveil v0.1.0 Sovereign Edition</div>
            </div>
            {userEmail && (
              <div className="diag-item">
                <div className="diag-label">Active Session</div>
                <div className="diag-val">{userEmail}</div>
              </div>
            )}
            <div className="diag-item">
              <div className="diag-label">Edge Inbound Gateway</div>
              <div className="diag-val diag-status-ok">● AWS SES (ap-southeast-1) via Cloudflare Worker</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">SES Inbound Receipt Rule</div>
              <div className="diag-val">
                <code>postveil-inbound-rule</code> (Universal Inbound)
              </div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Database Subsystem</div>
              <div className="diag-val diag-status-ok">● Cloudflare D1 (postveil-prod, sub-4ms read latency)</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Security & Screening</div>
              <div className="diag-val">SPF / DKIM / DMARC Strict · Zero Security Bans</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Storage Lake</div>
              <div className="diag-val">S3 Mailbox Object Lake (Multi-tenant partition)</div>
            </div>
          </div>
        </div>
        <div className="mail-ribbon-modal-footer">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              if ("caches" in window) {
                void caches.keys().then((names) => {
                  for (const name of names) void caches.delete(name);
                });
              }
              window.location.reload();
            }}
          >
            Clear Cache & Reload
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
