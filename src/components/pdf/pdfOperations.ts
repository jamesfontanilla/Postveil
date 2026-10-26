import { pdfCodec } from "../docs/formats/pdfCodec.ts";
import type { UniversalDoc } from "../docs/types.ts";
export type PdfExportResult = { ok: true; data: Blob; filename: string } | { ok: false; error: string };
export function isUniversalDoc(value: unknown): value is UniversalDoc { return Boolean(value && typeof value === "object" && "metadata" in value && "blocks" in value && Array.isArray((value as UniversalDoc).blocks)); }
export async function exportPdfSnapshot(snapshot: UniversalDoc): Promise<PdfExportResult> { if (!isUniversalDoc(snapshot)) return { ok: false, error: "A current P-Docs snapshot is required" }; try { const result = await pdfCodec.export(snapshot, { format: "pdf" }); if (!(result.data instanceof Blob)) return { ok: false, error: "PDF export returned no binary document" }; return { ok: true, data: result.data, filename: result.filename }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "PDF export failed" }; } }
export function pdfImportBoundary(): { available: false; message: string } { return { available: false, message: "PDF import and preview setup required. This boundary does not parse arbitrary PDF bytes." }; }
