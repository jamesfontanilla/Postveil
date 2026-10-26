import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ParentSuiteRibbon,
  RibbonShell,
} from "../platform/ribbon";

interface RibbonGroupProps {
  title: string;
  children: React.ReactNode;
}

const RibbonGroup: React.FC<RibbonGroupProps> = ({ title, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px", borderRight: "1px solid #e2e8f0" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>{children}</div>
    <span style={{ fontSize: "10px", color: "#94a3b8", textAlign: "center", marginTop: "2px", fontWeight: 500 }}>{title}</span>
  </div>
);

interface RibbonButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

const RibbonButton: React.FC<RibbonButtonProps> = ({ icon, label, onClick, disabled, active }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "2px",
      padding: "4px 8px",
      minWidth: "48px",
      height: "48px",
      border: active ? "1px solid #0f5132" : "1px solid transparent",
      borderRadius: "6px",
      backgroundColor: active ? "rgba(15, 81, 50, 0.08)" : "transparent",
      color: active ? "#0f5132" : "#334155",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      transition: "all 0.15s ease",
    }}
  >
    {icon}
    <span style={{ fontSize: "11px", fontWeight: active ? 600 : 500 }}>{label}</span>
  </button>
);
import {
  Play,
  FileDown,
  FileUp,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sliders,
  MessageSquare,
  Sparkles,
  Layout,
  Code2,
  Eye,
  Columns,
} from "lucide-react";
import {
  DeckPresentation,
  DeckSlide,
  SlideTheme,
  SlideTransition,
} from "./deckTypes";
import {
  parseSovereignDeckMarkdown,
  serializeSovereignDeckMarkdown,
  createDemoPresentation,
  createDefaultSlide,
} from "./deckParser";
import "./DeckStyles.css";

