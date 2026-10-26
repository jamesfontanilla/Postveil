import { type UniversalDoc, type ExportOptions, type DocumentCodec } from "../types.ts";
import { jsPDF } from "jspdf";

export const pdfCodec: DocumentCodec = {
  id: "pdf",
  spec: {
    id: "pdf",
    name: "Portable Document Format",
    extension: ".pdf",
    mimeType: "application/pdf",
    category: "Publication",
    giantCompetitor: "Adobe Acrobat & macOS Preview",
    description: "Vector paginated PDF export with exact typography margins, headers, and page numbers.",
    isLossless: false,
    supportsMath: true,
    supportsTables: true,
  },

  async import(_raw: string | ArrayBuffer): Promise<UniversalDoc> {
    throw new Error("PDF import/preview setup required; no parser is configured");
  },

  async export(doc: UniversalDoc, options?: ExportOptions): Promise<{ data: Blob; filename: string }> {
    const isLandscape = doc.metadata.orientation === "landscape";
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 54; // 0.75 in * 72 pt
    const maxContentWidth = pageWidth - margin * 2;
    let y = margin + 20;

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin - 30) {
        pdf.addPage();
        y = margin + 20;
        drawHeaderFooter();
      }
    };

    const drawHeaderFooter = () => {
      // Header
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184); // #94a3b8
      pdf.text(doc.metadata.headerText || doc.metadata.title, margin, margin - 10);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.5);
      pdf.line(margin, margin - 4, pageWidth - margin, margin - 4);

      // Footer
      const pageCount = (pdf as any).internal.getNumberOfPages();
      pdf.line(margin, pageHeight - margin + 10, pageWidth - margin, pageHeight - margin + 10);
      pdf.text(`Page ${pageCount}`, pageWidth - margin - 35, pageHeight - margin + 22);
      pdf.text("Postveil Sovereign Document • Zero Hostage", margin, pageHeight - margin + 22);
    };

    drawHeaderFooter();

    for (const block of doc.blocks) {
      switch (block.type) {
        case "heading": {
          const lvl = block.level || 1;
          const sz = lvl === 1 ? 22 : lvl === 2 ? 16 : 13;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(sz);
          pdf.setTextColor(lvl === 1 ? 15 : 30, lvl === 1 ? 81 : 41, lvl === 1 ? 50 : 59);

          const lines = pdf.splitTextToSize(block.content || "", maxContentWidth);
          const blockH = lines.length * (sz * 1.3) + 16;
          checkPageBreak(blockH);

          y += 10;
          pdf.text(lines, margin, y);
          y += lines.length * (sz * 1.3);

          if (lvl === 1) {
            pdf.setDrawColor(15, 81, 50);
            pdf.setLineWidth(1.5);
            pdf.line(margin, y + 2, margin + 140, y + 2);
            y += 8;
          }
          y += 6;
          break;
        }

        case "paragraph": {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10.5);
          pdf.setTextColor(26, 26, 26);

          const lines = pdf.splitTextToSize(block.content || "", maxContentWidth);
          const blockH = lines.length * 15 + 8;
          checkPageBreak(blockH);

          pdf.text(lines, margin, y);
          y += blockH;
          break;
        }

        case "blockquote": {
          pdf.setFont("helvetica", "italic");
          pdf.setFontSize(10);
          pdf.setTextColor(71, 85, 105);

          const lines = pdf.splitTextToSize(block.content || "", maxContentWidth - 24);
          const blockH = lines.length * 14 + 16;
          checkPageBreak(blockH);

          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y - 6, maxContentWidth, blockH, "F");

          pdf.setDrawColor(15, 81, 50);
          pdf.setLineWidth(3);
          pdf.line(margin, y - 6, margin, y - 6 + blockH);

          pdf.text(lines, margin + 16, y + 6);
          y += blockH + 6;
          break;
        }

        case "taskList":
        case "bulletList": {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10);
          pdf.setTextColor(30, 41, 59);

          const prefix = block.type === "taskList" ? (block.checked ? "[x] " : "[ ] ") : "• ";
          const text = prefix + (block.content || "");
          const lines = pdf.splitTextToSize(text, maxContentWidth - 12);
          const blockH = lines.length * 14 + 4;
          checkPageBreak(blockH);

          pdf.text(lines, margin + 8, y);
          y += blockH;
          break;
        }

        case "callout": {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(15, 81, 50);

          const title = (block.calloutTitle || "NOTE").toUpperCase();
          const lines = pdf.splitTextToSize(block.content || "", maxContentWidth - 24);
          const blockH = lines.length * 13 + 30;
          checkPageBreak(blockH);

          pdf.setFillColor(240, 253, 244);
          pdf.rect(margin, y - 4, maxContentWidth, blockH, "F");

          pdf.setDrawColor(15, 81, 50);
          pdf.setLineWidth(3);
          pdf.line(margin, y - 4, margin, y - 4 + blockH);

          pdf.text(title, margin + 14, y + 8);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(51, 65, 85);
          pdf.text(lines, margin + 14, y + 22);
          y += blockH + 8;
          break;
        }

        case "table": {
          if (block.rows && block.rows.length > 0) {
            const rowH = 22;
            const colCount = block.rows[0].cells.length || 1;
            const colW = maxContentWidth / colCount;
            const tableH = block.rows.length * rowH + 10;
            checkPageBreak(Math.min(tableH, 120));

            for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
              checkPageBreak(rowH + 4);
              const r = block.rows[rIdx];
              for (let cIdx = 0; cIdx < r.cells.length; cIdx++) {
                const c = r.cells[cIdx];
                const cellX = margin + cIdx * colW;

                if (c.isHeader) {
                  pdf.setFillColor(241, 245, 249);
                  pdf.rect(cellX, y, colW, rowH, "F");
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(9);
                  pdf.setTextColor(15, 23, 42);
                } else {
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(9);
                  pdf.setTextColor(30, 41, 59);
                }

                pdf.setDrawColor(203, 213, 225);
                pdf.setLineWidth(0.5);
                pdf.rect(cellX, y, colW, rowH, "S");

                const cellText = pdf.splitTextToSize(c.content || "", colW - 8)[0] || "";
                pdf.text(cellText, cellX + 5, y + 14);
              }
              y += rowH;
            }
            y += 10;
          }
          break;
        }

        case "codeBlock": {
          pdf.setFont("courier", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(15, 23, 42);

          const lines = pdf.splitTextToSize(block.content || "", maxContentWidth - 16);
          const blockH = lines.length * 12 + 16;
          checkPageBreak(blockH);

          pdf.setFillColor(241, 245, 249);
          pdf.rect(margin, y - 4, maxContentWidth, blockH, "F");
          pdf.setDrawColor(203, 213, 225);
          pdf.setLineWidth(0.5);
          pdf.rect(margin, y - 4, maxContentWidth, blockH, "S");

          pdf.text(lines, margin + 8, y + 8);
          y += blockH + 8;
          break;
        }

        default:
          if (block.content) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            pdf.setTextColor(30, 41, 59);
            const lines = pdf.splitTextToSize(block.content, maxContentWidth);
            const blockH = lines.length * 14 + 6;
            checkPageBreak(blockH);
            pdf.text(lines, margin, y);
            y += blockH;
          }
      }
    }

    const blob = pdf.output("blob");
    const filename = `${doc.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { data: blob, filename };
  },
};
