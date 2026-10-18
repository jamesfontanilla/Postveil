import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, Check, ChevronDown, Sparkles, X, Type } from "lucide-react";
import { FONT_CATALOG, type FontOption, ensureFontLoaded } from "../engine/FontCatalog";

interface FontPickerProps {
  currentFont: string;
  onSelectFont: (fontFamily: string) => void;
}

export const FontPicker: React.FC<FontPickerProps> = ({ currentFont, onSelectFont }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
      setSelectedCategory("all");
    }
  }, [isOpen]);

  // Filter fonts by search query and category
  const filteredFonts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return FONT_CATALOG.filter((font) => {
      const matchesCategory = selectedCategory === "all" || font.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        font.name.toLowerCase().includes(q) ||
        font.category.toLowerCase().includes(q) ||
        (font.tags && font.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [searchQuery, selectedCategory]);

  // Lazy-load visible fonts so their real typography renders in the preview list!
  useEffect(() => {
    if (isOpen) {
      // Preload the first 12 filtered fonts for crisp in-menu preview
      filteredFonts.slice(0, 16).forEach((font) => {
        void ensureFontLoaded(font.family);
      });
    }
  }, [isOpen, filteredFonts]);

  const handleSelect = (font: FontOption) => {
    void ensureFontLoaded(font.family);
    onSelectFont(font.family);
    setIsOpen(false);
  };

  const categories = [
    { id: "all", label: "All" },
    { id: "sans-serif", label: "Sans" },
    { id: "serif", label: "Serif" },
    { id: "monospace", label: "Mono" },
    { id: "display", label: "Display" },
    { id: "handwriting", label: "Script" },
  ];

  return (
    <div className="pdocs-font-picker-wrapper" ref={dropdownRef} style={{ position: "relative" }}>
      {/* Trigger Button styled like Google Docs / Word Font Dropdown */}
      <button
        type="button"
        className="pdocs-tool-btn pdocs-font-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Font Family & Typography"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minWidth: "155px",
          maxWidth: "185px",
          height: "30px",
          padding: "0 10px",
          borderRadius: "6px",
          border: "1px solid var(--pdocs-border)",
          backgroundColor: isOpen ? "#f1f5f9" : "#ffffff",
          cursor: "pointer",
          gap: "8px",
          fontFamily: currentFont,
          fontSize: "13px",
          color: "var(--pdocs-text-primary)",
          transition: "all 0.15s ease",
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            textAlign: "left",
            fontWeight: 500,
          }}
        >
          {currentFont}
        </span>
        <ChevronDown size={14} style={{ color: "#64748b", flexShrink: 0 }} />
      </button>

      {/* Floating Font Menu with Search & In-Menu Typography Preview */}
      {isOpen && (
        <div
          className="pdocs-font-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: "340px",
            maxHeight: "440px",
            backgroundColor: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 12px 30px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.05)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header & Search Bar */}
          <div
            style={{
              padding: "10px 12px 8px 12px",
              borderBottom: "1px solid #f1f5f9",
              backgroundColor: "#fafbfc",
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                width: "100%",
                background: "#ffffff",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                padding: "4px 8px",
              }}
            >
              <Search size={14} style={{ color: "#94a3b8", marginRight: "6px", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search 50+ fonts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  width: "100%",
                  fontSize: "12px",
                  color: "#0f172a",
                  background: "transparent",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#94a3b8",
                    display: "flex",
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "8px",
                overflowX: "auto",
                scrollbarWidth: "none",
              }}
            >
              {categories.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: active ? 600 : 500,
                      border: "none",
                      backgroundColor: active ? "#0f5132" : "#f1f5f9",
                      color: active ? "#ffffff" : "#475569",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font List with Rich Real-Time Typography Preview */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px",
              maxHeight: "330px",
            }}
          >
            {filteredFonts.length === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "#94a3b8",
                }}
              >
                No fonts matching "{searchQuery}"
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected = currentFont.toLowerCase() === font.family.toLowerCase();
                return (
                  <div
                    key={font.family}
                    onClick={() => handleSelect(font)}
                    onMouseEnter={() => {
                      // Pre-load on hover so clicking is instant!
                      void ensureFontLoaded(font.family);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "#f0fdf4" : "transparent",
                      transition: "background-color 0.12s ease",
                    }}
                    className="pdocs-font-item"
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "8px",
                        }}
                      >
                        {/* Font Name rendered in its own typeface preview */}
                        <span
                          style={{
                            fontFamily: `"${font.family}", sans-serif`,
                            fontSize: "15px",
                            fontWeight: 500,
                            color: isSelected ? "#0f5132" : "#0f172a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {font.name}
                        </span>

                        {/* Category badge */}
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            backgroundColor: "#f1f5f9",
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {font.category}
                        </span>
                      </div>

                      {/* Specimen sample preview */}
                      <span
                        style={{
                          fontFamily: `"${font.family}", sans-serif`,
                          fontSize: "12px",
                          color: "#64748b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        The quick brown fox jumps over the lazy dog
                      </span>
                    </div>

                    {isSelected && (
                      <Check size={16} style={{ color: "#0f5132", marginLeft: "10px", flexShrink: 0 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer showing font library size */}
          <div
            style={{
              padding: "6px 12px",
              borderTop: "1px solid #f1f5f9",
              backgroundColor: "#fafbfc",
              fontSize: "11px",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Sparkles size={12} style={{ color: "#16a34a" }} /> 50+ Sovereign Fonts
            </span>
            <span>Offline-Ready WOFF2</span>
          </div>
        </div>
      )}
    </div>
  );
};