export default function PDeckApp() {
  const [presentation, setPresentation] = useState<DeckPresentation>(() => {
    const saved = localStorage.getItem("postveil_pdeck_current");
    if (saved) {
      try {
        return parseSovereignDeckMarkdown(saved);
      } catch {
        // Fallback to demo
      }
    }
    return createDemoPresentation();
  });

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"home" | "design" | "transitions" | "view">("home");
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notice, setNotice] = useState<string>("");

  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSlide: DeckSlide =
    presentation.slides[currentSlideIndex] || presentation.slides[0];

  // Autosave to localStorage on changes
  useEffect(() => {
    try {
      const markdown = serializeSovereignDeckMarkdown(presentation);
      localStorage.setItem("postveil_pdeck_current", markdown);
    } catch {
      // Ignore quota errors
    }
  }, [presentation]);

  const showEphemeralNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  // Keyboard navigation for presentation
  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) =>
      Math.min(prev + 1, presentation.slides.length - 1)
    );
  }, [presentation.slides.length]);

  const goToPrevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs or textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input") return;

      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPrevSlide();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShowNotes((prev) => !prev);
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextSlide, goToPrevSlide, toggleFullscreen, isFullscreen]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Slide CRUD
  const handleAddSlide = () => {
    const newSlide = createDefaultSlide(presentation.slides.length + 1);
    const newSlides = [...presentation.slides, newSlide];
    setPresentation({
      ...presentation,
      slides: newSlides,
      updatedAt: new Date().toISOString(),
    });
    setCurrentSlideIndex(newSlides.length - 1);
    showEphemeralNotice("Slide added");
  };

  const handleDeleteSlide = () => {
    if (presentation.slides.length <= 1) {
      showEphemeralNotice("Cannot delete the only slide");
      return;
    }
    const newSlides = presentation.slides.filter((_, idx) => idx !== currentSlideIndex);
    setPresentation({
      ...presentation,
      slides: newSlides,
      updatedAt: new Date().toISOString(),
    });
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
    showEphemeralNotice("Slide deleted");
  };

  const handleUpdateCurrentSlideMarkdown = (newMarkdown: string) => {
    const newSlides = [...presentation.slides];
    const headingMatch = newMarkdown.match(/^#\s+(.+)$/m);
    const updatedTitle = headingMatch ? headingMatch[1].trim() : newSlides[currentSlideIndex].title;

    newSlides[currentSlideIndex] = {
      ...newSlides[currentSlideIndex],
      markdown: newMarkdown,
      title: updatedTitle,
    };
    setPresentation({
      ...presentation,
      slides: newSlides,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleThemeChange = (theme: SlideTheme) => {
    setPresentation({ ...presentation, theme });
    showEphemeralNotice(`Theme: ${theme}`);
  };

  const handleTransitionChange = (transition: SlideTransition) => {
    const newSlides = [...presentation.slides];
    newSlides[currentSlideIndex] = {
      ...newSlides[currentSlideIndex],
      transition,
    };
    setPresentation({ ...presentation, slides: newSlides });
    showEphemeralNotice(`Slide transition: ${transition}`);
  };

  const handleExportMarkdown = () => {
    const markdown = serializeSovereignDeckMarkdown(presentation);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${presentation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "presentation"}.pdeck.md`;
    a.click();
    URL.revokeObjectURL(url);
    showEphemeralNotice("Exported .pdeck.md");
  };

  const handleExportStandaloneHtml = () => {
    const title = presentation.title;
    const slidesHtml = presentation.slides
      .map(
        (slide, i) => `
      <section class="pv-deck-slide ${i === 0 ? "active" : ""}" data-index="${i}">
        ${renderMarkdownToHtml(slide.markdown)}
      </section>
    `
      )
      .join("\n");

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - Postveil Sovereign Deck</title>
  <style>
    body { margin: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
    .stage { width: 960px; height: 540px; aspect-ratio: 16/9; background: #ffffff; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); overflow: hidden; position: relative; }
    .pv-deck-slide { display: none; width: 100%; height: 100%; padding: 48px 64px; box-sizing: border-box; flex-direction: column; justify-content: center; }
    .pv-deck-slide.active { display: flex; }
    h1 { font-size: 38px; color: #0f5132; margin-bottom: 16px; }
    h2 { font-size: 28px; color: #0f5132; margin-bottom: 14px; }
    p, li { font-size: 16px; line-height: 1.6; color: #1e293b; }
    .controls { position: absolute; bottom: 16px; right: 16px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 20px; color: white; font-size: 12px; }
  </style>
</head>
<body>
  <div class="stage">
    ${slidesHtml}
    <div class="controls">Slide <span id="idx">1</span> / ${presentation.slides.length} (Arrow keys to navigate)</div>
  </div>
  <script>
    let current = 0;
    const slides = document.querySelectorAll('.pv-deck-slide');
    const idxEl = document.getElementById('idx');
    function update() {
      slides.forEach((s, i) => s.classList.toggle('active', i === current));
      idxEl.textContent = current + 1;
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        current = Math.min(current + 1, slides.length - 1);
        update();
      } else if (e.key === 'ArrowLeft') {
        current = Math.max(current - 1, 0);
        update();
      }
    });
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "presentation"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showEphemeralNotice("Exported Standalone HTML");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        try {
          const parsed = parseSovereignDeckMarkdown(text);
          setPresentation(parsed);
          setCurrentSlideIndex(0);
          showEphemeralNotice(`Loaded ${parsed.slides.length} slides`);
        } catch (err) {
          showEphemeralNotice("Failed to parse deck markdown");
        }
      }
    };
    reader.readAsText(file);
  };

  // Basic Markdown Renderer for slide presentation
  function renderMarkdownToHtml(md: string) {
    const lines = md.split("\n");
    let html = "";
    let inList = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("# ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      } else if (trimmed.startsWith("## ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      } else if (trimmed.startsWith("### ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${renderInlineMarkdown(trimmed.slice(2))}</li>`;
      } else if (trimmed.startsWith("> ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<blockquote>${renderInlineMarkdown(trimmed.slice(2))}</blockquote>`;
      } else if (trimmed === "") {
        if (inList) { html += "</ul>"; inList = false; }
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${renderInlineMarkdown(trimmed)}</p>`;
      }
    });

    if (inList) html += "</ul>";
    return html;
  }

  function renderInlineMarkdown(str: string) {
    let out = escapeHtml(str);
    // Bold: **text**
    out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text*
    out = out.replace(/\*(.*?)\*/g, "<em>$1</em>");
    // Inline code: `code`
    out = out.replace(/`(.*?)`/g, "<code>$1</code>");
    return out;
  }

  function escapeHtml(text: string) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const transitionClass = currentSlide.transition
    ? `pv-deck-transition-${currentSlide.transition}`
    : "pv-deck-transition-slide";
  const themeClass = `pv-deck-theme-${presentation.theme || "sovereign"}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f8fafc" }}>
      {/* Universal Parent Masthead Ribbon */}
      <ParentSuiteRibbon currentPillarId="p-deck" />

      {/* P-Deck Formatting Ribbon */}
      <RibbonShell
        activeTabId={activeTab}
        onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
        tabs={[
          { id: "home", label: "Home" },
          { id: "design", label: "Design & Themes" },
          { id: "transitions", label: "Transitions" },
          { id: "view", label: "View & Present" },
        ]}
      >
        {activeTab === "home" && (
          <>
            <RibbonGroup title="Slide Management">
              <RibbonButton
                icon={<Plus size={16} />}
                label="New Slide"
                onClick={handleAddSlide}
              />
              <RibbonButton
                icon={<Trash2 size={16} />}
                label="Delete"
                onClick={handleDeleteSlide}
                disabled={presentation.slides.length <= 1}
              />
            </RibbonGroup>

            <RibbonGroup title="Presentation Play">
              <RibbonButton
                icon={<Play size={16} color="#0f5132" />}
                label="Present (F)"
                onClick={toggleFullscreen}
              />
              <RibbonButton
                icon={<MessageSquare size={16} />}
                label="Notes (S)"
                active={showNotes}
                onClick={() => setShowNotes((prev) => !prev)}
              />
            </RibbonGroup>

            <RibbonGroup title="Storage & Export">
              <RibbonButton
                icon={<FileDown size={16} />}
                label="Save .pdeck"
                onClick={handleExportMarkdown}
              />
              <RibbonButton
                icon={<FileUp size={16} />}
                label="Import"
                onClick={() => fileInputRef.current?.click()}
              />
              <RibbonButton
                icon={<Sparkles size={16} />}
                label="HTML Standalone"
                onClick={handleExportStandaloneHtml}
              />
            </RibbonGroup>
          </>
        )}

        {activeTab === "design" && (
          <RibbonGroup title="Sovereign Deck Themes">
            {(["sovereign", "dark", "cyber", "minimal", "academic"] as SlideTheme[]).map((thm) => (
              <RibbonButton
                key={thm}
                icon={<Layout size={16} />}
                label={thm.charAt(0).toUpperCase() + thm.slice(1)}
                active={presentation.theme === thm}
                onClick={() => handleThemeChange(thm)}
              />
            ))}
          </RibbonGroup>
        )}

        {activeTab === "transitions" && (
          <RibbonGroup title="Slide Transitions">
            {(["slide", "fade", "zoom", "none"] as SlideTransition[]).map((trans) => (
              <RibbonButton
                key={trans}
                icon={<Sliders size={16} />}
                label={trans.charAt(0).toUpperCase() + trans.slice(1)}
                active={currentSlide.transition === trans}
                onClick={() => handleTransitionChange(trans)}
              />
            ))}
          </RibbonGroup>
        )}

        {activeTab === "view" && (
          <RibbonGroup title="Editor Workspace Layout">
            <RibbonButton
              icon={<Columns size={16} />}
              label="Split View"
              active={viewMode === "split"}
              onClick={() => setViewMode("split")}
            />
            <RibbonButton
              icon={<Code2 size={16} />}
              label="Markdown Only"
              active={viewMode === "editor"}
              onClick={() => setViewMode("editor")}
            />
            <RibbonButton
              icon={<Eye size={16} />}
              label="Stage Only"
              active={viewMode === "preview"}
              onClick={() => setViewMode("preview")}
            />
          </RibbonGroup>
        )}
      </RibbonShell>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".md,.pdeck,.txt"
        style={{ display: "none" }}
      />

      {/* Main Workspace Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Left Thumbnails Strip */}
        <div
          style={{
            width: "160px",
            borderRight: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            overflowY: "auto",
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", padding: "0 4px 4px 4px" }}>
            Slides ({presentation.slides.length})
          </div>
          {presentation.slides.map((s, idx) => (
            <div
              key={s.id}
              onClick={() => setCurrentSlideIndex(idx)}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: idx === currentSlideIndex ? "2px solid #0f5132" : "1px solid #cbd5e1",
                backgroundColor: idx === currentSlideIndex ? "#ffffff" : "#f1f5f9",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f5132", marginBottom: "2px" }}>
                {idx + 1}. {s.title.slice(0, 16)}
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.markdown.split("\n")[0] || "Empty slide"}
              </div>
            </div>
          ))}
          <button
            onClick={handleAddSlide}
            style={{
              padding: "6px 8px",
              borderRadius: "6px",
              border: "1px dashed #94a3b8",
              backgroundColor: "transparent",
              color: "#475569",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
            }}
          >
            <Plus size={14} /> Add Slide
          </button>
        </div>

        {/* Markdown Source Editor */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div
            style={{
              flex: viewMode === "split" ? "0 0 380px" : "1",
              borderRight: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
            }}
          >
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Slide {currentSlideIndex + 1} Markdown</span>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Markdown + HTML comments</span>
            </div>
            <textarea
              value={currentSlide.markdown}
              onChange={(e) => handleUpdateCurrentSlideMarkdown(e.target.value)}
              placeholder="Write your slide content in Markdown..."
              style={{
                flex: 1,
                padding: "16px",
                fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: "13px",
                lineHeight: "1.6",
                border: "none",
                outline: "none",
                resize: "none",
                backgroundColor: "#fafbfc",
                color: "#1e293b",
              }}
            />
          </div>
        )}

        {/* Presentation Stage Canvas */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div ref={stageRef} className="pv-deck-viewport">
            <div className={`pv-deck-stage ${themeClass}`}>
              <div
                key={`slide-${currentSlideIndex}`}
                className={`pv-deck-slide ${transitionClass}`}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(currentSlide.markdown),
                }}
              />

              {/* Progress bar */}
              <div
                className="pv-deck-progress-bar"
                style={{
                  width: `${((currentSlideIndex + 1) / presentation.slides.length) * 100}%`,
                }}
              />

              {/* On-stage HUD Controls */}
              <div className="pv-deck-controls">
                <button
                  className="pv-deck-btn"
                  onClick={goToPrevSlide}
                  disabled={currentSlideIndex === 0}
                  title="Previous Slide (Left Arrow)"
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ color: "#ffffff", fontSize: "12px", padding: "0 6px", fontWeight: 600 }}>
                  {currentSlideIndex + 1} / {presentation.slides.length}
                </span>
                <button
                  className="pv-deck-btn"
                  onClick={goToNextSlide}
                  disabled={currentSlideIndex === presentation.slides.length - 1}
                  title="Next Slide (Right Arrow / Space)"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="pv-deck-btn"
                  onClick={() => setShowNotes((prev) => !prev)}
                  title="Toggle Presenter Notes (S)"
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  className="pv-deck-btn"
                  onClick={toggleFullscreen}
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>

              {/* Presenter Notes Overlay */}
              {showNotes && currentSlide.notes && (
                <div className="pv-deck-notes-panel">
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", marginBottom: "4px" }}>
                    Presenter Notes
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.5" }}>{currentSlide.notes}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Ephemeral Status Toast */}
      {notice && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            backgroundColor: "#0f5132",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
