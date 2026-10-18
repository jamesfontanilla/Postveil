/**
 * Font Catalog & Dynamic Font Loader for P-Docs
 * 
 * Provides an expansive, curated collection of 50+ beautiful, high-quality open-source fonts
 * spanning Sans-Serif, Serif, Monospace, Display, and Handwriting categories.
 * Supports lazy runtime injection of font definitions and real-time font preview rendering.
 */

export interface FontOption {
  family: string;
  name: string;
  category: "sans-serif" | "serif" | "monospace" | "display" | "handwriting";
  weights: number[];
  previewText?: string;
  tags?: string[];
}

export const FONT_CATALOG: FontOption[] = [
  // --- Modern Sans-Serif ---
  {
    family: "Schibsted Grotesk",
    name: "Schibsted Grotesk",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["default", "editorial", "clean", "modern"],
  },
  {
    family: "Inter",
    name: "Inter",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["ui", "screen", "geometric", "versatile"],
  },
  {
    family: "Roboto",
    name: "Roboto",
    category: "sans-serif",
    weights: [400, 500, 700],
    tags: ["workhorse", "clean", "neutral"],
  },
  {
    family: "Open Sans",
    name: "Open Sans",
    category: "sans-serif",
    weights: [400, 600, 700],
    tags: ["friendly", "legible", "neutral"],
  },
  {
    family: "Lato",
    name: "Lato",
    category: "sans-serif",
    weights: [400, 700],
    tags: ["warm", "humanist", "balanced"],
  },
  {
    family: "Montserrat",
    name: "Montserrat",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["geometric", "posters", "headings"],
  },
  {
    family: "Plus Jakarta Sans",
    name: "Plus Jakarta Sans",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["contemporary", "tech", "crisp"],
  },
  {
    family: "Poppins",
    name: "Poppins",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["geometric", "modern", "friendly"],
  },
  {
    family: "Work Sans",
    name: "Work Sans",
    category: "sans-serif",
    weights: [400, 500, 600],
    tags: ["grotesque", "print", "screen"],
  },
  {
    family: "DM Sans",
    name: "DM Sans",
    category: "sans-serif",
    weights: [400, 500, 700],
    tags: ["low-contrast", "geometric", "clean"],
  },
  {
    family: "Nunito",
    name: "Nunito",
    category: "sans-serif",
    weights: [400, 600, 700],
    tags: ["rounded", "soft", "friendly"],
  },
  {
    family: "Raleway",
    name: "Raleway",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["elegant", "headings", "thin-accents"],
  },
  {
    family: "Rubik",
    name: "Rubik",
    category: "sans-serif",
    weights: [400, 500, 700],
    tags: ["subtle-rounded", "smooth"],
  },
  {
    family: "Outfit",
    name: "Outfit",
    category: "sans-serif",
    weights: [400, 500, 600, 700],
    tags: ["brand", "minimalist", "tech"],
  },
  {
    family: "Cabinet Grotesk",
    name: "Cabinet Grotesk",
    category: "sans-serif",
    weights: [400, 700, 800],
    tags: ["bold", "editorial", "display"],
  },
  {
    family: "Space Grotesk",
    name: "Space Grotesk",
    category: "sans-serif",
    weights: [400, 500, 700],
    tags: ["tech", "monospaced-feel", "quirky"],
  },

  // --- Editorial & Book Serif ---
  {
    family: "Merriweather",
    name: "Merriweather",
    category: "serif",
    weights: [400, 700],
    tags: ["book", "reading", "high-legibility"],
  },
  {
    family: "Fraunces",
    name: "Fraunces",
    category: "serif",
    weights: [400, 600, 700],
    tags: ["wonky", "display", "editorial", "warm"],
  },
  {
    family: "Playfair Display",
    name: "Playfair Display",
    category: "serif",
    weights: [400, 600, 700],
    tags: ["classical", "high-contrast", "luxury"],
  },
  {
    family: "Lora",
    name: "Lora",
    category: "serif",
    weights: [400, 500, 600],
    tags: ["calligraphic", "contemporary", "stories"],
  },
  {
    family: "PT Serif",
    name: "PT Serif",
    category: "serif",
    weights: [400, 700],
    tags: ["universal", "formal", "publication"],
  },
  {
    family: "Cinzel",
    name: "Cinzel",
    category: "serif",
    weights: [400, 600, 700],
    tags: ["roman", "classical", "inscriptional"],
  },
  {
    family: "EB Garamond",
    name: "EB Garamond",
    category: "serif",
    weights: [400, 500, 700],
    tags: ["renaissance", "academic", "literature"],
  },
  {
    family: "Libre Baskerville",
    name: "Libre Baskerville",
    category: "serif",
    weights: [400, 700],
    tags: ["traditional", "legal", "formal"],
  },
  {
    family: "Cormorant Garamond",
    name: "Cormorant Garamond",
    category: "serif",
    weights: [400, 500, 600, 700],
    tags: ["delicate", "high-elegance", "poetry"],
  },
  {
    family: "Bodoni Moda",
    name: "Bodoni Moda",
    category: "serif",
    weights: [400, 600, 700],
    tags: ["fashion", "extreme-contrast", "vogue"],
  },
  {
    family: "Literata",
    name: "Literata",
    category: "serif",
    weights: [400, 500, 700],
    tags: ["e-reader", "long-form", "balanced"],
  },
  {
    family: "Newsreader",
    name: "Newsreader",
    category: "serif",
    weights: [400, 500, 600],
    tags: ["journalism", "continuous-reading"],
  },

  // --- Monospace & Developer Fonts ---
  {
    family: "JetBrains Mono",
    name: "JetBrains Mono",
    category: "monospace",
    weights: [400, 500, 700],
    tags: ["developer", "code", "ligatures", "clear"],
  },
  {
    family: "Fira Code",
    name: "Fira Code",
    category: "monospace",
    weights: [400, 500, 600],
    tags: ["programming", "ascii", "tech"],
  },
  {
    family: "IBM Plex Mono",
    name: "IBM Plex Mono",
    category: "monospace",
    weights: [400, 500, 600],
    tags: ["engineered", "industrial", "typewriter"],
  },
  {
    family: "Source Code Pro",
    name: "Source Code Pro",
    category: "monospace",
    weights: [400, 600],
    tags: ["adobe", "coding", "crisp"],
  },
  {
    family: "Inconsolata",
    name: "Inconsolata",
    category: "monospace",
    weights: [400, 700],
    tags: ["humanist-mono", "dense", "terminal"],
  },
  {
    family: "Space Mono",
    name: "Space Mono",
    category: "monospace",
    weights: [400, 700],
    tags: ["retro-futuristic", "headline", "stylized"],
  },
  {
    family: "Red Hat Mono",
    name: "Red Hat Mono",
    category: "monospace",
    weights: [400, 500, 700],
    tags: ["linux", "modern-mono", "distro"],
  },

  // --- Display, Post & Creative ---
  {
    family: "Oswald",
    name: "Oswald",
    category: "display",
    weights: [400, 500, 600, 700],
    tags: ["condensed", "gothic", "impact", "posters"],
  },
  {
    family: "Bebas Neue",
    name: "Bebas Neue",
    category: "display",
    weights: [400],
    tags: ["all-caps", "bold", "banners", "titling"],
  },
  {
    family: "Syne",
    name: "Syne",
    category: "display",
    weights: [400, 600, 700, 800],
    tags: ["artistic", "experimental", "brutalist"],
  },
  {
    family: "Unbounded",
    name: "Unbounded",
    category: "display",
    weights: [400, 600, 700],
    tags: ["wide", "futuristic", "web3", "bold"],
  },
  {
    family: "Clash Display",
    name: "Clash Display",
    category: "display",
    weights: [500, 600, 700],
    tags: ["high-impact", "neo-grotesque", "headlines"],
  },
  {
    family: "Abril Fatface",
    name: "Abril Fatface",
    category: "display",
    weights: [400],
    tags: ["vintage", "fatface", "news-titling"],
  },
  {
    family: "Righteous",
    name: "Righteous",
    category: "display",
    weights: [400],
    tags: ["retro", "deco", "posters"],
  },
  {
    family: "Bungee",
    name: "Bungee",
    category: "display",
    weights: [400],
    tags: ["urban", "signage", "heavy"],
  },

  // --- Handwritten & Script ---
  {
    family: "Caveat",
    name: "Caveat",
    category: "handwriting",
    weights: [400, 600, 700],
    tags: ["casual", "marker", "notes"],
  },
  {
    family: "Pacifico",
    name: "Pacifico",
    category: "handwriting",
    weights: [400],
    tags: ["surf", "brush", "retro-script"],
  },
  {
    family: "Dancing Script",
    name: "Dancing Script",
    category: "handwriting",
    weights: [400, 600, 700],
    tags: ["bouncy", "informal", "cursive"],
  },
  {
    family: "Kalam",
    name: "Kalam",
    category: "handwriting",
    weights: [400, 700],
    tags: ["hand-lettering", "pen", "notebook"],
  },
  {
    family: "Shadows Into Light",
    name: "Shadows Into Light",
    category: "handwriting",
    weights: [400],
    tags: ["neat-handwriting", "feminine", "sketch"],
  },
  {
    family: "Satisfy",
    name: "Satisfy",
    category: "handwriting",
    weights: [400],
    tags: ["brush-script", "timeless", "signature"],
  },
  {
    family: "Great Vibes",
    name: "Great Vibes",
    category: "handwriting",
    weights: [400],
    tags: ["formal-calligraphy", "invitations", "flowing"],
  },
];

