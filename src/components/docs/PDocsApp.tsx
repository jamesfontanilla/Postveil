import React, { useState, useEffect, useRef, useMemo } from "react";
import "./ui/DocsStyles.css";
import {
  type UniversalDoc,
  type BlockType,
  type SupportedFormat,
  type PaperSize,
  type Orientation,
  type DocMargins,
} from "./types";
import { UniversalFormatEngine } from "./formats/UniversalFormatEngine";
import { DocumentEngine } from "./engine/DocumentEngine";
import { OpfsDocStorage } from "./engine/OpfsDocStorage";
import { DocsHeader } from "./ui/DocsHeader";
import { DocsToolbar } from "./ui/DocsToolbar";
import { DocsSidebar } from "./ui/DocsSidebar";
import { DocsCanvas } from "./ui/DocsCanvas";
import { ExportModal } from "./ui/ExportModal";
import { ImportModal } from "./ui/ImportModal";
import { PageSetupModal } from "./ui/PageSetupModal";

interface PDocsAppProps {
  onBackToMail: () => void;
  onSwitchToAccounts: () => void;
  onSignOut?: () => void;
  userEmail?: string;
  userName?: string;
}

export const PDocsApp: React.FC<PDocsAppProps> = ({
  onBackToMail,
  onSwitchToAccounts,
  onSignOut,
  userEmail = "idezjames14@gmail.com",
  userName = "IdesJames",
}) => {
  // Initialize with demo document showcasing 10 formats and math/tables
  const [doc, setDoc] = useState<UniversalDoc>(() => UniversalFormatEngine.createDemoDocument());
  const engineRef = useRef<DocumentEngine>(new DocumentEngine(doc));

  const [viewMode, setViewMode] = useState<"paginated" | "continuous" | "markdown">("paginated");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<SupportedFormat>("docx");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState<"Schibsted Grotesk" | "Inter" | "Merriweather" | "JetBrains Mono">("Schibsted Grotesk");
  const [fontSize, setFontSize] = useState(15);
  const [markdownSource, setMarkdownSource] = useState("");

  // Auto-save to local OPFS on change
  useEffect(() => {
    const timer = setTimeout(() => {
      void OpfsDocStorage.saveDocumentLocally(doc);
    }, 500);
    return () => clearTimeout(timer);
  }, [doc]);

  // Update markdown source if in split view
  useEffect(() => {
    if (viewMode === "markdown") {
      void UniversalFormatEngine.exportDocument(doc, { format: "md" }).then((res) => {
        setMarkdownSource(typeof res.data === "string" ? res.data : "");
      });
    }
  }, [viewMode, doc]);

  const outline = useMemo(() => {
    return engineRef.current.getOutline();
  }, [doc]);

  const handleTitleChange = (newTitle: string) => {
    engineRef.current.updateTitle(newTitle);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateBlockContent = (id: string, content: string) => {
    engineRef.current.updateBlockContent(id, content);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleToggleTask = (id: string) => {
    engineRef.current.toggleTaskItem(id);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleInsertBlock = (type: BlockType) => {
    const targetId = activeBlockId || doc.blocks[doc.blocks.length - 1]?.id || "";
    const newBlock = engineRef.current.insertBlockAfter(targetId, type, "");
    setDoc({ ...engineRef.current.getDocument() });
    setActiveBlockId(newBlock.id);
    setTimeout(() => {
      document.getElementById(newBlock.id)?.focus();
    }, 50);
  };

  const handleInsertBlockAfter = (afterId: string, type: BlockType) => {
    const newBlock = engineRef.current.insertBlockAfter(afterId, type, "");
    setDoc({ ...engineRef.current.getDocument() });
    setActiveBlockId(newBlock.id);
    setTimeout(() => {
      document.getElementById(newBlock.id)?.focus();
    }, 50);
  };

  const handleDeleteBlock = (id: string) => {
    engineRef.current.deleteBlock(id);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUndo = () => {
    const prev = engineRef.current.undo();
    if (prev) setDoc({ ...prev });
  };

  const handleRedo = () => {
    const next = engineRef.current.redo();
    if (next) setDoc({ ...next });
  };

  const handleNewDoc = () => {
    const newDoc = UniversalFormatEngine.createBlankDocument("Untitled Document", userName);
    engineRef.current.setDocument(newDoc);
    setDoc(newDoc);
  };

  const handleDocumentImported = (importedDoc: UniversalDoc) => {
    engineRef.current.setDocument(importedDoc);
    setDoc(importedDoc);
  };

  const handleOpenExportWithFormat = (format: SupportedFormat) => {
    setExportFormat(format);
    setIsExportOpen(true);
  };

  const handleScrollToBlock = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  const handleSplitBlock = (currentId: string, currentContent: string, newContent: string, newType?: BlockType) => {
    const newBlock = engineRef.current.splitBlock(currentId, currentContent, newContent, newType);
    setDoc({ ...engineRef.current.getDocument() });
    setActiveBlockId(newBlock.id);
    setTimeout(() => {
      const el = document.getElementById(newBlock.id);
      if (el) {
        el.focus();
        // Place caret at start of new block
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, 30);
  };

  const handleUpdateTableRows = (blockId: string, rows: import("./types").TableRow[]) => {
    engineRef.current.updateTableRows(blockId, rows);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateCallout = (blockId: string, variant?: import("./types").CalloutVariant, title?: string) => {
    engineRef.current.updateCallout(blockId, variant, title);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateMathLatex = (blockId: string, latex: string) => {
    engineRef.current.updateMathLatex(blockId, latex);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handlePaperSetupChange = (paperSize: PaperSize, orientation: Orientation) => {
    engineRef.current.updatePaperSetup(paperSize, orientation, doc.metadata.margins, doc.metadata.pageColor);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleMarginsChange = (margins: DocMargins) => {
    engineRef.current.updatePaperSetup(doc.metadata.paperSize, doc.metadata.orientation, margins, doc.metadata.pageColor);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleApplyPageSetup = (
    paperSize: PaperSize,
    orientation: Orientation,
    margins: DocMargins,
    pageColor: string
  ) => {
    engineRef.current.updatePaperSetup(paperSize, orientation, margins, pageColor);
    setDoc({ ...engineRef.current.getDocument() });
  };

  return (
    <div className="pdocs-container">
      {/* Header */}
      <DocsHeader
        doc={doc}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onTitleChange={handleTitleChange}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onPrint={() => window.print()}
        onNewDoc={handleNewDoc}
        onBackToMail={onBackToMail}
        onSwitchToAccounts={onSwitchToAccounts}
        onSignOut={onSignOut}
        onInsertBlock={handleInsertBlock}
        onOpenPageSetup={() => setIsPageSetupOpen(true)}
        userEmail={userEmail}
        userName={userName}
      />

      {/* Formatting Toolbar */}
      <DocsToolbar
        canUndo={engineRef.current.canUndo()}
        canRedo={engineRef.current.canRedo()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onPrint={() => window.print()}
        onInsertBlock={handleInsertBlock}
        fontFamily={fontFamily}
        onFontFamilyChange={(f) => {
          setFontFamily(f);
          setDoc((prev) => ({
            ...prev,
            metadata: { ...prev.metadata, fontFamily: f },
          }));
        }}
        fontSize={fontSize}
        onFontSizeChange={(delta) => {
          const next = Math.min(32, Math.max(10, fontSize + delta));
          setFontSize(next);
          setDoc((prev) => ({
            ...prev,
            metadata: { ...prev.metadata, fontSize: next },
          }));
        }}
        paperSize={doc.metadata.paperSize}
        orientation={doc.metadata.orientation}
        margins={doc.metadata.margins}
        onPaperSetupChange={handlePaperSetupChange}
        onMarginsChange={handleMarginsChange}
        onOpenPageSetup={() => setIsPageSetupOpen(true)}
      />

      {/* Main Workspace */}
      <div className="pdocs-workspace">
        {/* Outline & Intelligence Sidebar */}
        <DocsSidebar
          doc={doc}
          outline={outline}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onScrollToBlock={handleScrollToBlock}
          onOpenExportFormat={handleOpenExportWithFormat}
        />

        {/* Editing Canvas or Markdown Split */}
        {viewMode === "markdown" ? (
          <div style={{ flex: 1, display: "flex", height: "100%", backgroundColor: "#ffffff" }}>
            <div style={{ flex: 1, borderRight: "1px solid #e2e8f0", padding: "16px", overflowY: "auto" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                Markdown Source (CommonMark / GFM)
              </div>
              <textarea
                style={{
                  width: "100%",
                  height: "calc(100% - 30px)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  border: "none",
                  outline: "none",
                  resize: "none",
                }}
                value={markdownSource}
                onChange={(e) => {
                  setMarkdownSource(e.target.value);
                  void UniversalFormatEngine.importDocument(e.target.value, "md").then((imported) => {
                    engineRef.current.setDocument(imported);
                    setDoc(imported);
                  });
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132", marginBottom: 8, textTransform: "uppercase" }}>
                Live Document AST Preview
              </div>
              <DocsCanvas
                doc={doc}
                viewMode="continuous"
                onUpdateBlockContent={handleUpdateBlockContent}
                onToggleTask={handleToggleTask}
                onInsertBlockAfter={handleInsertBlockAfter}
                onDeleteBlock={handleDeleteBlock}
                onSplitBlock={handleSplitBlock}
                onUpdateTableRows={handleUpdateTableRows}
                onUpdateCallout={handleUpdateCallout}
                onUpdateMathLatex={handleUpdateMathLatex}
              />
            </div>
          </div>
        ) : (
          <DocsCanvas
            doc={doc}
            viewMode={viewMode}
            onUpdateBlockContent={handleUpdateBlockContent}
            onToggleTask={handleToggleTask}
            onInsertBlockAfter={handleInsertBlockAfter}
            onDeleteBlock={handleDeleteBlock}
            onSplitBlock={handleSplitBlock}
            onUpdateTableRows={handleUpdateTableRows}
            onUpdateCallout={handleUpdateCallout}
            onUpdateMathLatex={handleUpdateMathLatex}
          />
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        doc={doc}
        initialFormat={exportFormat}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onDocumentImported={handleDocumentImported}
      />

      {/* Page Setup Modal */}
      <PageSetupModal
        isOpen={isPageSetupOpen}
        onClose={() => setIsPageSetupOpen(false)}
        currentPaperSize={doc.metadata.paperSize}
        currentOrientation={doc.metadata.orientation}
        currentMargins={doc.metadata.margins}
        currentPageColor={doc.metadata.pageColor}
        onApply={handleApplyPageSetup}
      />
    </div>
  );
};

export default PDocsApp;
