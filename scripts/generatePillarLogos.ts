/**
 * Generator script for all 20 Postveil Sovereign Pillar Logos
 * Follows the Postveil brand geometry:
 * - 100x100 viewBox
 * - Rounded square outer seal: <rect x="6" y="6" width="88" height="88" rx="22" .../>
 * - Dual geometric intersecting facets/planes (Postveil diagonal signature shear)
 * - Cohesive brand color palette anchored in Postveil Signature Forest Emerald (#1F6B58), Obsidian Teal (#172522), and Crisp Sage (#F4F7F4)
 * - Modern, clean, enterprise-grade vector iconography embedded with precision
 */
import fs from "fs";
import path from "path";

export interface PillarMeta {
  id: string;
  name: string;
  category: string;
  replaces: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  svgContent: string;
}

export const PILLARS: PillarMeta[] = [
  // 1. P-Mail
  {
    id: "p-mail",
    name: "P-Mail",
    category: "Communication",
    replaces: "Gmail / Superhuman",
    primaryColor: "#1F6B58",
    accentColor: "#172522",
    bgColor: "#F4F7F4",
    svgContent: `
      <!-- Intersecting Envelope & Folded Wing Plane -->
      <polygon points="0,0 68,0 22,100 0,100" clip-path="url(#seal-p-mail)" fill="#1F6B58" opacity="0.15"/>
      <polygon points="78,0 100,0 100,100 32,100" clip-path="url(#seal-p-mail)" fill="#172522" opacity="0.10"/>
      <!-- Sealed Envelope Geometry -->
      <rect x="23" y="32" width="54" height="38" rx="7" fill="#1F6B58" stroke="#172522" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Letter Fold Flap -->
      <path d="M25 34 L50 53 L75 34" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Sovereign Security Stamp -->
      <circle cx="50" cy="53" r="5" fill="#34D399" stroke="#172522" stroke-width="1.5"/>
      <!-- Dynamic Speed Wings -->
      <path d="M30 48 L25 68" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M70 48 L75 68" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
    `
  },

  // 2. P-Calendar
  {
    id: "p-calendar",
    name: "P-Calendar",
    category: "Communication",
    replaces: "Google Calendar / Calendly",
    primaryColor: "#059669",
    accentColor: "#064E3B",
    bgColor: "#ECFDF5",
    svgContent: `
      <!-- Calendar Backing and Header Stripe -->
      <rect x="22" y="24" width="56" height="54" rx="10" fill="#FFFFFF" stroke="#059669" stroke-width="3"/>
      <path d="M22 36 L78 36" stroke="#059669" stroke-width="3"/>
      <path d="M22 24 H78 V36 H22 Z" fill="#059669" clip-path="url(#cal-hdr-clip)"/>
      <!-- Calendar Binder Rings -->
      <rect x="33" y="18" width="5" height="12" rx="2.5" fill="#064E3B"/>
      <rect x="62" y="18" width="5" height="12" rx="2.5" fill="#064E3B"/>
      <!-- High-Density Schedule Matrix Points -->
      <circle cx="34" cy="46" r="3.5" fill="#10B981"/>
      <circle cx="50" cy="46" r="3.5" fill="#10B981"/>
      <circle cx="66" cy="46" r="3.5" fill="#E2E8F0"/>
      <circle cx="34" cy="58" r="3.5" fill="#E2E8F0"/>
      <circle cx="50" cy="58" r="3.5" fill="#059669"/>
      <circle cx="66" cy="58" r="3.5" fill="#10B981"/>
      <!-- Active Appointment Indicator Badge -->
      <rect x="42" y="66" width="16" height="4" rx="2" fill="#047857"/>
    `
  },

  // 3. P-Meet
  {
    id: "p-meet",
    name: "P-Meet",
    category: "Communication",
    replaces: "Google Meet / Zoom",
    primaryColor: "#0284C7",
    accentColor: "#0C4A6E",
    bgColor: "#F0F9FF",
    svgContent: `
      <!-- Intersecting Camera Housing -->
      <rect x="20" y="30" width="40" height="40" rx="9" fill="#0284C7" stroke="#0C4A6E" stroke-width="2.5"/>
      <!-- Projector Lens Funnel -->
      <path d="M60 42 L78 31 V69 L60 58 Z" fill="#0369A1" stroke="#0C4A6E" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Camera Aperture Wave -->
      <circle cx="40" cy="50" r="11" fill="#FFFFFF"/>
      <circle cx="40" cy="50" r="6" fill="#0284C7"/>
      <!-- Real-Time Signal Pulse -->
      <circle cx="71" cy="27" r="3" fill="#10B981"/>
    `
  },

  // 4. P-Chat
  {
    id: "p-chat",
    name: "P-Chat",
    category: "Communication",
    replaces: "Slack / Teams",
    primaryColor: "#0D9488",
    accentColor: "#134E4A",
    bgColor: "#F0FDFA",
    svgContent: `
      <!-- Secondary Message Bubble (Behind) -->
      <rect x="36" y="24" width="42" height="34" rx="10" fill="#99F6E4" stroke="#134E4A" stroke-width="2.5"/>
      <!-- Primary Foreground Speech Bubble -->
      <path d="M22 36 C22 30.5 26.5 26 32 26 H62 C67.5 26 72 30.5 72 36 V56 C72 61.5 67.5 66 62 66 H34 L22 76 V36 Z" fill="#0D9488" stroke="#134E4A" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Active Typing Indicator Dots -->
      <circle cx="36" cy="46" r="3.5" fill="#FFFFFF"/>
      <circle cx="47" cy="46" r="3.5" fill="#FFFFFF"/>
      <circle cx="58" cy="46" r="3.5" fill="#FFFFFF"/>
    `
  },

  // 5. P-Docs
  {
    id: "p-docs",
    name: "P-Docs",
    category: "Productivity",
    replaces: "Google Docs / Notion",
    primaryColor: "#1F6B58",
    accentColor: "#172522",
    bgColor: "#F4F7F4",
    svgContent: `
      <!-- Document Sheet with Dog-Ear Corner -->
      <path d="M26 20 H56 L74 38 V78 C74 81 71.5 83.5 68.5 83.5 H26 C23 83.5 20.5 81 20.5 78 V25.5 C20.5 22.5 23 20 26 20 Z" fill="#FFFFFF" stroke="#1F6B58" stroke-width="3" stroke-linejoin="round"/>
      <!-- Dog Ear Fold -->
      <path d="M56 20 V38 H74" fill="#E2E8F0" stroke="#1F6B58" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="56,20 74,38 56,38" fill="#D1FAE5"/>
      <!-- Clean Typography Lines -->
      <line x1="32" y1="48" x2="62" y2="48" stroke="#1F6B58" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="58" x2="62" y2="58" stroke="#1F6B58" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="68" x2="48" y2="68" stroke="#10B981" stroke-width="3" stroke-linecap="round"/>
    `
  },

  // 6. P-Sheets
  {
    id: "p-sheets",
    name: "P-Sheets",
    category: "Productivity",
    replaces: "Excel / Google Sheets",
    primaryColor: "#15803D",
    accentColor: "#14532D",
    bgColor: "#F0FDF4",
    svgContent: `
      <!-- Spreadsheet Grid Canvas -->
      <rect x="20" y="22" width="60" height="56" rx="8" fill="#FFFFFF" stroke="#15803D" stroke-width="3"/>
      <!-- Header Column and Row -->
      <path d="M20 38 H80" stroke="#15803D" stroke-width="2.5"/>
      <path d="M20 54 H80" stroke="#15803D" stroke-width="2"/>
      <path d="M40 22 V78" stroke="#15803D" stroke-width="2.5"/>
      <path d="M60 22 V78" stroke="#15803D" stroke-width="2"/>
      <!-- Selected Calculation Cell -->
      <rect x="40.5" y="38.5" width="19" height="15" fill="#86EFAC" opacity="0.6"/>
      <!-- Mathematical Sigma / Formula Indicator -->
      <path d="M27 30 H33 L29 34 L33 38 H27" fill="none" stroke="#15803D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Trending Mini Bar in Cell -->
      <rect x="65" y="44" width="3" height="6" fill="#15803D" rx="1"/>
      <rect x="70" y="41" width="3" height="9" fill="#22C55E" rx="1"/>
    `
  },

  // 7. P-Deck
  {
    id: "p-deck",
    name: "P-Deck",
    category: "Productivity",
    replaces: "Slides / PowerPoint",
    primaryColor: "#EA580C",
    accentColor: "#7C2D12",
    bgColor: "#FFF7ED",
    svgContent: `
      <!-- Cinema-Grade 16:9 Presentation Display -->
      <rect x="18" y="24" width="64" height="42" rx="7" fill="#EA580C" stroke="#7C2D12" stroke-width="2.5"/>
      <rect x="22" y="28" width="56" height="34" rx="4" fill="#FFFFFF"/>
      <!-- Stand and Base -->
      <path d="M50 66 V76 M38 76 H62" stroke="#7C2D12" stroke-width="3" stroke-linecap="round"/>
      <!-- Visual Slide Layout Elements: Header, Hero Chart & Text -->
      <rect x="28" y="34" width="18" height="4" rx="1.5" fill="#EA580C"/>
      <path d="M28 54 L36 44 L44 49 L54 38 L62 46" fill="none" stroke="#F97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="54" cy="38" r="2.5" fill="#EA580C"/>
    `
  },

  // 8. P-Draw
  {
    id: "p-draw",
    name: "P-Draw",
    category: "Productivity",
    replaces: "Miro / Excalidraw",
    primaryColor: "#8B5CF6",
    accentColor: "#4C1D95",
    bgColor: "#F5F3FF",
    svgContent: `
      <!-- Infinite Canvas Grid Points -->
      <circle cx="26" cy="26" r="1.5" fill="#DDD6FE"/>
      <circle cx="50" cy="26" r="1.5" fill="#DDD6FE"/>
      <circle cx="74" cy="26" r="1.5" fill="#DDD6FE"/>
      <!-- Designer Compass / Stylus Vector -->
      <path d="M30 68 L64 34 L72 42 L38 76 L24 78 Z" fill="#8B5CF6" stroke="#4C1D95" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Precision Pen Tip -->
      <polygon points="24,78 30,68 38,76" fill="#EDE9FE"/>
      <circle cx="27" cy="75" r="1.5" fill="#4C1D95"/>
      <!-- Stylus Brass Ring -->
      <line x1="58" y1="40" x2="66" y2="48" stroke="#C4B5FD" stroke-width="2"/>
      <!-- Dynamic Vector Curve Ribbon -->
      <path d="M26 38 C40 20 60 55 76 30" fill="none" stroke="#A78BFA" stroke-width="2.5" stroke-linecap="round"/>
    `
  },

  // 9. P-Voice
  {
    id: "p-voice",
    name: "P-Voice",
    category: "Productivity",
    replaces: "Otter.ai / Voice Memos",
    primaryColor: "#E11D48",
    accentColor: "#881337",
    bgColor: "#FFF1F2",
    svgContent: `
      <!-- Studio Microphone Capsule -->
      <rect x="38" y="20" width="24" height="38" rx="12" fill="#E11D48" stroke="#881337" stroke-width="2.5"/>
      <!-- Microphone Grille Mesh Line -->
      <line x1="42" y1="32" x2="58" y2="32" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
      <line x1="42" y1="40" x2="58" y2="40" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
      <!-- Suspension Shock Mount Arc -->
      <path d="M30 42 C30 57 70 57 70 42" fill="none" stroke="#881337" stroke-width="3" stroke-linecap="round"/>
      <!-- Mic Stand and Weighted Base -->
      <path d="M50 57 V74 M36 74 H64" stroke="#881337" stroke-width="3" stroke-linecap="round"/>
      <!-- Local Whisper Waveform Resonance -->
      <line x1="22" y1="38" x2="22" y2="46" stroke="#FB7185" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="78" y1="38" x2="78" y2="46" stroke="#FB7185" stroke-width="2.5" stroke-linecap="round"/>
    `
  },

  // 10. P-Drive
  {
    id: "p-drive",
    name: "P-Drive",
    category: "Vault",
    replaces: "Google Drive / Dropbox",
    primaryColor: "#2563EB",
    accentColor: "#1E3A8A",
    bgColor: "#EFF6FF",
    svgContent: `
      <!-- Isometric Sovereign Vault Cube / Folders -->
      <path d="M20 34 C20 30 23 27 27 27 H43 L49 33 H73 C77 33 80 36 80 40 V46 H20 Z" fill="#3B82F6" stroke="#1E3A8A" stroke-width="2.5"/>
      <!-- Vault Front Face with Depth -->
      <rect x="20" y="42" width="60" height="38" rx="8" fill="#FFFFFF" stroke="#1E3A8A" stroke-width="2.5"/>
      <!-- Striped Storage Matrix (RAID-0 / R2 Partition Bars) -->
      <rect x="28" y="52" width="44" height="5" rx="2.5" fill="#93C5FD"/>
      <rect x="28" y="62" width="28" height="5" rx="2.5" fill="#2563EB"/>
      <!-- Shield Keyhole Emblem -->
      <circle cx="64" cy="64" r="4.5" fill="#10B981" stroke="#1E3A8A" stroke-width="1.5"/>
    `
  },

  // 11. P-Studio
  {
    id: "p-studio",
    name: "P-Studio",
    category: "Design",
    replaces: "Canva / Adobe Express",
    primaryColor: "#D946EF",
    accentColor: "#701A75",
    bgColor: "#FDF4FF",
    svgContent: `
      <!-- Artist Color Palette Base -->
      <path d="M22 50 C22 34 34 22 50 22 C66 22 78 32 78 46 C78 58 68 64 62 64 C58 64 56 61 54 59 C52 57 49 55 45 55 C39 55 35 60 35 66 C35 70 32 74 27 74 C24 74 22 64 22 50 Z" fill="#FFFFFF" stroke="#701A75" stroke-width="3" stroke-linejoin="round"/>
      <!-- Vibrant Color Swatches -->
      <circle cx="38" cy="35" r="4.5" fill="#EC4899"/>
      <circle cx="52" cy="32" r="4.5" fill="#3B82F6"/>
      <circle cx="66" cy="38" r="4.5" fill="#F59E0B"/>
      <circle cx="68" cy="52" r="4.5" fill="#10B981"/>
      <!-- Palette Thumb Ring -->
      <circle cx="34" cy="60" r="5" fill="#FDF4FF" stroke="#701A75" stroke-width="2"/>
    `
  },

  // 12. P-PDF
  {
    id: "p-pdf",
    name: "P-PDF",
    category: "Design",
    replaces: "Acrobat Pro / Smallpdf",
    primaryColor: "#DC2626",
    accentColor: "#7F1D1D",
    bgColor: "#FEF2F2",
    svgContent: `
      <!-- Signature Red PDF Container Sheet -->
      <path d="M26 20 H56 L74 38 V78 C74 81 71.5 83.5 68.5 83.5 H26 C23 83.5 20.5 81 20.5 78 V25.5 C20.5 22.5 23 20 26 20 Z" fill="#DC2626" stroke="#7F1D1D" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Fold Corner -->
      <polygon points="56,20 74,38 56,38" fill="#FCA5A5"/>
      <!-- Distinctive Bold 'PDF' Vector Brandmark -->
      <rect x="28" y="44" width="38" height="24" rx="4" fill="#FFFFFF"/>
      <text x="32" y="61" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="900" fill="#DC2626" letter-spacing="1">PDF</text>
      <!-- Redaction Crossbar Indicator -->
      <line x1="28" y1="73" x2="52" y2="73" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
    `
  },

  // 13. P-Record
  {
    id: "p-record",
    name: "P-Record",
    category: "Media",
    replaces: "Loom / Screen Studio",
    primaryColor: "#F43F5E",
    accentColor: "#881337",
    bgColor: "#FFF1F2",
    svgContent: `
      <!-- Studio Screen Frame -->
      <rect x="18" y="22" width="64" height="46" rx="8" fill="#FFFFFF" stroke="#881337" stroke-width="3"/>
      <!-- Concentric Recording Target Beacon -->
      <circle cx="50" cy="45" r="16" fill="#FFE4E6" stroke="#F43F5E" stroke-width="2"/>
      <circle cx="50" cy="45" r="9" fill="#F43F5E"/>
      <circle cx="50" cy="45" r="4" fill="#FFFFFF"/>
      <!-- Live Video Pip Bubble (Webcam) -->
      <circle cx="70" cy="56" r="7" fill="#881337" stroke="#FFFFFF" stroke-width="2"/>
      <!-- Studio Stand Base -->
      <path d="M42 68 L36 78 H64 L58 68" fill="#881337"/>
    `
  },

  // 14. P-Sign
  {
    id: "p-sign",
    name: "P-Sign",
    category: "Operations",
    replaces: "DocuSign / PandaDoc",
    primaryColor: "#0F766E",
    accentColor: "#134E4A",
    bgColor: "#F0FDFA",
    svgContent: `
      <!-- Legal Contract Parchment Base -->
      <rect x="22" y="20" width="56" height="60" rx="8" fill="#FFFFFF" stroke="#0F766E" stroke-width="3"/>
      <!-- Contract Header Lines -->
      <line x1="30" y1="32" x2="56" y2="32" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="30" y1="40" x2="68" y2="40" stroke="#CBD5E1" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Elegant Ed25519 Fountain Pen Signature Swash -->
      <path d="M30 58 C36 50 42 66 50 56 C54 52 56 60 64 54 L70 56" fill="none" stroke="#0F766E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Cryptographic Verification Shield Seal -->
      <circle cx="64" cy="68" r="9" fill="#10B981" stroke="#134E4A" stroke-width="1.5"/>
      <path d="M60.5 68 L63 70.5 L67.5 65.5" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `
  },

  // 15. P-Forms
  {
    id: "p-forms",
    name: "P-Forms",
    category: "Operations",
    replaces: "Typeform / Google Forms",
    primaryColor: "#4F46E5",
    accentColor: "#312E81",
    bgColor: "#EEF2FF",
    svgContent: `
      <!-- Survey Clipboard Tray -->
      <rect x="22" y="24" width="56" height="56" rx="9" fill="#FFFFFF" stroke="#4F46E5" stroke-width="3"/>
      <!-- Clipboard Top Metal Clip -->
      <path d="M38 24 V20 C38 18 40 16 42 16 H58 C60 16 62 18 62 20 V24 Z" fill="#312E81"/>
      <rect x="44" y="20" width="12" height="4" rx="1" fill="#FFFFFF"/>
      <!-- Conversational Checkbox Question Items -->
      <rect x="30" y="36" width="9" height="9" rx="2.5" fill="#4F46E5"/>
      <path d="M32.5 40.5 L34.5 42.5 L37 38" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="45" y1="40.5" x2="68" y2="40.5" stroke="#4F46E5" stroke-width="2.5" stroke-linecap="round"/>

      <rect x="30" y="50" width="9" height="9" rx="2.5" fill="#EEF2FF" stroke="#4F46E5" stroke-width="1.5"/>
      <line x1="45" y1="54.5" x2="68" y2="54.5" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>

      <rect x="30" y="64" width="9" height="9" rx="2.5" fill="#EEF2FF" stroke="#4F46E5" stroke-width="1.5"/>
      <line x1="45" y1="68.5" x2="60" y2="68.5" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>
    `
  },

  // 16. P-Books
  {
    id: "p-books",
    name: "P-Books",
    category: "Operations",
    replaces: "QuickBooks / FreshBooks",
    primaryColor: "#047857",
    accentColor: "#064E3B",
    bgColor: "#ECFDF5",
    svgContent: `
      <!-- Double-Entry Financial Ledger / Secure Card -->
      <rect x="18" y="26" width="64" height="48" rx="9" fill="#047857" stroke="#064E3B" stroke-width="2.5"/>
      <!-- Gold EMV Ledger Microchip -->
      <rect x="26" y="36" width="14" height="12" rx="3" fill="#FCD34D" stroke="#D97706" stroke-width="1.5"/>
      <line x1="33" y1="36" x2="33" y2="48" stroke="#D97706" stroke-width="1"/>
      <line x1="26" y1="42" x2="40" y2="42" stroke="#D97706" stroke-width="1"/>
      <!-- Ledger Balance Bars -->
      <line x1="46" y1="38" x2="72" y2="38" stroke="#A7F3D0" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="46" y1="46" x2="64" y2="46" stroke="#A7F3D0" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Currency Sovereign Indicator (Double T-Account Bar) -->
      <path d="M28 62 H72" stroke="#34D399" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="68" cy="62" r="3" fill="#FCD34D"/>
    `
  },

  // 17. P-CRM
  {
    id: "p-crm",
    name: "P-CRM",
    category: "Operations",
    replaces: "HubSpot / Salesforce",
    primaryColor: "#0284C7",
    accentColor: "#075985",
    bgColor: "#F0F9FF",
    svgContent: `
      <!-- Interlocking Team / Customer Pipeline Nodes -->
      <!-- Center Lead Avatar -->
      <circle cx="50" cy="36" r="10" fill="#0284C7" stroke="#075985" stroke-width="2.5"/>
      <path d="M34 58 C34 50 41 46 50 46 C59 46 66 50 66 58 V62 H34 Z" fill="#0284C7" stroke="#075985" stroke-width="2.5"/>
      <!-- Left Contact Node -->
      <circle cx="25" cy="45" r="6" fill="#38BDF8"/>
      <path d="M16 64 C16 58 20 56 25 56 C28 56 31 57 33 59" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round"/>
      <!-- Right Contact Node -->
      <circle cx="75" cy="45" r="6" fill="#38BDF8"/>
      <path d="M67 59 C69 57 72 56 75 56 C80 56 84 58 84 64" fill="none" stroke="#0284C7" stroke-width="2" stroke-linecap="round"/>
      <!-- Deal Conversion Funnel Spark -->
      <path d="M35 74 H65" stroke="#10B981" stroke-width="3" stroke-linecap="round"/>
      <circle cx="50" cy="74" r="3.5" fill="#10B981"/>
    `
  },

  // 18. P-Pass
  {
    id: "p-pass",
    name: "P-Pass",
    category: "Security",
    replaces: "1Password / Bitwarden",
    primaryColor: "#1E293B",
    accentColor: "#0F172A",
    bgColor: "#F8FAFC",
    svgContent: `
      <!-- Hardened Hardened Steel Padlock Shackle -->
      <path d="M34 42 V30 C34 21.2 41.2 14 50 14 C58.8 14 66 21.2 66 30 V42" fill="none" stroke="#1E293B" stroke-width="7" stroke-linecap="round"/>
      <!-- Heavy Vault Body -->
      <rect x="22" y="40" width="56" height="46" rx="10" fill="#1E293B" stroke="#0F172A" stroke-width="2.5"/>
      <!-- Argon2id Cryptographic Core Keyhole -->
      <circle cx="50" cy="58" r="6" fill="#10B981"/>
      <path d="M47 58 L45 72 H55 L53 58 Z" fill="#10B981"/>
      <!-- Hardware Biometric Sensor Rings -->
      <circle cx="50" cy="62" r="16" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3"/>
    `
  },

  // 19. P-Sites
  {
    id: "p-sites",
    name: "P-Sites",
    category: "Web",
    replaces: "Webflow / Ghost / Vercel",
    primaryColor: "#059669",
    accentColor: "#064E3B",
    bgColor: "#ECFDF5",
    svgContent: `
      <!-- Global Edge Planet / Orbit Grid -->
      <circle cx="50" cy="50" r="26" fill="#FFFFFF" stroke="#059669" stroke-width="3"/>
      <!-- Equator & Longitudinal Meridian Curves -->
      <ellipse cx="50" cy="50" rx="26" ry="11" fill="none" stroke="#059669" stroke-width="2"/>
      <ellipse cx="50" cy="50" rx="11" ry="26" fill="none" stroke="#059669" stroke-width="2"/>
      <line x1="24" y1="50" x2="76" y2="50" stroke="#059669" stroke-width="2"/>
      <line x1="50" y1="24" x2="50" y2="76" stroke="#059669" stroke-width="2"/>
      <!-- Edge Broadcast Nodes (300+ Cities) -->
      <circle cx="36" cy="40" r="3" fill="#10B981"/>
      <circle cx="64" cy="40" r="3" fill="#10B981"/>
      <circle cx="50" cy="61" r="3" fill="#10B981"/>
      <!-- Lightning Fast Sub-50ms TTFB Ray -->
      <polygon points="50,16 54,26 48,26 52,36 44,36" fill="#F59E0B" stroke="#D97706" stroke-width="1"/>
    `
  },

  // 20. P-Automate
  {
    id: "p-automate",
    name: "P-Automate",
    category: "Workflow",
    replaces: "Zapier / Make.com",
    primaryColor: "#F59E0B",
    accentColor: "#B45309",
    bgColor: "#FFFBEB",
    svgContent: `
      <!-- Interconnected Trigger & Action Logic Mesh -->
      <!-- Trigger Source Node -->
      <circle cx="28" cy="30" r="7" fill="#F59E0B" stroke="#B45309" stroke-width="2"/>
      <!-- Filter / Condition Splitter Node -->
      <circle cx="28" cy="70" r="7" fill="#F59E0B" stroke="#B45309" stroke-width="2"/>
      <!-- Action Destination Node -->
      <circle cx="72" cy="50" r="9" fill="#10B981" stroke="#065F46" stroke-width="2.5"/>
      <!-- Serverless Data Flow Pipes -->
      <path d="M35 30 H50 L63 45" fill="none" stroke="#B45309" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M35 70 H50 L63 55" fill="none" stroke="#B45309" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- High-Voltage Edge Lightning Bolt (Zero-Latency Trigger) -->
      <polygon points="53,24 45,46 55,46 47,68 65,42 55,42" fill="#F59E0B" stroke="#78350F" stroke-width="2" stroke-linejoin="round"/>
    `
  }
];

