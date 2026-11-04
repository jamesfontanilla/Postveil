import React, { useState, useEffect } from "react";
import { RibbonIcons } from "../icons";
import { BackstageTab } from "../types";
import { UniversalDoc, SupportedFormat } from "../../../types";
import { OpfsDocStorage } from "../../../engine/OpfsDocStorage";

export interface BackstageViewProps {
  isOpen: boolean;
  doc: UniversalDoc;
  onClose: () => void;
  onNewDoc: () => void;
  onOpenLibrary: () => void;
  onSaveDoc: () => void;
  onExportFormat: (format: SupportedFormat) => void;
  onPrint: () => void;
  onOpenSignatureModal: () => void;
  userEmail?: string;
  userName?: string;
}

export const BackstageView: React.FC<BackstageViewProps> = ({
  isOpen,
  doc,
  onClose,
  onNewDoc,
  onOpenLibrary,
  onSaveDoc,
  onExportFormat,
  onPrint,
  onOpenSignatureModal,
  userEmail,
  userName,
}) => {
  const [activeTab, setActiveTab] = useState<BackstageTab>("home");
  const [recentDocs, setRecentDocs] = useState<import("../../../engine/OpfsDocStorage").DocStorageSummary[]>([]);

  useEffect(() => {
    if (isOpen) {
      OpfsDocStorage.listLocalDocuments().then((list: import("../../../engine/OpfsDocStorage").DocStorageSummary[]) => {
        setRecentDocs(list.slice(0, 5));
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const BackIcon = RibbonIcons.back;

  return (
    <div className="pdocs-backstage-overlay" role="dialog" aria-modal="true" aria-label="Backstage View">
      {/* Sidebar Navigation */}
      <div className="pdocs-backstage-sidebar">
        <button
          type="button"
          className="pdocs-backstage-back-btn"
          onClick={onClose}
          title="Return to Document (Esc)"
        >
          <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors">
            <BackIcon size={16} />
          </div>
        </button>

        <div className="pdocs-backstage-nav">
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "home" ? "active" : ""}`}
            onClick={() => setActiveTab("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "new" ? "active" : ""}`}
            onClick={() => setActiveTab("new")}
          >
            New
          </button>
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "open" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("open");
              onOpenLibrary();
              onClose();
            }}
          >
            Open
          </button>
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "info" ? "active" : ""}`}
            onClick={() => setActiveTab("info")}
          >
            Info
          </button>
          <div className="pdocs-backstage-nav-divider" />
          <button
            type="button"
            className="pdocs-backstage-nav-item"
            onClick={() => {
              onSaveDoc();
              onClose();
            }}
          >
            Save
          </button>
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
          >
            Export
          </button>
          <button
            type="button"
            className="pdocs-backstage-nav-item"
            onClick={() => {
              onPrint();
              onClose();
            }}
          >
            Print
          </button>
          <button
            type="button"
            className={`pdocs-backstage-nav-item ${activeTab === "share" ? "active" : ""}`}
            onClick={() => setActiveTab("share")}
          >
            Share
          </button>
          <div className="pdocs-backstage-nav-divider" />
          <button
            type="button"
            className="pdocs-backstage-nav-item text-red-300 hover:text-red-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pdocs-backstage-content">
        {activeTab === "home" && (
          <div className="pdocs-backstage-pane">
            <h1 className="text-2xl font-bold mb-2">Good day, {userName || "Postveil Author"}</h1>
            <p className="text-slate-400 text-sm mb-6">Create new documents or continue where you left off in your sovereign local vault.</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <button
                type="button"
                className="pdocs-template-card"
                onClick={() => {
                  onNewDoc();
                  onClose();
                }}
              >
                <div className="w-10 h-10 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg mb-3">+</div>
                <div className="font-semibold text-sm">Blank document</div>
                <div className="text-xs text-slate-400">Start from a clean slate</div>
              </button>
              <button
                type="button"
                className="pdocs-template-card"
                onClick={() => {
                  onOpenLibrary();
                  onClose();
                }}
              >
                <div className="w-10 h-10 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg mb-3">📁</div>
                <div className="font-semibold text-sm">Document Library</div>
                <div className="text-xs text-slate-400">Browse OPFS local vault</div>
              </button>
            </div>

            <h2 className="text-lg font-semibold mb-3">Recent Documents</h2>
            <div className="flex flex-col gap-2">
              {recentDocs.length === 0 ? (
                <div className="text-sm text-slate-400 italic">No recent documents found.</div>
              ) : (
                recentDocs.map((item) => (
                  <div key={item.id} className="pdocs-recent-item">
                    <div className="font-medium text-sm">{item.title || "Untitled Document"}</div>
                    <div className="text-xs text-slate-400">
                      Modified {new Date(item.updatedAt).toLocaleDateString()} • {item.wordCount || 0} words
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "new" && (
          <div className="pdocs-backstage-pane">
            <h1 className="text-2xl font-bold mb-6">New Document</h1>
            <div className="grid grid-cols-3 gap-4">
              <button
                type="button"
                className="pdocs-template-card"
                onClick={() => {
                  onNewDoc();
                  onClose();
                }}
              >
                <div className="w-12 h-14 bg-white/10 rounded border border-white/20 mb-3 flex items-center justify-center text-xl font-bold text-blue-400">+</div>
                <div className="font-semibold text-sm">Blank Document</div>
                <div className="text-xs text-slate-400">Standard A4 / Letter Canvas</div>
              </button>
            </div>
          </div>
        )}

        {activeTab === "info" && (
          <div className="pdocs-backstage-pane">
            <h1 className="text-2xl font-bold mb-6">Document Info</h1>
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded border border-slate-700 bg-slate-800/40">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Document Title</div>
                  <div className="text-lg font-semibold">{doc.metadata.title}</div>
                </div>

                <div className="p-4 rounded border border-slate-700 bg-slate-800/40">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cryptographic Notary</div>
                  <p className="text-xs text-slate-300 mb-3">
                    Sign and seal this document with an immutable Ed25519 digital signature and canonical SHA-256 hash.
                  </p>
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                    onClick={() => {
                      onOpenSignatureModal();
                      onClose();
                    }}
                  >
                    Open Sovereign Notary
                  </button>
                </div>
              </div>

              <div className="p-4 rounded border border-slate-700 bg-slate-800/40 flex flex-col gap-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Properties</div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                  <span className="text-slate-400">Words</span>
                  <span className="font-medium">{doc.metadata.wordCount}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                  <span className="text-slate-400">Characters</span>
                  <span className="font-medium">{doc.metadata.charCount}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                  <span className="text-slate-400">Paper Size</span>
                  <span className="font-medium">{doc.metadata.paperSize} ({doc.metadata.orientation})</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                  <span className="text-slate-400">Storage Substrate</span>
                  <span className="font-medium text-emerald-400">Origin Private File System (OPFS)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "export" && (
          <div className="pdocs-backstage-pane">
            <h1 className="text-2xl font-bold mb-2">Export Document</h1>
            <p className="text-slate-400 text-sm mb-6">Download your document in any of Postveil's 10 universal codecs.</p>

            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              {[
                { format: "pdf" as SupportedFormat, label: "PDF Document (.pdf)", desc: "Vector printable publication with KaTeX math" },
                { format: "docx" as SupportedFormat, label: "Microsoft Word (.docx)", desc: "Office Open XML document parity" },
                { format: "odt" as SupportedFormat, label: "OpenDocument Text (.odt)", desc: "LibreOffice & OASIS open standard format" },
                { format: "latex" as SupportedFormat, label: "Academic LaTeX (.tex)", desc: "Clean LaTeX AST with equations and tables" },
                { format: "md" as SupportedFormat, label: "Markdown (.md)", desc: "GitHub flavored markdown" },
                { format: "html" as SupportedFormat, label: "Web Page (.html)", desc: "Standalone styled HTML document" },
              ].map((item) => (
                <button
                  key={item.format}
                  type="button"
                  className="pdocs-export-card"
                  onClick={() => {
                    onExportFormat(item.format);
                    onClose();
                  }}
                >
                  <div className="font-bold text-sm text-blue-400">{item.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "share" && (
          <div className="pdocs-backstage-pane">
            <h1 className="text-2xl font-bold mb-2">Share & Collaboration</h1>
            <p className="text-slate-400 text-sm mb-6">Collaborate with peers over end-to-end encrypted WebRTC mesh channels.</p>
            <div className="p-4 rounded border border-slate-700 bg-slate-800/40 max-w-lg">
              <div className="text-sm font-semibold mb-2">Direct Link</div>
              <input
                type="text"
                readOnly
                value={window.location.href}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 mb-3"
              />
              <button
                type="button"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Document URL copied to clipboard!");
                }}
              >
                Copy Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
