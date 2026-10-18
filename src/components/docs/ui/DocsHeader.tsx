import React, { useState } from "react";
import {
  FileText,
  Save,
  Download,
  Upload,
  Printer,
  ChevronDown,
  LayoutGrid,
  ShieldCheck,
  LogOut,
  Settings2,
  Mail,
  Check,
  Sparkles,
  Eye,
  FileCode,
  Layers,
  FolderOpen,
  Copy,
  Search,
  History,
  Link2,
  Bookmark,
  MessageSquare,
  Menu,
} from "lucide-react";
import BrandMark from "../../BrandMark";
import { WaffleLauncher } from "../../accounts/WaffleLauncher";
import { type UniversalDoc, type SupportedFormat, type BlockType } from "../types";

interface DocsHeaderProps {
  doc: UniversalDoc;
  viewMode: "paginated" | "continuous" | "markdown";
  onViewModeChange: (mode: "paginated" | "continuous" | "markdown") => void;
  onTitleChange: (newTitle: string) => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onPrint: () => void;
  onNewDoc: () => void;
  onBackToMail: () => void;
  onSwitchToAccounts: () => void;
  onSignOut?: () => void;
  onInsertBlock?: (type: BlockType) => void;
  onOpenPageSetup?: () => void;
  onOpenLibrary?: () => void;
  onDuplicateDoc?: () => void;
  onOpenFindReplace?: () => void;
  onOpenVersionHistory?: () => void;
  onOpenHyperlinkModal?: () => void;
  onAddFootnote?: () => void;
  onOpenSignatureModal?: () => void;
  onOpenNewCommentModal?: () => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  columns?: 1 | 2 | 3;
  columnDivider?: boolean;
  onColumnsChange?: (columns: 1 | 2 | 3, spacing?: number, divider?: boolean) => void;
  userEmail?: string;
  userName?: string;
}

