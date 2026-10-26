import { SHEET_MAX_FORMULA_LENGTH, SHEET_MAX_COLUMNS, SHEET_MAX_ROWS, cellKey, parseCellAddress, type EvaluatedValue, type FormulaErrorCode, type SheetCell, type SheetModel, type SheetValue } from "./sheetTypes.ts";

const error = (value: FormulaErrorCode): EvaluatedValue => ({ error: value });
const isError = (value: EvaluatedValue): value is { error: FormulaErrorCode } => typeof value === "object" && value !== null && "error" in value;
const isNumber = (value: EvaluatedValue): value is number => typeof value === "number" && Number.isFinite(value);

type Address = ReturnType<typeof parseCellAddress>;
function addressFromToken(token: string): Address { return parseCellAddress(token.replace(/^.*!/, "")); }
function addressRange(token: string): { start: Address; end: Address } | null {
  const parts = token.split(":"); if (parts.length !== 2) return null;
  const start = addressFromToken(parts[0]); const end = addressFromToken(parts[1]);
  return start && end ? { start, end } : null;
}

export function evaluateFormula(formula: string, sheet: SheetModel, options: { stack?: Set<string>; currentCell?: string } = {}): EvaluatedValue {
  if (typeof formula !== "string" || formula.length > SHEET_MAX_FORMULA_LENGTH || !formula.startsWith("=")) return error("#VALUE!");
  const expression = formula.slice(1).trim();
  if (!expression) return error("#VALUE!");
  const stack = options.stack || new Set<string>();
  const currentCell = options.currentCell || "<formula>";
  if (stack.has(currentCell)) return error("#CYCLE!");
  stack.add(currentCell);
  try { return parseExpression(expression, sheet, stack); } finally { stack.delete(currentCell); }
}

function readCell(token: string, sheet: SheetModel, stack: Set<string>): EvaluatedValue {
  const qualifier = token.match(/^([^!]+)!/);
  if (qualifier && qualifier[1].replace(/^'/, "").replace(/'$/, "") !== sheet.name) return error("#REF!");
  const address = addressFromToken(token); if (!address) return error("#REF!");
  const key = cellKey(address.column, address.row); const cell: SheetCell | undefined = sheet.cells[key];
  if (!cell) return null;
  if (cell.formula) {
    if (stack.has(key)) return error("#CYCLE!");
    return evaluateFormula(cell.formula, sheet, { stack, currentCell: key });
  }
  return cell.value ?? null;
}
function valuesInRange(token: string, sheet: SheetModel, stack: Set<string>): EvaluatedValue[] {
  const qualifier = token.match(/^([^!]+)!/);
  if (qualifier && qualifier[1].replace(/^'/, "").replace(/'$/, "") !== sheet.name) return [error("#REF!")];
  const range = addressRange(token); if (!range) return [error("#REF!")];
  const minColumn = Math.min(range.start!.column, range.end!.column); const maxColumn = Math.max(range.start!.column, range.end!.column);
  const minRow = Math.min(range.start!.row, range.end!.row); const maxRow = Math.max(range.start!.row, range.end!.row);
  if (minColumn < 0 || maxColumn >= SHEET_MAX_COLUMNS || minRow < 0 || maxRow >= SHEET_MAX_ROWS) return [error("#REF!")];
  const values: EvaluatedValue[] = [];
  for (let row = minRow; row <= maxRow; row += 1) for (let column = minColumn; column <= maxColumn; column += 1) values.push(readCell(cellKey(column, row), sheet, stack));
  return values;
}
function splitArguments(expression: string): string[] {
  const output: string[] = []; let depth = 0; let start = 0;
  for (let index = 0; index < expression.length; index += 1) { const char = expression[index]; if (char === "(") depth += 1; else if (char === ")") depth -= 1; else if (char === "," && depth === 0) { output.push(expression.slice(start, index).trim()); start = index + 1; } }
  output.push(expression.slice(start).trim()); return output;
}
function parseExpression(expression: string, sheet: SheetModel, stack: Set<string>): EvaluatedValue {
  const aggregate = expression.match(/^(SUM|AVERAGE|MIN|MAX)\((.*)\)$/i);
  if (aggregate) {
    const args = splitArguments(aggregate[2]); const values = args.flatMap((arg) => arg.includes(":") ? valuesInRange(arg, sheet, stack) : [readCell(arg, sheet, stack)]);
    const failure = values.find(isError); if (failure) return failure;
    const numbers = values.filter(isNumber);
    switch (aggregate[1].toUpperCase()) {
      case "SUM": return numbers.reduce((sum, value) => sum + value, 0);
      case "AVERAGE": return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : error("#DIV/0!");
      case "MIN": return numbers.length ? Math.min(...numbers) : error("#VALUE!");
      case "MAX": return numbers.length ? Math.max(...numbers) : error("#VALUE!");
    }
  }
  const quoted = expression.match(/^"([\s\S]*)"$/); if (quoted) return quoted[1];
  if (/^(TRUE|FALSE)$/i.test(expression)) return expression.toUpperCase() === "TRUE";
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(expression)) return Number(expression);
  const binary = expression.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
  if (binary) {
    const left = parseExpression(binary[1], sheet, stack); const right = parseExpression(binary[3], sheet, stack);
    if (isError(left)) return left; if (isError(right)) return right;
    if (!isNumber(left) || !isNumber(right)) return error("#VALUE!");
    if (binary[2] === "+") return left + right; if (binary[2] === "-") return left - right; if (binary[2] === "*") return left * right; return right === 0 ? error("#DIV/0!") : left / right;
  }
  if (parseCellAddress(expression.replace(/^.*!/, ""))) return readCell(expression, sheet, stack);
  return error("#NAME?");
}

export function evaluateCell(sheet: SheetModel, key: string, stack = new Set<string>()): EvaluatedValue {
  const cell = sheet.cells[key]; if (!cell) return null;
  return cell.formula ? evaluateFormula(cell.formula, sheet, { stack, currentCell: key }) : cell.value ?? null;
}
