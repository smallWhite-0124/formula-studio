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
  "÷": "\\div",
  "∂": "\\partial",
  "∇": "\\nabla",
  "∞": "\\infty",
  "±": "\\pm",
  "∓": "\\mp",
  "⋯": "\\cdots",
  "⋮": "\\vdots",
  "⋱": "\\ddots",
  "′": "'"
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

const ACCENT_LATEX: Record<string, string> = {
  vec: "vec",
  hat: "hat",
  bar: "bar",
  tilde: "tilde",
  dot: "dot",
  ddot: "ddot",
  overline: "overline",
  underline: "underline",
  overbrace: "overbrace",
  underbrace: "underbrace"
};

function escapeLatex(value: string): string {
  return value.replace(/[{}_%#&$]/g, (char) => `\\${char}`);
}

function symbolToLatex(text: string, role?: string): string {
  if (!text) return "";
  const command = GREEK_LATEX[text] ?? OPERATOR_LATEX[text] ?? NARY_LATEX[text] ?? FUNCTION_LATEX[text];
  if (command) return command.startsWith("\\") ? `${command} ` : command;
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
    case "binom":
      return `\\binom{${render(node.top)}}{${render(node.bottom)}}`;
    case "accent":
      return `\\${ACCENT_LATEX[node.accent]}{${render(node.body)}}`;
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
      const body = node.rows
        .map((row) => row.map((cell) => render(cell)).join(" & "))
        .join(" \\\\ ");

      if (node.kind === "matrix" && node.columnLines && node.columnLines.length > 0) {
        const columnCount = Math.max(...node.rows.map((row) => row.length), 1);
        const spec: string[] = [];
        for (let index = 0; index < columnCount; index += 1) {
          spec.push("c");
          if (node.columnLines.includes(index + 1) && index < columnCount - 1) spec.push("|");
        }
        const left = node.left === "[" ? "[" : node.left === "(" ? "(" : ".";
        const right = node.right === "]" ? "]" : node.right === ")" ? ")" : ".";
        return `\\left${left}\\begin{array}{${spec.join("")}}${body}\\end{array}\\right${right}`;
      }

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
      return `\\begin{${environment}}${body}\\end{${environment}}`;
    }
    case "align": {
      const rows = node.rows.map((row) => {
        if (row.length > 1) return row.map(render).join(" & ");
        let replaced = false;
        return render(row[0]).replace(/=/g, (match) => {
          if (replaced) return match;
          replaced = true;
          return "&=";
        });
      });
      return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
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
