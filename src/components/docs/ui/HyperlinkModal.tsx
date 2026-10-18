import React, { useState, useEffect } from "react";
import { Link2, ExternalLink, X, Check } from "lucide-react";

interface HyperlinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  initialUrl?: string;
  onApply: (text: string, url: string) => void;
}

export const HyperlinkModal: React.FC<HyperlinkModalProps> = ({
  isOpen,
  onClose,
  initialText = "",
  initialUrl = "",
  onApply,
}) => {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setUrl(initialUrl);
    }
  }, [isOpen, initialText, initialUrl]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("#") && !finalUrl.startsWith("mailto:")) {
      finalUrl = `https://${finalUrl}`;
    }
    onApply(text.trim() || finalUrl, finalUrl);
    onClose();
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="pdocs-modal"
        style={{
          maxWidth: "460px",
          borderRadius: "14px",
          padding: 0,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                backgroundColor: "#e0f2fe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0284c7",
              }}
            >
              <Link2 size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                Insert link
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>
                Add URL or web destination (Ctrl+K)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#64748b",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body - 2 Column Form Grid per UI Playbook */}
        <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "85px 1fr",
              gap: "14px 12px",
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
              Text:
            </label>
            <input
              type="text"
              className="pdocs-form-input"
              placeholder="Display text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
              Link:
            </label>
            <input
              type="text"
              className="pdocs-form-input"
              placeholder="Paste or search a link (e.g. https://...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Quick suggestions */}
          <div style={{ marginTop: "16px", paddingLeft: "97px" }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Quick links:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { name: "Postveil Suite", url: "https://postveil.jamesfontanilla.com" },
                { name: "P-Mail", url: "https://postveil.jamesfontanilla.com/?view=mail" },
                { name: "Accounts Hub", url: "https://accounts.postveil.jamesfontanilla.com" },
              ].map((sug) => (
                <button
                  type="button"
                  key={sug.name}
                  onClick={() => {
                    setUrl(sug.url);
                    if (!text) setText(sug.name);
                  }}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  {sug.name}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: "24px",
              paddingTop: "14px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#475569",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: url.trim() ? "#0f5132" : "#94a3b8",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: url.trim() ? "pointer" : "not-allowed",
              }}
            >
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
