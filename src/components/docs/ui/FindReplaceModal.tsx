import React, { useState, useEffect, useMemo, useCallback } from "react";
import { X, Search, Replace, ChevronUp, ChevronDown, CheckCheck } from "lucide-react";
import { type UniversalDoc, type DocBlock } from "../types";

interface FindReplaceModalProps {
  isOpen: boolean;
  doc: UniversalDoc;
  onClose: () => void;
  onReplaceBlockContent: (blockId: string, newContent: string) => void;
  onReplaceAllBlocks: (newDoc: UniversalDoc) => void;
}

interface MatchOccurrence {
  blockId: string;
  startIndex: number;
  endIndex: number;
  text: string;
}

export const FindReplaceModal: React.FC<FindReplaceModalProps> = ({
  isOpen,
  doc,
  onClose,
  onReplaceBlockContent,
  onReplaceAllBlocks,
}) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);

  // Compute all matches across all blocks
  const matches = useMemo<MatchOccurrence[]>(() => {
    if (!findText.trim()) {
      setRegexError(null);
      return [];
    }

    const results: MatchOccurrence[] = [];
    let regex: RegExp;

    try {
      if (useRegex) {
        regex = new RegExp(findText, matchCase ? "g" : "gi");
      } else {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(escaped, matchCase ? "g" : "gi");
      }
      setRegexError(null);
    } catch (err) {
      setRegexError((err as Error).message);
      return [];
    }

    for (const block of doc.blocks) {
      const content = block.content || "";
      if (!content) continue;

      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(content)) !== null) {
        results.push({
          blockId: block.id,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          text: match[0],
        });
        if (match[0].length === 0) regex.lastIndex++; // prevent infinite loop on empty match
      }
    }

    return results;
  }, [findText, matchCase, useRegex, doc.blocks]);

  useEffect(() => {
    if (activeMatchIndex >= matches.length) {
      setActiveMatchIndex(0);
    }
  }, [matches.length, activeMatchIndex]);

  // Scroll to active match
  useEffect(() => {
    if (matches.length > 0 && matches[activeMatchIndex]) {
      const targetBlockId = matches[activeMatchIndex].blockId;
      const el = document.getElementById(targetBlockId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeMatchIndex, matches]);

  const handleNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const handlePrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleReplaceCurrent = () => {
    if (matches.length === 0 || !matches[activeMatchIndex]) return;
    const current = matches[activeMatchIndex];
    const block = doc.blocks.find((b) => b.id === current.blockId);
    if (!block || !block.content) return;

    const before = block.content.slice(0, current.startIndex);
    const after = block.content.slice(current.endIndex);
    const updated = before + replaceText + after;

    onReplaceBlockContent(block.id, updated);
  };

  const handleReplaceAll = () => {
    if (matches.length === 0) return;

    let regex: RegExp;
    if (useRegex) {
      regex = new RegExp(findText, matchCase ? "g" : "gi");
    } else {
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(escaped, matchCase ? "g" : "gi");
    }

    const updatedBlocks = doc.blocks.map((block) => {
      if (!block.content) return block;
      return {
        ...block,
        content: block.content.replace(regex, replaceText),
      };
    });

    onReplaceAllBlocks({
      ...doc,
      blocks: updatedBlocks,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="pdocs-floating-panel"
      style={{
        position: "fixed",
        top: "96px",
        right: "28px",
        width: "440px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 16px 36px -4px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0,0,0,0.06)",
        border: "1px solid #cbd5e1",
        zIndex: 500,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Title Bar */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid #f1f5f9",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
          <Search size={16} color="#0f5132" />
          <span>Find and replace</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body Content */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Google Docs-Style 2-Column Form Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "85px 1fr",
            rowGap: "12px",
            alignItems: "center",
          }}
        >
          {/* Find Row */}
          <span style={{ fontSize: "13px", fontWeight: 500, color: "#475569" }}>Find</span>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type="text"
              autoFocus
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Text to find..."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 64px 0 10px",
                borderRadius: "6px",
                border: regexError ? "1px solid #ef4444" : "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                if (!regexError) {
                  e.currentTarget.style.borderColor = "#0f5132";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(15, 81, 50, 0.15)";
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = regexError ? "#ef4444" : "#cbd5e1";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            {/* Embedded Match Counter Badge */}
            <div
              style={{
                position: "absolute",
                right: "8px",
                fontSize: "11px",
                fontWeight: 600,
                color: matches.length > 0 ? "#0f5132" : "#94a3b8",
                backgroundColor: matches.length > 0 ? "#e8f5e9" : "transparent",
                padding: matches.length > 0 ? "2px 6px" : "0",
                borderRadius: "10px",
                pointerEvents: "none",
              }}
            >
              {matches.length > 0
                ? `${activeMatchIndex + 1} of ${matches.length}`
                : findText.trim()
                ? "0 of 0"
                : ""}
            </div>
          </div>

          {/* Replace Row */}
          <span style={{ fontSize: "13px", fontWeight: 500, color: "#475569" }}>Replace with</span>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replacement text..."
            style={{
              width: "100%",
              height: "36px",
              padding: "0 10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#0f5132";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(15, 81, 50, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Regex Error Helper */}
        {regexError && (
          <div style={{ paddingLeft: "85px", fontSize: "11px", color: "#dc2626", marginTop: "-6px" }}>
            Invalid regex: {regexError}
          </div>
        )}

        {/* Indented Checkbox Options Section */}
        <div
          style={{
            paddingLeft: "85px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#334155",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                margin: 0,
                accentColor: "#0f5132",
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <span>Match case</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#334155",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                margin: 0,
                accentColor: "#0f5132",
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <span>Match using regular expressions</span>
          </label>
        </div>

        {/* Google Docs-Style Split Action Toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "6px",
            paddingTop: "14px",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          {/* Navigation Group (Left) */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={handlePrev}
              disabled={matches.length === 0}
              title="Previous match (Shift+Enter)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                height: "32px",
                padding: "0 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: matches.length > 0 ? "#ffffff" : "#f8fafc",
                color: matches.length > 0 ? "#334155" : "#94a3b8",
                fontSize: "12px",
                fontWeight: 500,
                cursor: matches.length > 0 ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
              }}
            >
              <ChevronUp size={14} /> Previous
            </button>
            <button
              onClick={handleNext}
              disabled={matches.length === 0}
              title="Next match (Enter)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                height: "32px",
                padding: "0 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: matches.length > 0 ? "#ffffff" : "#f8fafc",
                color: matches.length > 0 ? "#334155" : "#94a3b8",
                fontSize: "12px",
                fontWeight: 500,
                cursor: matches.length > 0 ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
              }}
            >
              Next <ChevronDown size={14} />
            </button>
          </div>

          {/* Execution Group (Right) */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "32px",
                padding: "0 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: matches.length > 0 ? "#ffffff" : "#f8fafc",
                color: matches.length > 0 ? "#334155" : "#94a3b8",
                fontSize: "12px",
                fontWeight: 500,
                cursor: matches.length > 0 ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
              }}
            >
              <Replace size={13} /> Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "32px",
                padding: "0 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: matches.length > 0 ? "#0f5132" : "#94a3b8",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: matches.length > 0 ? "pointer" : "not-allowed",
                boxShadow: matches.length > 0 ? "0 2px 4px rgba(15, 81, 50, 0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <CheckCheck size={14} /> Replace all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
