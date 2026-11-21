export type SymbolRole = "number" | "ident" | "operator" | "text";

export type MathNode =
  | { type: "row"; children: MathNode[] }
  | { type: "symbol"; text: string; role?: SymbolRole }
  | { type: "frac"; numerator: MathNode; denominator: MathNode }
  | { type: "binom"; top: MathNode; bottom: MathNode }
  | {
      type: "accent";
      accent: "vec" | "hat" | "bar" | "tilde" | "dot" | "ddot" | "overline" | "underline" | "overbrace" | "underbrace";
      body: MathNode;
    }
  | { type: "sup"; base: MathNode; sup: MathNode }
  | { type: "sub"; base: MathNode; sub: MathNode }
  | { type: "subsup"; base: MathNode; sub: MathNode; sup: MathNode }
  | { type: "rad"; body: MathNode; degree?: MathNode }
  | {
      type: "nary";
      operator: "sum" | "prod" | "int" | "iint" | "oint";
      lower?: MathNode;
      upper?: MathNode;
      body?: MathNode;
    }
  | { type: "group"; body: MathNode; left?: string; right?: string }
  | {
      type: "matrix";
      rows: MathNode[][];
      kind: "matrix" | "cases";
      left?: string;
      right?: string;
      columnLines?: number[];
    }
  | { type: "align"; rows: MathNode[][] }
  | { type: "func"; name: string; argument: MathNode };

export interface FormulaTemplate {
  id: string;
  name: string;
  label: string;
  description: string;
  params: string[];
  expansion: string;
  example: string;
  builtin?: boolean;
}

export interface ParsedFormula {
  source: string;
  ast: MathNode;
  latex: string;
  usedTemplates: string[];
}

export class FormulaParseError extends Error {
  readonly position?: number;

  constructor(message: string, position?: number) {
    super(message);
    this.name = "FormulaParseError";
    this.position = position;
  }
}

export function row(children: MathNode[]): MathNode {
  const flattened: MathNode[] = [];
  for (const child of children) {
    if (child.type === "row") {
      flattened.push(...child.children);
    } else {
      flattened.push(child);
    }
  }

  if (flattened.length === 0) {
    return { type: "symbol", text: "", role: "text" };
  }

  return flattened.length === 1 ? flattened[0] : { type: "row", children: flattened };
}


