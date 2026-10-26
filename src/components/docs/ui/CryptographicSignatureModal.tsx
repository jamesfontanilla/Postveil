import React, { useEffect, useState } from "react";
import { Copy, FileCheck, KeyRound, ShieldAlert, X, Check } from "lucide-react";
import { isVerifiedSignature, type SignatureMetadata, type UniversalDoc } from "../types";

interface CryptographicSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: UniversalDoc;
  onAddSignature?: (signature: SignatureMetadata) => void;
  userEmail?: string;
  userName?: string;
}

export const CryptographicSignatureModal: React.FC<CryptographicSignatureModalProps> = ({ isOpen, onClose, doc }) => {
  const [docHash, setDocHash] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const canonical = JSON.stringify({ title: doc.metadata.title, blocks: doc.blocks.map((block) => ({ id: block.id, type: block.type, content: block.content })) });
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)).then((buffer) => {
      setDocHash([...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
    }).catch(() => setDocHash(""));
  }, [doc, isOpen]);

  if (!isOpen) return null;
  const signatures = doc.metadata.signatures || [];

  return (
    <div className="pdocs-signature-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(15,23,42,.45)" }}>
      <div role="dialog" aria-modal="true" aria-label="Document signing setup" onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 580, background: "#fff", borderRadius: 16, overflow: "hidden" }}>
        <header style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><ShieldAlert size={22} color="#b45309" /><div><h2 style={{ margin: 0, fontSize: 16 }}>Document signing setup required</h2><p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>No signing or verification service is configured.</p></div></div>
          <button onClick={onClose} className="pdocs-tool-btn" aria-label="Close"><X size={16} /></button>
        </header>
        <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
          <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10 }}>
            <strong style={{ display: "block", fontSize: 11, textTransform: "uppercase", color: "#475569" }}>Document hash preview (SHA-256)</strong>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}><code style={{ wordBreak: "break-all", fontSize: 11, flex: 1 }}>{docHash || "Computing..."}</code><button type="button" onClick={() => { if (docHash) void navigator.clipboard?.writeText(docHash); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }} aria-label="Copy document hash">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
          </div>
          <div><strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><FileCheck size={15} /> Signature metadata ({signatures.length})</strong>
            {!signatures.length ? <p style={{ fontSize: 12, color: "#64748b" }}>No signature metadata is attached to this document.</p> : <div style={{ display: "grid", gap: 8, marginTop: 8 }}>{signatures.map((signature) => <div key={signature.id} style={{ padding: 12, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}><strong>{signature.signerName}</strong><div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>{isVerifiedSignature(signature) ? "Verified through the approved key service" : "Unverified signature metadata"}</div><div style={{ fontSize: 10, marginTop: 4, wordBreak: "break-all" }}>Document hash: {signature.documentHashSha256}</div></div>)}</div>}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>Signing is disabled until an approved key service and verification path are configured. The hash preview does not sign, seal, or verify this document.</p>
        </div>
        <footer style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}><button type="button" onClick={onClose} className="pdocs-tool-btn">Close</button><button type="button" disabled style={{ marginLeft: 8, opacity: .55 }}><KeyRound size={14} /> Signing setup required</button></footer>
      </div>
    </div>
  );
};
