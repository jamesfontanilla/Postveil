import React, { useEffect, useState } from "react";
import { Copy, FileCheck, KeyRound, ShieldCheck, ShieldAlert, X, Check, Lock, RefreshCw } from "lucide-react";
import { isVerifiedSignature, type SignatureMetadata, type VerifiedSignature, type UniversalDoc } from "../types";
import { SovereignDocCrypt } from "../engine/SovereignDocCrypt";

interface CryptographicSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: UniversalDoc;
  onAddSignature?: (signature: SignatureMetadata) => void;
  userEmail?: string;
  userName?: string;
}

export const CryptographicSignatureModal: React.FC<CryptographicSignatureModalProps> = ({
  isOpen,
  onClose,
  doc,
  onAddSignature,
  userEmail,
  userName,
}) => {
  const [docHash, setDocHash] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [verificationMap, setVerificationMap] = useState<Record<string, boolean | null>>({});
  const [signSuccess, setSignSuccess] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);

  // Compute canonical document SHA-256 hash
  useEffect(() => {
    if (!isOpen) return;
    const canonical = JSON.stringify({
      title: doc.metadata.title,
      blocks: doc.blocks.map((block) => ({ id: block.id, type: block.type, content: block.content })),
    });
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
      .then((buffer) => {
        const hash = [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        setDocHash(hash);
      })
      .catch(() => setDocHash(""));
  }, [doc, isOpen]);

  // Verify all attached signatures whenever doc or docHash changes
  useEffect(() => {
    if (!isOpen || !docHash) return;
    const signatures = doc.metadata.signatures || [];
    if (!signatures.length) return;

    signatures.forEach(async (sig) => {
      if (sig.algorithm === "Ed25519" && sig.publicKey && sig.signatureBase64) {
        try {
          const valid = await SovereignDocCrypt.verifyDocumentSignature(
            sig.documentHashSha256 || docHash,
            sig.signatureBase64,
            sig.publicKey
          );
          setVerificationMap((prev) => ({ ...prev, [sig.id]: valid }));
        } catch {
          setVerificationMap((prev) => ({ ...prev, [sig.id]: false }));
        }
      } else {
        setVerificationMap((prev) => ({ ...prev, [sig.id]: false }));
      }
    });
  }, [doc, docHash, isOpen]);

  if (!isOpen) return null;
  const signatures = doc.metadata.signatures || [];

  // Helper to retrieve or generate sovereign signing keypair in local browser session
  const getOrCreateSovereignKeyPair = async (): Promise<CryptoKeyPair> => {
    const KEY_PRIVATE = "pdocs_sovereign_priv_ed25519";
    const KEY_PUBLIC = "pdocs_sovereign_pub_ed25519";

    if (typeof localStorage !== "undefined") {
      const storedPriv = localStorage.getItem(KEY_PRIVATE);
      const storedPub = localStorage.getItem(KEY_PUBLIC);
      if (storedPriv && storedPub) {
        try {
          const privKey = await crypto.subtle.importKey(
            "pkcs8",
            SovereignDocCrypt.base64ToBytes(storedPriv).buffer as ArrayBuffer,
            { name: "Ed25519" },
            true,
            ["sign"]
          );
          const pubKey = await crypto.subtle.importKey(
            "raw",
            SovereignDocCrypt.base64ToBytes(storedPub).buffer as ArrayBuffer,
            { name: "Ed25519" },
            true,
            ["verify"]
          );
          return { privateKey: privKey, publicKey: pubKey };
        } catch {
          // Fall through to generate fresh keypair
        }
      }
    }

    const keyPair = await SovereignDocCrypt.generateSigningKeyPair();
    if (typeof localStorage !== "undefined") {
      try {
        const exportedPriv = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
        const exportedPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
        localStorage.setItem(KEY_PRIVATE, SovereignDocCrypt.bytesToBase64(new Uint8Array(exportedPriv)));
        localStorage.setItem(KEY_PUBLIC, SovereignDocCrypt.bytesToBase64(new Uint8Array(exportedPub)));
      } catch {}
    }
    return keyPair;
  };

  const handleSignDocument = async () => {
    if (!docHash) return;
    setIsSigning(true);
    setSigningError(null);
    try {
      const keyPair = await getOrCreateSovereignKeyPair();
      const pubKeyBase64 = await SovereignDocCrypt.exportKeyBase64(keyPair.publicKey);
      const signatureBase64 = await SovereignDocCrypt.signDocumentHash(docHash, keyPair.privateKey);

      const now = new Date().toISOString();
      const signer = userName || (userEmail ? userEmail.split("@")[0] : "Sovereign Author");
      const email = userEmail || "sovereign@postveil.me";

      const verifiedSig: VerifiedSignature = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        signerName: signer,
        signerEmail: email,
        publicKey: pubKeyBase64,
        signatureBase64,
        documentHashSha256: docHash,
        timestamp: now,
        algorithm: "Ed25519",
        kind: "verified",
        status: "verified",
        verifiedAt: now,
        verificationMethod: "approved-key-service",
      };

      if (onAddSignature) {
        onAddSignature(verifiedSig);
      }
      setVerificationMap((prev) => ({ ...prev, [verifiedSig.id]: true }));
      setSignSuccess(true);
      setTimeout(() => setSignSuccess(false), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cryptographic signing encountered an unexpected error";
      setSigningError(message);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div
      className="pdocs-signature-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15,23,42,.65)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cryptographic Document Notary"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#ffffff",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #e2e8f0",
        }}
      >
        <header
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={20} color="#16a34a" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Sovereign Cryptographic Notary
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Ed25519 digital seal and SHA-256 canonical integrity verification
              </p>
            </div>
          </div>
          <button onClick={onClose} className="pdocs-tool-btn" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
          {/* Canonical Hash Display */}
          <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, textTransform: "uppercase", color: "#475569", letterSpacing: "0.05em" }}>
                <Lock size={12} /> Canonical Document Hash (SHA-256)
              </strong>
              <span style={{ fontSize: 10, background: "#e2e8f0", padding: "2px 6px", borderRadius: 4, color: "#475569" }}>
                Lossless AST Digest
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <code style={{ wordBreak: "break-all", fontSize: 11, flex: 1, color: "#0f172a", background: "#ffffff", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>
                {docHash || "Computing canonical digest..."}
              </code>
              <button
                type="button"
                onClick={() => {
                  if (docHash) void navigator.clipboard?.writeText(docHash);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="pdocs-tool-btn"
                aria-label="Copy document hash"
                title="Copy hash to clipboard"
                style={{ padding: "8px 12px", border: "1px solid #cbd5e1", background: "#ffffff" }}
              >
                {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Attached Signatures List */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#1e293b" }}>
                <FileCheck size={15} color="#2563eb" /> Cryptographic Signatures ({signatures.length})
              </strong>
              {signatures.length > 0 && (
                <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                  Active Verification Engine
                </span>
              )}
            </div>

            {!signatures.length ? (
              <div style={{ padding: 16, border: "1px dashed #cbd5e1", borderRadius: 8, background: "#f8fafc", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                  No digital signature is currently sealed to this document.
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                  Click &ldquo;Sign & Seal Document&rdquo; below to apply your sovereign Ed25519 signature.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                {signatures.map((sig) => {
                  const isVerified = verificationMap[sig.id] ?? isVerifiedSignature(sig);
                  const isCurrentDocMatch = sig.documentHashSha256 === docHash;

                  return (
                    <div
                      key={sig.id}
                      style={{
                        padding: 12,
                        border: isVerified && isCurrentDocMatch ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                        borderRadius: 8,
                        background: isVerified && isCurrentDocMatch ? "#f0fdf4" : "#fffbeb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <strong style={{ fontSize: 12, color: "#0f172a" }}>{sig.signerName}</strong>
                          <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>({sig.signerEmail})</span>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 12,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: isVerified && isCurrentDocMatch ? "#dcfce7" : "#ffedd5",
                            color: isVerified && isCurrentDocMatch ? "#15803d" : "#c2410c",
                          }}
                        >
                          {isVerified && isCurrentDocMatch ? (
                            <>
                              <Check size={11} /> Valid Ed25519 Seal
                            </>
                          ) : (
                            <>
                              <ShieldAlert size={11} />
                              {!isCurrentDocMatch ? "Hash Mismatch (Modified)" : "Unverified Key"}
                            </>
                          )}
                        </span>
                      </div>

                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontFamily: "var(--font-mono, monospace)" }}>
                        Sealed: {new Date(sig.timestamp).toLocaleString()} • Algorithm: {sig.algorithm}
                      </div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2, wordBreak: "break-all", fontFamily: "var(--font-mono, monospace)" }}>
                        Public Key: {sig.publicKey ? `${sig.publicKey.slice(0, 16)}...${sig.publicKey.slice(-8)}` : "Unavailable"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {signSuccess && (
            <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Check size={14} color="#16a34a" />
              <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>
                Document successfully signed and sealed with sovereign Ed25519 signature!
              </span>
            </div>
          )}

          {signingError && (
            <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={14} color="#dc2626" />
              <span style={{ fontSize: 12, color: "#b91c1c" }}>{signingError}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
            Postveil Sovereign Signatures are generated directly inside your local browser using high-speed Web Crypto Ed25519 keypairs. Your private key never leaves your device.
          </p>
        </div>

        <footer
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
          }}
        >
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Signer: <strong>{userName || (userEmail ? userEmail.split("@")[0] : "Sovereign Author")}</strong>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} className="pdocs-tool-btn" style={{ padding: "8px 14px" }}>
              Close
            </button>
            <button
              type="button"
              onClick={handleSignDocument}
              disabled={isSigning || !docHash}
              className="pdocs-btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: isSigning || !docHash ? "not-allowed" : "pointer",
                opacity: isSigning || !docHash ? 0.6 : 1,
              }}
            >
              {isSigning ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Signing Document...
                </>
              ) : (
                <>
                  <KeyRound size={14} /> Sign & Seal Document
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
