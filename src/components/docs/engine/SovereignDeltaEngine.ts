/**
 * Sovereign Track Changes & Revision Delta Engine
 *
 * Implements fine-grained range editing, inline redlining, and change tracking
 * compatible with enterprise Word / Google Docs review workflows.
 */

export interface InlineDelta {
  id: string;
  type: "insert" | "delete" | "format";
  author: string;
  authorEmail?: string;
  timestamp: string;
  text?: string;
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
    };

    return { updatedText: originalText, delta }; // Preserves text for review markup
  }

  /**
   * Renders tracked changes with Word-standard visual markup:
   * - Insertions: Underlined in green/cyan with author tooltip
   * - Deletions: Struck-through in red with author tooltip
   */
  public static renderTrackedHtml(text: string, deltas: InlineDelta[]): string {
    if (!deltas || deltas.length === 0) return text;

    let html = text;
    for (const delta of deltas) {
      if (delta.type === "insert" && delta.text) {
        const replacement = `<ins class="pdocs-tracked-insert" style="color:#0f766e; text-decoration:underline; background:rgba(20,184,166,0.12);" title="Inserted by ${delta.author} at ${new Date(delta.timestamp).toLocaleTimeString()}">${delta.text}</ins>`;
        html = html.replace(delta.text, replacement);
      } else if (delta.type === "delete" && delta.text) {
        const replacement = `<del class="pdocs-tracked-delete" style="color:#b91c1c; text-decoration:line-through; background:rgba(239,68,68,0.12);" title="Deleted by ${delta.author} at ${new Date(delta.timestamp).toLocaleTimeString()}">${delta.text}</del>`;
        html = html.replace(delta.text, replacement);
      }
    }
    return html;
  }
}
