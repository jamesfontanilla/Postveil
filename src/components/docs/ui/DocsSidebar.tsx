import React from "react";
import {
  List,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  ChevronRight,
  FileCheck,
  Clock,
  Type,
  FileText,
} from "lucide-react";
import { type UniversalDoc } from "../types";
import { type DocOutlineItem } from "../engine/DocumentEngine";
import { FORMAT_REGISTRY } from "../formats/UniversalFormatEngine";

interface DocsSidebarProps {
  doc: UniversalDoc;
  outline: DocOutlineItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onScrollToBlock: (blockId: string) => void;
  onOpenExportFormat: (format: any) => void;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  doc,
  outline,
  collapsed,
  onToggleCollapse,
  onScrollToBlock,
  onOpenExportFormat,
}) => {
  if (collapsed) return null;

  return (
    <aside className="pdocs-sidebar" aria-label="Document Outline and Metadata">
      {/* Document Outline */}
      <div style={{ marginBottom: "24px" }}>
        <div className="pdocs-sidebar-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <List size={14} />
          <span>Document Outline</span>
        </div>
        {outline.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic", padding: "4px 8px" }}>
            Add headings to generate an automatic table of contents.
          </div>
        ) : (
          outline.map((item) => (
            <div
              key={item.id}
              className={`pdocs-outline-link level-${item.level}`}
              onClick={() => onScrollToBlock(item.id)}
              title={item.text}
            >
              {item.text}
            </div>
          ))
        )}
      </div>

      {/* Document Intelligence */}
      <div style={{ marginBottom: "24px" }}>
        <div className="pdocs-sidebar-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Type size={14} />
          <span>Document Stats</span>
        </div>
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Words</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              {doc.metadata.wordCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Characters</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              {doc.metadata.charCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Reading Time</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f5132" }}>
              ~{doc.metadata.readingTimeMinutes} min
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Headings</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              {outline.length}
            </div>
          </div>
        </div>
      </div>

      {/* Sovereign Interoperability Matrix */}
      <div>
        <div className="pdocs-sidebar-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Layers size={14} />
          <span>Sovereign Formats</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {Object.values(FORMAT_REGISTRY).slice(0, 5).map((spec) => (
            <div
              key={spec.id}
              onClick={() => onOpenExportFormat(spec.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: "8px",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={`Export directly to ${spec.name} (${spec.giantCompetitor})`}
            >
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                  {spec.name}
                </div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>{spec.extension}</div>
              </div>
              <ChevronRight size={14} color="#94a3b8" />
            </div>
          ))}
        </div>
      </div>

      {/* Silicon Sovereignty Badge */}
      <div
        style={{
          marginTop: "auto",
          padding: "12px",
          borderRadius: "10px",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <ShieldCheck size={18} color="#0f5132" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: "11px", color: "#166534", lineHeight: "1.4" }}>
          <strong>Zero Cloud Hostage:</strong> Rendered & stored strictly on local silicon via OPFS.
        </div>
      </div>
    </aside>
  );
};
