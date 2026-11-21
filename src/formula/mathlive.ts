const MATRIX_ENVIRONMENTS: Record<string, string> = {
  matrix: "matrix",
  pmatrix: "matrix",
  bmatrix: "bmatrix",
  vmatrix: "vmatrix",
  cases: "cases",
  aligned: "align"
};

function convertMatrixBody(environment: string, body: string): string {
  const name = MATRIX_ENVIRONMENTS[environment] ?? "matrix";
  const rows = body
    .trim()
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const cells = row.split("&").map((cell) => cell.trim());
      return name === "align" ? cells.join("") : cells.join(",");
    });
  return `${name}(${rows.join(";")})`;
}

/**
 * MathLive exposes ASCIIMath, which is useful for simple formulas but represents
 * matrices and cases with a different grammar. This adapter keeps MathLive's
 * visual edits inside the editor's linear syntax and, critically, inside the
 * AST/OMML export path.
 */
export function mathLiveLatexToLinear(latex: string): string {
  let value = latex.trim();

  value = value.replace(
    /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|cases|aligned)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, environment: string, body: string) => convertMatrixBody(environment, body)
  );

  value = value.replace(/\\left/g, "").replace(/\\right/g, "");
  value = value.replace(/\\operatorname\{([A-Za-z]+)\}/g, "$1");
  value = value.replace(/\\mathrm\{([^{}]*)\}/g, "$1");
  value = value.replace(/\\text\{([^{}]*)\}/g, "$1");
  value = value.replace(/\\cdot/g, "·");
  value = value.replace(/\\times/g, "*");
  value = value.replace(/\\div/g, "/");
  value = value.replace(/\\leq/g, "<=");
  value = value.replace(/\\le/g, "<=");
  value = value.replace(/\\geq/g, ">=");
  value = value.replace(/\\ge/g, ">=");
  value = value.replace(/\\neq/g, "!=");
  value = value.replace(/\\ne/g, "!=");
  value = value.replace(/\\to/g, "->");
  value = value.replace(/\\,/g, " ").replace(/\\;/g, " ");
  value = value.replace(/\\ /g, " ");

  return value.trim();
}


