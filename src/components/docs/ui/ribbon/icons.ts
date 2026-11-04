import {
  Undo2,
  Redo2,
  Save,
  Printer,
  ClipboardPaste,
  Scissors,
  Copy,
  Paintbrush,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Palette,
  Highlighter,
  Eraser,
  CaseSensitive,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Indent,
  Outdent,
  ArrowUpDown,
  Table,
  Image,
  Sigma,
  Link2,
  MessageSquarePlus,
  BookmarkPlus,
  FileText,
  Columns,
  ShieldCheck,
  PenTool,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react";

export const RibbonIcons = {
  // QAT & File
  save: Save,
  undo: Undo2,
  redo: Redo2,
  print: Printer,

  // Clipboard
  paste: ClipboardPaste,
  cut: Scissors,
  copy: Copy,
  formatPainter: Paintbrush,

  // Font
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  subscript: Subscript,
  superscript: Superscript,
  textColor: Palette,
  highlightColor: Highlighter,
  clearFormat: Eraser,
  changeCase: CaseSensitive,

  // Paragraph
  alignLeft: AlignLeft,
  alignCenter: AlignCenter,
  alignRight: AlignRight,
  alignJustify: AlignJustify,
  bulletList: List,
  orderedList: ListOrdered,
  checkList: CheckSquare,
  indent: Indent,
  outdent: Outdent,
  lineSpacing: ArrowUpDown,

  // Insert
  table: Table,
  image: Image,
  equation: Sigma,
  link: Link2,
  comment: MessageSquarePlus,
  footnote: BookmarkPlus,

  // Layout & Setup
  pageSetup: FileText,
  columns: Columns,

  // Review & Notary
  suggesting: PenTool,
  editing: FileText,
  viewing: Eye,
  digitalSeal: ShieldCheck,

  // View
  fullscreen: Maximize2,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,

  // Controls
  check: Check,
  chevronDown: ChevronDown,
  aiSparkle: Sparkles,
};
