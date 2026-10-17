import React, { useState } from "react";
import BrandMark from "../BrandMark";
import { ShieldCheck, EyeOff, Check, ChevronDown, Lock } from "lucide-react";

interface OAuthConsentCardProps {
  appName?: string;
  appLogo?: string;
  currentUserEmail?: string;
  currentUserName?: string;
  onConsent: (shareRealEmail: boolean, cloakedAlias: string) => void;
  onCancel: () => void;
}

export const OAuthConsentCard: React.FC<OAuthConsentCardProps> = ({
  appName = "Figma",
  appLogo,
  currentUserEmail = "james@jamesfontanilla.com",
  currentUserName = "James Fontanilla",
  onConsent,
  onCancel,
}) => {
  const [emailMode, setEmailMode] = useState<"real" | "cloaked">("cloaked");
  const cloakedAlias = `${appName.toLowerCase()}.shield92@postveil.app`;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f0f4f9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* 2-Column Desktop / Single Column Mobile Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          backgroundColor: "#ffffff",
          borderRadius: "28px",
          padding: "48px 40px",
          boxShadow: "0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)",
          display: "flex",
          flexWrap: "wrap",
          gap: "40px",
        }}
      >
        {/* Left Column: Brand & Intent */}
        <div style={{ flex: "1 1 340px", minWidth: "280px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <BrandMark size={32} />
            <span style={{ fontSize: "22px", fontWeight: 600, color: "#1f1f1f" }}>
              Postveil
            </span>
          </div>

          <h1
            style={{
              fontSize: "32px",
              fontWeight: 500,
              color: "#1f1f1f",
              margin: "0 0 12px",
              lineHeight: 1.25,
            }}
          >
            Sign in with Postveil
          </h1>

          <p style={{ fontSize: "16px", color: "#444746", margin: "0 0 32px", lineHeight: 1.5 }}>
            to continue to <strong style={{ color: "#1f1f1f" }}>{appName}</strong>
          </p>

          {/* Account Chooser Chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderRadius: "24px",
              border: "1px solid #747775",
              backgroundColor: "#ffffff",
              maxWidth: "340px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0f5132 0%, #198754 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {currentUserName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f1f1f" }}>
                {currentUserName}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#444746",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentUserEmail}
              </div>
            </div>
            <ChevronDown size={16} color="#747775" />
          </div>
        </div>

        {/* Right Column: Scopes & Hide My Email Selector */}
        <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
          <div style={{ fontSize: "15px", fontWeight: 500, color: "#1f1f1f", marginBottom: 12 }}>
            {appName} will receive:
          </div>

          <div
            style={{
              padding: "16px",
              backgroundColor: "#f0f4f9",
              borderRadius: "16px",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Check size={18} color="#0f5132" />
              <span style={{ fontSize: "14px", color: "#1f1f1f" }}>
                Your name and profile avatar
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Check size={18} color="#0f5132" />
              <span style={{ fontSize: "14px", color: "#1f1f1f" }}>
                An active email address to contact you
              </span>
            </div>
          </div>

          {/* Hide My Email Selector */}
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#1f1f1f", marginBottom: 10 }}>
            Choose an email address to share:
          </div>

          <div
            onClick={() => setEmailMode("cloaked")}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px",
              borderRadius: "16px",
              border: emailMode === "cloaked" ? "2px solid #198754" : "1px solid #e0e2ec",
              backgroundColor: emailMode === "cloaked" ? "#e8f5e9" : "#ffffff",
              cursor: "pointer",
              marginBottom: 10,
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ marginTop: 2 }}>
              <input
                type="radio"
                checked={emailMode === "cloaked"}
                onChange={() => setEmailMode("cloaked")}
                style={{ accentColor: "#198754" }}
              />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f5132" }}>
                  Hide My Email (Recommended)
                </span>
                <EyeOff size={14} color="#0f5132" />
              </div>
              <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#1f1f1f", marginTop: 2 }}>
                {cloakedAlias}
              </div>
              <div style={{ fontSize: "12px", color: "#444746", marginTop: 2 }}>
                Forwards securely to your inbox. You can mute or delete this alias anytime.
              </div>
            </div>
          </div>

          <div
            onClick={() => setEmailMode("real")}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px",
              borderRadius: "16px",
              border: emailMode === "real" ? "2px solid #198754" : "1px solid #e0e2ec",
              backgroundColor: emailMode === "real" ? "#e8f5e9" : "#ffffff",
              cursor: "pointer",
              marginBottom: 28,
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ marginTop: 2 }}>
              <input
                type="radio"
                checked={emailMode === "real"}
                onChange={() => setEmailMode("real")}
                style={{ accentColor: "#198754" }}
              />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f1f1f" }}>
                Share My Real Email
              </div>
              <div style={{ fontSize: "13px", color: "#444746", marginTop: 2 }}>
                {currentUserEmail}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            <button
              onClick={onCancel}
              style={{
                background: "none",
                border: "none",
                color: "#198754",
                fontSize: "14px",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: "20px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              onClick={() => onConsent(emailMode === "real", cloakedAlias)}
              style={{
                backgroundColor: "#198754",
                border: "none",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                padding: "10px 24px",
                borderRadius: "20px",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(25, 135, 84, 0.2)",
              }}
            >
              Continue to {appName}
            </button>
          </div>
        </div>
      </div>

      {/* Google-Style Localized Footer */}
      <footer
        style={{
          width: "100%",
          maxWidth: "880px",
          marginTop: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#444746",
          padding: "0 12px",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>English (United States)</div>
        <div style={{ display: "flex", gap: "20px" }}>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>Help</a>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default OAuthConsentCard;
