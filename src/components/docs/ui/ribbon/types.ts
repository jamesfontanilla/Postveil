import { LucideIcon } from "lucide-react";
import { ReviewMode, PaperSize, Orientation, DocMargins } from "../../types";

export type RibbonTabId =
  | "file"
  | "home"
  | "insert"
  | "draw"
  | "design"
  | "layout"
  | "references"
  | "mailings"
  | "review"
  | "view"
  | "table-design"
  | "table-layout"
  | "picture-format"
  | "shape-format";

export type RibbonItemKind =
  | "big"
  | "small"
  | "split"
  | "menu"
  | "custom"
  | "separator";

export interface RibbonItemDef {
  id: string;
  kind: RibbonItemKind;
  label: string;
  tooltip: string;
  icon?: LucideIcon | string;
  shortcut?: string;
  commandId?: string;
  defaultParams?: Record<string, any>;
  items?: RibbonMenuItemDef[];
  customRender?: string;
  priority?: number;
}

export interface RibbonMenuItemDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  checked?: boolean;
  commandId: string;
  params?: Record<string, any>;
  separatorBefore?: boolean;
}

export interface RibbonGroupDef {
  id: string;
  name: string;
  dialogCommand?: string;
  items: RibbonItemDef[];
  collapsedLabel?: string;
}

export interface RibbonTabDef {
  id: RibbonTabId;
  label: string;
  isContextual?: boolean;
  contextualType?: "table" | "image" | "shape";
  groups: RibbonGroupDef[];
}

export interface QatItemDef {
  id: string;
  label: string;
  icon: LucideIcon;
  commandId: string;
}
