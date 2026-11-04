import { type DocSuggestion } from "../types";

export interface InlineDelta {
  id: string;
  type: "insert" | "delete" | "replace" | "format";
  author: string;
  authorEmail?: string;
  timestamp: string;
  text?: string;
  suggestedText?: string;
  originalText?: string;
  startOffset?: number;
  endOffset?: number;
  formatChange?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  };
}

export interface TrackedRange {
  blockId: string;
  startOffset: number;
  endOffset: number;
  delta: InlineDelta;
  status: "pending" | "accepted" | "rejected";
}

export class SovereignDeltaEngine {
  /**
   * Applies an inline character-level edit to a paragraph while preserving or recording deltas.
   */
  public static recordInsertion(
    originalText: string,
    insertText: string,
    offset: number,
    author: string,
    authorEmail?: string
  ): { updatedText: string; delta: InlineDelta } {
    const delta: InlineDelta = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "insert",
      author,
      authorEmail,
      timestamp: new Date().toISOString(),
      text: insertText,
      startOffset: offset,
      endOffset: offset + insertText.length,
    };

    const updatedText = originalText.slice(0, offset) + insertText + originalText.slice(offset);
    return { updatedText, delta };
  }

  /**
   * Records a deletion range with strikethrough markup in review mode.
   */
  public static recordDeletion(
    originalText: string,
    startOffset: number,
    endOffset: number,
    author: string,
    authorEmail?: string
  ): { updatedText: string; delta: InlineDelta } {
    const deletedText = originalText.slice(startOffset, endOffset);
    const delta: InlineDelta = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "delete",
      author,
      authorEmail,
      timestamp: new Date().toISOString(),
      text: deletedText,
      startOffset,
      endOffset,
    };

    return { updatedText: originalText, delta }; // Preserves text for review markup
  }

  /**
   * Computes a fine-grained character-level diff between original and updated text in suggesting mode,
   * returning exact offset boundaries and delta categorization.
   */
  public static computeSuggestion(
    originalText: string,
    newText: string,
    author: string,
    authorEmail?: string
  ): {
    type: "insert" | "delete" | "replace";
    originalText?: string;
    suggestedText: string;
    startIndex: number;
    endIndex: number;
  } | null {
    if (originalText === newText) return null;

    // Find common prefix length
    let prefixLen = 0;
    const minLen = Math.min(originalText.length, newText.length);
    while (prefixLen < minLen && originalText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    // Find common suffix length (ensuring no overlap with prefix)
    let origSuffix = originalText.length;
    let newSuffix = newText.length;
    while (origSuffix > prefixLen && newSuffix > prefixLen && originalText[origSuffix - 1] === newText[newSuffix - 1]) {
      origSuffix--;
      newSuffix--;
    }

    const removed = originalText.slice(prefixLen, origSuffix);
    const added = newText.slice(prefixLen, newSuffix);

    if (removed.length === 0 && added.length > 0) {
      return {
        type: "insert",
        suggestedText: added,
        startIndex: prefixLen,
        endIndex: prefixLen,
      };
    } else if (added.length === 0 && removed.length > 0) {
      return {
        type: "delete",
        originalText: removed,
        suggestedText: "",
        startIndex: prefixLen,
        endIndex: origSuffix,
      };
    } else {
      return {
        type: "replace",
        originalText: removed,
        suggestedText: added,
        startIndex: prefixLen,
        endIndex: origSuffix,
      };
    }
  }

  /**
   * Renders tracked changes with Word-standard visual markup:
   * - Insertions: Underlined in green/cyan with author tooltip (<ins>)
   * - Deletions: Struck-through in red with author tooltip (<del>)
   * - Suggestions: Renders active pending suggestions directly in the block HTML
   */
  public static renderTrackedHtml(text: string, deltasOrSuggestions: Array<InlineDelta | DocSuggestion>): string {
    if (!deltasOrSuggestions || deltasOrSuggestions.length === 0) return text;

    let html = text;
    for (const item of deltasOrSuggestions) {
      if ("status" in item && item.status !== "pending") continue;

      const isSuggestion = "suggestedText" in item;
      const author = item.author || "Reviewer";

      if (item.type === "insert") {
        const textToInsert = isSuggestion ? item.suggestedText : item.text;
        if (textToInsert && !html.includes(`data-pdocs-rev="${item.id}"`)) {
          const replacement = `<ins class="pdocs-tracked-insert" data-pdocs-rev="${item.id}" style="color:#0f766e; text-decoration:underline; background:rgba(20,184,166,0.14); padding:1px 2px; border-radius:2px; font-weight:500;" title="Suggested insertion by ${author}">${textToInsert}</ins>`;
          if (html.includes(textToInsert)) {
            html = html.replace(textToInsert, replacement);
          } else {
            html = `${html} ${replacement}`;
          }
        }
      } else if (item.type === "delete") {
        const textToDelete = isSuggestion ? item.originalText : item.text;
        if (textToDelete && html.includes(textToDelete)) {
          const replacement = `<del class="pdocs-tracked-delete" data-pdocs-rev="${item.id}" style="color:#b91c1c; text-decoration:line-through; background:rgba(239,68,68,0.14); padding:1px 2px; border-radius:2px;" title="Suggested deletion by ${author}">${textToDelete}</del>`;
          html = html.replace(textToDelete, replacement);
        }
      } else if (item.type === "replace") {
        const orig = isSuggestion ? item.originalText : item.text;
        const sugg = isSuggestion ? item.suggestedText : "";
        if (orig && html.includes(orig)) {
          const replacement = `<span class="pdocs-tracked-replace" data-pdocs-rev="${item.id}"><del style="color:#b91c1c; text-decoration:line-through; background:rgba(239,68,68,0.14); padding:1px 2px; border-radius:2px;" title="Suggested replacement by ${author}">${orig}</del><ins style="color:#0f766e; text-decoration:underline; background:rgba(20,184,166,0.14); padding:1px 2px; border-radius:2px; margin-left:3px; font-weight:500;" title="Suggested replacement by ${author}">${sugg || ""}</ins></span>`;
          html = html.replace(orig, replacement);
        }
      }
    }
    return html;
  }
}
