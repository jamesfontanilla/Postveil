// Microsoft Word / Office 365 Standard & Theme Color Palettes

export interface ColorSwatch {
  name: string;
  color: string;
}

// 10 theme columns x 6 shade tiers = 60 Theme Colors
export const THEME_COLOR_COLUMNS: ColorSwatch[][] = [
  // 1: White to Black / Dark Gray
  [
    { name: "White", color: "#ffffff" },
    { name: "White, Darker 5%", color: "#f8fafc" },
    { name: "White, Darker 15%", color: "#f1f5f9" },
    { name: "White, Darker 25%", color: "#e2e8f0" },
    { name: "White, Darker 35%", color: "#cbd5e1" },
    { name: "White, Darker 50%", color: "#94a3b8" },
  ],
  // 2: Black to Lighter
  [
    { name: "Black", color: "#000000" },
    { name: "Black, Lighter 50%", color: "#64748b" },
    { name: "Black, Lighter 35%", color: "#475569" },
    { name: "Black, Lighter 25%", color: "#334155" },
    { name: "Black, Lighter 15%", color: "#1e293b" },
    { name: "Black, Lighter 5%", color: "#0f172a" },
  ],
  // 3: Warm Gray / Slate
  [
    { name: "Warm Gray", color: "#e7e5e4" },
    { name: "Warm Gray, Lighter 80%", color: "#fafaf9" },
    { name: "Warm Gray, Lighter 60%", color: "#f5f5f4" },
    { name: "Warm Gray, Darker 25%", color: "#a8a29e" },
    { name: "Warm Gray, Darker 50%", color: "#78716c" },
    { name: "Warm Gray, Darker 75%", color: "#44403c" },
  ],
  // 4: Navy / Dark Blue
  [
    { name: "Navy Blue", color: "#1e3a8a" },
    { name: "Navy, Lighter 80%", color: "#eff6ff" },
    { name: "Navy, Lighter 60%", color: "#dbeafe" },
    { name: "Navy, Lighter 40%", color: "#bfdbfe" },
    { name: "Navy, Darker 25%", color: "#172554" },
    { name: "Navy, Darker 50%", color: "#0f172a" },
  ],
  // 5: Cobalt / Accent Blue
  [
    { name: "Blue", color: "#2563eb" },
    { name: "Blue, Lighter 80%", color: "#dbeafe" },
    { name: "Blue, Lighter 60%", color: "#93c5fd" },
    { name: "Blue, Lighter 40%", color: "#60a5fa" },
    { name: "Blue, Darker 25%", color: "#1d4ed8" },
    { name: "Blue, Darker 50%", color: "#1e40af" },
  ],
  // 6: Orange / Copper
  [
    { name: "Orange", color: "#ea580c" },
    { name: "Orange, Lighter 80%", color: "#ffedd5" },
    { name: "Orange, Lighter 60%", color: "#fed7aa" },
    { name: "Orange, Lighter 40%", color: "#fdba74" },
    { name: "Orange, Darker 25%", color: "#c2410c" },
    { name: "Orange, Darker 50%", color: "#9a3412" },
  ],
  // 7: Gray / Slate Accent
  [
    { name: "Slate Gray", color: "#64748b" },
    { name: "Slate, Lighter 80%", color: "#f8fafc" },
    { name: "Slate, Lighter 60%", color: "#e2e8f0" },
    { name: "Slate, Lighter 40%", color: "#cbd5e1" },
    { name: "Slate, Darker 25%", color: "#475569" },
    { name: "Slate, Darker 50%", color: "#334155" },
  ],
  // 8: Gold / Amber
  [
    { name: "Gold / Amber", color: "#d97706" },
    { name: "Gold, Lighter 80%", color: "#fef3c7" },
    { name: "Gold, Lighter 60%", color: "#fde68a" },
    { name: "Gold, Lighter 40%", color: "#fcd34d" },
    { name: "Gold, Darker 25%", color: "#b45309" },
    { name: "Gold, Darker 50%", color: "#78350f" },
  ],
  // 9: Emerald / Forest Green
  [
    { name: "Emerald Green", color: "#0f5132" },
    { name: "Green, Lighter 80%", color: "#dcfce7" },
    { name: "Green, Lighter 60%", color: "#bbf7d0" },
    { name: "Green, Lighter 40%", color: "#86efac" },
    { name: "Green, Darker 25%", color: "#166534" },
    { name: "Green, Darker 50%", color: "#14532d" },
  ],
  // 10: Purple / Amethyst
  [
    { name: "Amethyst Purple", color: "#7e22ce" },
    { name: "Purple, Lighter 80%", color: "#f3e8ff" },
    { name: "Purple, Lighter 60%", color: "#e9d5ff" },
    { name: "Purple, Lighter 40%", color: "#d8b4fe" },
    { name: "Purple, Darker 25%", color: "#6b21a8" },
    { name: "Purple, Darker 50%", color: "#581c87" },
  ],
];

// Microsoft Word Standard Colors Row (10 universal colors)
export const STANDARD_COLORS: ColorSwatch[] = [
  { name: "Dark Red", color: "#c00000" },
  { name: "Red", color: "#ff0000" },
  { name: "Orange", color: "#ffc000" },
  { name: "Yellow", color: "#ffff00" },
  { name: "Light Green", color: "#92d050" },
  { name: "Green", color: "#00b050" },
  { name: "Light Blue", color: "#00b0f0" },
  { name: "Blue", color: "#0070c0" },
  { name: "Dark Blue", color: "#002060" },
  { name: "Purple", color: "#7030a0" },
];

// Microsoft Word 15 Highlighters + Transparent (No Color) + Pastels
export const HIGHLIGHT_PALETTE: ColorSwatch[] = [
  { name: "No Color", color: "transparent" },
  { name: "Yellow", color: "#ffff00" },
  { name: "Bright Green", color: "#00ff00" },
  { name: "Turquoise", color: "#00ffff" },
  { name: "Pink", color: "#ff00ff" },
  { name: "Blue", color: "#0000ff" },
  { name: "Red", color: "#ff0000" },
  { name: "Dark Blue", color: "#000080" },
  { name: "Teal", color: "#008080" },
  { name: "Green", color: "#008000" },
  { name: "Violet", color: "#800080" },
  { name: "Dark Red", color: "#800000" },
  { name: "Dark Yellow", color: "#808000" },
  { name: "Gray 50%", color: "#808080" },
  { name: "Gray 25%", color: "#c0c0c0" },
  { name: "Black", color: "#000000" },
  // Modern Soft Pastel Highlighters
  { name: "Pastel Lemon", color: "#fef08a" },
  { name: "Pastel Mint", color: "#bbf7d0" },
  { name: "Pastel Sky", color: "#bae6fd" },
  { name: "Pastel Lavender", color: "#e9d5ff" },
  { name: "Pastel Rose", color: "#fbcfe8" },
  { name: "Pastel Peach", color: "#fed7aa" },
  { name: "Pastel Coral", color: "#fecdd3" },
  { name: "Pastel Butter", color: "#fef9c3" },
];
