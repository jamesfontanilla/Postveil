import engine from "katex";

export interface MathRenderOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  macros?: Record<string, string>;
}

export interface MathSymbolSpec {
  label: string;
  symbol: string;
  category: "operators" | "calculus" | "greek" | "matrices" | "logic";
  tooltip: string;
}

/**
 * Sovereign Mathematical Typesetting Engine
 * High-performance client-side symbolic equation renderer and validator
 */
export class SovereignMathEngine {
  /**
   * Renders a mathematical expression string to semantic HTML markup
   */
  public static renderToHtml(expression: string, options: MathRenderOptions = {}): string {
    const trimmed = (expression || "").trim();
    if (!trimmed) {
      return `<span class="sovereign-math-empty" style="color:#94a3b8; font-style:italic;">[Empty equation]</span>`;
    }

    try {
      return engine.renderToString(trimmed, {
        displayMode: options.displayMode ?? true,
        throwOnError: options.throwOnError ?? false,
        macros: options.macros,
      });
    } catch {
      return `<span class="sovereign-math-error" style="color:#ef4444; font-family:monospace; font-size:12px;">Syntax error in mathematical expression: ${this.escapeHtml(trimmed)}</span>`;
    }
  }

  /**
   * Renders an inline mathematical formula ($...$)
   */
  public static renderInline(expression: string): string {
    return this.renderToHtml(expression, { displayMode: false, throwOnError: false });
  }

  /**
   * Renders a standalone display mathematical formula ($$...$$)
   */
  public static renderDisplay(expression: string): string {
    return this.renderToHtml(expression, { displayMode: true, throwOnError: false });
  }

  /**
   * Validates a mathematical expression without throwing
   */
  public static validate(expression: string): { valid: boolean; error?: string } {
    try {
      engine.renderToString(expression || "", {
        displayMode: true,
        throwOnError: true,
      });
      return { valid: true };
    } catch (err: unknown) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Invalid mathematical syntax",
      };
    }
  }

  /**
   * Curated palette of symbolic primitives for interactive formula authoring
   */
  public static getSymbolPalette(): MathSymbolSpec[] {
    return [
      { label: "∂", symbol: "\\partial", category: "calculus", tooltip: "Partial derivative" },
      { label: "∇", symbol: "\\nabla", category: "calculus", tooltip: "Nabla / Del vector operator" },
      { label: "∫", symbol: "\\int_{0}^{\\infty}", category: "calculus", tooltip: "Definite integral" },
      { label: "∑", symbol: "\\sum_{i=1}^{n}", category: "calculus", tooltip: "Summation series" },
      { label: "∏", symbol: "\\prod_{i=1}^{n}", category: "calculus", tooltip: "Product series" },
      { label: "a/b", symbol: "\\frac{a}{b}", category: "operators", tooltip: "Fraction" },
      { label: "√x", symbol: "\\sqrt{x}", category: "operators", tooltip: "Square root" },
      { label: "x²", symbol: "x^{2}", category: "operators", tooltip: "Superscript power" },
      { label: "xᵢ", symbol: "x_{i}", category: "operators", tooltip: "Subscript index" },
      { label: "×", symbol: "\\times", category: "operators", tooltip: "Cross product" },
      { label: "·", symbol: "\\cdot", category: "operators", tooltip: "Dot product" },
      { label: "±", symbol: "\\pm", category: "operators", tooltip: "Plus-minus" },
      { label: "≈", symbol: "\\approx", category: "logic", tooltip: "Approximately equal" },
      { label: "≠", symbol: "\\neq", category: "logic", tooltip: "Not equal" },
      { label: "≤", symbol: "\\leq", category: "logic", tooltip: "Less than or equal" },
      { label: "≥", symbol: "\\geq", category: "logic", tooltip: "Greater than or equal" },
      { label: "∈", symbol: "\\in", category: "logic", tooltip: "Element of" },
      { label: "∀", symbol: "\\forall", category: "logic", tooltip: "For all" },
      { label: "∃", symbol: "\\exists", category: "logic", tooltip: "There exists" },
      { label: "⇒", symbol: "\\implies", category: "logic", tooltip: "Implies" },
      { label: "⇔", symbol: "\\iff", category: "logic", tooltip: "If and only if" },
      { label: "α", symbol: "\\alpha", category: "greek", tooltip: "Alpha" },
      { label: "β", symbol: "\\beta", category: "greek", tooltip: "Beta" },
      { label: "γ", symbol: "\\gamma", category: "greek", tooltip: "Gamma" },
      { label: "δ", symbol: "\\delta", category: "greek", tooltip: "Delta" },
      { label: "ε", symbol: "\\varepsilon", category: "greek", tooltip: "Epsilon" },
      { label: "θ", symbol: "\\theta", category: "greek", tooltip: "Theta" },
      { label: "λ", symbol: "\\lambda", category: "greek", tooltip: "Lambda wavelength" },
      { label: "μ", symbol: "\\mu", category: "greek", tooltip: "Mu permeability" },
      { label: "π", symbol: "\\pi", category: "greek", tooltip: "Pi constant" },
      { label: "σ", symbol: "\\sigma", category: "greek", tooltip: "Sigma" },
      { label: "ω", symbol: "\\omega", category: "greek", tooltip: "Omega angular frequency" },
      { label: "Ψ", symbol: "\\Psi", category: "greek", tooltip: "Psi wave function" },
      { label: "[Matrix]", symbol: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", category: "matrices", tooltip: "2x2 Matrix" },
      { label: "[Vector]", symbol: "\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}", category: "matrices", tooltip: "3D Column Vector" },
    ];
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
