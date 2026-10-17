import { Sparkles, X } from "lucide-react";

export default function WhatsNewModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={onClose}
    >
      <div className="mail-ribbon-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mail-ribbon-modal-header">
          <h3 id="whats-new-title">
            <Sparkles size={18} /> What's New in Postveil
          </h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="mail-ribbon-modal-body">
          <div className="whats-new-items">
            <div className="whats-new-feature">
              <h4>✨ Microsoft Outlook Simplified Ribbon Toolbar</h4>
              <p>
                Authentic, responsive Simplified Ribbon navigation featuring <strong>Home</strong>, <strong>View</strong>
                , <strong>File</strong>, and <strong>Help</strong> tabs with quick actions, segmented dropdowns, folder
                routing, density toggles, and reading pane controls.
              </p>
            </div>
            <div className="whats-new-feature">
              <h4>🌲 Postveil Signature Green & Schibsted Grotesk</h4>
              <p>
                Restored Postveil's iconic brand identity with emerald green (<code>#1f6b57</code>) styling, crisp
                typography, and uncluttered desktop focus.
              </p>
            </div>
            <div className="whats-new-feature">
              <h4>🌐 Universal Inbound Architecture</h4>
              <p>
                Zero-configuration universal AWS SES receipt rule (<code>postveil-inbound-rule</code>) routing email for
                all custom user domains directly to Cloudflare edge workers.
              </p>
            </div>
            <div className="whats-new-feature">
              <h4>⚡ Sub-4ms Edge Performance</h4>
              <p>
                Ultra-lean D1 SQL indexing, optimized PWA service worker caching headers, and lightning-fast full-text
                search.
              </p>
            </div>
          </div>
        </div>
        <div className="mail-ribbon-modal-footer">
          <button className="primary-button" type="button" onClick={onClose}>
            Explore Ribbon
          </button>
        </div>
      </div>
    </div>
  );
}
