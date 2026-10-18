import React, { useState } from "react";
import {
  type UniversalDoc,
  type SupportedFormat,
  type FormatSpecification,
} from "../types";
import { FORMAT_REGISTRY, UniversalFormatEngine } from "../formats/UniversalFormatEngine";
import {
  Download,
  X,
  Check,
  FileText,
  Shield,
  Sparkles,
  ExternalLink,
  Layers,
} from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: UniversalDoc;
  initialFormat?: SupportedFormat;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  doc,
  initialFormat = "docx",
}) => {
  const [selectedFormat, setSelectedFormat] = useState<SupportedFormat>(initialFormat);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const formats = Object.values(FORMAT_REGISTRY);
  const activeSpec = FORMAT_REGISTRY[selectedFormat];

  const handleDownload = async () => {
    setIsExporting(true);
    setDownloadSuccess(false);

    try {
      const result = await UniversalFormatEngine.exportDocument(doc, {
        format: selectedFormat,
        includeMetadata: true,
      });

      // Browser download trigger
      let blob: Blob;
      if (typeof result.data === "string") {
        blob = new Blob([result.data], { type: activeSpec.mimeType });
      } else {
        blob = result.data;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      alert("Export failed: " + String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose} role="dialog" aria-label="Export Document">
      <div className="pdocs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pdocs-export-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#e8f5e9",
                color: "#0f5132",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Download size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                Universal Document Export
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Zero data lock-in. Instant conversion across 10 major world formats.
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

        {/* Modal Body */}
        <div className="pdocs-export-modal-body">
          {/* Format Picker Column */}
          <div className="pdocs-export-formats-col">
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                padding: "4px 8px",
              }}
            >
              Choose Format
            </div>
            {formats.map((fmt) => {
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: isSelected ? "1px solid #0f5132" : "1px solid transparent",
                    backgroundColor: isSelected ? "#ffffff" : "transparent",
                    color: isSelected ? "#0f5132" : "#334155",
                    fontWeight: isSelected ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px" }}>{fmt.name}</div>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>{fmt.extension}</div>
                  </div>
                  {isSelected && <Check size={14} color="#0f5132" />}
                </button>
              );
            })}
          </div>

          {/* Format Details & Giant Comparison */}
          <div className="pdocs-export-details-col">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                  {activeSpec.name}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: "#e0f2fe",
                    color: "#0369a1",
                  }}
                >
                  {activeSpec.category}
                </span>
              </div>
            </div>

            <p style={{ fontSize: "13px", color: "#475569", margin: "10px 0 16px", lineHeight: "1.5" }}>
              {activeSpec.description}
            </p>

            {/* Giant Defeated Card */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "14px 16px",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132", marginBottom: 4 }}>
                TARGET GIANT INTEROPERABILITY
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>
                {activeSpec.giantCompetitor}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: 4 }}>
                Seamless round-trip editing without proprietary subscription walls or vendor telemetry.
              </div>
            </div>

            {/* Technical Capabilities */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "auto" }}>
              <span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#f1f5f9" }}>
                {activeSpec.isLossless ? "Lossless AST" : "Rendered Format"}
              </span>
              <span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#f1f5f9" }}>
                {activeSpec.supportsMath ? "LaTeX Math Supported" : "Plain Equations"}
              </span>
              <span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#f1f5f9" }}>
                {activeSpec.supportsTables ? "Table Structure Intact" : "ASCII Tables"}
              </span>
            </div>

            {/* Download CTA */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  borderRadius: "20px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={isExporting}
                style={{
                  padding: "8px 24px",
                  borderRadius: "20px",
                  border: "none",
                  backgroundColor: downloadSuccess ? "#15803d" : "#0f5132",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s ease",
                }}
              >
                {downloadSuccess ? (
                  <>
                    <Check size={16} />
                    Downloaded!
                  </>
                ) : isExporting ? (
                  "Converting..."
                ) : (
                  <>
                    <Download size={16} />
                    Download {activeSpec.extension}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
