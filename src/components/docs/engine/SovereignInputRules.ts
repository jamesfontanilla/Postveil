import { type BlockType, type CalloutVariant } from "../types";

export interface InputRuleMatch {
  matched: boolean;
  targetType?: BlockType;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  calloutVariant?: CalloutVariant;
  calloutTitle?: string;
  language?: string;
  cleanText?: string;
}

/**
 * Sovereign Input Rules Engine
 * Automatically expands typing shorthands into rich semantic AST blocks
 */
export class SovereignInputRules {
  /**
   * Tests a line of user-typed text against markdown & symbol expansion rules
   */
  public static test(text: string): InputRuleMatch {
    // Heading 1-6 (# Heading)
    const headingMatch = text.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, Math.max(1, headingMatch[1].length)) as 1 | 2 | 3 | 4 | 5 | 6;
      return {
        matched: true,
        targetType: "heading",
        level,
        cleanText: headingMatch[2],
      };
    }

    // Task List (- [ ] or - [x])
    const taskMatch = text.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      return {
        matched: true,
        targetType: "taskList",
        cleanText: taskMatch[2],
      };
    }

    // Bullet List (- or *)
    const bulletMatch = text.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      return {
        matched: true,
        targetType: "bulletList",
        cleanText: bulletMatch[1],
      };
    }

    // Ordered List (1.)
    const orderedMatch = text.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      return {
        matched: true,
        targetType: "orderedList",
        cleanText: orderedMatch[1],
      };
    }

    // Callout (> [!NOTE], > [!TIP], > [!WARNING], > [!DANGER])
    const calloutMatch = text.match(/^>\s*\[!(NOTE|TIP|INFO|WARNING|DANGER|CAUTION)\]\s*(.*)$/i);
    if (calloutMatch) {
      const tag = calloutMatch[1].toLowerCase();
      let variant: CalloutVariant = "note";
      if (tag === "tip") variant = "tip";
      else if (tag === "info") variant = "info";
      else if (tag === "warning") variant = "warning";
      else if (tag === "danger" || tag === "caution") variant = "danger";

      return {
        matched: true,
        targetType: "callout",
        calloutVariant: variant,
        calloutTitle: calloutMatch[1].toUpperCase(),
        cleanText: calloutMatch[2],
      };
    }

    // Blockquote (> Quote)
    const quoteMatch = text.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      return {
        matched: true,
        targetType: "blockquote",
        cleanText: quoteMatch[1],
      };
    }

    // Code Block (```typescript or ```)
    const codeMatch = text.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (codeMatch) {
      return {
        matched: true,
        targetType: "codeBlock",
        language: codeMatch[1] || "typescript",
        cleanText: "",
      };
    }

    // Standalone Math Equation ($$ or $$equation$$)
    const mathMatch = text.match(/^\$\$\s*(.*?)\s*\$\$?$/);
    if (mathMatch) {
      return {
        matched: true,
        targetType: "mathBlock",
        cleanText: mathMatch[1] || "\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J}",
      };
    }

    // Horizontal Divider (--- or ***)
    if (/^(?:---|\*\*\*|___)\s*$/.test(text)) {
      return {
        matched: true,
        targetType: "divider",
        cleanText: "",
      };
    }

    return { matched: false };
  }
}
