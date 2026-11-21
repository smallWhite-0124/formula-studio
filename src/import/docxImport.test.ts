// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { builtInTemplates } from "../formula/templates";
import { parseFormula } from "../formula/parser";
import { toOmml } from "../formula/omml";
import { buildDocxBlob } from "../export/docx";
import { importDocx } from "./docxImport";

describe("DOCX import and roundtrip", () => {
  it("imports text and preserves OMML formulas", async () => {
    const parsed = parseFormula("sigma(1,n){i^2}", builtInTemplates);
    const sourceDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "导入前：" },
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
    };

    const blob = await buildDocxBlob(sourceDoc, "导入测试");
    const imported = await importDocx(blob);
    const paragraph = imported.content.content?.[0];
    const formula = paragraph?.content?.find((node) => node.type === "formula");

    expect(imported.title).toBe("导入测试");
    expect(imported.paragraphCount).toBeGreaterThanOrEqual(1);
    expect(imported.formulaCount).toBe(1);
    expect(formula?.attrs?.omml).toContain("<m:nary>");
    expect(formula?.attrs?.latex).toContain("\\sum");
    expect(formula?.attrs?.source).toBeTruthy();
  });

  it("re-exports imported formulas as native OMML", async () => {
    const parsed = parseFormula("a/b", builtInTemplates);
    const blob = await buildDocxBlob(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "往返测试：" },
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
      "往返测试"
    );

    const imported = await importDocx(blob);
    const roundtrip = await buildDocxBlob(imported.content, imported.title);
    const zip = await JSZip.loadAsync(await roundtrip.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toContain("<m:oMath>");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("往返测试");
  });
});
