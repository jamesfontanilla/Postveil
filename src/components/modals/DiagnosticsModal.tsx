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
              <div className="diag-label">Mail service</div>
              <div className="diag-val diag-status-ok">● Current deployment mail route is available</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Inbound receipt</div>
              <div className="diag-val">Configured mail receipt route; provider details are deployment-specific.</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Application database</div>
              <div className="diag-val diag-status-ok">● Current deployment database route is available</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Mail screening</div>
              <div className="diag-val">Configured authentication and screening checks; no unsupported security verdict is shown.</div>
            </div>
            <div className="diag-item">
              <div className="diag-label">Mail attachment storage</div>
              <div className="diag-val">Configured private attachment storage for mail; this is separate from local pillar storage.</div>
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
