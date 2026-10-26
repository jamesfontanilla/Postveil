import { SHEET_MAX_COLUMNS, SHEET_MAX_ROWS, cellKey, type SheetCell, type Workbook } from "./sheetTypes.ts";

const allowed = (value: unknown): value is Workbook => Boolean(value && typeof value === "object" && (value as Workbook).schema === "postveil.psheet" && (value as Workbook).schemaVersion === 1 && Array.isArray((value as Workbook).sheets));
export function canonicalWorkbook(workbook: Workbook): Workbook {
  if (!allowed(workbook) || workbook.sheets.length < 1) throw new Error("Invalid .psheet workbook");
  const sheets = workbook.sheets.map((sheet) => ({ name: String(sheet.name), cells: Object.fromEntries(Object.keys(sheet.cells).sort().map((key) => [key, sheet.cells[key]])) }));
  for (const sheet of sheets) for (const key of Object.keys(sheet.cells)) { const [letters, digits] = key.match(/^([A-Za-z]+)(\d+)$/)?.slice(1) || []; const column = letters ? letters.toUpperCase().charCodeAt(0) - 65 : -1; const row = digits ? Number(digits) - 1 : -1; if (column < 0 || column >= SHEET_MAX_COLUMNS || row < 0 || row >= SHEET_MAX_ROWS) throw new Error("Cell is out of bounds"); }
  return { schema: "postveil.psheet", schemaVersion: 1, activeSheet: workbook.activeSheet || sheets[0].name, sheets };
}
export function serializePsheet(workbook: Workbook): string { return JSON.stringify(canonicalWorkbook(workbook)); }
export function parsePsheet(raw: string): Workbook { const parsed = JSON.parse(raw) as Workbook; return canonicalWorkbook(parsed); }
function csvEscape(value: unknown): string { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
export function exportCsv(sheet: Workbook["sheets"][number]): string {
  const keys = Object.keys(sheet.cells); if (!keys.length) return "";
  const maxColumn = Math.max(...keys.map((key) => key.match(/^[A-Za-z]+/)?.[0].charCodeAt(0) || 65)) - 65;
  const maxRow = Math.max(...keys.map((key) => Number(key.match(/\d+$/)?.[0] || 1))) - 1;
  return Array.from({ length: maxRow + 1 }, (_, row) => Array.from({ length: maxColumn + 1 }, (_, column) => csvEscape(sheet.cells[cellKey(column, row)]?.value ?? "")).join(",")).join("\n");
}
function parseCsvLine(line: string): string[] { const result: string[] = []; let current = ""; let quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { result.push(current); current = ""; } else current += char; } result.push(current); return result; }
export function importCsv(raw: string, name = "Sheet1"): Workbook { const cells: Record<string, SheetCell> = {}; const rows = raw.replace(/\r/g, "").split("\n").filter((line) => line.length).map(parseCsvLine); if (rows.length > SHEET_MAX_ROWS || rows.some((row) => row.length > SHEET_MAX_COLUMNS)) throw new Error("CSV exceeds bounded sheet size"); rows.forEach((row, r) => row.forEach((value, c) => { if (value !== "") cells[cellKey(c, r)] = { value: /^-?(?:\d+\.?\d*|\.\d+)$/.test(value) ? Number(value) : value }; })); return { schema: "postveil.psheet", schemaVersion: 1, activeSheet: name, sheets: [{ name, cells }] }; }
