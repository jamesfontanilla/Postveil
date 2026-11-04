import React, { useEffect, useState } from "react";
import { KeyTipBadge } from "../types";

export interface KeyTipsOverlayProps {
  isActive: boolean;
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onExecuteCommand: (commandId: string, params?: Record<string, any>) => void;
  onDismiss: () => void;
}

export const KeyTipsOverlay: React.FC<KeyTipsOverlayProps> = ({
  isActive,
  activeTabId,
  onSelectTab,
  onExecuteCommand,
  onDismiss,
}) => {
  const [stage, setStage] = useState<"root" | "shelf">("root");
  const [badges, setBadges] = useState<KeyTipBadge[]>([]);

  // Collect badge positions when KeyTips become active or stage changes
  useEffect(() => {
    if (!isActive) {
      setBadges([]);
      setStage("root");
      return;
    }

    const collected: KeyTipBadge[] = [];

    if (stage === "root") {
      // Collect badges for Tab buttons
      const tabButtons = document.querySelectorAll<HTMLElement>(".pdocs-ribbon-tab-btn");
      tabButtons.forEach((btn) => {
        const text = btn.innerText.trim().toLowerCase();
        let code = "";
        if (text.includes("file")) code = "F";
        else if (text.includes("home")) code = "H";
        else if (text.includes("insert")) code = "N";
        else if (text.includes("layout") && !text.includes("table")) code = "P";
        else if (text.includes("review")) code = "R";
        else if (text.includes("view")) code = "W";
        else if (text.includes("table design")) code = "JT";
        else if (text.includes("table layout")) code = "JL";
        else if (text.includes("picture format")) code = "JP";

        if (code) {
          const rect = btn.getBoundingClientRect();
          collected.push({
            id: `tab-${code}`,
            code,
            targetId: btn.id || code,
            rect,
          });
        }
      });

      // Collect badges for QAT buttons
      const qatButtons = document.querySelectorAll<HTMLElement>(".pdocs-qat-btn[data-keytip]");
      qatButtons.forEach((btn) => {
        const code = btn.getAttribute("data-keytip");
        if (code) {
          const rect = btn.getBoundingClientRect();
          collected.push({
            id: `qat-${code}`,
            code,
            targetId: btn.id,
            rect,
          });
        }
      });
    } else if (stage === "shelf") {
      // Collect badges for shelf items within current active tab
      const shelfItems = document.querySelectorAll<HTMLElement>(".pdocs-ribbon-shelf [data-command-id], .pdocs-ribbon-shelf button[id]");
      let index = 1;
      shelfItems.forEach((el) => {
        const cmdId = el.getAttribute("data-command-id") || el.id;
        if (cmdId) {
          let code = "";
          if (cmdId === "format.bold" || cmdId === "bold") code = "1";
          else if (cmdId === "format.italic" || cmdId === "italic") code = "2";
          else if (cmdId === "format.underline" || cmdId === "underline") code = "3";
          else if (cmdId === "format.strikethrough" || cmdId === "strike") code = "4";
          else if (cmdId.includes("paste")) code = "V";
          else if (cmdId.includes("cut")) code = "X";
          else if (cmdId.includes("copy")) code = "C";
          else if (cmdId.includes("alignLeft")) code = "AL";
          else if (cmdId.includes("alignCenter")) code = "AC";
          else if (cmdId.includes("alignRight")) code = "AR";
          else {
            code = String(index++);
          }

          const rect = el.getBoundingClientRect();
          collected.push({
            id: `cmd-${code}-${cmdId}`,
            code,
            commandId: cmdId,
            targetId: el.id,
            rect,
          });
        }
      });
    }

    setBadges(collected);
  }, [isActive, stage, activeTabId]);

  // Global key listener when KeyTips are active
  useEffect(() => {
    if (!isActive) return;

    let buffer = "";
    let bufferTimer: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (stage === "shelf") {
          setStage("root");
        } else {
          onDismiss();
        }
        return;
      }

      if (e.key === "Alt") {
        e.preventDefault();
        onDismiss();
        return;
      }

      const key = e.key.toUpperCase();
      if (!/^[A-Z0-9]$/.test(key)) return;

      e.preventDefault();
      buffer += key;

      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => {
        buffer = "";
      }, 800);

      const match = badges.find((b) => b.code === buffer);
      if (match) {
        if (stage === "root") {
          // Tab selection or QAT execute
          if (match.code === "F") {
            onSelectTab("file");
            onDismiss();
          } else if (match.code === "H") {
            onSelectTab("home");
            setStage("shelf");
          } else if (match.code === "N") {
            onSelectTab("insert");
            setStage("shelf");
          } else if (match.code === "P") {
            onSelectTab("layout");
            setStage("shelf");
          } else if (match.code === "R") {
            onSelectTab("review");
            setStage("shelf");
          } else if (match.code === "W") {
            onSelectTab("view");
            setStage("shelf");
          } else if (match.code === "JT") {
            onSelectTab("table-design");
            setStage("shelf");
          } else if (match.code === "JL") {
            onSelectTab("table-layout");
            setStage("shelf");
          } else if (match.code === "JP") {
            onSelectTab("picture-format");
            setStage("shelf");
          } else if (match.targetId) {
            const btn = document.getElementById(match.targetId);
            btn?.click();
            onDismiss();
          }
        } else if (stage === "shelf") {
          if (match.commandId) {
            onExecuteCommand(match.commandId);
          } else if (match.targetId) {
            const btn = document.getElementById(match.targetId);
            btn?.click();
          }
          onDismiss();
        }
        buffer = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(bufferTimer);
    };
  }, [isActive, stage, badges, onSelectTab, onExecuteCommand, onDismiss]);

  if (!isActive || badges.length === 0) return null;

  return (
    <div className="pdocs-keytips-container" aria-hidden="true">
      {badges.map((badge) => {
        if (!badge.rect) return null;
        return (
          <div
            key={badge.id}
            className="pdocs-keytip-badge"
            style={{
              top: `${badge.rect.bottom - 10}px`,
              left: `${badge.rect.left + badge.rect.width / 2}px`,
            }}
          >
            {badge.code}
          </div>
        );
      })}
    </div>
  );
};
