import React from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";

export interface AlignmentGroupProps {
  onAlign?: (alignment: "left" | "center" | "right" | "justify") => void;
  activeAlignment?: "left" | "center" | "right" | "justify";
}

export const AlignmentGroup: React.FC<AlignmentGroupProps> = ({
  onAlign = (align) => {
    const cmdMap: Record<string, string> = {
      left: "justifyLeft",
      center: "justifyCenter",
      right: "justifyRight",
      justify: "justifyFull",
    };
    document.execCommand(cmdMap[align], false);
  },
  activeAlignment,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <button
        className={`pdocs-tool-btn ${activeAlignment === "left" ? "active" : ""}`}
        onClick={() => onAlign("left")}
        title="Align left (Ctrl+Shift+L)"
      >
        <AlignLeft size={16} />
      </button>
      <button
        className={`pdocs-tool-btn ${activeAlignment === "center" ? "active" : ""}`}
        onClick={() => onAlign("center")}
        title="Align center (Ctrl+Shift+E)"
      >
        <AlignCenter size={16} />
      </button>
      <button
        className={`pdocs-tool-btn ${activeAlignment === "right" ? "active" : ""}`}
        onClick={() => onAlign("right")}
        title="Align right (Ctrl+Shift+R)"
      >
        <AlignRight size={16} />
      </button>
      <button
        className={`pdocs-tool-btn ${activeAlignment === "justify" ? "active" : ""}`}
        onClick={() => onAlign("justify")}
        title="Justify (Ctrl+Shift+J)"
      >
        <AlignJustify size={16} />
      </button>
    </div>
  );
};