export const DocsHeader: React.FC<DocsHeaderProps> = ({
  doc,
  viewMode,
  onViewModeChange,
  onTitleChange,
  onOpenExport,
  onOpenImport,
  onPrint,
  onNewDoc,
  onBackToMail,
  onSwitchToAccounts,
  onSignOut,
  onInsertBlock,
  onOpenPageSetup,
  onOpenLibrary,
  onDuplicateDoc,
  onOpenFindReplace,
  onOpenVersionHistory,
  onOpenHyperlinkModal,
  onAddFootnote,
  onOpenSignatureModal,
  onOpenNewCommentModal,
  showRuler = true,
  onToggleRuler,
  columns = 1,
  columnDivider = false,
  onColumnsChange,
  userEmail = "user@postveil.app",
  userName = "Postveil Creator",
}) => {
  const [isWaffleOpen, setIsWaffleOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  return (
    <header className="pdocs-header" role="banner">
      {/* Left: App Logo, Waffle Launcher, Title & Menus */}
      <div className="pdocs-header-left">
        <div style={{ position: "relative" }}>
          <button
            className="pdocs-tool-btn"
            title="Postveil Sovereign Suite"
            onClick={() => {
              setIsWaffleOpen(!isWaffleOpen);
              setIsUserMenuOpen(false);
            }}
            style={{ width: 34, height: 34, padding: 0 }}
          >
            <LayoutGrid size={18} />
          </button>
          <WaffleLauncher
            isOpen={isWaffleOpen}
            onClose={() => setIsWaffleOpen(false)}
            anchorOrigin="left"
            onSwitchToMail={onBackToMail}
            onSwitchToAccounts={onSwitchToAccounts}
          />
        </div>

        <div className="pdocs-logo-brand" onClick={onNewDoc} title="New P-Docs Document">
          <BrandMark small />
          <span style={{ fontWeight: 700, fontSize: "16px", color: "var(--pdocs-primary)" }}>
            P-Docs
          </span>
        </div>

        <div className="pdocs-title-wrapper">
          <input
            className="pdocs-title-input"
            value={doc.metadata.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled Document"
            title="Rename Document"
          />

          {/* Menubar */}
          <div className="pdocs-menubar">
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
              >
                File
              </button>
              {activeMenu === "file" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "6px",
                      minWidth: "220px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onNewDoc();
                        setActiveMenu(null);
                      }}
                    >
                      <FileText size={15} style={{ marginRight: 8 }} />
                      New Document
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenLibrary?.();
                        setActiveMenu(null);
                      }}
                    >
                      <FolderOpen size={15} style={{ marginRight: 8, color: "#0f5132" }} />
                      Open... (Library & Local OPFS)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onDuplicateDoc?.();
                        setActiveMenu(null);
                      }}
                    >
                      <Copy size={15} style={{ marginRight: 8 }} />
                      Make a copy
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenVersionHistory?.();
                        setActiveMenu(null);
                      }}
                    >
                      <History size={15} style={{ marginRight: 8, color: "#2563eb" }} />
                      Version history (Ctrl+Alt+Shift+H)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenSignatureModal?.();
                        setActiveMenu(null);
                      }}
                    >
                      <ShieldCheck size={15} style={{ marginRight: 8, color: "#059669" }} />
                      Sovereign digital signature (Ed25519)...
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenImport();
                        setActiveMenu(null);
                      }}
                    >
                      <Upload size={15} style={{ marginRight: 8 }} />
                      Import (DOCX, ODT, MD...)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenExport();
                        setActiveMenu(null);
                      }}
                    >
                      <Download size={15} style={{ marginRight: 8 }} />
                      Export Document As...
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onPrint();
                        setActiveMenu(null);
                      }}
                    >
                      <Printer size={15} style={{ marginRight: 8 }} />
                      Print / Save as PDF (Ctrl+P)
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenPageSetup?.();
                        setActiveMenu(null);
                      }}
                    >
                      <Settings2 size={15} style={{ marginRight: 8 }} />
                      Page setup (Margins & Size)...
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Edit Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
              >
                Edit
              </button>
              {activeMenu === "edit" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "6px",
                      minWidth: "200px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        document.execCommand("undo");
                        setActiveMenu(null);
                      }}
                    >
                      Undo (Ctrl+Z)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        document.execCommand("redo");
                        setActiveMenu(null);
                      }}
                    >
                      Redo (Ctrl+Y)
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        document.execCommand("selectAll");
                        setActiveMenu(null);
                      }}
                    >
                      Select All (Ctrl+A)
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenFindReplace?.();
                        setActiveMenu(null);
                      }}
                    >
                      <Search size={14} style={{ marginRight: 8 }} />
                      Find and replace (Ctrl+H)
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* View Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
              >
                View
              </button>
              {activeMenu === "view" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "6px",
                      minWidth: "220px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <button
                      className={`pdocs-tool-btn ${viewMode === "paginated" ? "active" : ""}`}
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onViewModeChange("paginated");
                        setActiveMenu(null);
                      }}
                    >
                      Paginated Paper View
                    </button>
                    <button
                      className={`pdocs-tool-btn ${viewMode === "continuous" ? "active" : ""}`}
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onViewModeChange("continuous");
                        setActiveMenu(null);
                      }}
                    >
                      Continuous Flow Canvas
                    </button>
                    <button
                      className={`pdocs-tool-btn ${viewMode === "markdown" ? "active" : ""}`}
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onViewModeChange("markdown");
                        setActiveMenu(null);
                      }}
                    >
                      Markdown Source Split View
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "space-between", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onToggleRuler?.();
                        setActiveMenu(null);
                      }}
                    >
                      <span>Show ruler</span>
                      {showRuler && <Check size={14} color="#0f5132" />}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Insert Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "insert" ? null : "insert")}
              >
                Insert
              </button>
              {activeMenu === "insert" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "6px",
                      minWidth: "200px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenHyperlinkModal?.();
                        setActiveMenu(null);
                      }}
                    >
                      <Link2 size={15} style={{ marginRight: 8, color: "#2563eb" }} />
                      Link... (Ctrl+K)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onAddFootnote?.();
                        setActiveMenu(null);
                      }}
                    >
                      <Bookmark size={15} style={{ marginRight: 8, color: "#7c3aed" }} />
                      Footnote (Ctrl+Alt+F)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onOpenNewCommentModal?.();
                        setActiveMenu(null);
                      }}
                    >
                      <MessageSquare size={15} style={{ marginRight: 8, color: "#2563eb" }} />
                      Comment (Ctrl+Alt+M)
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("toc");
                        setActiveMenu(null);
                      }}
                    >
                      Table of contents
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("columnBreak");
                        setActiveMenu(null);
                      }}
                    >
                      Column Break (Ctrl+Shift+Enter)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("pageBreak");
                        setActiveMenu(null);
                      }}
                    >
                      Page Break (Ctrl+Enter)
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("table");
                        setActiveMenu(null);
                      }}
                    >
                      Table
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("mathBlock");
                        setActiveMenu(null);
                      }}
                    >
                      LaTeX Math Equation
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("callout");
                        setActiveMenu(null);
                      }}
                    >
                      Sovereign Callout Box
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("taskList");
                        setActiveMenu(null);
                      }}
                    >
                      Checklist
                    </button>
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "flex-start", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onInsertBlock?.("divider");
                        setActiveMenu(null);
                      }}
                    >
                      Horizontal Line
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Format Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "format" ? null : "format")}
              >
                Format
              </button>
              {activeMenu === "format" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "6px",
                      minWidth: "200px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <div style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Columns
                    </div>
                    <button
                      className={`pdocs-tool-btn ${columns === 1 ? "active" : ""}`}
                      style={{ justifyContent: "space-between", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onColumnsChange?.(1, undefined, columnDivider);
                        setActiveMenu(null);
                      }}
                    >
                      <span>1 Column (Standard)</span>
                      {columns === 1 && <Check size={14} color="#0f5132" />}
                    </button>
                    <button
                      className={`pdocs-tool-btn ${columns === 2 ? "active" : ""}`}
                      style={{ justifyContent: "space-between", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onColumnsChange?.(2, 0.5, columnDivider);
                        setActiveMenu(null);
                      }}
                    >
                      <span>2 Columns (Dual)</span>
                      {columns === 2 && <Check size={14} color="#0f5132" />}
                    </button>
                    <button
                      className={`pdocs-tool-btn ${columns === 3 ? "active" : ""}`}
                      style={{ justifyContent: "space-between", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onColumnsChange?.(3, 0.5, columnDivider);
                        setActiveMenu(null);
                      }}
                    >
                      <span>3 Columns (Newspaper)</span>
                      {columns === 3 && <Check size={14} color="#0f5132" />}
                    </button>
                    <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 0" }} />
                    <button
                      className="pdocs-tool-btn"
                      style={{ justifyContent: "space-between", width: "100%", padding: "8px 12px" }}
                      onClick={() => {
                        onColumnsChange?.(columns, 0.5, !columnDivider);
                        setActiveMenu(null);
                      }}
                    >
                      <span>Line between columns</span>
                      {columnDivider && <Check size={14} color="#0f5132" />}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Tools Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="pdocs-menu-item"
                onClick={() => setActiveMenu(activeMenu === "tools" ? null : "tools")}
              >
                Tools
              </button>
              {activeMenu === "tools" && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 120 }}
                    onClick={() => setActiveMenu(null)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "24px",
                      left: 0,
                      backgroundColor: "#ffffff",
                      borderRadius: "10px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "12px",
                      minWidth: "220px",
                      zIndex: 130,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                      Document Statistics
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>Words:</span>
                      <strong style={{ color: "#0f172a" }}>{doc.metadata.wordCount}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>Characters:</span>
                      <strong style={{ color: "#0f172a" }}>{doc.metadata.charCount}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>Reading Time:</span>
                      <strong style={{ color: "#0f172a" }}>~{doc.metadata.readingTimeMinutes} min</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>Paper Format:</span>
                      <strong style={{ color: "#0f5132" }}>{doc.metadata.paperSize} ({doc.metadata.orientation})</strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Autosave Status */}
      <div className="pdocs-status-indicator" title="Origin Private File System Zero-Hostage Storage">
        <Check size={14} />
        <span>Saved to local OPFS</span>
      </div>

      {/* Right: Actions, View Modes, Profile Popover */}
      <div className="pdocs-header-right">
        {/* View mode toggle */}
        <div className="pdocs-view-toggle-group">
          <button
            className={`pdocs-tool-btn ${viewMode === "paginated" ? "active" : ""}`}
            onClick={() => onViewModeChange("paginated")}
            title="Print Layout (Letter/A4 discrete pages)"
            style={{ fontSize: "12px", height: "28px" }}
          >
            <Layers size={13} className="pdocs-view-mode-icon" />
            <span className="pdocs-view-mode-label">Print Layout</span>
          </button>
          <button
            className={`pdocs-tool-btn ${viewMode === "continuous" ? "active" : ""}`}
            onClick={() => onViewModeChange("continuous")}
            title="Continuous Flow Web Canvas"
            style={{ fontSize: "12px", height: "28px" }}
          >
            <Eye size={13} className="pdocs-view-mode-icon" />
            <span className="pdocs-view-mode-label">Flow</span>
          </button>
          <button
            className={`pdocs-tool-btn ${viewMode === "markdown" ? "active" : ""}`}
            onClick={() => onViewModeChange("markdown")}
            title="Markdown Source Split View"
            style={{ fontSize: "12px", height: "28px" }}
          >
            <FileCode size={13} className="pdocs-view-mode-icon" />
            <span className="pdocs-view-mode-label">Markdown</span>
          </button>
        </div>

        <button className="pdocs-btn-secondary pdocs-header-btn-import" onClick={onOpenImport} title="Import from DOCX, ODT, MD, HTML">
          <Upload size={15} />
          <span className="pdocs-btn-text">Import</span>
        </button>

        <button className="pdocs-btn-export pdocs-header-btn-export" onClick={onOpenExport} title="Export to 10 Formats">
          <Download size={15} />
          <span className="pdocs-btn-text">Export As</span>
        </button>

        {/* User Profile Avatar */}
        <div style={{ position: "relative" }}>
          <button
            className="pv-acc-avatar-btn"
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsWaffleOpen(false);
            }}
            title={userEmail}
            style={{ cursor: "pointer" }}
          >
            <div className="pv-acc-avatar" style={{ width: 34, height: 34, fontSize: 14 }}>
              {userName.charAt(0).toUpperCase()}
            </div>
          </button>

          {isUserMenuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 190 }}
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="pv-acc-user-popover" style={{ top: "48px", right: "0px" }}>
                <div className="pv-acc-user-popover-avatar">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: "17px", fontWeight: 600 }}>{userName}</div>
                <div style={{ fontSize: "13px", color: "var(--pv-acc-text-secondary)" }}>
                  {userEmail}
                </div>

                <button
                  className="pv-acc-btn-manage"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSwitchToAccounts();
                  }}
                  style={{ textDecoration: "none", cursor: "pointer" }}
                >
                  <ShieldCheck size={16} style={{ marginRight: 8, color: "#0f5132" }} />
                  Manage your Postveil Account
                </button>

                <div style={{ width: "100%", height: "1px", backgroundColor: "#e2e8f0", margin: "8px 0" }} />

                <button
                  className="mail-ribbon-menu-item"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "14px",
                    color: "#334155",
                  }}
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onBackToMail();
                  }}
                >
                  <Mail size={16} />
                  Open P-Mail Inbox
                </button>

                {onSignOut && (
                  <button className="pv-acc-btn-signout" style={{ marginTop: "12px" }} onClick={onSignOut}>
                    <LogOut size={16} />
                    Sign out of Postveil
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
