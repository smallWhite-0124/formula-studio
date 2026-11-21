import { expandTemplates, normalizeFormulaInput } from "./templates";
import { toLatex } from "./latex";
import {
  FormulaParseError,
  row,
  type FormulaTemplate,
  type MathNode,
  type ParsedFormula
} from "./types";

type TokenKind = "number" | "ident" | "op" | "punct" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  position: number;
}

const GREEK: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω"
};

const SPECIAL_SYMBOLS: Record<string, string> = {
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  infinity: "∞",
  cdots: "⋯",
  vdots: "⋮",
  ddots: "⋱",
  times: "×",
  cdot: "·",
  pm: "±",
  mp: "∓"
};

const ACCENT_NAMES = new Set([
  "vec",
  "hat",
  "bar",
  "tilde",
  "dot",
  "ddot",
  "overline",
  "underline",
  "overbrace",
  "underbrace"
]);

const NARY_NAMES = new Set(["sum", "prod", "int", "iint", "oint"]);
const ADD_OPERATORS = new Set(["+", "-", "=", "<", ">", "->", "<=", ">=", "!="]);
const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "max", "min", "lim", "abs", "det"]);

const ALIGN_NAMES = new Set(["align", "aligned", "eqarr"]);

const MATRIX_NAMES: Record<string, { kind: "matrix" | "cases"; left: string; right: string }> = {
  matrix: { kind: "matrix", left: "(", right: ")" },
  pmatrix: { kind: "matrix", left: "(", right: ")" },
  bmatrix: { kind: "matrix", left: "[", right: "]" },
  vmatrix: { kind: "matrix", left: "|", right: "|" },
  mat: { kind: "matrix", left: "(", right: ")" },
  augmatrix: { kind: "matrix", left: "[", right: "]" },
  cases: { kind: "cases", left: "{", right: "" }
};

const OPERATOR_DISPLAY: Record<string, string> = {
  "*": "·",
  "->": "→",
  "<=": "≤",
  ">=": "≥",
  "!=": "≠"
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "\\") {
      const match = source.slice(index + 1).match(/^[A-Za-z]+/);
      if (!match) throw new FormulaParseError("反斜杠后需要命令名", index);
      tokens.push({ kind: "ident", value: match[0], position: index });
      index += match[0].length + 1;
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
      const match = source.slice(index).match(/^\d+(?:\.\d+)?|^\.\d+/);
      if (!match) throw new FormulaParseError("数字格式不正确", index);
      tokens.push({ kind: "number", value: match[0], position: index });
      index += match[0].length;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      const match = source.slice(index).match(/^[A-Za-z]+/);
      if (!match) throw new FormulaParseError("无法识别标识符", index);
      tokens.push({ kind: "ident", value: match[0], position: index });
      index += match[0].length;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (["->", "<=", ">=", "!=", ":="].includes(two)) {
      tokens.push({ kind: "op", value: two, position: index });
      index += 2;
      continue;
    }

    if ("+-*/^_=<>".includes(char)) {
      tokens.push({ kind: "op", value: char, position: index });
      index += 1;
      continue;
    }

    if ("()[]{};,|".includes(char)) {
      tokens.push({ kind: "punct", value: char, position: index });
      index += 1;
      continue;
    }

    if ("∑∏∫∬∮".includes(char)) {
      tokens.push({ kind: "ident", value: char, position: index });
      index += 1;
      continue;
    }

    if (/[\p{L}]/u.test(char)) {
      tokens.push({ kind: "ident", value: char, position: index });
      index += 1;
      continue;
    }

    tokens.push({ kind: "op", value: char, position: index });
    index += 1;
  }

  tokens.push({ kind: "eof", value: "", position: source.length });
  return tokens;
}

