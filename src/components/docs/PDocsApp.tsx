import React, { useState, useEffect, useRef, useMemo } from "react";
import "./ui/DocsStyles.css";
import {
  type UniversalDoc,
  type DocBlock,
  type BlockType,
  type SupportedFormat,
  type PaperSize,
  type Orientation,
  type DocMargins,
  type ReviewMode,
  type CryptographicSignature,
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
import { DocumentLibraryModal } from "./ui/DocumentLibraryModal";
import { FindReplaceModal } from "./ui/FindReplaceModal";
import { VersionHistoryModal } from "./ui/VersionHistoryModal";
import { HyperlinkModal } from "./ui/HyperlinkModal";
import { CryptographicSignatureModal } from "./ui/CryptographicSignatureModal";
import { NewCommentModal } from "./ui/NewCommentModal";
import { prewarmTopFonts, ensureFontLoaded } from "./engine/FontCatalog";

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

  // On mobile (<768px), default to continuous flow mode and collapsed sidebar for ergonomic reading
  const isMobileInitial = typeof window !== "undefined" && window.innerWidth < 768;
  const isTabletInitial = typeof window !== "undefined" && window.innerWidth < 1024;
  const [viewMode, setViewMode] = useState<"paginated" | "continuous" | "markdown">(
    isMobileInitial ? "continuous" : "paginated"
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isTabletInitial);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<SupportedFormat>("docx");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isHyperlinkModalOpen, setIsHyperlinkModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isNewCommentModalOpen, setIsNewCommentModalOpen] = useState(false);
  const [commentTargetBlockId, setCommentTargetBlockId] = useState<string>("");
  const [commentQuotedText, setCommentQuotedText] = useState<string>("");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("editing");
  const [hyperlinkInitialText, setHyperlinkInitialText] = useState("");
  const [hyperlinkInitialUrl, setHyperlinkInitialUrl] = useState("");
  const [showRuler, setShowRuler] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState<string>("Schibsted Grotesk");
  const [fontSize, setFontSize] = useState(15);
  const [markdownSource, setMarkdownSource] = useState("");

  // Restore active document from OPFS on mount and prewarm fonts
  useEffect(() => {
    prewarmTopFonts();
    void (async () => {
      const activeId = OpfsDocStorage.getActiveDocumentId();
      if (activeId) {
        const loaded = await OpfsDocStorage.loadDocumentLocally(activeId);
        if (loaded) {
          engineRef.current.setDocument(loaded);
          setDoc(loaded);
          if (loaded.metadata?.fontFamily) {
            setFontFamily(loaded.metadata.fontFamily);
            void ensureFontLoaded(loaded.metadata.fontFamily);
          }
        }
      }
    })();
  }, []);

  // Global keyboard shortcuts (Ctrl+O, Ctrl+H, Ctrl+K, Ctrl+Alt+Shift+H, Ctrl+Alt+F, Ctrl+Alt+M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        setIsLibraryOpen(true);
      } else if (modKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setIsFindReplaceOpen(true);
      } else if (modKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const sel = window.getSelection();
        const selectedText = sel ? sel.toString().trim() : "";
        setHyperlinkInitialText(selectedText);
        setHyperlinkInitialUrl("");
        setIsHyperlinkModalOpen(true);
      } else if (modKey && e.altKey && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setIsVersionHistoryOpen(true);
      } else if (modKey && e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        handleAddFootnote();
      } else if (modKey && e.altKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        handleOpenNewCommentModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeBlockId, doc]);

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
    OpfsDocStorage.setActiveDocumentId(newDoc.metadata.id);
  };

  const handleSelectDocFromLibrary = (loadedDoc: UniversalDoc) => {
    engineRef.current.setDocument(loadedDoc);
    setDoc(loadedDoc);
    OpfsDocStorage.setActiveDocumentId(loadedDoc.metadata.id);
    setIsLibraryOpen(false);
  };

  const handleDuplicateDoc = async () => {
    const cloned = await OpfsDocStorage.duplicateDocumentLocally(doc.metadata.id);
    if (cloned) {
      engineRef.current.setDocument(cloned);
      setDoc(cloned);
      OpfsDocStorage.setActiveDocumentId(cloned.metadata.id);
    }
  };

  const handleReplaceBlockContent = (blockId: string, newContent: string) => {
    engineRef.current.updateBlockContent(blockId, newContent);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleReplaceAllBlocks = (newDoc: UniversalDoc) => {
    engineRef.current.setDocument(newDoc);
    setDoc(newDoc);
  };

  const handleLineSpacingChange = (spacing: "1.0" | "1.15" | "1.5" | "2.0") => {
    setDoc((prev) => {
      const updated = {
        ...prev,
        metadata: {
          ...prev.metadata,
          lineSpacing: spacing,
        },
      };
      engineRef.current.setDocument(updated);
      return updated;
    });
  };

  const handleDocumentImported = (importedDoc: UniversalDoc) => {
    engineRef.current.setDocument(importedDoc);
    setDoc(importedDoc);
    OpfsDocStorage.setActiveDocumentId(importedDoc.metadata.id);
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

  const handleChangeBlockType = (blockId: string, newType: BlockType, level?: 1 | 2 | 3 | 4 | 5 | 6) => {
    engineRef.current.changeBlockType(blockId, newType, level);
    setDoc({ ...engineRef.current.getDocument() });
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

  const handleInsertBlocksAfter = (afterId: string, blocks: DocBlock[]) => {
    engineRef.current.insertBlocksAfter(afterId, blocks);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateImage = (
    blockId: string,
    url: string,
    alt?: string,
    width?: string,
    align?: "left" | "center" | "right"
  ) => {
    engineRef.current.updateImage(blockId, url, alt, width, align);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateToc = (blockId: string, style: "dotted" | "links") => {
    engineRef.current.updateTocStyle(blockId, style);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleColumnsChange = (columns: 1 | 2 | 3, spacing?: number, divider?: boolean) => {
    engineRef.current.updateColumns(columns, spacing, divider);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleInsertImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        const targetId = activeBlockId || doc.blocks[doc.blocks.length - 1]?.id || "";
        const newBlock: DocBlock = {
          id: `b_${Date.now()}`,
          type: "image",
          content: file.name,
          imageUrl: dataUrl,
          imageAlt: file.name,
          imageWidth: "100%",
          imageAlign: "center",
        };
        engineRef.current.insertBlocksAfter(targetId, [newBlock]);
        setDoc({ ...engineRef.current.getDocument() });
        setActiveBlockId(newBlock.id);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddFootnote = (blockId?: string, text?: string) => {
    const targetBlockId = blockId || activeBlockId || doc.blocks[0]?.id || "";
    engineRef.current.addFootnote(targetBlockId, text || "Footnote citation text.");
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateFootnote = (id: string, text: string) => {
    engineRef.current.updateFootnote(id, text);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleDeleteFootnote = (id: string) => {
    engineRef.current.deleteFootnote(id);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleUpdateHeaderFooter = (
    headerText?: string,
    footerText?: string,
    differentFirstPage?: boolean,
    pageNumberStyle?: "none" | "standard" | "pageOfTotal"
  ) => {
    engineRef.current.updateHeaderFooter(headerText, footerText, differentFirstPage, pageNumberStyle);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleOpenHyperlinkModal = (initialText?: string, initialUrl?: string) => {
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : "";
    setHyperlinkInitialText(initialText || selectedText || "");
    setHyperlinkInitialUrl(initialUrl || "");
    setIsHyperlinkModalOpen(true);
  };

  const handleApplyHyperlink = (text: string, url: string) => {
    try {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.getAttribute("contenteditable") === "true" ||
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA")
      ) {
        document.execCommand(
          "insertHTML",
          false,
          `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">${text || url}</a>`
        );
      }
    } catch (err) {
      console.warn("Could not insert hyperlink HTML:", err);
    }
  };

  const handleRestoreVersion = (restoredDoc: UniversalDoc) => {
    engineRef.current.setDocument(restoredDoc);
    setDoc(restoredDoc);
    OpfsDocStorage.setActiveDocumentId(restoredDoc.metadata.id);
    setIsVersionHistoryOpen(false);
  };

  const handleOpenNewCommentModal = (blockId?: string, quotedText?: string) => {
    const sel = window.getSelection();
    const text = quotedText || (sel ? sel.toString().trim() : "");
    setCommentTargetBlockId(blockId || activeBlockId || doc.blocks[0]?.id || "");
    setCommentQuotedText(text);
    setIsNewCommentModalOpen(true);
  };

  const handleAddComment = (blockId: string, text: string, quotedText?: string) => {
    engineRef.current.addComment(blockId, text, userName, userEmail, quotedText);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleAddCommentReply = (commentId: string, text: string) => {
    engineRef.current.addCommentReply(commentId, text, userName, userEmail);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleResolveComment = (commentId: string) => {
    engineRef.current.resolveComment(commentId);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleDeleteComment = (commentId: string) => {
    engineRef.current.deleteComment(commentId);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleAcceptSuggestion = (suggestionId: string) => {
    engineRef.current.acceptSuggestion(suggestionId);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    engineRef.current.rejectSuggestion(suggestionId);
    setDoc({ ...engineRef.current.getDocument() });
  };

  const handleAddSignature = (sig: CryptographicSignature) => {
    engineRef.current.addSignature(sig);
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
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onDuplicateDoc={handleDuplicateDoc}
        onOpenFindReplace={() => setIsFindReplaceOpen(true)}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        onOpenHyperlinkModal={() => handleOpenHyperlinkModal()}
        onAddFootnote={() => handleAddFootnote()}
        onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
        onOpenNewCommentModal={() => handleOpenNewCommentModal()}
        showRuler={showRuler}
        onToggleRuler={() => setShowRuler((prev) => !prev)}
        columns={doc.metadata.columns || 1}
        columnDivider={doc.metadata.columnDivider || false}
        onColumnsChange={handleColumnsChange}
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
          engineRef.current.updateFontFamily(f);
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
        lineSpacing={doc.metadata.lineSpacing || "1.15"}
        onLineSpacingChange={handleLineSpacingChange}
        paperSize={doc.metadata.paperSize}
        orientation={doc.metadata.orientation}
        margins={doc.metadata.margins}
        onPaperSetupChange={handlePaperSetupChange}
        onMarginsChange={handleMarginsChange}
        onOpenPageSetup={() => setIsPageSetupOpen(true)}
        onOpenFindReplace={() => setIsFindReplaceOpen(true)}
        onOpenHyperlinkModal={() => handleOpenHyperlinkModal()}
        onAddFootnote={() => handleAddFootnote()}
        columns={doc.metadata.columns || 1}
        columnSpacing={doc.metadata.columnSpacing || 0.5}
        columnDivider={doc.metadata.columnDivider || false}
        onColumnsChange={handleColumnsChange}
        onInsertImageFile={handleInsertImageFile}
        reviewMode={reviewMode}
        onReviewModeChange={setReviewMode}
        onOpenNewCommentModal={() => handleOpenNewCommentModal()}
        onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
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
          onAddCommentReply={handleAddCommentReply}
          onResolveComment={handleResolveComment}
          onDeleteComment={handleDeleteComment}
          onAcceptSuggestion={handleAcceptSuggestion}
          onRejectSuggestion={handleRejectSuggestion}
          onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
          onOpenNewCommentModal={() => handleOpenNewCommentModal()}
        />

        {/* Mobile Scrim Backdrop for Sidebar drawer */}
        {!isSidebarCollapsed && (
          <div
            className="pdocs-sidebar-scrim"
            onClick={() => setIsSidebarCollapsed(true)}
            aria-label="Close sidebar drawer"
          />
        )}

        {/* Editing Canvas or Markdown Split */}
        {viewMode === "markdown" ? (
          <div className="pdocs-markdown-split">
            <div className="pdocs-markdown-editor-pane">
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
            <div className="pdocs-markdown-preview-pane">
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132", marginBottom: 8, textTransform: "uppercase" }}>
                Live Document AST Preview
              </div>
              <DocsCanvas
                doc={doc}
                viewMode="continuous"
                showRuler={false}
                onMarginsChange={handleMarginsChange}
                onUpdateBlockContent={handleUpdateBlockContent}
                onToggleTask={handleToggleTask}
                onInsertBlockAfter={handleInsertBlockAfter}
                onDeleteBlock={handleDeleteBlock}
                onSplitBlock={handleSplitBlock}
                onUpdateTableRows={handleUpdateTableRows}
                onUpdateCallout={handleUpdateCallout}
                onUpdateMathLatex={handleUpdateMathLatex}
                onInsertBlocksAfter={handleInsertBlocksAfter}
                onUpdateImage={handleUpdateImage}
                onUpdateToc={handleUpdateToc}
                onAddFootnote={handleAddFootnote}
                onUpdateFootnote={handleUpdateFootnote}
                onDeleteFootnote={handleDeleteFootnote}
                onUpdateHeaderFooter={handleUpdateHeaderFooter}
                onOpenHyperlinkModal={handleOpenHyperlinkModal}
                reviewMode={reviewMode}
                onOpenNewCommentModal={handleOpenNewCommentModal}
                onChangeBlockType={handleChangeBlockType}
              />
            </div>
          </div>
        ) : (
          <DocsCanvas
            doc={doc}
            viewMode={viewMode}
            showRuler={showRuler}
            onMarginsChange={handleMarginsChange}
            onUpdateBlockContent={handleUpdateBlockContent}
            onToggleTask={handleToggleTask}
            onInsertBlockAfter={handleInsertBlockAfter}
            onDeleteBlock={handleDeleteBlock}
            onSplitBlock={handleSplitBlock}
            onUpdateTableRows={handleUpdateTableRows}
            onUpdateCallout={handleUpdateCallout}
            onUpdateMathLatex={handleUpdateMathLatex}
            onInsertBlocksAfter={handleInsertBlocksAfter}
            onUpdateImage={handleUpdateImage}
            onUpdateToc={handleUpdateToc}
            onAddFootnote={handleAddFootnote}
            onUpdateFootnote={handleUpdateFootnote}
            onDeleteFootnote={handleDeleteFootnote}
            onUpdateHeaderFooter={handleUpdateHeaderFooter}
            onOpenHyperlinkModal={handleOpenHyperlinkModal}
            reviewMode={reviewMode}
            onOpenNewCommentModal={handleOpenNewCommentModal}
            onChangeBlockType={handleChangeBlockType}
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

      {/* Document Library Modal */}
      <DocumentLibraryModal
        isOpen={isLibraryOpen}
        activeDocId={doc.metadata.id}
        onClose={() => setIsLibraryOpen(false)}
        onSelectDoc={handleSelectDocFromLibrary}
        onCreateNewDoc={() => {
          handleNewDoc();
          setIsLibraryOpen(false);
        }}
      />

      {/* Find and Replace Modal */}
      <FindReplaceModal
        isOpen={isFindReplaceOpen}
        doc={doc}
        onClose={() => setIsFindReplaceOpen(false)}
        onReplaceBlockContent={handleReplaceBlockContent}
        onReplaceAllBlocks={handleReplaceAllBlocks}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        currentDoc={doc}
        onClose={() => setIsVersionHistoryOpen(false)}
        onRestoreVersion={handleRestoreVersion}
      />

      {/* Hyperlink Modal */}
      <HyperlinkModal
        isOpen={isHyperlinkModalOpen}
        initialText={hyperlinkInitialText}
        initialUrl={hyperlinkInitialUrl}
        onClose={() => setIsHyperlinkModalOpen(false)}
        onApply={handleApplyHyperlink}
      />

      {/* Sovereign Cryptographic Signature Modal */}
      <CryptographicSignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        doc={doc}
        onAddSignature={handleAddSignature}
        userEmail={userEmail}
        userName={userName}
      />

      {/* New Comment Modal */}
      <NewCommentModal
        isOpen={isNewCommentModalOpen}
        onClose={() => setIsNewCommentModalOpen(false)}
        blockId={commentTargetBlockId}
        quotedText={commentQuotedText}
        onAddComment={handleAddComment}
      />
    </div>
  );
};

export default PDocsApp;
