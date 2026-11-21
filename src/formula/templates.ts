import { FormulaParseError, type FormulaTemplate } from "./types";

export const builtInTemplates: FormulaTemplate[] = [
  {
    id: "builtin-sigma",
    name: "sigma",
    label: "求和 sigma",
    description: "把 sigma(下限, 上限){正文} 展开成带上下限的求和。",
    params: ["下限", "上限", "正文"],
    expansion: "sum_(i=$1)^{$2}{$3}",
    example: "sigma(1,n){i^2}",
    builtin: true
  },
  {
    id: "builtin-sum-alias",
    name: "sum",
    label: "求和 sum",
    description: "sigma 的短别名；sum_(...) 这种原生上下标写法仍然可用。",
    params: ["下限", "上限", "正文"],
    expansion: "sum_(i=$1)^{$2}{$3}",
    example: "sum(1,n){i^2}",
    builtin: true
  },
  {
    id: "builtin-integral",
    name: "integral",
    label: "定积分 integral",
    description: "把 integral(下限, 上限){被积式} 展开成定积分。",
    params: ["下限", "上限", "被积式"],
    expansion: "int_{$1}^{$2}{$3}",
    example: "integral(0,1){f(x)dx}",
    builtin: true
  },
  {
    id: "builtin-int-alias",
    name: "int",
    label: "定积分 int",
    description: "integral 的短别名；int_0^1 这种原生写法仍然可用。",
    params: ["下限", "上限", "被积式"],
    expansion: "int_{$1}^{$2}{$3}",
    example: "int(0,1){f(x)dx}",
    builtin: true
  },
  {
    id: "builtin-limit",
    name: "limit",
    label: "极限 limit",
    description: "把 limit(变量, 目标){正文} 展开成极限。",
    params: ["变量", "目标", "正文"],
    expansion: "lim_{$1->$2}{$3}",
    example: "limit(x,0){sin(x)/x}",
    builtin: true
  },
  {
    id: "builtin-absval",
    name: "absval",
    label: "绝对值 absval",
    description: "把 absval(正文) 展开成绝对值。",
    params: ["正文"],
    expansion: "abs($1)",
    example: "absval(x-1)",
    builtin: true
  }
];

const FULLWIDTH_MAP: Record<string, string> = {
  "（": "(",
  "）": ")",
  "【": "{",
  "】": "}",
  "［": "[",
  "］": "]",
  "，": ",",
  "；": ";",
  "＋": "+",
  "－": "-",
  "＊": "*",
  "／": "/",
  "＝": "=",
  "＾": "^",
  "＿": "_",
  "｛": "{",
  "｝": "}"
};

export function normalizeFormulaInput(value: string): string {
  return Array.from(value)
    .map((char) => FULLWIDTH_MAP[char] ?? char)
    .join("");
}

function isIdentifierChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function findMatching(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new FormulaParseError(`括号没有闭合：缺少 ${close}`, start);
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (pairs[char]) stack.push(pairs[char]);
    else if (stack.at(-1) === char) stack.pop();
    else if (char === "," && stack.length === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts;
}

function substitute(expansion: string, values: string[]): string {
  return expansion.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    if (!values[index]) {
      throw new FormulaParseError(`模板缺少第 ${index + 1} 个参数`);
    }
    return `{${values[index]}}`;
  });
}

export interface ExpandedFormula {
  input: string;
  usedTemplates: string[];
}

export function expandTemplates(
  source: string,
  templates: FormulaTemplate[],
  usedTemplates = new Set<string>(),
  depth = 0
): ExpandedFormula {
  if (depth > 4) {
    throw new FormulaParseError("模板展开层级过深，请检查是否存在循环引用");
  }

  let value = normalizeFormulaInput(source);
  const sorted = [...templates].sort((a, b) => b.name.length - a.name.length);
  let output = "";
  let index = 0;

  while (index < value.length) {
    const template = sorted.find((candidate) => {
      if (!value.startsWith(candidate.name, index)) return false;
      const before = value[index - 1];
      const after = value[index + candidate.name.length];
      return !isIdentifierChar(before) && !isIdentifierChar(after);
    });

    if (!template) {
      output += value[index];
      index += 1;
      continue;
    }

    const nameEnd = index + template.name.length;
    let cursor = nameEnd;
    while (/\s/.test(value[cursor] ?? "")) cursor += 1;

    if (template.params.length === 0 && value[cursor] !== "(") {
      output += substitute(template.expansion, []);
      usedTemplates.add(template.label);
      index = nameEnd;
      continue;
    }

    if (value[cursor] !== "(") {
      output += value[index];
      index += 1;
      continue;
    }

    const closeParen = findMatching(value, cursor, "(", ")");
    const args = splitTopLevel(value.slice(cursor + 1, closeParen));
    cursor = closeParen + 1;
    while (/\s/.test(value[cursor] ?? "")) cursor += 1;

    let body: string | undefined;
    if (value[cursor] === "{") {
      const closeBrace = findMatching(value, cursor, "{", "}");
      body = value.slice(cursor + 1, closeBrace);
      cursor = closeBrace + 1;
    }

    const supplied = body === undefined ? args : [...args, body];
    if (supplied.length !== template.params.length) {
      throw new FormulaParseError(
        `模板 ${template.name} 需要 ${template.params.length} 个参数，实际得到 ${supplied.length} 个`
      );
    }

    output += substitute(template.expansion, supplied);
    usedTemplates.add(template.label);
    index = cursor;
  }

  if (output === value) {
    return { input: value, usedTemplates: [...usedTemplates] };
  }

  return expandTemplates(output, templates, usedTemplates, depth + 1);
}

