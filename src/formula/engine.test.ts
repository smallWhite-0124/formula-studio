import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocxBlob } from "../export/docx";
import { parseFormula } from "./parser";
import { builtInTemplates } from "./templates";
import { toOmml } from "./omml";
import { mathLiveLatexToLinear } from './mathlive';

describe("linear formula parser", () => {
  it("parses fractions, powers and radicals", () => {
    const parsed = parseFormula("a/b + sqrt(x^2+1)");
    expect(parsed.latex).toContain("\\frac{a}{b}");
    expect(parsed.latex).toContain("\\sqrt");
    expect(parsed.latex).toContain("^{2}");
  });

  it("expands the built-in sigma template", () => {
    const parsed = parseFormula("sigma(1,n){i^2}", builtInTemplates);
    expect(parsed.usedTemplates).toContain("求和 sigma");
    expect(parsed.latex).toContain("\\sum");
    expect(parsed.latex).toContain("_{");
    expect(parsed.latex).toContain("^{");
  });

  it("accepts full-width Chinese punctuation around templates", () => {
    const parsed = parseFormula("sigma（1,n）【i^2】", builtInTemplates);
    expect(parsed.latex).toContain("\\sum");
  });

  it("supports sum/int aliases and LaTeX-style frac", () => {
    const sum = parseFormula("sum(1,n){i^2}", builtInTemplates);
    const integral = parseFormula("int(0,1){f(x)dx}", builtInTemplates);
    const frac = parseFormula("\\frac{a}{b}");
    expect(sum.latex).toContain("\\sum");
    expect(integral.latex).toContain("\\int");
    expect(frac.latex).toContain("\\frac{a}{b}");
  });

  it("parses integral and limit templates", () => {
    const integral = parseFormula("integral(0,1){f(x)dx}", builtInTemplates);
    const limit = parseFormula("limit(x,0){sin(x)/x}", builtInTemplates);
    expect(integral.latex).toContain("\\int");
    expect(limit.latex).toContain("\\lim");
  });

  it("parses multiline aligned equations", () => {
    const aligned = parseFormula("align(x=1;y=2)");
    const converted = mathLiveLatexToLinear("\\begin{aligned}x&=1 \\\\ y&=2\\end{aligned}");
    expect(aligned.latex).toContain("\\begin{aligned}");
    expect(aligned.latex).toContain("&=");
    expect(converted).toBe("align(x=1;y=2)");
    expect(toOmml(aligned.ast)).toContain("<m:eqArr>");
  });

  it("converts MathLive LaTeX matrices back to linear syntax", () => {
    const matrix = mathLiveLatexToLinear("\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}");
    const cases = mathLiveLatexToLinear("\\begin{cases}{x}^{2} & x\\ge0 \\\\ -x & x<0\\end{cases}");
    expect(matrix).toBe("matrix(a,b;c,d)");
    expect(cases).toBe("cases({x}^{2},x>=0;-x,x<0)");
    expect(() => parseFormula(matrix)).not.toThrow();
    expect(() => parseFormula(cases)).not.toThrow();
  });

  it("parses matrix and cases structures", () => {
    const matrix = parseFormula("matrix(a,b;c,d)");
    const brackets = parseFormula("bmatrix(1,0;0,1)");
    const cases = parseFormula("cases(x^2,x>=0;-x,x<0)");
    expect(matrix.latex).toContain("\\begin{pmatrix}");
    expect(matrix.latex).toContain("&");
    expect(matrix.latex).toContain("\\\\");
    expect(brackets.latex).toContain("\\begin{bmatrix}");
    expect(cases.latex).toContain("\\begin{cases}");
  });

  it("reports a friendly error for an unclosed group", () => {
    expect(() => parseFormula("sqrt(x+1")).toThrow(/括号没有闭合/);
  });
});

describe("OMML and DOCX", () => {
  it("generates semantic OMML for a fraction and n-ary", () => {
    const parsed = parseFormula("sigma(1,n){a/b}", builtInTemplates);
    const omml = toOmml(parsed.ast);
    expect(omml).toContain("<m:nary>");
    expect(omml).toContain("<m:f>");
    expect(omml).toContain("<m:chr m:val=\"∑\"/>");
  });

  it("generates OMML matrix rows for matrices and cases", () => {
    const matrix = parseFormula("matrix(a,b;c,d)");
    const cases = parseFormula("cases(x^2,x>=0;-x,x<0)");
    expect(toOmml(matrix.ast)).toContain("<m:m>");
    expect(toOmml(matrix.ast)).toContain("<m:mr>");
    expect(toOmml(cases.ast)).toContain('<m:begChr m:val="{"/>');
  });

  it("packages an editable Word formula in document.xml", async () => {
    const parsed = parseFormula("a/b", builtInTemplates);
    const blob = await buildDocxBlob(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "公式：" },
              {
                type: "formula",
                attrs: {
                  source: parsed.source,
                  latex: parsed.latex,
                  omml: toOmml(parsed.ast)
                }
              }
            ]
          }
        ]
      },
      "测试文档"
    );

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("<m:oMath>");
    expect(documentXml).toContain("<m:f>");
    const coreXml = await zip.file("docProps/core.xml")?.async("string");
    expect(coreXml).toContain("测试文档");
  });
});






