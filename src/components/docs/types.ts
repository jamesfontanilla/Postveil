export type SupportedFormat =
  | "docx"
  | "odt"
  | "pdf"
  | "md"
  | "html"
  | "epub"
  | "latex"
  | "rtf"
  | "txt"
  | "pdoc";

export type BlockType =
  | "paragraph"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "table"
  | "mathBlock"
  | "callout"
  | "divider"
  | "pageBreak"
  | "columnBreak"
  | "image"
  | "toc";

export type CalloutVariant = "note" | "tip" | "info" | "warning" | "danger";

export interface InlineMark {
  type: "bold" | "italic" | "underline" | "strike" | "code" | "color" | "highlight" | "link" | "sub" | "sup" | "font";
  value?: string;
}

export interface InlineSpan {
  text: string;
  marks?: InlineMark[];
}

export interface TableCell {
  id: string;
  content: string;
  isHeader?: boolean;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface DocBlock {
  id: string;
  type: BlockType;
  content?: string;
  html?: string; // Rich styled HTML content preserving inline text colors, highlights, marks
  level?: 1 | 2 | 3 | 4 | 5 | 6; // For headings
  spans?: InlineSpan[]; // For rich inline marks
  checked?: boolean; // For task items
  language?: string; // For code blocks
  calloutVariant?: CalloutVariant; // For callouts
  calloutTitle?: string;
  latex?: string; // For math blocks
  rows?: TableRow[]; // For tables
  imageUrl?: string; // For images
  imageAlt?: string;
  imageWidth?: string; // e.g. "50%", "100%"
  imageAlign?: "left" | "center" | "right";
  tocStyle?: "dotted" | "links"; // For Table of Contents
}
export type PaperSize = "A4" | "Letter" | "Legal" | "A3" | "A5" | "Tabloid";
export type Orientation = "portrait" | "landscape";

export type MarginPreset = "normal" | "narrow" | "moderate" | "wide" | "custom";

export interface DocMargins {
  preset: MarginPreset;
  top: number; // in inches
  bottom: number;
  left: number;
  right: number;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  wordCount: number;
  charCount: number;
  readingTimeMinutes: number;
  paperSize: PaperSize;
  orientation: Orientation;
  margins?: DocMargins;
  pageColor?: string;
  columns?: 1 | 2 | 3;
  columnSpacing?: number; // in inches, default 0.5
  columnDivider?: boolean;
  lineSpacing: "1.0" | "1.15" | "1.5" | "2.0";
  fontFamily: string;
  fontSize: number; // in px or pt
  isEncrypted: boolean;
  authorKeyId?: string;
  differentFirstPage?: boolean;
  headerText?: string;
  footerText?: string;
  headerMargin?: number; // in inches
  footerMargin?: number; // in inches
  pageNumberStyle?: "standard" | "pageOfTotal" | "none";
  footnotes?: FootnoteItem[];
  comments?: DocComment[];
  suggestions?: DocSuggestion[];
  signatures?: SignatureMetadata[];
}

export type ReviewMode = "editing" | "suggesting" | "viewing";

export interface LegacySignatureFields {
  id: string;
  signerName: string;
  signerEmail: string;
  publicKey: string;
  signatureBase64: string;
  documentHashSha256: string;
  timestamp: string;
  algorithm: "Ed25519";
}

export interface VerifiedSignature extends LegacySignatureFields {
  kind: "verified";
  status: "verified";
  verifiedAt: string;
  verificationMethod: "approved-key-service";
}

export interface UnverifiedSignatureMetadata extends LegacySignatureFields {
  kind: "unverified";
  status: "unverified";
  reason: "legacy-signature-metadata" | "verification-unavailable";
}

export type SignatureMetadata = VerifiedSignature | UnverifiedSignatureMetadata;

const LEGACY_SIGNATURE_KEYS = ["id", "signerName", "signerEmail", "publicKey", "signatureBase64", "documentHashSha256", "timestamp", "algorithm"] as const;

export function normalizeSignatureMetadata(value: unknown): SignatureMetadata | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (LEGACY_SIGNATURE_KEYS.some((key) => typeof candidate[key] !== "string") || candidate.algorithm !== "Ed25519") return null;
  const legacy = Object.fromEntries(LEGACY_SIGNATURE_KEYS.map((key) => [key, candidate[key]])) as unknown as LegacySignatureFields;
  if (candidate.kind === "verified" && candidate.status === "verified" && typeof candidate.verifiedAt === "string" && candidate.verificationMethod === "approved-key-service") {
    return { ...legacy, kind: "verified", status: "verified", verifiedAt: candidate.verifiedAt, verificationMethod: "approved-key-service" };
  }
  return { ...legacy, kind: "unverified", status: "unverified", reason: candidate.kind === "unverified" && candidate.reason === "verification-unavailable" ? "verification-unavailable" : "legacy-signature-metadata" };
}

export function normalizeDocumentSignatures<T extends UniversalDoc>(doc: T): T {
  const signatures = Array.isArray(doc.metadata.signatures)
    ? doc.metadata.signatures.map(normalizeSignatureMetadata).filter((signature): signature is SignatureMetadata => Boolean(signature))
    : undefined;
  return { ...doc, metadata: { ...doc.metadata, ...(signatures ? { signatures } : {}) } };
}

export type AutosaveStatus = "unknown" | "saved" | "saving" | "unsaved" | "error";

export type SaveResult =
  | { status: "saved"; medium: "opfs" | "indexeddb" | "localStorage"; savedAt: string }
  | { status: "failed"; reason: "unsupported" | "quota" | "io"; message: string };

export function isVerifiedSignature(signature: SignatureMetadata): signature is VerifiedSignature {
  return signature.kind === "verified" && signature.status === "verified";
}

export interface CommentReply {
  id: string;
  author: string;
  authorEmail?: string;
  timestamp: string;
  text: string;
}

export interface DocComment {
  id: string;
  blockId: string;
  quotedText?: string;
  author: string;
  authorEmail?: string;
  timestamp: string;
  text: string;
  resolved: boolean;
  replies: CommentReply[];
}

export interface DocSuggestion {
  id: string;
  blockId: string;
  author: string;
  authorEmail?: string;
  timestamp: string;
  type: "insert" | "delete" | "replace";
  originalText?: string;
  suggestedText: string;
  status: "pending" | "accepted" | "rejected";
}

export interface FootnoteItem {
  id: string;
  number: number;
  text: string;
  blockId?: string;
}

export interface DocVersionSnapshot {
  id: string;
  timestamp: string;
  name?: string;
  author: string;
  wordCount: number;
  doc: UniversalDoc;
}

export interface UniversalDoc {
  metadata: DocumentMetadata;
  blocks: DocBlock[];
}

export interface FormatSpecification {
  id: SupportedFormat;
  name: string;
  extension: string;
  mimeType: string;
  category: "Word Processor" | "Open Standard" | "Markup / Code" | "Publication" | "Plaintext" | "Sovereign Native";
  giantCompetitor: string;
  description: string;
  isLossless: boolean;
  supportsMath: boolean;
  supportsTables: boolean;
}

export interface ExportOptions {
  format: SupportedFormat;
  includeMetadata?: boolean;
  paperSize?: PaperSize;
  orientation?: Orientation;
  mathEngine?: "latex" | "mathml" | "unicode";
  styleTheme?: "modern" | "classic" | "academic" | "minimal";
}

export interface DocumentCodec {
  id: SupportedFormat;
  spec: FormatSpecification;
  import(raw: string | ArrayBuffer): Promise<UniversalDoc>;
  export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: string | Blob; filename: string }>;
}
