import React, { useEffect, useState } from "react";
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Link2,
  MessageSquarePlus,
  Table,
  Plus,
  Trash2,
  Image,
} from "lucide-react";
import { ActiveMarks } from "../../../types";

export interface DocsContextMenuProps {
  onFormat: (command: string, value?: string) => void;
  onOpenHyperlinkModal: () => void;
  onOpenNewCommentModal: () => void;
  hasTableSelected?: boolean;
  hasImageSelected?: boolean;
  onTableAction?: (action: string) => void;
  onPictureAction?: (action: string) => void;
  activeMarks?: ActiveMarks;
}

export const DocsContextMenu: React.FC<DocsContextMenuProps> = ({
  onFormat,
  onOpenHyperlinkModal,
  onOpenNewCommentModal,
  hasTableSelected,
  hasImageSelected,
  onTableAction,
  onPictureAction,
  activeMarks,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const canvasEl = document.querySelector(".pdocs-canvas");
      if (canvasEl && canvasEl.contains(target)) {
        e.preventDefault();
        setPosition({ x: e.clientX, y: e.clientY });
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".pdocs-context-menu")) {
        setIsOpen(false);
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  if (!isOpen || !position) return null;

  return (
    <div
      className="pdocs-context-menu"
      style={{
        position: "fixed",
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 1000,
      }}
    >
      {/* Cut / Copy / Paste */}
      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          document.execCommand("cut");
          setIsOpen(false);
        }}
      >
        <Scissors size={14} className="mr-2 opacity-70" />
        <span className="flex-1">Cut</span>
        <span className="text-[10px] text-slate-400">Ctrl+X</span>
      </button>

      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          document.execCommand("copy");
          setIsOpen(false);
        }}
      >
        <Copy size={14} className="mr-2 opacity-70" />
        <span className="flex-1">Copy</span>
        <span className="text-[10px] text-slate-400">Ctrl+C</span>
      </button>

      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            document.execCommand("insertText", false, text);
          } catch {
            document.execCommand("paste");
          }
          setIsOpen(false);
        }}
      >
        <ClipboardPaste size={14} className="mr-2 opacity-70" />
        <span className="flex-1">Paste</span>
        <span className="text-[10px] text-slate-400">Ctrl+V</span>
      </button>

      <div className="pdocs-context-menu-divider" />

      {/* Font & Paragraph Actions */}
      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          onFormat("bold");
          setIsOpen(false);
        }}
      >
        <span className="w-4 font-bold mr-2 text-center">B</span>
        <span>Bold</span>
        <span className="ml-auto text-[10px] text-slate-400">Ctrl+B</span>
      </button>

      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          onFormat("italic");
          setIsOpen(false);
        }}
      >
        <span className="w-4 italic mr-2 text-center">I</span>
        <span>Italic</span>
        <span className="ml-auto text-[10px] text-slate-400">Ctrl+I</span>
      </button>

      <div className="pdocs-context-menu-divider" />

      {/* Insert & Annotations */}
      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          onOpenHyperlinkModal();
          setIsOpen(false);
        }}
      >
        <Link2 size={14} className="mr-2 opacity-70" />
        <span>Add Link...</span>
        <span className="ml-auto text-[10px] text-slate-400">Ctrl+K</span>
      </button>

      <button
        type="button"
        className="pdocs-context-menu-item"
        onClick={() => {
          onOpenNewCommentModal();
          setIsOpen(false);
        }}
      >
        <MessageSquarePlus size={14} className="mr-2 opacity-70" />
        <span>New Comment</span>
      </button>

      {/* Table Contextual Items */}
      {hasTableSelected && (
        <>
          <div className="pdocs-context-menu-divider" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-400">
            Table Tools
          </div>
          <button
            type="button"
            className="pdocs-context-menu-item"
            onClick={() => {
              onTableAction?.("table.insertRowBelow");
              setIsOpen(false);
            }}
          >
            <Plus size={14} className="mr-2 opacity-70" />
            <span>Insert Row Below</span>
          </button>
          <button
            type="button"
            className="pdocs-context-menu-item"
            onClick={() => {
              onTableAction?.("table.insertColRight");
              setIsOpen(false);
            }}
          >
            <Plus size={14} className="mr-2 opacity-70" />
            <span>Insert Column Right</span>
          </button>
          <button
            type="button"
            className="pdocs-context-menu-item text-red-400 hover:text-red-300"
            onClick={() => {
              onTableAction?.("table.deleteRow");
              setIsOpen(false);
            }}
          >
            <Trash2 size={14} className="mr-2 opacity-70" />
            <span>Delete Row</span>
          </button>
        </>
      )}

      {/* Picture Contextual Items */}
      {hasImageSelected && (
        <>
          <div className="pdocs-context-menu-divider" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-400">
            Picture Tools
          </div>
          <button
            type="button"
            className="pdocs-context-menu-item"
            onClick={() => {
              onPictureAction?.("picture.reset");
              setIsOpen(false);
            }}
          >
            <Image size={14} className="mr-2 opacity-70" />
            <span>Reset Picture</span>
          </button>
        </>
      )}
    </div>
  );
};
