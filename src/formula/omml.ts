import type { MathNode } from "./types";

const NARY_CHAR: Record<string, string> = {
  sum: "∑",
  prod: "∏",
  int: "∫",
  iint: "∬",
  oint: "∮"
};

const FUNCTION_COMMANDS: Record<string, string> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  log: "log",
  ln: "ln",
  exp: "exp",
  max: "max",
  min: "min",
  lim: "lim",
  det: "det"
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function run(text: string, role?: string): string {
  if (!text) return "";
  const properties =
    role === "text"
      ? "<m:rPr><m:nor/></m:rPr>"
      : role === "operator" || /^[A-Za-z]{2,}$/.test(text)
        ? '<m:rPr><m:sty m:val="p"/></m:rPr>'
        : "";
  return `<m:r>${properties}<m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`;
}

function delimiter(left: string, right: string, body: string): string {
  return `<m:d><m:dPr><m:begChr m:val="${escapeXml(left)}"/><m:endChr m:val="${escapeXml(right)}"/></m:dPr><m:e>${body}</m:e></m:d>`;
}

function render(node: MathNode): string {
  switch (node.type) {
    case "row":
      return node.children.map(render).join("");
    case "symbol":
      if (node.text === "sum") return run("∑", "operator");
      if (node.text === "prod") return run("∏", "operator");
      if (node.text === "int") return run("∫", "operator");
      if (node.text === "iint") return run("∬", "operator");
      if (node.text === "oint") return run("∮", "operator");
      return run(node.text, node.role);
    case "frac":
      return `<m:f><m:num>${render(node.numerator)}</m:num><m:den>${render(node.denominator)}</m:den></m:f>`;
    case "binom":
      return delimiter(
        "(",
        ")",
        `<m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>${render(node.top)}</m:num><m:den>${render(node.bottom)}</m:den></m:f>`
      );
    case "accent": {
      if (node.accent === "bar" || node.accent === "overline" || node.accent === "underline") {
        const position = node.accent === "underline" ? "bot" : "top";
        return `<m:bar><m:barPr><m:pos m:val="${position}"/></m:barPr><m:e>${render(node.body)}</m:e></m:bar>`;
      }
      if (node.accent === "overbrace" || node.accent === "underbrace") {
        const position = node.accent === "underbrace" ? "bot" : "top";
        const chr = node.accent === "underbrace" ? "⏟" : "⏞";
        return `<m:groupChr><m:groupChrPr><m:chr m:val="${chr}"/><m:pos m:val="${position}"/></m:groupChrPr><m:e>${render(node.body)}</m:e></m:groupChr>`;
      }
      const chr: Record<string, string> = {
        vec: "→",
        hat: "^",
        tilde: "~",
        dot: "˙",
        ddot: "¨"
      };
      return `<m:acc><m:accPr><m:chr m:val="${chr[node.accent]}"/></m:accPr><m:e>${render(node.body)}</m:e></m:acc>`;
    }
    case "sup":
      return `<m:sSup><m:e>${render(node.base)}</m:e><m:sup>${render(node.sup)}</m:sup></m:sSup>`;
    case "sub":
      return `<m:sSub><m:e>${render(node.base)}</m:e><m:sub>${render(node.sub)}</m:sub></m:sSub>`;
    case "subsup":
      return `<m:sSubSup><m:e>${render(node.base)}</m:e><m:sub>${render(node.sub)}</m:sub><m:sup>${render(node.sup)}</m:sup></m:sSubSup>`;
    case "rad": {
      const hideDegree = node.degree ? "0" : "1";
      return `<m:rad><m:radPr><m:degHide m:val="${hideDegree}"/></m:radPr><m:deg>${node.degree ? render(node.degree) : ""}</m:deg><m:e>${render(node.body)}</m:e></m:rad>`;
    }
    case "nary": {
      const char = NARY_CHAR[node.operator];
      const location = node.operator === "sum" || node.operator === "prod" ? "undOvr" : "subSup";
      const subHide = node.lower ? "0" : "1";
      const supHide = node.upper ? "0" : "1";
      return `<m:nary><m:naryPr><m:chr m:val="${char}"/><m:limLoc m:val="${location}"/><m:subHide m:val="${subHide}"/><m:supHide m:val="${supHide}"/></m:naryPr><m:sub>${node.lower ? render(node.lower) : ""}</m:sub><m:sup>${node.upper ? render(node.upper) : ""}</m:sup><m:e>${node.body ? render(node.body) : ""}</m:e></m:nary>`;
    }
    case "group": {
      const body = render(node.body);
      if (!node.left && !node.right) return body;
      return delimiter(node.left ?? "(", node.right ?? ")", body);
    }
    case "matrix": {
      const rows = node.rows
        .map(
          (row) =>
            `<m:mr>${row.map((cell) => `<m:e>${render(cell)}</m:e>`).join("")}</m:mr>`
        )
        .join("");
      const matrix = `<m:m>${rows}</m:m>`;
      if (!node.left && !node.right) return matrix;
      return delimiter(node.left ?? "(", node.right ?? "", matrix);
    }
    case "align": {
      return `<m:eqArr>${node.rows
        .map((row) => `<m:e>${row.map(render).join(run("  "))}</m:e>`)
        .join("")}</m:eqArr>`;
    }
    case "func": {
      const name = FUNCTION_COMMANDS[node.name] ?? node.name;
      if (node.name === "abs") return delimiter("|", "|", render(node.argument));
      return `${run(name, "ident")}${delimiter("(", ")", render(node.argument))}`;
    }
    default:
      return "";
  }
}

export function toOmml(node: MathNode): string {
  return render(node);
}


