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
      style={{
        position: "fixed",
        top: "100px",
        right: "24px",
        width: "360px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0,0,0,0.08)",
        border: "1px solid #cbd5e1",
        zIndex: 500,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Title Bar */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #f1f5f9",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
          <Search size={15} color="#0f5132" />
          <span>Find and replace</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body Inputs */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Find Input */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
            <span>Find:</span>
            <span>
              {matches.length > 0
                ? `${activeMatchIndex + 1} of ${matches.length}`
                : findText.trim()
                ? "No matches"
                : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              autoFocus
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Text to find..."
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: "6px",
                border: regexError ? "1px solid #ef4444" : "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              onClick={handlePrev}
              disabled={matches.length === 0}
              title="Previous (Shift+Enter)"
              className="pdocs-tool-btn"
              style={{ width: 28, height: 28, padding: 0 }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={handleNext}
              disabled={matches.length === 0}
              title="Next (Enter)"
              className="pdocs-tool-btn"
              style={{ width: 28, height: 28, padding: 0 }}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          {regexError && (
            <div style={{ fontSize: "10px", color: "#dc2626", marginTop: 4 }}>
              Invalid Regex: {regexError}
            </div>
          )}
        </div>

        {/* Replace Input */}
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
            Replace with:
          </div>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replacement text..."
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Checkbox Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: "#475569", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Match case
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: "#475569", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
            />
            Match using regular expressions
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            onClick={handleReplaceCurrent}
            disabled={matches.length === 0}
            className="pdocs-btn-secondary"
            style={{ flex: 1, height: "32px", fontSize: "12px", padding: 0, justifyContent: "center" }}
          >
            <Replace size={13} /> Replace
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
            className="pdocs-btn-primary"
            style={{ flex: 1, height: "32px", fontSize: "12px", padding: 0, justifyContent: "center" }}
          >
            <CheckCheck size={14} /> Replace all
          </button>
        </div>
      </div>
    </div>
  );
};
