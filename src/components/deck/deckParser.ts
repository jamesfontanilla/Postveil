import { DeckPresentation, DeckSlide, SlideTheme, SlideTransition } from "./deckTypes";

/**
 * Postveil Sovereign Deck Parser & Serializer
 * Inspired by Slidev's frontmatter syntax and Reveal.js slide separation.
 * Slides are delimited by standard triple dashes (`---`).
 */

export function parseSovereignDeckMarkdown(rawMarkdown: string): DeckPresentation {
  const normalized = rawMarkdown.replace(/\r\n/g, "\n");
  const rawSlideChunks = normalized.split(/\n---\n/);

  let presentationTitle = "Untitled Presentation";
  let theme: SlideTheme = "sovereign";
  let aspectRatio: "16:9" | "4:3" = "16:9";

  const slides: DeckSlide[] = [];

  rawSlideChunks.forEach((chunk, index) => {
    let content = chunk.trim();
    let notes = "";
    let layout: DeckSlide["layout"] = index === 0 ? "cover" : "default";
    let transition: SlideTransition = "slide";
    let background: string | undefined = undefined;

    // 1. Extract HTML speaker notes: <!-- note content -->
    const noteMatch = content.match(/<!--\s*([\s\S]*?)\s*-->/);
    if (noteMatch) {
      notes = noteMatch[1].trim();
      content = content.replace(noteMatch[0], "").trim();
    }

    // 2. Extract YAML-style frontmatter headers if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatterMatch) {
      const frontmatterLines = frontmatterMatch[1].split("\n");
      frontmatterLines.forEach((line) => {
        const [key, ...valParts] = line.split(":");
        if (!key || valParts.length === 0) return;
        const k = key.trim().toLowerCase();
        const v = valParts.join(":").trim().replace(/^['"]|['"]$/g, "");
        if (k === "title") presentationTitle = v;
        if (k === "theme" && ["sovereign", "dark", "academic", "minimal", "cyber"].includes(v)) {
          theme = v as SlideTheme;
        }
        if (k === "aspectratio" && (v === "16:9" || v === "4:3")) {
          aspectRatio = v as "16:9" | "4:3";
        }
        if (k === "layout" && ["cover", "default", "two-cols", "center", "statement"].includes(v)) {
          layout = v as DeckSlide["layout"];
        }
        if (k === "transition" && ["slide", "fade", "convex", "concave", "zoom", "none"].includes(v)) {
          transition = v as SlideTransition;
        }
        if (k === "background") {
          background = v;
        }
      });
      content = content.replace(frontmatterMatch[0], "").trim();
    }

    // Determine slide title from first heading (# Title)
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const slideTitle = headingMatch ? headingMatch[1].trim() : `Slide ${index + 1}`;
    if (index === 0 && presentationTitle === "Untitled Presentation" && headingMatch) {
      presentationTitle = headingMatch[1].trim();
    }

    slides.push({
      id: `slide-${index + 1}-${Date.now().toString(36)}`,
      title: slideTitle,
      markdown: content,
      notes: notes || undefined,
      layout,
      transition,
      background,
    });
  });

  return {
    id: `deck-${Date.now().toString(36)}`,
    title: presentationTitle,
    theme,
    aspectRatio,
    slides: slides.length > 0 ? slides : [createDefaultSlide(1)],
    updatedAt: new Date().toISOString(),
  };
}

export function serializeSovereignDeckMarkdown(deck: DeckPresentation): string {
  return deck.slides
    .map((slide, index) => {
      let chunk = "";
      if (index === 0) {
        chunk += `---\ntitle: "${deck.title}"\ntheme: ${deck.theme}\naspectRatio: ${deck.aspectRatio}\n---\n\n`;
      } else if (slide.layout !== "default" || slide.transition !== "slide" || slide.background) {
        chunk += `---\nlayout: ${slide.layout || "default"}\ntransition: ${slide.transition || "slide"}${
          slide.background ? `\nbackground: "${slide.background}"` : ""
        }\n---\n\n`;
      }

      chunk += slide.markdown.trim();

      if (slide.notes) {
        chunk += `\n\n<!--\n${slide.notes.trim()}\n-->`;
      }
      return chunk;
    })
    .join("\n\n---\n\n");
}

export function createDefaultSlide(index: number): DeckSlide {
  if (index === 1) {
    return {
      id: `slide-${Date.now().toString(36)}-1`,
      title: "Postveil Sovereign Deck",
      markdown: `# Postveil Sovereign Deck\n\n### Local-First Presentation Engine\n\n- Zero corporate tracking or cloud dependency\n- Powered by client-side markdown compilation\n- Built-in speaker notes and keyboard navigation`,
      layout: "cover",
      transition: "slide",
      notes: "Welcome the audience and introduce the sovereign local-first proposition.",
    };
  }
  return {
    id: `slide-${Date.now().toString(36)}-${index}`,
    title: `Slide ${index}`,
    markdown: `## Slide ${index}: Key Architecture\n\n- First major milestone\n- Second architectural point\n- Conclusion and next steps`,
    layout: "default",
    transition: "slide",
  };
}

export function createDemoPresentation(): DeckPresentation {
  return parseSovereignDeckMarkdown(`---
title: "Postveil Sovereign Presentation"
theme: sovereign
aspectRatio: 16:9
---

# Postveil P-Deck
### High-Assurance, Local-First Slide Presentations

- Instant keyboard navigation (Arrow keys, Space, Esc)
- 100% Client-side markdown compilation
- Speaker notes & presenter HUD mode

<!--
Remind the audience that this presentation runs entirely within the browser sandbox with zero telemetry.
-->

---

## Architectural Pillars

1. **Local-First Core**: All slide ASTs persist directly into the user's browser via OPFS.
2. **Standard Markdown**: Write presentations using simple headers, bullets, and LaTeX.
3. **Hardware Acceleration**: Smooth 60 FPS transitions without heavy cloud runtimes.

---

## The Sovereign Advantage

> "Software that respects human dignity does not extract subscriptions for basic local computation."

- Complete binary offline exports
- Zero third-party surveillance
- Uncompromising cryptographic truth
`);
}
