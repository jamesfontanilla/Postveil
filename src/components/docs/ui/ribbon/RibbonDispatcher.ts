import {
  BlockType,
  PaperSize,
  Orientation,
  DocMargins,
  MarginPreset,
  ReviewMode,
  ActiveMarks,
} from "../../types";

export interface RibbonCommandContext {
  // History & File
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;

  // Formatting
  onFormatCommand: (command: string, value?: string) => void;
  onFontChange: (fontName: string) => void;
  onFontSizeChange: (size: number) => void;
  onAlignChange: (alignment: "left" | "center" | "right" | "justify") => void;
  onBlockTypeChange: (type: BlockType) => void;
  onLineSpacingChange: (spacing: number) => void;
  onIndentChange?: (delta: number) => void;
  showFormattingMarks?: boolean;
  onToggleFormattingMarks?: () => void;
  activeMarks?: ActiveMarks;

  // Modals & Panels
  onOpenPageSetupModal?: () => void;
  onOpenFindReplaceModal?: () => void;
  onOpenHyperlinkModal: () => void;
  onOpenNewCommentModal: () => void;
  onOpenSignatureModal: () => void;
  onOpenImageUpload?: () => void;
  onAddFootnote: () => void;

  // Insert actions
  onInsertTable?: (rows: number, cols: number) => void;
  onInsertEquation?: (formula: string) => void;

  // Layout setup
  onMarginPresetChange: (preset: MarginPreset) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onPaperSizeChange: (paperSize: PaperSize) => void;
  onColumnsChange: (columns: number) => void;

  // Review & View
  reviewMode: ReviewMode;
  onReviewModeChange: (mode: ReviewMode) => void;
  onViewModeChange: (mode: "paginated" | "continuous") => void;
  isRulerVisible?: boolean;
  onToggleRuler?: (visible: boolean) => void;

  // Contextual Table actions
  onTableAction?: (action: string, params?: Record<string, any>) => void;

  // Contextual Picture actions
  onPictureAction?: (action: string, params?: Record<string, any>) => void;

  // Contextual Equation actions
  onEquationAction?: (action: string, params?: Record<string, any>) => void;
}

export class RibbonDispatcher {
  private ctx: RibbonCommandContext;

  constructor(ctx: RibbonCommandContext) {
    this.ctx = ctx;
  }

  public updateContext(ctx: RibbonCommandContext) {
    this.ctx = ctx;
  }

