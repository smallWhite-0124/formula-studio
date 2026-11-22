import type { Node as PMNode } from "@tiptap/pm/model";

export interface EquationInfo {
  label: string;
  number: number;
  position: number;
  source: string;
}

export function collectEquationLabels(doc: PMNode): EquationInfo[] {
  const equations: EquationInfo[] = [];
  let number = 0;

  doc.descendants((node, position) => {
    if (node.type.name === "formula" && node.attrs.numbering && node.attrs.displayMode) {
      number += 1;
      equations.push({
        label: String(node.attrs.label ?? `eq${number}`),
        number,
        position,
        source: String(node.attrs.source ?? "")
      });
    }
  });

  return equations;
}

export function resolveEquationNumber(doc: PMNode, label: string): number | null {
  return collectEquationLabels(doc).find((equation) => equation.label === label)?.number ?? null;
}

export function equationNumberAtPosition(doc: PMNode, position: number): number | null {
  return collectEquationLabels(doc).find((equation) => equation.position === position)?.number ?? null;
}

export function nextEquationLabel(doc: PMNode): string {
  return `eq${collectEquationLabels(doc).length + 1}`;
}
