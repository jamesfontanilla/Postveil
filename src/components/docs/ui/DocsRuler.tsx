import React, { useState, useRef, useEffect, useCallback } from "react";
import { type DocMargins } from "../types";

interface DocsRulerProps {
  paperWidth: number;
  margins: DocMargins;
  onMarginsChange: (newMargins: DocMargins) => void;
}

export const DocsRuler: React.FC<DocsRulerProps> = ({
  paperWidth,
  margins,
  onMarginsChange,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<"left" | "right" | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);

  // 1 inch = 72px in the interactive canvas typography point scale
  const PPI = 72;
  const leftPx = Math.round(margins.left * PPI);
  const rightPx = Math.round(margins.right * PPI);

  const handleMouseDown = (handle: "left" | "right", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingHandle(handle);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingHandle || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const relativeX = clientX - rect.left;
      setDragCurrentX(relativeX);

      const minPx = Math.round(0.25 * PPI); // minimum 0.25"
      const maxPx = Math.round(3.0 * PPI); // maximum 3.0"

      if (draggingHandle === "left") {
        const clampedX = Math.max(minPx, Math.min(maxPx, relativeX));
        const newLeftInches = Math.round((clampedX / PPI) * 20) / 20; // snap to 0.05"
        if (newLeftInches !== margins.left) {
          onMarginsChange({
            ...margins,
            left: newLeftInches,
            preset: "custom",
          });
        }
      } else if (draggingHandle === "right") {
        const rightFromEdge = paperWidth - relativeX;
        const clampedRight = Math.max(minPx, Math.min(maxPx, rightFromEdge));
        const newRightInches = Math.round((clampedRight / PPI) * 20) / 20;
        if (newRightInches !== margins.right) {
          onMarginsChange({
            ...margins,
            right: newRightInches,
            preset: "custom",
          });
        }
      }
    },
    [draggingHandle, margins, onMarginsChange, paperWidth]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingHandle(null);
    setDragCurrentX(null);
  }, []);

  useEffect(() => {
    if (draggingHandle) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp]);

  // Generate tick marks for each 1/8", 1/4", 1/2", 1"
  const ticks: React.ReactNode[] = [];
  const totalInches = Math.ceil(paperWidth / PPI);

  for (let inch = 0; inch < totalInches; inch++) {
    const inchX = inch * PPI;
    if (inchX <= paperWidth) {
      ticks.push(
        <div
          key={`tick-num-${inch}`}
          style={{
            position: "absolute",
            left: `${inchX}px`,
            top: 2,
            fontSize: "9px",
            color: "#64748b",
            fontFamily: "monospace",
            userSelect: "none",
            pointerEvents: "none",
            transform: inch === 0 ? "none" : "translateX(-50%)",
          }}
        >
          {inch > 0 ? inch : ""}
        </div>
      );
    }

    // 8 subdivisions per inch
    for (let frac = 0; frac < 8; frac++) {
      const tickX = inchX + frac * (PPI / 8);
      if (tickX > paperWidth) break;
      const isInch = frac === 0;
      const isHalf = frac === 4;
      const isQuarter = frac === 2 || frac === 6;

      const height = isInch ? 12 : isHalf ? 8 : isQuarter ? 6 : 4;

      ticks.push(
        <div
          key={`tick-${inch}-${frac}`}
          style={{
            position: "absolute",
            left: `${tickX}px`,
            bottom: 0,
            width: "1px",
            height: `${height}px`,
            backgroundColor: isInch ? "#475569" : isHalf ? "#94a3b8" : "#cbd5e1",
            pointerEvents: "none",
          }}
        />
      );
    }
  }

  return (
    <div
      ref={rulerRef}
      style={{
        width: `${paperWidth}px`,
        maxWidth: "100%",
        height: "22px",
        backgroundColor: "#f1f5f9",
        border: "1px solid #cbd5e1",
        borderBottom: "none",
        position: "relative",
        boxSizing: "border-box",
        userSelect: "none",
        margin: "0 auto",
      }}
      className="pdocs-canvas-ruler"
    >
      {/* Active Printable White Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${leftPx}px`,
          right: `${rightPx}px`,
          backgroundColor: "#ffffff",
          pointerEvents: "none",
        }}
      />

      {/* Ticks Layer */}
      {ticks}

      {/* Left Margin Marker (Downward Triangle) */}
      <div
        onMouseDown={(e) => handleMouseDown("left", e)}
        title={`Left Margin: ${margins.left}" (Drag to adjust)`}
        style={{
          position: "absolute",
          left: `${leftPx}px`,
          top: 0,
          bottom: 0,
          width: "12px",
          transform: "translateX(-50%)",
          cursor: "ew-resize",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        {/* Rectangular Indent Bar */}
        <div
          style={{
            width: "10px",
            height: "4px",
            backgroundColor: "#2563eb",
            borderRadius: "1px",
          }}
        />
        {/* Downward Triangle Marker */}
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "7px solid #2563eb",
          }}
        />
      </div>

      {/* Right Margin Marker (Downward Triangle) */}
      <div
        onMouseDown={(e) => handleMouseDown("right", e)}
        title={`Right Margin: ${margins.right}" (Drag to adjust)`}
        style={{
          position: "absolute",
          left: `${paperWidth - rightPx}px`,
          top: 0,
          bottom: 0,
          width: "12px",
          transform: "translateX(-50%)",
          cursor: "ew-resize",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "8px solid #2563eb",
            marginTop: 2,
          }}
        />
      </div>

      {/* Visual Alignment Guideline while dragging */}
      {draggingHandle && dragCurrentX !== null && (
        <div
          style={{
            position: "absolute",
            left: `${dragCurrentX}px`,
            top: 0,
            width: "1px",
            height: "1000px",
            borderLeft: "1px dashed #2563eb",
            pointerEvents: "none",
            zIndex: 50,
          }}
        />
      )}
    </div>
  );
};
