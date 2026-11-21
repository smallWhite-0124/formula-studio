export function collectFormulaOmml(document: unknown): string[] {
  const formulas: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const candidate = node as {
      type?: string;
      attrs?: { omml?: string };
      content?: unknown[];
    };
    if (candidate.type === "formula") {
      formulas.push(String(candidate.attrs?.omml ?? ""));
    }
    for (const child of candidate.content ?? []) visit(child);
  };
  visit(document);
  return formulas;
}
