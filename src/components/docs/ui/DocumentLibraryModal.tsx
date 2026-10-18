import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  Plus,
  Trash2,
  Copy,
  FolderOpen,
  Search,
  Clock,
  Sparkles,
  Check,
} from "lucide-react";
import { OpfsDocStorage, type DocStorageSummary } from "../engine/OpfsDocStorage";
import { type UniversalDoc } from "../types";

interface DocumentLibraryModalProps {
  isOpen: boolean;
  activeDocId: string;
  onClose: () => void;
  onSelectDoc: (loadedDoc: UniversalDoc) => void;
  onCreateNewDoc: () => void;
}

export const DocumentLibraryModal: React.FC<DocumentLibraryModalProps> = ({
  isOpen,
  activeDocId,
  onClose,
  onSelectDoc,
  onCreateNewDoc,
}) => {
  const [docsList, setDocsList] = useState<DocStorageSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const list = await OpfsDocStorage.listLocalDocuments();
      setDocsList(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchDocs();
      setSearchQuery("");
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredDocs = docsList.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDoc = async (id: string) => {
    setIsLoading(true);
    try {
      const loaded = await OpfsDocStorage.loadDocumentLocally(id);
      if (loaded) {
        onSelectDoc(loaded);
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const cloned = await OpfsDocStorage.duplicateDocumentLocally(id);
      if (cloned) {
        setActionSuccessMsg(`Created copy: "${cloned.metadata.title}"`);
        setTimeout(() => setActionSuccessMsg(null), 3000);
        await fetchDocs();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setIsLoading(true);
    try {
      await OpfsDocStorage.deleteDocumentLocally(id);
      setConfirmDeleteId(null);
      await fetchDocs();
    } finally {
      setIsLoading(false);
    }
  };

  const formatRelativeTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose}>
      <div
        className="pdocs-modal"
        style={{ maxWidth: "780px", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                backgroundColor: "#e8f5e9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0f5132",
              }}
            >
              <FolderOpen size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                Sovereign Document Library
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Encrypted in Origin Private File System (OPFS) • Zero Cloud Telemetry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="pdocs-tool-btn"
            style={{ width: 32, height: 32, borderRadius: "50%", padding: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Bar & Search */}
        <div
          style={{
            padding: "16px 24px",
            backgroundColor: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={16}
              color="#94a3b8"
              style={{ position: "absolute", left: 12, pointerEvents: "none" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title..."
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
                backgroundColor: "#ffffff",
              }}
            />
          </div>
          <button
            onClick={() => {
              onCreateNewDoc();
              onClose();
            }}
            className="pdocs-btn-primary"
            style={{ padding: "0 16px", height: "36px", whiteSpace: "nowrap" }}
          >
            <Plus size={16} /> New Document
          </button>
        </div>

        {/* Status Toast Banner */}
        {actionSuccessMsg && (
          <div
            style={{
              padding: "8px 24px",
              backgroundColor: "#f0fdf4",
              borderBottom: "1px solid #bbf7d0",
              color: "#15803d",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Check size={14} /> {actionSuccessMsg}
          </div>
        )}

        {/* Documents Grid / List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "16px",
            alignContent: "start",
          }}
        >
          {/* New Document Blank Card */}
          <div
            onClick={() => {
              onCreateNewDoc();
              onClose();
            }}
            style={{
              border: "2px dashed #cbd5e1",
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              minHeight: "140px",
              backgroundColor: "#ffffff",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#0f5132";
              e.currentTarget.style.backgroundColor = "#f0fdf4";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.backgroundColor = "#ffffff";
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: "#e8f5e9",
                color: "#0f5132",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Plus size={20} />
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              Blank Document
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
              Start from scratch
            </div>
          </div>

          {/* Stored Document Cards */}
          {filteredDocs.map((item) => {
            const isActive = item.id === activeDocId;
            const isConfirmingDelete = confirmDeleteId === item.id;

            return (
              <div
                key={item.id}
                onClick={() => handleOpenDoc(item.id)}
                style={{
                  border: isActive ? "2px solid #0f5132" : "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                  backgroundColor: isActive ? "#fbfdfc" : "#ffffff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = "#94a3b8";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.03)";
                }}
              >
                {/* Active Indicator Badge */}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      fontSize: "9px",
                      fontWeight: 700,
                      backgroundColor: "#e8f5e9",
                      color: "#0f5132",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    ACTIVE
                  </span>
                )}

                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "8px",
                      backgroundColor: "#f1f5f9",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: isActive ? 48 : 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#0f172a",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.title}
                    >
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 2,
                      }}
                    >
                      <Clock size={11} />
                      {formatRelativeTime(item.updatedAt)}
                    </div>
                  </div>
                </div>

                {/* Document Metadata Pill Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "10px",
                    color: "#64748b",
                    marginTop: "auto",
                    paddingTop: 10,
                    borderTop: "1px solid #f8fafc",
                  }}
                >
                  <span style={{ backgroundColor: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                    {item.paperSize || "A4"}
                  </span>
                  <span>{item.wordCount || 0} words</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => handleDuplicateDoc(item.id, e)}
                      title="Make a copy"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        color: "#64748b",
                        borderRadius: "4px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#0f172a")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteDoc(item.id, e)}
                      title={isConfirmingDelete ? "Click again to confirm delete" : "Delete document"}
                      style={{
                        background: isConfirmingDelete ? "#fee2e2" : "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        color: isConfirmingDelete ? "#dc2626" : "#64748b",
                        borderRadius: "4px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={(e) => {
                        if (!isConfirmingDelete) e.currentTarget.style.color = "#64748b";
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}

          {filteredDocs.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "32px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: "13px",
              }}
            >
              No documents found matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 24px",
            backgroundColor: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} color="#0f5132" />
            <span>Files are stored strictly on your local device.</span>
          </div>
          <button onClick={onClose} className="pdocs-btn-secondary" style={{ height: "32px" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