  public dispatch(commandId: string, params: Record<string, any> = {}): boolean {
    switch (commandId) {
      // --- File & History Commands ---
      case "file.save":
        this.ctx.onSave?.();
        return true;
      case "file.print":
        window.print();
        return true;
      case "edit.undo":
        if (this.ctx.canUndo) this.ctx.onUndo();
        return true;
      case "edit.redo":
        if (this.ctx.canRedo) this.ctx.onRedo();
        return true;

      case "edit.cut": {
        document.execCommand("cut");
        return true;
      }
      case "edit.copy": {
        document.execCommand("copy");
        return true;
      }
      case "edit.paste": {
        if (navigator.clipboard?.readText) {
          navigator.clipboard.readText().then((text) => {
            if (text) {
              document.execCommand("insertText", false, text);
            }
          }).catch(() => {
            document.execCommand("paste");
          });
        } else {
          document.execCommand("paste");
        }
        return true;
      }
      case "edit.formatPainter": {
        this.ctx.onFormatCommand?.("formatPainter");
        return true;
      }

      // --- Inline Formatting Commands ---
      case "format.bold":
      case "format.italic":
      case "format.underline":
      case "format.strikethrough":
      case "format.subscript":
      case "format.superscript":
      case "format.clear": {
        const cmdName = commandId.replace("format.", "");
        const mappedCmd = cmdName === "clear" ? "removeFormat" : cmdName;
        this.ctx.onFormatCommand(mappedCmd);
        return true;
      }

      case "format.case": {
        if (params.type) this.ctx.onFormatCommand("changeCase", params.type);
        return true;
      }

      case "format.textColor":
        if (params.color) this.ctx.onFormatCommand("foreColor", params.color);
        return true;

      case "format.highlightColor":
        if (params.color) this.ctx.onFormatCommand("hiliteColor", params.color);
        return true;

      case "format.font":
        if (params.name) this.ctx.onFontChange(params.name);
        return true;

      case "format.size":
        if (params.size) this.ctx.onFontSizeChange(params.size);
        return true;

      // --- Paragraph & Block Commands ---
      case "para.align":
        if (params.alignment) this.ctx.onAlignChange(params.alignment);
        return true;

      case "para.blockType":
        if (params.type) this.ctx.onBlockTypeChange(params.type);
        return true;

      case "para.indent":
        if (params.delta !== undefined) {
          this.ctx.onIndentChange?.(params.delta);
        }
        return true;

      case "para.showFormattingMarks":
        this.ctx.onToggleFormattingMarks?.();
        return true;

      case "para.lineSpacing":
        if (params.spacing) this.ctx.onLineSpacingChange(params.spacing);
        return true;

      // --- Insert Commands ---
      case "insert.table":
        this.ctx.onInsertTable?.(params.rows || 3, params.cols || 3);
        return true;

      case "insert.equation":
        this.ctx.onInsertEquation?.(params.formula || "\\int_0^\\infty e^{-x} dx");
        return true;

      case "insert.image":
        this.ctx.onOpenImageUpload?.();
        return true;

      case "insert.link":
        this.ctx.onOpenHyperlinkModal();
        return true;

      case "insert.comment":
        this.ctx.onOpenNewCommentModal();
        return true;

      case "insert.footnote":
        this.ctx.onAddFootnote();
        return true;

      // --- Layout Commands ---
      case "layout.margins":
        if (params.preset) this.ctx.onMarginPresetChange(params.preset);
        return true;

      case "layout.orientation":
        if (params.value) this.ctx.onOrientationChange(params.value);
        return true;

      case "layout.size":
        if (params.size) this.ctx.onPaperSizeChange(params.size);
        return true;

      case "layout.columns":
        if (params.count) this.ctx.onColumnsChange(params.count);
        return true;

      // --- Review & Security Commands ---
      case "review.mode":
        if (params.mode) this.ctx.onReviewModeChange(params.mode);
        return true;

      case "review.sign":
        this.ctx.onOpenSignatureModal();
        return true;

      // --- View Commands ---
      case "view.layout":
        if (params.mode) this.ctx.onViewModeChange(params.mode);
        return true;

      case "view.ruler":
        this.ctx.onToggleRuler?.(!this.ctx.isRulerVisible);
        return true;

      // --- Dialog Launchers ---
      case "ui.dialog":
        if (params.name === "pageSetup") this.ctx.onOpenPageSetupModal?.();
        if (params.name === "findReplace") this.ctx.onOpenFindReplaceModal?.();
        return true;

      // --- Contextual Table Commands ---
      case "table.look.headerRow":
      case "table.look.bandedRows":
      case "table.look.firstColumn":
      case "table.shading":
      case "table.style":
      case "table.borders":
      case "table.insertRowAbove":
      case "table.insertRowBelow":
      case "table.insertColLeft":
      case "table.insertColRight":
      case "table.deleteRow":
      case "table.deleteTable":
      case "table.cellAlign":
      case "table.autoFit":
      case "table.distributeRows":
      case "table.distributeCols":
        this.ctx.onTableAction?.(commandId, params);
        return true;

      // --- Contextual Picture Commands ---
      case "picture.change":
        this.ctx.onOpenImageUpload?.();
        return true;
      case "picture.reset":
      case "picture.border":
      case "picture.shadow":
      case "picture.align":
      case "picture.dimensions":
        this.ctx.onPictureAction?.(commandId, params);
        return true;

      // --- Contextual Equation Commands ---
      case "equation.insertSymbol":
      case "equation.insertStructure":
      case "equation.toggleMode":
        this.ctx.onEquationAction?.(commandId, params);
        return true;

      default:
        console.warn(`[RibbonDispatcher] Unhandled command: ${commandId}`, params);
        return false;
    }
  }
}
