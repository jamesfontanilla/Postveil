import React, { useMemo, useState, useRef } from "react";
import {
  ParentSuiteRibbon,
  RibbonShell,
  TextStyleGroup,
  AlignmentGroup,
  HistoryGroup,
} from "../platform/ribbon";
import { evaluateCell } from "./formulaEngine";
import { cellKey, type Workbook } from "./sheetTypes";
import { exportCsv, importCsv, parsePsheet, serializePsheet } from "./sheetCodecs";
import { Download, Upload, FileSpreadsheet, FileText } from "lucide-react";
import "./SheetsStyles.css";

const blankWorkbook = (): Workbook => ({
  schema: "postveil.psheet",
  schemaVersion: 1,
  activeSheet: "Sheet1",
  sheets: [{ name: "Sheet1", cells: {} }],
});

export default function PSheetsApp() {
  const [workbook, setWorkbook] = useState<Workbook>(() => blankWorkbook());
  const [selected, setSelected] = useState("A1");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [textColor, setTextColor] = useState("#000000");
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [highlightColor, setHighlightColor] = useState("transparent");
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);
  const [alignment, setAlignment] = useState<"left" | "center" | "right" | "justify">("left");

  const csvInputRef = useRef<HTMLInputElement>(null);
  const psheetInputRef = useRef<HTMLInputElement>(null);

  const sheet = workbook.sheets[0];
  const cell = sheet.cells[selected];
  const evaluated = useMemo(() => evaluateCell(sheet, selected), [sheet, selected]);

  const update = (value: string) =>
    setWorkbook((current) => ({
      ...current,
      sheets: [
        {
          ...sheet,
          cells: {
            ...sheet.cells,
            [selected]: value.startsWith("=")
              ? { formula: value }
              : {
                  value:
                    value === ""
                      ? null
                      : /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)
                      ? Number(value)
                      : value,
                },
          },
        },
      ],
    }));

  const download = (blob: Blob, name: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const ribbonTabs = [
    { id: "home", label: "Home" },
    { id: "insert", label: "Insert" },
    { id: "formulas", label: "Formulas" },
    { id: "data", label: "Data" },
  ];

  return (
    <div className="pv-platform-shell" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Universal 20-Pillar Parent Ribbon */}
      <ParentSuiteRibbon currentPillarId="p-sheets" />

      <main className="pv-suite-content pv-sheets" style={{ padding: "0", maxWidth: "100%", flex: 1, overflowY: "auto" }}>
        {/* Universal Sovereign Ribbon */}
        <RibbonShell
          tabs={ribbonTabs}
          activeTabId={activeTab}
          onTabChange={setActiveTab}
          rightControls={
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="pv-ribbon-btn"
                title="Export .psheet"
                onClick={() =>
                  download(
                    new Blob([serializePsheet(workbook)], { type: "application/json" }),
                    "workbook.psheet"
                  )
                }
              >
                <FileSpreadsheet size={15} style={{ marginRight: 4 }} /> Export .psheet
              </button>
              <button
                type="button"
                className="pv-ribbon-btn"
                title="Export CSV"
                onClick={() =>
                  download(new Blob([exportCsv(sheet)], { type: "text/csv" }), "sheet.csv")
                }
              >
                <FileText size={15} style={{ marginRight: 4 }} /> Export CSV
              </button>
            </div>
          }
        >
          {/* History Group */}
          <HistoryGroup
            canUndo={false}
            canRedo={false}
            onUndo={() => {}}
            onRedo={() => {}}
            onPrint={() => window.print()}
          />

          <div className="pv-ribbon-separator" />

          {/* Text Styling */}
          <TextStyleGroup
            activeTextColor={textColor}
            onTextColorChange={(color) => {
              setTextColor(color);
              setIsTextColorOpen(false);
            }}
            isTextColorOpen={isTextColorOpen}
            onToggleTextColor={() => setIsTextColorOpen(!isTextColorOpen)}
            onCloseTextColor={() => setIsTextColorOpen(false)}
            activeHighlightColor={highlightColor}
            onHighlightColorChange={(color) => {
              setHighlightColor(color);
              setIsHighlightOpen(false);
            }}
            isHighlightOpen={isHighlightOpen}
            onToggleHighlight={() => setIsHighlightOpen(!isHighlightOpen)}
            onCloseHighlight={() => setIsHighlightOpen(false)}
          />

          <div className="pv-ribbon-separator" />

          {/* Alignment */}
          <AlignmentGroup
            activeAlignment={alignment}
            onAlign={(align) => setAlignment(align)}
          />

          <div className="pv-ribbon-separator" />

          {/* Import Actions */}
          <button
            type="button"
            className="pv-ribbon-btn"
            title="Import CSV"
            onClick={() => csvInputRef.current?.click()}
          >
            <Upload size={14} style={{ marginRight: 4 }} /> Import CSV
          </button>
          <input
            type="file"
            ref={csvInputRef}
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setWorkbook(importCsv(await file.text()));
                setNotice("CSV imported locally");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "CSV import failed");
              }
            }}
          />

          <button
            type="button"
            className="pv-ribbon-btn"
            title="Import .psheet"
            onClick={() => psheetInputRef.current?.click()}
          >
            <Upload size={14} style={{ marginRight: 4 }} /> Import .psheet
          </button>
          <input
            type="file"
            ref={psheetInputRef}
            accept=".psheet,application/json"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setWorkbook(parsePsheet(await file.text()));
                setNotice("Workbook imported locally");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Workbook import failed");
              }
            }}
          />
        </RibbonShell>

        <div style={{ padding: "12px 16px" }}>
          {notice && <p role="status" style={{ margin: "6px 0", color: "#0f5132", fontWeight: 600 }}>{notice}</p>}

          {/* Formula Bar */}
          <label className="pv-sheet-formula">
            Formula bar{" "}
            <input
              value={
                cell?.formula ??
                (cell?.value === null || cell?.value === undefined ? "" : String(cell.value))
              }
              onChange={(event) => update(event.target.value)}
            />
            <output>
              {typeof evaluated === "object" && evaluated ? evaluated.error : String(evaluated ?? "")}
            </output>
          </label>

          {/* Bounded Cell Grid */}
          <div className="pv-sheet-grid" role="grid">
            {Array.from({ length: 20 }, (_, row) =>
              Array.from({ length: 10 }, (_, column) => {
                const key = cellKey(column, row);
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={key}
                    className={selected === key ? "selected" : ""}
                    onClick={() => setSelected(key)}
                  >
                    {key}
                    <small>{String(evaluateCell(sheet, key) ?? "")}</small>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