function normalizeNaryName(name: string): "sum" | "prod" | "int" | "iint" | "oint" | null {
  if (name === "∑" || name === "Sigma") return "sum";
  if (name === "∏") return "prod";
  if (name === "∫") return "int";
  if (name === "∬") return "iint";
  if (name === "∮") return "oint";
  if (NARY_NAMES.has(name)) return name as "sum" | "prod" | "int" | "iint" | "oint";
  return null;
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): MathNode {
    const expression = this.parseAdd();
    if (this.peek().kind !== "eof") {
      throw new FormulaParseError(`无法识别的符号“${this.peek().value}”`, this.peek().position);
    }
    return expression;
  }

  private parseAdd(): MathNode {
    const children: MathNode[] = [this.parseTerm()];

    while (this.peek().kind === "op" && ADD_OPERATORS.has(this.peek().value)) {
      const operator = this.consume().value;
      children.push(this.symbol(OPERATOR_DISPLAY[operator] ?? operator, "operator"));
      children.push(this.parseTerm());
    }

    return row(children);
  }

  private parseTerm(): MathNode {
    let node = this.parseUnary();

    while (true) {
      if (this.checkOp("*")) {
        this.consume();
        node = row([node, this.symbol("·", "operator"), this.parseUnary()]);
        continue;
      }

      if (this.checkOp("/")) {
        this.consume();
        const firstDenominator = this.parseUnary();
        if (firstDenominator.type === "symbol" && firstDenominator.text === "∂") {
          const factors: MathNode[] = [firstDenominator];
          while (this.startsPrimary(this.peek())) factors.push(this.parseUnary());
          node = { type: "frac", numerator: node, denominator: row(factors) };
        } else {
          node = { type: "frac", numerator: node, denominator: firstDenominator };
        }
        continue;
      }

      if (this.startsPrimary(this.peek())) {
        node = row([node, this.parseUnary()]);
        continue;
      }

      break;
    }

    return node;
  }

  private parseUnary(): MathNode {
    if (this.checkOp("+")) {
      this.consume();
      return this.parseUnary();
    }

    if (this.checkOp("-")) {
      this.consume();
      return row([this.symbol("−", "operator"), this.parseUnary()]);
    }

    return this.parsePower();
  }

  private parsePower(): MathNode {
    let base = this.parsePrimary();
    let sub: MathNode | undefined;
    let sup: MathNode | undefined;
    let primeCount = 0;

    while (this.checkOp("'")) {
      this.consume();
      primeCount += 1;
    }

    while (this.checkOp("_") || this.checkOp("^")) {
      const operator = this.consume().value;
      const operand = this.parseScriptOperand();
      if (operator === "_") sub = operand;
      else sup = operand;
    }

    if (primeCount > 0) {
      const primes = this.symbol("′".repeat(primeCount), "operator");
      sup = sup ? row([sup, primes]) : primes;
    }

    const naryName = base.type === "symbol" ? normalizeNaryName(base.text) : null;
    if (naryName) {
      if (!sub && sup) base = { type: "sup", base, sup };
      else if (sub && !sup) base = { type: "sub", base, sub };
      else if (sub && sup) base = { type: "subsup", base, sub, sup };
      else return base;

      return { type: "nary", operator: naryName, lower: sub, upper: sup };
    }

    if (sub && sup) return { type: "subsup", base, sub, sup };
    if (sub) return { type: "sub", base, sub };
    if (sup) return { type: "sup", base, sup };
    return base;
  }

  private parsePrimary(): MathNode {
    const token = this.peek();

    if (token.kind === "number") {
      this.consume();
      return this.symbol(token.value, "number");
    }

    if (token.kind === "ident") {
      this.consume();
      const rawName = token.value;
      const naryName = normalizeNaryName(rawName);

      if (rawName === "sqrt" && this.isGroupStart(this.peek())) {
        return { type: "rad", body: this.parseDelimited().body };
      }

      if (rawName === "root" && this.checkPunct("(")) {
        this.consume();
        const degree = this.parseAdd();
        this.expectPunct(",");
        const body = this.parseAdd();
        this.expectPunct(")");
        return { type: "rad", degree, body };
      }

      if (rawName === "frac" && this.isGroupStart(this.peek())) {
        if (this.checkPunct("(")) {
          this.consume();
          const numerator = this.parseAdd();
          this.expectPunct(",");
          const denominator = this.parseAdd();
          this.expectPunct(")");
          return { type: "frac", numerator, denominator };
        }
        const numerator = this.parseDelimited().body;
        if (!this.isGroupStart(this.peek())) {
          throw new FormulaParseError("frac 需要两个用括号包起来的部分", this.peek().position);
        }
        const denominator = this.parseDelimited().body;
        return { type: "frac", numerator, denominator };
      }

      if (naryName) {
        return this.symbol(naryName, "ident");
      }

      if (ACCENT_NAMES.has(rawName) && this.isGroupStart(this.peek())) {
        return {
          type: "accent",
          accent: rawName as "vec" | "hat" | "bar" | "tilde" | "dot" | "ddot" | "overline" | "underline" | "overbrace" | "underbrace",
          body: this.parseDelimited().body
        };
      }

      if (rawName === "binom" && this.isGroupStart(this.peek())) {
        if (this.checkPunct("(")) {
          this.consume();
          const top = this.parseAdd();
          this.expectPunct(",");
          const bottom = this.parseAdd();
          this.expectPunct(")");
          return { type: "binom", top, bottom };
        }
        const top = this.parseDelimited().body;
        if (!this.isGroupStart(this.peek())) {
          throw new FormulaParseError("binom 需要上下两个用括号包起来的部分", this.peek().position);
        }
        const bottom = this.parseDelimited().body;
        return { type: "binom", top, bottom };
      }

      if (SPECIAL_SYMBOLS[rawName]) {
        return this.symbol(SPECIAL_SYMBOLS[rawName], "ident");
      }

      const matrixDefinition = MATRIX_NAMES[rawName];
      if (matrixDefinition && this.checkPunct("(")) {
        return this.parseMatrix(matrixDefinition);
      }

      if (ALIGN_NAMES.has(rawName) && this.checkPunct("(")) {
        return this.parseAlign();
      }

      if (GREEK[rawName]) {
        return this.symbol(GREEK[rawName], "ident");
      }

      if (this.checkPunct("(")) {
        const group = this.parseDelimited();
        return { type: "func", name: rawName, argument: group.body };
      }

      if (FUNCTIONS.has(rawName)) {
        return this.symbol(rawName, "ident");
      }

      return this.symbol(rawName, "ident");
    }

    if (this.isGroupStart(token)) {
      return this.parseDelimited();
    }

    if (token.kind === "punct" && token.value === "|") {
      this.consume();
      return this.symbol("|", "operator");
    }

    throw new FormulaParseError(`这里需要一个数字、变量或括号，但得到了“${token.value}”`, token.position);
  }

  private parseMatrix(definition: { kind: "matrix" | "cases"; left: string; right: string }): MathNode {
    this.expectPunct("(");
    const rows: MathNode[][] = [];
    const columnLines = new Set<number>();
    let currentRow: MathNode[] = [];

    if (this.checkPunct(")")) {
      throw new FormulaParseError("矩阵或分段函数不能为空", this.peek().position);
    }

    while (true) {
      currentRow.push(this.parseAdd());

      if (this.checkPunct("|")) {
        this.consume();
        columnLines.add(currentRow.length);
        continue;
      }

      if (this.checkPunct(",")) {
        this.consume();
        continue;
      }

      if (this.checkPunct(";")) {
        this.consume();
        rows.push(currentRow);
        currentRow = [];
        continue;
      }

      if (this.checkPunct(")")) {
        this.consume();
        rows.push(currentRow);
        break;
      }

      throw new FormulaParseError("矩阵单元格之间请使用逗号，行之间使用分号，竖线表示分隔列", this.peek().position);
    }

    return {
      type: "matrix",
      rows,
      kind: definition.kind,
      left: definition.left,
      right: definition.right,
      columnLines: [...columnLines].sort((a, b) => a - b)
    };
  }

  private parseAlign(): MathNode {
    this.expectPunct("(");
    const rows: MathNode[][] = [];
    let currentRow: MathNode[] = [];
    if (this.checkPunct(")")) {
      throw new FormulaParseError("多行对齐公式不能为空", this.peek().position);
    }

    while (true) {
      if (this.checkOp("=")) {
        this.consume();
        currentRow.push(row([this.symbol("=", "operator"), this.parseAdd()]));
      } else {
        currentRow.push(this.parseAdd());
      }

      if (this.checkOp("&")) {
        this.consume();
        continue;
      }

      if (this.checkPunct(";")) {
        this.consume();
        rows.push(currentRow);
        currentRow = [];
        continue;
      }

      if (this.checkPunct(")")) {
        this.consume();
        rows.push(currentRow);
        break;
      }

      throw new FormulaParseError("多行对齐公式请使用 & 分隔对齐列，使用分号分隔行", this.peek().position);
    }

    return { type: "align", rows };
  }

  private parseScriptOperand(): MathNode {
    if (this.checkOp("-") || this.checkOp("+")) return this.parseUnary();
    const token = this.peek();
    if (token.kind === "number" || token.kind === "ident" || this.isGroupStart(token)) {
      return this.parsePrimary();
    }
    throw new FormulaParseError("上下标后面需要数字、变量或括号", token.position);
  }

  private parseDelimited(): { type: "group"; body: MathNode; left: string; right: string } {
    const opening = this.consume();
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const close = pairs[opening.value];
    if (!close) throw new FormulaParseError(`无法匹配符号“${opening.value}”`, opening.position);

    const body = this.parseAdd();
    if (this.peek().kind === "eof") {
      throw new FormulaParseError(`括号没有闭合：缺少 ${close}`, opening.position);
    }
    this.expectPunct(close);
    return {
      type: "group",
      body,
      left: opening.value === "{" ? "" : opening.value,
      right: close === "}" ? "" : close
    };
  }

  private startsPrimary(token: Token): boolean {
    if (token.kind === "number" || token.kind === "ident") return true;
    return token.kind === "punct" && ["(", "[", "{"].includes(token.value);
  }

  private isGroupStart(token: Token): boolean {
    return token.kind === "punct" && ["(", "[", "{"].includes(token.value);
  }

  private symbol(text: string, role: "number" | "ident" | "operator" | "text" = "ident"): MathNode {
    return { type: "symbol", text, role };
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private consume(): Token {
    return this.tokens[this.index++];
  }

  private checkOp(value: string): boolean {
    return this.peek().kind === "op" && this.peek().value === value;
  }

  private checkPunct(value: string): boolean {
    return this.peek().kind === "punct" && this.peek().value === value;
  }

  private expectPunct(value: string): Token {
    if (!this.checkPunct(value)) {
      throw new FormulaParseError(`这里需要“${value}”`, this.peek().position);
    }
    return this.consume();
  }
}

