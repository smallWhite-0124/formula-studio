// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseFormula } from "../formula/parser";
import { toOmml } from "../formula/omml";
import { buildDocxBlob } from "./docx";
import { exportPatchedDocx } from "./docxPatch";
import { collectFormulaOmml } from './formulaCollection';

describe("faithful DOCX formula patching", () => {
  it("patches formulas without removing tables or comments", async () => {
    const originalFormula = parseFormula("a/b");
    const replacementFormula = parseFormula("c/d");
    const blob = await buildDocxBlob(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "原始文字" },
              {
                type: "formula",
                attrs: {
                  source: originalFormula.source,
                  latex: originalFormula.latex,
                  omml: toOmml(originalFormula.ast),
                  displayMode: false
                }
              }
            ]
          }
        ]
      },
      "保真测试"
    );

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")!.async("string");
    zip.file(
      "word/document.xml",
      documentXml.replace(
        "</w:body>",
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body>"
      )
    );
    zip.file(
      "word/comments.xml",
      '<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0"><w:t>批注内容</w:t></w:comment></w:comments>'
    );
    const original = await zip.generateAsync({ type: "arraybuffer" });

    const patched = await exportPatchedDocx(original, [toOmml(replacementFormula.ast)]);
    const patchedZip = await JSZip.loadAsync(await patched.blob.arrayBuffer());
    const patchedXml = await patchedZip.file("word/document.xml")!.async("string");
    const comments = await patchedZip.file("word/comments.xml")!.async("string");

    expect(patched.formulaCount).toBe(1);
    expect(patchedXml).toContain("<w:tbl>");
    expect(patchedXml).toContain("表格内容");
    expect(patchedXml).toContain("<m:t xml:space=\"preserve\">c</m:t>");
    expect(comments).toContain("批注内容");
  });

  it("extracts formulas in document order", () => {
    const formula = parseFormula("x^2");
    const omml = toOmml(formula.ast);
    const formulas = collectFormulaOmml({
      type: "doc",
      content: [
        { type: "formula", attrs: { omml } },
        { type: "paragraph", content: [{ type: "formula", attrs: { omml } }] }
      ]
    });
    expect(formulas).toEqual([omml, omml]);
  });
});

