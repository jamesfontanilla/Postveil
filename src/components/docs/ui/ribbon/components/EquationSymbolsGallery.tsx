import React from "react";
import { useRibbonDispatcher } from "../RibbonContext";

export interface MathSymbolItem {
  latex: string;
  display: string;
  tooltip: string;
}

export const COMMON_MATH_SYMBOLS: MathSymbolItem[] = [
  // Greek Lowercase
  { latex: "\\alpha", display: "α", tooltip: "alpha" },
  { latex: "\\beta", display: "β", tooltip: "beta" },
  { latex: "\\gamma", display: "γ", tooltip: "gamma" },
  { latex: "\\theta", display: "θ", tooltip: "theta" },
  { latex: "\\pi", display: "π", tooltip: "pi" },
  { latex: "\\lambda", display: "λ", tooltip: "lambda" },
  { latex: "\\sigma", display: "σ", tooltip: "sigma" },
  { latex: "\\omega", display: "ω", tooltip: "omega" },
  { latex: "\\Delta", display: "Δ", tooltip: "Delta" },
  { latex: "\\Omega", display: "Ω", tooltip: "Omega" },

  // Operators & Relations
  { latex: "\\infty", display: "∞", tooltip: "infinity" },
  { latex: "\\pm", display: "±", tooltip: "plus-minus" },
  { latex: "\\neq", display: "≠", tooltip: "not equal" },
  { latex: "\\le", display: "≤", tooltip: "less or equal" },
  { latex: "\\ge", display: "≥", tooltip: "greater or equal" },
  { latex: "\\approx", display: "≈", tooltip: "approximately" },
  { latex: "\\in", display: "∈", tooltip: "element of" },
  { latex: "\\notin", display: "∉", tooltip: "not in" },
  { latex: "\\subset", display: "⊂", tooltip: "subset of" },
  { latex: "\\cup", display: "∪", tooltip: "union" },
  { latex: "\\cap", display: "∩", tooltip: "intersection" },
  { latex: "\\to", display: "→", tooltip: "right arrow" },
  { latex: "\\Rightarrow", display: "⇒", tooltip: "implies" },
  { latex: "\\nabla", display: "∇", tooltip: "nabla / gradient" },
  { latex: "\\times", display: "×", tooltip: "times" },
  { latex: "\\cdot", display: "·", tooltip: "dot product" },
];

export const EquationSymbolsGallery: React.FC = () => {
  const dispatcher = useRibbonDispatcher();

  const handleSymbolClick = (latex: string) => {
    dispatcher.dispatch("equation.insertSymbol", { latex });
  };

  return (
    <div
      className="pdocs-eq-symbols-grid"
      role="region"
      aria-label="Mathematical Symbols Fast Access"
    >
      {COMMON_MATH_SYMBOLS.map((sym) => (
        <button
          key={sym.latex}
          type="button"
          className="pdocs-eq-symbol-btn"
          title={`${sym.tooltip} (${sym.latex})`}
          onClick={() => handleSymbolClick(sym.latex)}
        >
          {sym.display}
        </button>
      ))}
    </div>
  );
};