export function generatePillarSvg(pillar: PillarMeta): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="${pillar.name} - Postveil Sovereign Suite">
  <defs>
    <!-- Postveil Signature Rounded Seal Mask -->
    <clipPath id="seal-${pillar.id}">
      <rect x="6" y="6" width="88" height="88" rx="22"/>
    </clipPath>
    <!-- Subtle Ambient Gradient -->
    <linearGradient id="bg-${pillar.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pillar.bgColor}"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
    <clipPath id="cal-hdr-clip">
      <rect x="22" y="24" width="56" height="54" rx="10"/>
    </clipPath>
  </defs>

  <!-- Postveil Seal Base Container -->
  <rect x="6" y="6" width="88" height="88" rx="22" fill="url(#bg-${pillar.id})" stroke="${pillar.accentColor}" stroke-opacity="0.12" stroke-width="1.5"/>

  <!-- Postveil Sovereign Dual-Plane Diagonal Brand Shear (Iconic Identity Anchor) -->
  <polygon points="0,0 68,0 22,100 0,100" clip-path="url(#seal-${pillar.id})" fill="${pillar.primaryColor}" opacity="0.08"/>
  <polygon points="78,0 100,0 100,100 32,100" clip-path="url(#seal-${pillar.id})" fill="${pillar.accentColor}" opacity="0.05" transform="translate(2,-2)"/>

  <!-- Pillar Specific Architectural Symbolism -->
  <g id="symbol-${pillar.id}">
    ${pillar.svgContent.trim()}
  </g>
</svg>
`;
}

// Generate all files
const outputDir = path.resolve(process.cwd(), "public", "brand", "pillars");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

PILLARS.forEach((pillar) => {
  const filePath = path.join(outputDir, `${pillar.id}.svg`);
  const svg = generatePillarSvg(pillar);
  fs.writeFileSync(filePath, svg, "utf-8");
  console.log(`Generated: ${pillar.id}.svg (${pillar.name})`);
});

console.log("All 20 Postveil Sovereign Pillar logos successfully generated!");
