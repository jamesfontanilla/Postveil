import React, { useState, useEffect } from "react";
import {
  History,
  Clock,
  RotateCcw,
  Tag,
  X,
  Check,
  Calendar,
  User,
  FileText,
} from "lucide-react";
import { type UniversalDoc, type DocVersionSnapshot } from "../types";
import { OpfsDocStorage } from "../engine/OpfsDocStorage";

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDoc: UniversalDoc;
  onRestoreVersion: (restoredDoc: UniversalDoc) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  currentDoc,
  onRestoreVersion,
}) => {
  const [versions, setVersions] = useState<DocVersionSnapshot[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isNamingOpen, setIsNamingOpen] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState("");
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);

  // Load versions from OPFS on open
  useEffect(() => {
    if (isOpen) {
      void (async () => {
        const loaded = await OpfsDocStorage.loadVersionSnapshots(currentDoc.metadata.id);
        setVersions(loaded);
        if (loaded.length > 0) {
          setSelectedVersionId(loaded[0].id);
        }
      })();
    }
  }, [isOpen, currentDoc.metadata.id]);

  if (!isOpen) return null;

  const selectedSnapshot = versions.find((v) => v.id === selectedVersionId) || versions[0];

  const handleCreateNamedVersion = async () => {
    if (!versionNameInput.trim()) return;
    const snap = await OpfsDocStorage.saveVersionSnapshot(currentDoc, versionNameInput.trim());
    setVersions((prev) => [snap, ...prev]);
    setSelectedVersionId(snap.id);
    setVersionNameInput("");
    setIsNamingOpen(false);
  };

  const handleRestore = async (snapshotId: string) => {
    const restored = await OpfsDocStorage.restoreVersionSnapshot(currentDoc.metadata.id, snapshotId);
    if (restored) {
      onRestoreVersion(restored);
      onClose();
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="pdocs-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="pdocs-modal"
        style={{
          maxWidth: "1040px",
          width: "92vw",
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
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
            padding: "16px 24px",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                backgroundColor: "#e6f4ea",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0f5132",
              }}
            >
              <History size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                Version history
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                {currentDoc.metadata.title} • Local Zero-Knowledge Snapshot Timeline
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "12px",
                color: "#475569",
                cursor: "pointer",
                padding: "6px 10px",
                backgroundColor: showDiff ? "#f0fdf4" : "#f8fafc",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={showDiff}
                onChange={(e) => setShowDiff(e.target.checked)}
                style={{ accentColor: "#059669" }}
              />
              <span style={{ fontWeight: 600 }}>Show changes</span>
            </label>
            <button
              onClick={() => setIsNamingOpen(!isNamingOpen)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                cursor: "pointer",
              }}
            >
              <Tag size={14} />
              Name current version
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                color: "#64748b",
                borderRadius: "6px",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Naming Bar Popup */}
        {isNamingOpen && (
          <div
            style={{
              padding: "12px 24px",
              backgroundColor: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
              Version name:
            </span>
            <input
              type="text"
              placeholder="e.g. Initial Draft, Pitch Deck Final, Legal Review..."
              value={versionNameInput}
              onChange={(e) => setVersionNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreateNamedVersion()}
              autoFocus
              style={{
                flex: 1,
                maxWidth: "380px",
                padding: "6px 12px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                outline: "none",
              }}
            />
            <button
              onClick={() => void handleCreateNamedVersion()}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#0f5132",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save version
            </button>
            <button
              onClick={() => setIsNamingOpen(false)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#64748b",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Body Split */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: Selected Version Document Preview */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#f1f5f9",
              padding: "24px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {selectedSnapshot ? (
              <div
                style={{
                  width: "100%",
                  maxWidth: "680px",
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  padding: "48px 40px",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #e2e8f0",
                    paddingBottom: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132", textTransform: "uppercase" }}>
                    Snapshot Preview • Read Only
                  </span>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    {formatDate(selectedSnapshot.timestamp)}
                  </span>
                </div>

                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>
                  {selectedSnapshot.doc.metadata.title}
                </h1>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {selectedSnapshot.doc.blocks.slice(0, 20).map((block) => {
                    const currentMatch = currentDoc.blocks.find((b) => b.id === block.id);
                    const isModified = currentMatch && currentMatch.content !== block.content;
                    const isRemovedInCurrent = !currentMatch;

                    return (
                      <div
                        key={block.id}
                        style={{
                          fontSize: "14px",
                          lineHeight: 1.6,
                          color: "#334155",
                          padding: showDiff && (isModified || isRemovedInCurrent) ? "6px 10px" : "0",
                          borderRadius: "6px",
                          backgroundColor:
                            showDiff && isRemovedInCurrent
                              ? "#fef2f2"
                              : showDiff && isModified
                              ? "#fffbeb"
                              : "transparent",
                          borderLeft:
                            showDiff && isRemovedInCurrent
                              ? "3px solid #ef4444"
                              : showDiff && isModified
                              ? "3px solid #f59e0b"
                              : "none",
                        }}
                      >
                        {showDiff && isRemovedInCurrent && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#dc2626",
                              backgroundColor: "#fee2e2",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "6px",
                            }}
                          >
                            REMOVED IN CURRENT
                          </span>
                        )}
                        {showDiff && isModified && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#b45309",
                              backgroundColor: "#fef3c7",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "6px",
                            }}
                          >
                            MODIFIED
                          </span>
                        )}
                        {block.type === "heading" ? (
                          <strong style={{ fontSize: "16px", color: "#0f172a" }}>{block.content}</strong>
                        ) : block.type === "mathBlock" ? (
                          <div style={{ padding: "8px", background: "#f8fafc", borderRadius: "6px", fontFamily: "monospace" }}>
                            LaTeX: {block.latex || block.content}
                          </div>
                        ) : (
                          block.content || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>[{block.type} block]</span>
                        )}
                      </div>
                    );
                  })}
                  {showDiff &&
                    currentDoc.blocks
                      .filter((cb) => !selectedSnapshot.doc.blocks.some((sb) => sb.id === cb.id))
                      .slice(0, 5)
                      .map((newBlock) => (
                        <div
                          key={`added_${newBlock.id}`}
                          style={{
                            fontSize: "14px",
                            lineHeight: 1.6,
                            padding: "6px 10px",
                            borderRadius: "6px",
                            backgroundColor: "#f0fdf4",
                            borderLeft: "3px solid #10b981",
                            color: "#166534",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#059669",
                              backgroundColor: "#d1fae5",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "6px",
                            }}
                          >
                            + ADDED IN CURRENT
                          </span>
                          {newBlock.content || `[${newBlock.type}]`}
                        </div>
                      ))}
                  {selectedSnapshot.doc.blocks.length > 20 && (
                    <p style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic", textAlign: "center" }}>
                      ... and {selectedSnapshot.doc.blocks.length - 20} more blocks
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", marginTop: "80px", color: "#64748b" }}>
                <Clock size={40} style={{ margin: "0 auto 12px", color: "#94a3b8" }} />
                <p style={{ margin: 0, fontSize: "14px" }}>No revision selected</p>
              </div>
            )}
          </div>

          {/* Right: Version List Panel */}
          <div
            style={{
              width: "320px",
              borderLeft: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e2e8f0",
                fontSize: "12px",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Revisions ({versions.length})
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
              {versions.length === 0 ? (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  <History size={28} style={{ margin: "0 auto 8px" }} />
                  <p style={{ margin: 0 }}>No previous revisions saved yet.</p>
                  <p style={{ margin: "6px 0 0", fontSize: "11px" }}>
                    Changes automatically snapshot to local OPFS as you edit.
                  </p>
                </div>
              ) : (
                versions.map((ver) => {
                  const isSelected = ver.id === selectedVersionId;
                  const isConfirming = confirmRestoreId === ver.id;

                  return (
                    <div
                      key={ver.id}
                      onClick={() => {
                        setSelectedVersionId(ver.id);
                        setConfirmRestoreId(null);
                      }}
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        marginBottom: "8px",
                        border: isSelected ? "1.5px solid #0f5132" : "1px solid #e2e8f0",
                        backgroundColor: isSelected ? "#f0fdf4" : "#ffffff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: isSelected ? "#0f5132" : "#0f172a" }}>
                          {ver.name || formatDate(ver.timestamp)}
                        </span>
                        {isSelected && <Check size={14} color="#0f5132" />}
                      </div>

                      {ver.name && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 6 }}>
                          {formatDate(ver.timestamp)}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "11px", color: "#64748b" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <User size={11} /> {ver.author}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <FileText size={11} /> {ver.wordCount} words
                        </span>
                      </div>

                      {/* Restore action */}
                      {isSelected && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #dcfce7" }}>
                          {isConfirming ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRestore(ver.id);
                                }}
                                style={{
                                  flex: 1,
                                  padding: "5px 10px",
                                  borderRadius: "6px",
                                  border: "none",
                                  backgroundColor: "#0f5132",
                                  color: "#ffffff",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Confirm Restore
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRestoreId(null);
                                }}
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  fontSize: "12px",
                                  color: "#64748b",
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmRestoreId(ver.id);
                              }}
                              style={{
                                width: "100%",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                backgroundColor: "#ffffff",
                                color: "#0f172a",
                                fontSize: "12px",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                cursor: "pointer",
                              }}
                            >
                              <RotateCcw size={13} />
                              Restore this version
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
