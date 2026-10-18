import React, { useState } from "react";
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
  MessageSquare,
  CheckCircle2,
  XCircle,
  CornerDownRight,
  Send,
  Trash2,
  Check,
  KeyRound,
  Lock,
} from "lucide-react";
import { type UniversalDoc, type DocComment, type DocSuggestion } from "../types";
import { type DocOutlineItem } from "../engine/DocumentEngine";
import { FORMAT_REGISTRY } from "../formats/UniversalFormatEngine";

interface DocsSidebarProps {
  doc: UniversalDoc;
  outline: DocOutlineItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onScrollToBlock: (blockId: string) => void;
  onOpenExportFormat: (format: any) => void;
  onAddCommentReply?: (commentId: string, text: string) => void;
  onResolveComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onAcceptSuggestion?: (suggestionId: string) => void;
  onRejectSuggestion?: (suggestionId: string) => void;
  onOpenSignatureModal?: () => void;
  onOpenNewCommentModal?: () => void;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  doc,
  outline,
  collapsed,
  onToggleCollapse,
  onScrollToBlock,
  onOpenExportFormat,
  onAddCommentReply,
  onResolveComment,
  onDeleteComment,
  onAcceptSuggestion,
  onRejectSuggestion,
  onOpenSignatureModal,
  onOpenNewCommentModal,
}) => {
  const [activeTab, setActiveTab] = useState<"outline" | "comments" | "signatures">("outline");
  const [commentFilter, setCommentFilter] = useState<"all" | "active" | "resolved">("active");
  const [replyInputId, setReplyInputId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");

  if (collapsed) return null;

  const comments = doc.metadata.comments || [];
  const suggestions = doc.metadata.suggestions || [];
  const signatures = doc.metadata.signatures || [];

  const filteredComments = comments.filter((c) => {
    if (commentFilter === "active") return !c.resolved;
    if (commentFilter === "resolved") return c.resolved;
    return true;
  });

  const handleSendReply = (commentId: string) => {
    if (!replyText.trim()) return;
    onAddCommentReply?.(commentId, replyText.trim());
    setReplyText("");
    setReplyInputId(null);
  };

  return (
    <aside className="pdocs-sidebar" aria-label="Document Navigation and Reviews">
      {/* Tab Switcher */}
      <div
        style={{
          display: "flex",
          backgroundColor: "#f1f5f9",
          padding: "3px",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <button
          onClick={() => setActiveTab("outline")}
          style={{
            flex: 1,
            padding: "6px 4px",
            fontSize: "11px",
            fontWeight: activeTab === "outline" ? 700 : 500,
            border: "none",
            borderRadius: "6px",
            backgroundColor: activeTab === "outline" ? "#ffffff" : "transparent",
            color: activeTab === "outline" ? "#0f5132" : "#64748b",
            boxShadow: activeTab === "outline" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Outline
        </button>
        <button
          onClick={() => setActiveTab("comments")}
          style={{
            flex: 1,
            padding: "6px 4px",
            fontSize: "11px",
            fontWeight: activeTab === "comments" ? 700 : 500,
            border: "none",
            borderRadius: "6px",
            backgroundColor: activeTab === "comments" ? "#ffffff" : "transparent",
            color: activeTab === "comments" ? "#2563eb" : "#64748b",
            boxShadow: activeTab === "comments" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span>Reviews</span>
          {(comments.length > 0 || suggestions.length > 0) && (
            <span
              style={{
                backgroundColor: "#dbeafe",
                color: "#1e40af",
                padding: "1px 5px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 700,
              }}
            >
              {comments.filter((c) => !c.resolved).length + suggestions.filter((s) => s.status === "pending").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("signatures")}
          style={{
            flex: 1,
            padding: "6px 4px",
            fontSize: "11px",
            fontWeight: activeTab === "signatures" ? 700 : 500,
            border: "none",
            borderRadius: "6px",
            backgroundColor: activeTab === "signatures" ? "#ffffff" : "transparent",
            color: activeTab === "signatures" ? "#059669" : "#64748b",
            boxShadow: activeTab === "signatures" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Signatures
        </button>
      </div>

      {/* Tab 1: Outline & Stats */}
      {activeTab === "outline" && (
        <>
          {/* Document Outline */}
          <div style={{ marginBottom: "20px" }}>
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

          {/* Document Intelligence Stats */}
          <div style={{ marginBottom: "20px" }}>
            <div className="pdocs-sidebar-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Type size={14} />
              <span>Document Stats</span>
            </div>
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "10px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              <div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>Words</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  {doc.metadata.wordCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>Characters</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  {doc.metadata.charCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>Reading Time</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f5132" }}>
                  ~{doc.metadata.readingTimeMinutes} min
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>Headings</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  {outline.length}
                </div>
              </div>
            </div>
          </div>

          {/* Sovereign Formats */}
          <div>
            <div className="pdocs-sidebar-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Layers size={14} />
              <span>Universal Formats</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {Object.values(FORMAT_REGISTRY).slice(0, 4).map((spec) => (
                <div
                  key={spec.id}
                  onClick={() => onOpenExportFormat(spec.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                  title={`Export directly to ${spec.name}`}
                >
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#1e293b" }}>
                      {spec.name}
                    </div>
                    <div style={{ fontSize: "9px", color: "#64748b" }}>{spec.extension}</div>
                  </div>
                  <ChevronRight size={12} color="#94a3b8" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Comments & Suggestions */}
      {activeTab === "comments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Action Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["active", "resolved", "all"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCommentFilter(mode)}
                  style={{
                    padding: "3px 8px",
                    fontSize: "10px",
                    fontWeight: commentFilter === mode ? 700 : 500,
                    borderRadius: "4px",
                    border: "1px solid",
                    borderColor: commentFilter === mode ? "#2563eb" : "#e2e8f0",
                    backgroundColor: commentFilter === mode ? "#eff6ff" : "#ffffff",
                    color: commentFilter === mode ? "#1d4ed8" : "#64748b",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={onOpenNewCommentModal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <MessageSquare size={12} />
              + Add
            </button>
          </div>

          {/* Pending Suggestions Section */}
          {suggestions.filter((s) => s.status === "pending").length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#0f766e",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}
              >
                Track Changes Suggestions ({suggestions.filter((s) => s.status === "pending").length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestions
                  .filter((s) => s.status === "pending")
                  .map((sug) => (
                    <div
                      key={sug.id}
                      style={{
                        padding: "10px",
                        backgroundColor: "#f0fdfa",
                        borderRadius: "8px",
                        border: "1px solid #ccfbf1",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "#134e4a" }}>{sug.author}</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>{sug.timestamp}</span>
                      </div>
                      <div style={{ color: "#0f766e", marginBottom: 8, fontStyle: "italic" }}>
                        {sug.type === "insert"
                          ? `Suggest add: "${sug.suggestedText}"`
                          : sug.type === "delete"
                          ? `Suggest delete: "${sug.originalText}"`
                          : `Suggest replace: "${sug.originalText}" → "${sug.suggestedText}"`}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => onAcceptSuggestion?.(sug.id)}
                          style={{
                            padding: "3px 8px",
                            fontSize: "10px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "none",
                            backgroundColor: "#0d9488",
                            color: "#ffffff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Check size={11} /> Accept
                        </button>
                        <button
                          onClick={() => onRejectSuggestion?.(sug.id)}
                          style={{
                            padding: "3px 8px",
                            fontSize: "10px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            backgroundColor: "#ffffff",
                            color: "#64748b",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <XCircle size={11} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Comments List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredComments.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px dashed #cbd5e1",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                No {commentFilter !== "all" ? commentFilter : ""} comments found. Highlight text or click + Add to start a thread!
              </div>
            ) : (
              filteredComments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: "10px 12px",
                    backgroundColor: comment.resolved ? "#f8fafc" : "#ffffff",
                    borderRadius: "10px",
                    border: "1px solid",
                    borderColor: comment.resolved ? "#e2e8f0" : "#bfdbfe",
                    boxShadow: comment.resolved ? "none" : "0 2px 8px rgba(37,99,235,0.06)",
                  }}
                >
                  {/* Top Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                        {comment.author}
                      </div>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{comment.timestamp}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => onResolveComment?.(comment.id)}
                        title={comment.resolved ? "Re-open comment" : "Resolve comment"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: comment.resolved ? "#16a34a" : "#64748b",
                          padding: "2px",
                        }}
                      >
                        <CheckCircle2 size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteComment?.(comment.id)}
                        title="Delete comment"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#94a3b8",
                          padding: "2px",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Quoted Text Snippet */}
                  {comment.quotedText && (
                    <div
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "#f1f5f9",
                        borderLeft: "2px solid #3b82f6",
                        borderRadius: "3px",
                        fontSize: "11px",
                        color: "#475569",
                        fontStyle: "italic",
                        marginBottom: 6,
                      }}
                    >
                      "{comment.quotedText}"
                    </div>
                  )}

                  {/* Comment Body */}
                  <div style={{ fontSize: "12px", color: "#334155", lineHeight: "1.4", marginBottom: 8 }}>
                    {comment.text}
                  </div>

                  {/* Reply Thread */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        borderTop: "1px solid #f1f5f9",
                        paddingTop: 6,
                        marginBottom: 6,
                      }}
                    >
                      {comment.replies.map((reply) => (
                        <div key={reply.id} style={{ fontSize: "11px", backgroundColor: "#f8fafc", padding: "4px 6px", borderRadius: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#1e293b" }}>{reply.author}: </span>
                          <span style={{ color: "#475569" }}>{reply.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Action */}
                  {replyInputId === comment.id ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      <input
                        type="text"
                        placeholder="Reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendReply(comment.id)}
                        autoFocus
                        style={{
                          flex: 1,
                          fontSize: "11px",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleSendReply(comment.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          backgroundColor: "#2563eb",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        <Send size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setReplyInputId(comment.id);
                        setReplyText("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: "11px",
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <CornerDownRight size={11} /> Reply
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Signatures */}
      {activeTab === "signatures" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
              Digital Signatures ({signatures.length})
            </span>
            <button
              onClick={onOpenSignatureModal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#059669",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <KeyRound size={12} />
              Sign
            </button>
          </div>

          {signatures.length === 0 ? (
            <div
              style={{
                padding: "16px",
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                textAlign: "center",
              }}
            >
              <Lock size={20} color="#94a3b8" style={{ margin: "0 auto 6px" }} />
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>
                Unsigned Document
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: 4 }}>
                Sign with your sovereign Ed25519 identity to seal document against alteration.
              </div>
            </div>
          ) : (
            signatures.map((sig) => (
              <div
                key={sig.id}
                style={{
                  padding: "10px",
                  backgroundColor: "#f0fdf4",
                  borderRadius: "8px",
                  border: "1px solid #bbf7d0",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <ShieldCheck size={14} color="#16a34a" />
                  <span style={{ fontWeight: 700, color: "#14532d" }}>{sig.signerName}</span>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      padding: "1px 5px",
                      borderRadius: "999px",
                    }}
                  >
                    VALID
                  </span>
                </div>
                <div style={{ color: "#15803d", marginBottom: 2 }}>{sig.timestamp}</div>
                <div style={{ fontSize: "9px", color: "#166534", wordBreak: "break-all", fontFamily: "monospace" }}>
                  SHA-256: {sig.documentHashSha256.slice(0, 16)}...
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Silicon Sovereignty Footer */}
      <div
        style={{
          marginTop: "auto",
          padding: "10px",
          borderRadius: "8px",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          display: "flex",
          alignItems: "flex-start",
          gap: "6px",
        }}
      >
        <ShieldCheck size={16} color="#0f5132" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: "10px", color: "#166534", lineHeight: "1.3" }}>
          <strong>Zero Cloud Hostage:</strong> Stored strictly on local silicon via OPFS.
        </div>
      </div>
    </aside>
  );
};
