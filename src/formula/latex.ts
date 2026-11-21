import type { MathNode } from "./types";

const GREEK_LATEX: Record<string, string> = {
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "ε": "\\epsilon",
  "ζ": "\\zeta",
  "η": "\\eta",
  "θ": "\\theta",
  "ι": "\\iota",
  "κ": "\\kappa",
  "λ": "\\lambda",
  "μ": "\\mu",
  "ν": "\\nu",
  "ξ": "\\xi",
  "ο": "o",
  "π": "\\pi",
  "ρ": "\\rho",
  "σ": "\\sigma",
  "τ": "\\tau",
  "υ": "\\upsilon",
  "φ": "\\phi",
  "χ": "\\chi",
  "ψ": "\\psi",
  "ω": "\\omega",
  "Γ": "\\Gamma",
  "Δ": "\\Delta",
  "Θ": "\\Theta",
  "Λ": "\\Lambda",
  "Ξ": "\\Xi",
  "Π": "\\Pi",
  "Σ": "\\Sigma",
  "Φ": "\\Phi",
  "Ψ": "\\Psi",
  "Ω": "\\Omega"
};

const OPERATOR_LATEX: Record<string, string> = {
  "−": "-",
  "·": "\\cdot",
  "→": "\\to",
  "≤": "\\le",
  "≥": "\\ge",
  "≠": "\\ne",
  "×": "\\times",
  "÷": "\\div"
};

const NARY_LATEX: Record<string, string> = {
  sum: "\\sum",
  prod: "\\prod",
  int: "\\int",
  iint: "\\iint",
  oint: "\\oint"
};

const FUNCTION_LATEX: Record<string, string> = {
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  cot: "\\cot",
  sec: "\\sec",
  csc: "\\csc",
  log: "\\log",
  ln: "\\ln",
  exp: "\\exp",
  max: "\\max",
  min: "\\min",
  lim: "\\lim",
  det: "\\det"
};

function escapeLatex(value: string): string {
  return value.replace(/[{}_%#&$]/g, (char) => `\\${char}`);
}

function symbolToLatex(text: string, role?: string): string {
  if (!text) return "";
  if (GREEK_LATEX[text]) return GREEK_LATEX[text];
  if (OPERATOR_LATEX[text]) return OPERATOR_LATEX[text];
  if (NARY_LATEX[text]) return NARY_LATEX[text];
  if (FUNCTION_LATEX[text]) return FUNCTION_LATEX[text];
  if (role === "number") return text;
  if (text.length === 1) return escapeLatex(text);
  if (/^[A-Za-z]+$/.test(text)) return `\\operatorname{${escapeLatex(text)}}`;
  return escapeLatex(text);
}

function render(node: MathNode): string {
  switch (node.type) {
    case "row":
      return node.children.map(render).join("");
    case "symbol":
      return symbolToLatex(node.text, node.role);
    case "frac":
      return `\\frac{${render(node.numerator)}}{${render(node.denominator)}}`;
    case "sup":
      return `{${render(node.base)}}^{${render(node.sup)}}`;
    case "sub":
      return `{${render(node.base)}}_{${render(node.sub)}}`;
    case "subsup":
      return `{${render(node.base)}}_{${render(node.sub)}}^{${render(node.sup)}}`;
    case "rad":
      return node.degree
        ? `\\sqrt[${render(node.degree)}]{${render(node.body)}}`
        : `\\sqrt{${render(node.body)}}`;
    case "nary": {
      const operator = NARY_LATEX[node.operator];
      const lower = node.lower ? `_{${render(node.lower)}}` : "";
      const upper = node.upper ? `^{${render(node.upper)}}` : "";
      return `${operator}${lower}${upper}${node.body ? ` ${render(node.body)}` : ""}`;
    }
    case "group": {
      const body = render(node.body);
      if (!node.left && !node.right) return `{${body}}`;
      return `\\left${escapeLatex(node.left ?? "(")}${body}\\right${escapeLatex(node.right ?? ")")}`;
    }
    case "matrix": {
      const environment =
        node.kind === "cases"
          ? "cases"
          : node.left === "["
            ? "bmatrix"
            : node.left === "|"
              ? "vmatrix"
              : node.left === "("
                ? "pmatrix"
                : "matrix";
      const body = node.rows
        .map((row) => row.map((cell) => render(cell)).join(" & "))
        .join(" \\\\ ");
      return `\\begin{${environment}}${body}\\end{${environment}}`;
    }
    case "func": {
      const argument = render(node.argument);
      if (node.name === "abs") return `\\left|${argument}\\right|`;
      const name = FUNCTION_LATEX[node.name] ?? node.name;
      return `${name}\\left(${argument}\\right)`;
    }
    default:
      return "";
  }
}

export function toLatex(node: MathNode): string {
  return render(node);
}

