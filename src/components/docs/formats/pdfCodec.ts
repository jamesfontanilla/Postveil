import { type UniversalDoc, type ExportOptions, type DocumentCodec, type DocBlock } from "../types.ts";
import { jsPDF } from "jspdf";
import katex from "katex";
import html2canvas from "html2canvas";

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
    const margins = doc.metadata.margins;
    const margin = margins?.left ? margins.left * 72 : 54; // default 0.75 in * 72 pt
    const maxContentWidth = pageWidth - margin * 2;
    let y = margin + 20;

    // Font selection based on document metadata
    const docFontFamily = doc.metadata.fontFamily || "Kerneon Grotesk";
    const isMonospaceDoc = /mono/i.test(docFontFamily);
    const isSerifDoc = /serif|times|georgia|merriweather|garamond/i.test(docFontFamily);

    const getPrimaryFont = (): string => {
      if (isMonospaceDoc) return "courier";
      if (isSerifDoc) return "times";
      return "helvetica";
    };

    const primaryFont = getPrimaryFont();

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin - 30) {
        pdf.addPage();
        y = margin + 20;
        drawHeaderFooter();
      }
    };

    const drawHeaderFooter = () => {
      // Header
      pdf.setFont(primaryFont, "normal");
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
          pdf.setFont(primaryFont, "bold");
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
          pdf.setFont(primaryFont, "normal");
          pdf.setFontSize(10.5);
          pdf.setTextColor(26, 26, 26);

          const text = block.content || "";
          if (!text.trim()) {
            y += 10;
            break;
          }

          const lines = pdf.splitTextToSize(text, maxContentWidth);
          const blockH = lines.length * 15 + 8;
          checkPageBreak(blockH);

          pdf.text(lines, margin, y);
          y += blockH;
          break;
        }

        case "blockquote": {
          pdf.setFont(isSerifDoc ? "times" : "helvetica", "italic");
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
        case "bulletList":
        case "orderedList": {
          pdf.setFont(primaryFont, "normal");
          pdf.setFontSize(10);
          pdf.setTextColor(30, 41, 59);

          const prefix =
            block.type === "taskList"
              ? block.checked
                ? "[x] "
                : "[ ] "
              : block.type === "orderedList"
              ? "1. "
              : "• ";
          const text = prefix + (block.content || "");
          const lines = pdf.splitTextToSize(text, maxContentWidth - 12);
          const blockH = lines.length * 14 + 4;
          checkPageBreak(blockH);

          pdf.text(lines, margin + 8, y);
          y += blockH;
          break;
        }

        case "callout": {
          pdf.setFont(primaryFont, "bold");
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
          pdf.setFont(primaryFont, "normal");
          pdf.setTextColor(51, 65, 85);
          pdf.text(lines, margin + 14, y + 22);
          y += blockH + 8;
          break;
        }

        case "mathBlock": {
          const formula = (block.latex || block.content || "").trim();
          if (formula) {
            // Render KaTeX formula to canvas/image to ensure crisp vector-grade symbols (integrals, fractions, radicals)
            const mathImage = await renderLatexToImage(formula);
            if (mathImage) {
              const maxImgW = maxContentWidth - 32;
              const imgW = Math.min(mathImage.width, maxImgW);
              const scale = imgW / mathImage.width;
              const imgH = mathImage.height * scale;
              const blockH = imgH + 28;

              checkPageBreak(blockH);

              // Render decorative equation card
              pdf.setFillColor(250, 250, 252);
              pdf.rect(margin, y - 4, maxContentWidth, blockH, "F");
              pdf.setDrawColor(226, 232, 240);
              pdf.setLineWidth(0.5);
              pdf.rect(margin, y - 4, maxContentWidth, blockH, "S");

              // Center equation
              const imgX = margin + (maxContentWidth - imgW) / 2;
              const imgY = y + 8;
              pdf.addImage(mathImage.dataUrl, "PNG", imgX, imgY, imgW, imgH);

              y += blockH + 8;
            } else {
              // Fallback: semantic text representation of formula
              const fallbackText = extractSemanticMathText(formula);
              const lines = pdf.splitTextToSize(fallbackText, maxContentWidth - 32);
              const blockH = lines.length * 14 + 20;

              checkPageBreak(blockH);

              pdf.setFillColor(250, 250, 252);
              pdf.rect(margin, y - 4, maxContentWidth, blockH, "F");
              pdf.setDrawColor(226, 232, 240);
              pdf.setLineWidth(0.5);
              pdf.rect(margin, y - 4, maxContentWidth, blockH, "S");

              pdf.setFont("times", "italic");
              pdf.setFontSize(11);
              pdf.setTextColor(15, 23, 42);
              pdf.text(lines, margin + 16, y + 12);
              y += blockH + 8;
            }
          }
          break;
        }

        case "table": {
          if (block.rows && block.rows.length > 0) {
            const rowH = 22;
            const colCount = Math.max(...block.rows.map((r) => r.cells.length), 1);
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
                  pdf.setFont(primaryFont, "bold");
                  pdf.setFontSize(9);
                  pdf.setTextColor(15, 23, 42);
                } else {
                  pdf.setFont(primaryFont, "normal");
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

        case "divider": {
          checkPageBreak(16);
          pdf.setDrawColor(203, 213, 225);
          pdf.setLineWidth(0.75);
          pdf.line(margin, y + 6, pageWidth - margin, y + 6);
          y += 16;
          break;
        }

        case "pageBreak": {
          pdf.addPage();
          y = margin + 20;
          drawHeaderFooter();
          break;
        }

        default:
          if (block.content) {
            pdf.setFont(primaryFont, "normal");
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

/**
 * Renders LaTeX formula directly to high-res PNG dataUrl using KaTeX and html2canvas in browser runtime.
 * Returns null if DOM/browser context is not present.
 */
async function renderLatexToImage(latex: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === "undefined" || !document.createElement) {
    return null;
  }

  try {
    const mathHtml = katex.renderToString(latex, {
      displayMode: true,
      throwOnError: false,
    });

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "-9999px";
    container.style.left = "-9999px";
    container.style.padding = "10px 16px";
    container.style.background = "#ffffff";
    container.style.color = "#0f172a";
    container.style.fontFamily = "KaTeX_Main, Times New Roman, serif";
    container.style.fontSize = "16px";
    container.style.display = "inline-block";
    container.innerHTML = mathHtml;

    document.body.appendChild(container);

    const canvas = await html2canvas(container, {
      scale: 2, // High DPI rendering
      backgroundColor: null,
      logging: false,
    });

    document.body.removeChild(container);

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width / 2,
      height: canvas.height / 2,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts human-readable Unicode mathematical text from KaTeX MathML output as a robust fallback.
 */
function extractSemanticMathText(latex: string): string {
  try {
    const mml = katex.renderToString(latex, {
      displayMode: true,
      output: "mathml",
      throwOnError: false,
    });
    return mml
      .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || latex;
  } catch {
    return latex;
  }
}