export function attachNaryBodies(node: MathNode): MathNode {
  if (node.type === "row") {
    const children = node.children.map(attachNaryBodies);
    const result: MathNode[] = [];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type === "nary" && !child.body) {
        const rest = children.slice(index + 1);
        result.push({ ...child, body: row(rest.length > 0 ? rest : []) });
        break;
      }
      result.push(child);
    }

    return row(result);
  }

  if (node.type === "group") {
    return { ...node, body: attachNaryBodies(node.body) };
  }

  if (node.type === "frac") {
    return { ...node, numerator: attachNaryBodies(node.numerator), denominator: attachNaryBodies(node.denominator) };
  }

  if (node.type === "binom") {
    return { ...node, top: attachNaryBodies(node.top), bottom: attachNaryBodies(node.bottom) };
  }

  if (node.type === "accent") {
    return { ...node, body: attachNaryBodies(node.body) };
  }

  if (node.type === "sup") return { ...node, base: attachNaryBodies(node.base), sup: attachNaryBodies(node.sup) };
  if (node.type === "sub") return { ...node, base: attachNaryBodies(node.base), sub: attachNaryBodies(node.sub) };
  if (node.type === "subsup") {
    return {
      ...node,
      base: attachNaryBodies(node.base),
      sub: attachNaryBodies(node.sub),
      sup: attachNaryBodies(node.sup)
    };
  }

  if (node.type === "rad") {
    return {
      ...node,
      body: attachNaryBodies(node.body),
      degree: node.degree ? attachNaryBodies(node.degree) : undefined
    };
  }

  if (node.type === "matrix") {
    return {
      ...node,
      rows: node.rows.map((row) => row.map(attachNaryBodies))
    };
  }

  if (node.type === "align") {
    return { ...node, rows: node.rows.map((row) => row.map(attachNaryBodies)) };
  }

  if (node.type === "func") return { ...node, argument: attachNaryBodies(node.argument) };
  return node;
}

export function parseFormula(source: string, templates: FormulaTemplate[] = []): ParsedFormula {
  const trimmed = normalizeFormulaInput(source).trim();
  if (!trimmed) throw new FormulaParseError("公式内容为空");

  const expanded = expandTemplates(trimmed, templates);
  const tokens = tokenize(expanded.input);
  const ast = attachNaryBodies(new FormulaParser(tokens).parse());

  return {
    source: trimmed,
    ast,
    latex: toLatex(ast),
    usedTemplates: expanded.usedTemplates
  };
}