// In-memory set of already injected/loaded fonts
const loadedFonts = new Set<string>([
  "Schibsted Grotesk",
  "Fraunces",
  "IBM Plex Mono",
]);

/**
 * Dynamically loads and registers a font family into the document DOM.
 * Generates an optimized, standard @font-face link or stylesheet injection.
 */
export function ensureFontLoaded(family: string): Promise<void> {
  if (loadedFonts.has(family)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const fontDef = FONT_CATALOG.find(
        (f) => f.family.toLowerCase() === family.toLowerCase()
      );
      const cleanFamily = fontDef ? fontDef.family : family;
      const id = `pdocs-font-${cleanFamily.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;

      if (document.getElementById(id)) {
        loadedFonts.add(cleanFamily);
        resolve();
        return;
      }

      // Format weights query string (e.g. wght@400;600;700)
      const weights = fontDef?.weights || [400, 700];
      const weightStr = weights.join(";");
      const encodedFamily = encodeURIComponent(cleanFamily);
      const href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=swap`;

      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;

      link.onload = () => {
        loadedFonts.add(cleanFamily);
        if ("fonts" in document) {
          // Attempt font readiness confirmation
          (document as any).fonts
            ?.load(`1rem "${cleanFamily}"`)
            .then(() => resolve())
            .catch(() => resolve());
        } else {
          resolve();
        }
      };

      link.onerror = () => {
        console.warn(`[P-Docs] Failed to load font: ${cleanFamily}`);
        resolve(); // Resolve gracefully to avoid blocking the user
      };

      document.head.appendChild(link);
    } catch (err) {
      console.warn("[P-Docs] Font loading error:", err);
      resolve();
    }
  });
}

/**
 * Pre-warms popular fonts on initial idle so user browsing is instantaneous
 */
export function prewarmTopFonts(): void {
  const topList = [
    "Inter",
    "Merriweather",
    "JetBrains Mono",
    "Roboto",
    "Playfair Display",
    "Fira Code",
    "Plus Jakarta Sans",
  ];
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => {
      topList.forEach((f) => void ensureFontLoaded(f));
    });
  } else {
    setTimeout(() => {
      topList.forEach((f) => void ensureFontLoaded(f));
    }, 1200);
  }
}
