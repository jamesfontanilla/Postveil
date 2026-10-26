export type SlideTransition = "slide" | "fade" | "convex" | "concave" | "zoom" | "none";
export type SlideTheme = "sovereign" | "dark" | "academic" | "minimal" | "cyber";

export interface DeckSlide {
  id: string;
  title: string;
  markdown: string;
  notes?: string;
  background?: string;
  layout?: "cover" | "default" | "two-cols" | "center" | "statement";
  transition?: SlideTransition;
}

export interface DeckPresentation {
  id: string;
  title: string;
  theme: SlideTheme;
  aspectRatio: "16:9" | "4:3";
  slides: DeckSlide[];
  updatedAt: string;
}
