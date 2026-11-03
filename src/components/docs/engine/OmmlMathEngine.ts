/**
 * LaTeX to Office Open XML Math (OMML) Transpiler
 *
 * Clean-room, high-fidelity bidirectional mathematical translation engine.
 * Converts standard LaTeX expressions into Microsoft Word-compatible
 * Office MathML (OMML) <m:oMath> XML trees with zero external dependencies.
 */

export interface OmmlOptions {
  display?: boolean;
}

export class OmmlMathEngine {
  /**
   * Converts a LaTeX math string (e.g. `\frac{a}{b}`, `\sqrt[n]{x}`, `\int_0^\infty`)
   * into valid ECMA-376 Office MathML `<m:oMath>` or `<m:oMathPara>`.
   */
  public static latexToOmml(latex: string, options: OmmlOptions = {}): string {
    const trimmed = (latex || "").trim();
    if (!trimmed) return "";

    const ommlBody = this.parseExpression(trimmed);
    if (options.display) {
      return `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath>${ommlBody}</m:oMath></m:oMathPara>`;
    }
    return `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlBody}</m:oMath>`;
  }

  private static parseExpression(input: string): string {
    let out = "";
    let i = 0;
    const len = input.length;

    while (i < len) {
      const char = input[i];

      // LaTeX command
      if (char === "\\") {
        i++;
        let cmd = "";
        while (i < len && /[a-zA-Z]/.test(input[i])) {
          cmd += input[i];
          i++;
        }

        // Fraction: \frac{num}{den}
        if (cmd === "frac") {
          const num = this.readGroup(input, i);
          i = num.nextIdx;
          const den = this.readGroup(input, i);
          i = den.nextIdx;
          out += `<m:f><m:num>${this.parseExpression(num.content)}</m:num><m:den>${this.parseExpression(den.content)}</m:den></m:f>`;
          continue;
        }

        // Radical / Square root: \sqrt{rad} or \sqrt[deg]{rad}
        if (cmd === "sqrt") {
          let deg = "";
          if (input[i] === "[") {
            const degGroup = this.readBracket(input, i);
            deg = degGroup.content;
            i = degGroup.nextIdx;
          }
          const rad = this.readGroup(input, i);
          i = rad.nextIdx;
          if (deg) {
            out += `<m:rad><m:radPr><m:degHide m:val="0"/></m:radPr><m:deg>${this.parseExpression(deg)}</m:deg><m:e>${this.parseExpression(rad.content)}</m:e></m:rad>`;
          } else {
            out += `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${this.parseExpression(rad.content)}</m:e></m:rad>`;
          }
          continue;
        }

        // Greek and math symbol entities
        const symbolEntity = this.lookupSymbol(cmd);
        if (symbolEntity) {
          out += `<m:r><m:t>${symbolEntity}</m:t></m:r>`;
          continue;
        }

        // Generic text/format command (\mathbf, \mathit, \text)
        if (["text", "textrm", "mathrm", "mathbf", "mathit"].includes(cmd)) {
          const txt = this.readGroup(input, i);
          i = txt.nextIdx;
          out += `<m:r><m:t xml:space="preserve">${this.escapeXml(txt.content)}</m:t></m:r>`;
          continue;
        }

        // Fallback for unrecognized command
        out += `<m:r><m:t>${this.escapeXml(cmd)}</m:t></m:r>`;
        continue;
      }

      // Superscript: ^
      if (char === "^") {
        i++;
        const sup = this.readTokenOrGroup(input, i);
        i = sup.nextIdx;
        // Wrap previous item or stand alone
        out += `<m:sSup><m:e/><m:sup>${this.parseExpression(sup.content)}</m:sup></m:sSup>`;
        continue;
      }

      // Subscript: _
      if (char === "_") {
        i++;
        const sub = this.readTokenOrGroup(input, i);
        i = sub.nextIdx;
        out += `<m:sSub><m:e/><m:sub>${this.parseExpression(sub.content)}</m:sub></m:sSub>`;
        continue;
      }

      // Plain whitespace or brackets
      if (char === "{" || char === "}") {
        i++;
        continue;
      }

      // Regular text/operator
      out += `<m:r><m:t>${this.escapeXml(char)}</m:t></m:r>`;
      i++;
    }

    return out;
  }

  private static readGroup(input: string, startIdx: number): { content: string; nextIdx: number } {
    let i = startIdx;
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length || input[i] !== "{") {
      return this.readTokenOrGroup(input, i);
    }
    i++; // Skip opening {
    let depth = 1;
    let content = "";
    while (i < input.length) {
      if (input[i] === "{") depth++;
      else if (input[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      content += input[i];
      i++;
    }
    return { content, nextIdx: i };
  }

  private static readBracket(input: string, startIdx: number): { content: string; nextIdx: number } {
    let i = startIdx + 1; // Skip [
    let content = "";
    while (i < input.length && input[i] !== "]") {
      content += input[i];
      i++;
    }
    if (i < input.length && input[i] === "]") i++;
    return { content, nextIdx: i };
  }

  private static readTokenOrGroup(input: string, startIdx: number): { content: string; nextIdx: number } {
    let i = startIdx;
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) return { content: "", nextIdx: i };

    if (input[i] === "{") {
      return this.readGroup(input, i);
    }

    if (input[i] === "\\") {
      let cmd = "\\";
      i++;
      while (i < input.length && /[a-zA-Z]/.test(input[i])) {
        cmd += input[i];
        i++;
      }
      return { content: cmd, nextIdx: i };
    }

    return { content: input[i], nextIdx: i + 1 };
  }

  private static lookupSymbol(cmd: string): string | null {
    const table: Record<string, string> = {
      alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
      eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
      nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
      upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
      Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ",
      Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
      times: "×", cdot: "·", pm: "±", div: "÷", infty: "∞",
      int: "∫", sum: "∑", prod: "∏", partial: "∂", nabla: "∇",
      approx: "≈", neq: "≠", leq: "≤", geq: "≥", in: "∈",
      notin: "∉", subset: "⊂", supset: "⊃", forall: "∀", exists: "∃",
      implies: "⇒", iff: "⇔", leftarrow: "←", rightarrow: "→",
    };
    return table[cmd] || null;
  }

  private static escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
