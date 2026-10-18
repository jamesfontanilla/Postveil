import React, { useState, useRef } from "react";
import { type UniversalDoc, type SupportedFormat } from "../types";
import { UniversalFormatEngine } from "../formats/UniversalFormatEngine";
import { Upload, X, FileText, Check, AlertCircle } from "lucide-react";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentImported: (doc: UniversalDoc) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onDocumentImported,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const format = UniversalFormatEngine.detectFormatFromFilename(file.name);
      const text = await file.text();
      const doc = await UniversalFormatEngine.importDocument(text, format);
      if (!doc.metadata.title || doc.metadata.title === "Untitled Document") {
        doc.metadata.title = file.name.replace(/\.[^/.]+$/, "");
      }
      onDocumentImported(doc);
      onClose();
    } catch (err) {
      setError("Failed to import document: " + String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose} role="dialog" aria-label="Import Document">
      <div className="pdocs-modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#e0f2fe",
                color: "#0369a1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Upload size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                Import Document
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Supports DOCX, ODT, Markdown, HTML, LaTeX, RTF, TXT, and PDOC.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "13px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#0f5132" : "#cbd5e1"}`,
              backgroundColor: isDragging ? "#f0fdf4" : "#f8fafc",
              borderRadius: "14px",
              padding: "40px 20px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".docx,.odt,.md,.markdown,.html,.htm,.txt,.tex,.rtf,.pdoc"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleFile(e.target.files[0]);
                }
              }}
            />
            <FileText size={36} color="#64748b" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e293b" }}>
              {isProcessing ? "Converting document..." : "Click or drag file here to import"}
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "6px 0 0" }}>
              Auto-converts Word (.docx), LibreOffice (.odt), Markdown (.md), or HTML
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
