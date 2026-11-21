function escapeLatexText(value: string): string {
  return value
    .replace(/\\/g, "\\backslash ")
    .replace(/([{}_%#&$])/g, "\\$1");
}

function childrenOf(element: Element): Element[] {
  return Array.from(element.children);
}

function firstChild(element: Element, name: string): Element | undefined {
  return childrenOf(element).find((child) => child.localName === name);
}

function childrenNamed(element: Element, name: string): Element[] {
  return childrenOf(element).filter((child) => child.localName === name);
}

function attr(element: Element | undefined, name: string): string | undefined {
  if (!element) return undefined;
  for (const attributeName of element.getAttributeNames()) {
    if (attributeName === name || attributeName.endsWith(`:${name}`)) {
      return element.getAttribute(attributeName) ?? undefined;
    }
  }
  return undefined;
}

function renderContainer(element: Element): string {
  return childrenOf(element)
    .filter((child) => !child.localName.endsWith("Pr"))
    .map(renderOmmlElement)
    .join("");
}

function renderMatrix(element: Element): string {
  const rows = childrenNamed(element, "mr").map((row) => {
    const cells = childrenNamed(row, "e").map((cell) => renderContainer(cell));
    return cells.join(" & ");
  });
  return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
}

function delimiterToLatex(value: string | undefined, fallback: string): string {
  const delimiter = value ?? fallback;
  if (!delimiter) return ".";
  if (delimiter === "{") return "\\{";
  if (delimiter === "}") return "\\}";
  return delimiter;
}

function renderDelimiter(element: Element): string {
  const properties = firstChild(element, "dPr");
  const begin = attr(firstChild(properties ?? element, "begChr"), "val") ?? "(";
  const end = attr(firstChild(properties ?? element, "endChr"), "val") ?? ")";
  const content = childrenNamed(element, "e").map(renderContainer).join("");
  return `\\left${delimiterToLatex(begin, "(")}${content}\\right${delimiterToLatex(end, ")")}`;
}

function renderNary(element: Element): string {
  const properties = firstChild(element, "naryPr");
  const char = attr(firstChild(properties ?? element, "chr"), "val") ?? "∑";
  const commands: Record<string, string> = {
    "∑": "\\sum",
    "∏": "\\prod",
    "∫": "\\int",
    "∬": "\\iint",
    "∮": "\\oint",
    "⋃": "\\bigcup",
    "⋂": "\\bigcap"
  };
  const command = commands[char] ?? `\\operatorname{${escapeLatexText(char)}}`;
  const lower = firstChild(element, "sub");
  const upper = firstChild(element, "sup");
  const body = firstChild(element, "e");
  return `${command}${lower ? `_{${renderContainer(lower)}}` : ""}${upper ? `^{${renderContainer(upper)}}` : ""}${body ? ` ${renderContainer(body)}` : ""}`;
}

function renderOmmlElement(element: Element): string {
  switch (element.localName) {
    case "oMath":
    case "oMathPara":
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "lim":
    case "fName":
    case "deg":
      return renderContainer(element);
    case "r": {
      const text = childrenNamed(element, "t").map((node) => node.textContent ?? "").join("");
      return /[\s\u3400-\u9FFF]/.test(text) ? `\\text{${text.replace(/[{}]/g, "")}}` : escapeLatexText(text);
    }
    case "f":
      return `\\frac{${firstChild(element, "num") ? renderContainer(firstChild(element, "num")!) : ""}}{${firstChild(element, "den") ? renderContainer(firstChild(element, "den")!) : ""}}`;
    case "sSup": {
      const base = firstChild(element, "e");
      const sup = firstChild(element, "sup");
      return `{${base ? renderContainer(base) : ""}}^{${sup ? renderContainer(sup) : ""}}`;
    }
    case "sSub": {
      const base = firstChild(element, "e");
      const sub = firstChild(element, "sub");
      return `{${base ? renderContainer(base) : ""}}_{${sub ? renderContainer(sub) : ""}}`;
    }
    case "sSubSup": {
      const base = firstChild(element, "e");
      const sub = firstChild(element, "sub");
      const sup = firstChild(element, "sup");
      return `{${base ? renderContainer(base) : ""}}_{${sub ? renderContainer(sub) : ""}}^{${sup ? renderContainer(sup) : ""}}`;
    }
    case "rad": {
      const body = firstChild(element, "e");
      const degree = firstChild(element, "deg");
      const degreeHidden = attr(firstChild(firstChild(element, "radPr") ?? element, "degHide"), "val") === "1";
      return degree && !degreeHidden
        ? `\\sqrt[${renderContainer(degree)}]{${body ? renderContainer(body) : ""}}`
        : `\\sqrt{${body ? renderContainer(body) : ""}}`;
    }
    case "nary":
      return renderNary(element);
    case "d":
      return renderDelimiter(element);
    case "m":
      return renderMatrix(element);
    case "func": {
      const name = firstChild(element, "fName");
      const body = firstChild(element, "e");
      return `${name ? renderContainer(name) : ""}\\left(${body ? renderContainer(body) : ""}\\right)`;
    }
    case "bar": {
      const body = firstChild(element, "e");
      return `\\overline{${body ? renderContainer(body) : ""}}`;
    }
    case "acc": {
      const properties = firstChild(element, "accPr");
      const char = attr(firstChild(properties ?? element, "chr"), "val") ?? "^";
      const body = firstChild(element, "e");
      const command = char === "¯" ? "bar" : char === "→" ? "vec" : char === "ˆ" ? "hat" : "hat";
      return `\\${command}{${body ? renderContainer(body) : ""}}`;
    }
    case "limLow": {
      const body = firstChild(element, "e");
      const lim = firstChild(element, "lim");
      return `{${body ? renderContainer(body) : ""}}_{${lim ? renderContainer(lim) : ""}}`;
    }
    case "limUpp": {
      const body = firstChild(element, "e");
      const lim = firstChild(element, "lim");
      return `{${body ? renderContainer(body) : ""}}^{${lim ? renderContainer(lim) : ""}}`;
    }
    case "eqArr": {
      const rows = childrenNamed(element, "e").map(renderContainer);
      return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
    }
    case "box":
    case "borderBox":
    case "phant":
    case "groupChr":
      return firstChild(element, "e") ? renderContainer(firstChild(element, "e")!) : renderContainer(element);
    case "t":
      return escapeLatexText(element.textContent ?? "");
    default:
      if (element.children.length > 0) return renderContainer(element);
      return "";
  }
}

export function ommlToLatex(omml: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${omml}</root>`,
    "application/xml"
  );
  if (document.getElementsByTagName("parsererror").length > 0) return "";
  const root = document.documentElement;
  return renderContainer(root).trim();
}

