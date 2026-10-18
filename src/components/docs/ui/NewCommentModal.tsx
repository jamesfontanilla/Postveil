import React, { useState } from "react";
import { MessageSquare, X, Send, Quote } from "lucide-react";

interface NewCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotedText?: string;
  blockId: string;
  onAddComment: (blockId: string, text: string, quotedText?: string) => void;
}

export const NewCommentModal: React.FC<NewCommentModalProps> = ({
  isOpen,
  onClose,
  quotedText,
  blockId,
  onAddComment,
}) => {
  const [commentText, setCommentText] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(blockId, commentText.trim(), quotedText);
    setCommentText("");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "460px",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.22)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          animation: "pdocs-dialog-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "8px",
                backgroundColor: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
              }}
            >
              <MessageSquare size={16} />
            </div>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
              Add Comment
            </span>
          </div>
          <button
            onClick={onClose}
            className="pdocs-tool-btn"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "18px 20px" }}>
          {quotedText && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#f8fafc",
                borderLeft: "3px solid #2563eb",
                borderRadius: "4px",
                marginBottom: "14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <Quote size={14} style={{ color: "#64748b", flexShrink: 0, marginTop: 2 }} />
              <div
                style={{
                  fontSize: "12px",
                  color: "#475569",
                  fontStyle: "italic",
                  lineHeight: "1.4",
                  maxHeight: "60px",
                  overflowY: "auto",
                }}
              >
                "{quotedText}"
              </div>
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <textarea
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Comment or add others with @..."
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 4 }}>
              Press Ctrl+Enter to post comment
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              className="pdocs-tool-btn"
              style={{ padding: "8px 16px", borderRadius: "8px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!commentText.trim()}
              style={{
                padding: "8px 18px",
                backgroundColor: commentText.trim() ? "#2563eb" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: commentText.trim() ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Send size={13} />
              Comment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
