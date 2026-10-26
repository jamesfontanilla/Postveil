export const SHEET_MAX_COLUMNS = 100;
export const SHEET_MAX_ROWS = 10_000;
export const SHEET_MAX_FORMULA_LENGTH = 1_000;

export type SheetScalar = string | number | boolean | null;
export type SheetValue = SheetScalar;
export type SheetCell = { value?: SheetValue; formula?: string };
export interface SheetModel { name: string; cells: Record<string, SheetCell>; }
export interface Workbook { schema: "postveil.psheet"; schemaVersion: 1; activeSheet: string; sheets: SheetModel[]; }
export type FormulaErrorCode = "#VALUE!" | "#REF!" | "#CYCLE!" | "#DIV/0!" | "#NAME?";
export interface FormulaError { error: FormulaErrorCode; }
export type EvaluatedValue = SheetValue | FormulaError;

export function columnToIndex(column: string): number {
  let result = 0;
  for (const char of column.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}
export function indexToColumn(index: number): string {
  let result = ""; let value = index + 1;
  while (value) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
export function parseCellAddress(address: string): { column: number; row: number; absoluteColumn: boolean; absoluteRow: boolean } | null {
  const match = address.match(/^\$?([A-Za-z]{1,3})\$?(\d+)$/);
  if (!match) return null;
  const column = columnToIndex(match[1]); const row = Number(match[2]) - 1;
  const absoluteColumn = address.startsWith("$"); const absoluteRow = /\$\d+$/.test(address);
  if (!Number.isInteger(row) || column < 0 || column >= SHEET_MAX_COLUMNS || row < 0 || row >= SHEET_MAX_ROWS) return null;
  return { column, row, absoluteColumn, absoluteRow };
}
export function cellKey(column: number, row: number): string { return `${indexToColumn(column)}${row + 1}`; }
