export type PillarId =
  | "p-mail"
  | "p-calendar"
  | "p-meet"
  | "p-chat"
  | "p-docs"
  | "p-sheets"
  | "p-deck"
  | "p-draw"
  | "p-voice"
  | "p-drive"
  | "p-studio"
  | "p-pdf"
  | "p-record"
  | "p-sign"
  | "p-forms"
  | "p-books"
  | "p-crm"
  | "p-pass"
  | "p-sites"
  | "p-automate";

export type PillarCategory = "comms" | "office" | "media" | "ops";
export type CapabilityState = "live" | "beta" | "setup-required" | "roadmap";
export type RegistryIcon = {
  kind: "asset";
  path: `/brand/pillars/${string}.svg`;
  alt: string;
};

export interface PillarDefinition {
  id: PillarId;
  name: string;
  category: PillarCategory;
  requiresAuth: true;
  icon: RegistryIcon;
  route: "/" | "/calendar" | "/docs" | "/accounts" | `/suite/${PillarId}`;
  state: CapabilityState;
  summary: string;
  dependencyNote?: string;
}

const icon = (id: PillarId, alt: string): RegistryIcon => ({
  kind: "asset",
  path: `/brand/pillars/${id}.svg`,
  alt,
});

export const PILLAR_REGISTRY: readonly PillarDefinition[] = [
  {
    id: "p-mail",
    name: "P-Mail",
    category: "comms",
    requiresAuth: true,
    icon: icon("p-mail", "P-Mail"),
    route: "/",
    state: "beta",
    summary: "Authenticated custom-domain mail with folders, search, compose, threads, and delivery controls.",
    dependencyNote: "Exchange, IMAP sync, malware scanning, and realtime delivery are not included.",
  },
  {
    id: "p-calendar",
    name: "P-Calendar",
    category: "comms",
    requiresAuth: true,
    icon: icon("p-calendar", "P-Calendar"),
    route: "/calendar",
    state: "beta",
    summary: "Private server-persisted calendar events; no provider sync.",
    dependencyNote: "Public booking, invitations, free/busy, ICS, and provider sync are not included.",
  },
  {
    id: "p-meet",
    name: "P-Meet",
    category: "comms",
    requiresAuth: true,
    icon: icon("p-meet", "P-Meet"),
    route: "/suite/p-meet",
    state: "setup-required",
    summary: "Video meetings need an approved signaling, TURN, and room authorization service.",
    dependencyNote: "Cloudflare Calls or another reviewed WebRTC service is not configured.",
  },
  {
    id: "p-chat",
    name: "P-Chat",
    category: "comms",
    requiresAuth: true,
    icon: icon("p-chat", "P-Chat"),
    route: "/suite/p-chat",
    state: "roadmap",
    summary: "Team channels and direct messages are planned; P-Mail threads remain mail.",
    dependencyNote: "No authenticated chat history, WebSocket service, or presence model exists yet.",
  },
  {
    id: "p-docs",
    name: "P-Docs",
    category: "office",
    requiresAuth: true,
    icon: icon("p-docs", "P-Docs"),
    route: "/docs",
    state: "beta",
    summary: "Local-first documents with rich editing, version history, import, and open-format export.",
    dependencyNote: "Multiplayer CRDT sync and cryptographic signature verification are not included.",
  },
  {
    id: "p-sheets",
    name: "P-Sheets",
    category: "office",
    requiresAuth: true,
    icon: icon("p-sheets", "P-Sheets"),
    route: "/suite/p-sheets",
    state: "beta",
    summary: "Bounded local workbook with a 100-column by 10,000-row grid and limited formulas.",
    dependencyNote: "WASM, million-row, and Excel compatibility are not claimed.",
  },
  {
    id: "p-deck",
    name: "P-Deck",
    category: "office",
    requiresAuth: true,
    icon: icon("p-deck", "P-Deck"),
    route: "/suite/p-deck",
    state: "roadmap",
    summary: "Markdown-native presentations are planned; no slide editor is available yet.",
    dependencyNote: "Presenter mode and PPTX import/export require a separately approved implementation.",
  },
  {
    id: "p-draw",
    name: "P-Draw",
    category: "media",
    requiresAuth: true,
    icon: icon("p-draw", "P-Draw"),
    route: "/suite/p-draw",
    state: "beta",
    summary: "Bounded local canvas with primitive objects, undo/redo, JSON and SVG export.",
    dependencyNote: "Collaboration and high-frame-rate guarantees are not included.",
  },
  {
    id: "p-voice",
    name: "P-Voice",
    category: "media",
    requiresAuth: true,
    icon: icon("p-voice", "P-Voice"),
    route: "/suite/p-voice",
    state: "beta",
    summary: "Capture-only local microphone recording with bounded time and byte limits.",
    dependencyNote: "Transcription and cloud upload are not included; browser permission is required.",
  },
  {
    id: "p-drive",
    name: "P-Drive",
    category: "office",
    requiresAuth: true,
    icon: icon("p-drive", "P-Drive"),
    route: "/suite/p-drive",
    state: "beta",
    summary: "Local file import, search, download, delete, and manifest export with bounded storage.",
    dependencyNote: "Cloud BYOS, sharing, encryption, and provider connectors are not included.",
  },
  {
    id: "p-studio",
    name: "P-Studio",
    category: "media",
    requiresAuth: true,
    icon: icon("p-studio", "P-Studio"),
    route: "/suite/p-studio",
    state: "roadmap",
    summary: "A local creative canvas is planned; no layer or image editor is available yet.",
    dependencyNote: "No WebGPU or image export pipeline is claimed.",
  },
  {
    id: "p-pdf",
    name: "P-PDF",
    category: "office",
    requiresAuth: true,
    icon: icon("p-pdf", "P-PDF"),
    route: "/suite/p-pdf",
    state: "beta",
    summary: "P-Docs can export an explicit current UniversalDoc snapshot to PDF.",
    dependencyNote: "Import, preview, OCR, redaction, compression, merge, and split are not available.",
  },
  {
    id: "p-record",
    name: "P-Record",
    category: "media",
    requiresAuth: true,
    icon: icon("p-record", "P-Record"),
    route: "/suite/p-record",
    state: "beta",
    summary: "Capture-only local display recording with bounded time and byte limits.",
    dependencyNote: "Cloud upload, share links, camera capture, and hardware encoding are not included.",
  },
  {
    id: "p-sign",
    name: "P-Sign",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-sign", "P-Sign"),
    route: "/suite/p-sign",
    state: "setup-required",
    summary: "Document signature metadata is not verified; signing is disabled pending key setup.",
    dependencyNote: "A real key lifecycle, verification service, revocation, and audit flow are required.",
  },
  {
    id: "p-forms",
    name: "P-Forms",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-forms", "P-Forms"),
    route: "/suite/p-forms",
    state: "beta",
    summary: "Local form builder, preview, and bounded local submissions.",
    dependencyNote: "Hosted forms, Turnstile, D1, and external pipes require separate setup.",
  },
  {
    id: "p-books",
    name: "P-Books",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-books", "P-Books"),
    route: "/suite/p-books",
    state: "roadmap",
    summary: "Accounting and invoicing are roadmap items, not an available financial product.",
    dependencyNote: "No ledger, payment connector, tax calculation, or reconciliation path exists.",
  },
  {
    id: "p-crm",
    name: "P-CRM",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-crm", "P-CRM"),
    route: "/suite/p-crm",
    state: "beta",
    summary: "Local deal board with fixed stages and explicit contact references.",
    dependencyNote: "Mail-derived revenue, campaigns, and automatic enrichment are not included.",
  },
  {
    id: "p-pass",
    name: "P-Pass",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-pass", "P-Pass"),
    route: "/accounts",
    state: "setup-required",
    summary: "Account MFA is available; a password vault and passkey service are not configured.",
    dependencyNote: "The current account surface must not claim FIDO2, Ed25519, or secret-vault support.",
  },
  {
    id: "p-sites",
    name: "P-Sites",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-sites", "P-Sites"),
    route: "/suite/p-sites",
    state: "setup-required",
    summary: "Publishing requires an approved public-content route and ownership controls.",
    dependencyNote: "No public page is created by this boundary.",
  },
  {
    id: "p-automate",
    name: "P-Automate",
    category: "ops",
    requiresAuth: true,
    icon: icon("p-automate", "P-Automate"),
    route: "/suite/p-automate",
    state: "setup-required",
    summary: "Cross-pillar automation requires an approved workflow graph and durable runner.",
    dependencyNote: "Existing P-Mail rules are not a cross-pillar automation product.",
  },
];

export const PILLAR_BY_ID: Readonly<Record<PillarId, PillarDefinition>> = Object.fromEntries(
  PILLAR_REGISTRY.map((pillar) => [pillar.id, pillar]),
) as Record<PillarId, PillarDefinition>;

export function getPillarDefinition(id: string): PillarDefinition | undefined {
  return PILLAR_BY_ID[id as PillarId];
}

export function isPillarId(value: string): value is PillarId {
  return value in PILLAR_BY_ID;
}

export type StorePillar = Exclude<PillarId, "p-mail" | "p-calendar" | "p-docs" | "p-pass">;

export function isStorePillar(value: string): value is StorePillar {
  return isPillarId(value) && !["p-mail", "p-calendar", "p-docs", "p-pass"].includes(value);
}

export const CAPABILITY_STATE_LABELS: Record<CapabilityState, string> = {
  live: "Live",
  beta: "Beta",
  "setup-required": "Setup required",
  roadmap: "Roadmap",
};
