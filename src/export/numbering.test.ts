import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseFormula } from "../formula/parser";
import { toOmml } from "../formula/omml";
import { buildDocxBlob } from "./docx";

function formula(source: string, label: string, numbering = false, displayMode = true) {
  const parsed = parseFormula(source);
  return {
    type: "formula",
    attrs: {
      source: parsed.source,
      latex: parsed.latex,
      omml: toOmml(parsed.ast),
      displayMode,
      numbering,
      label
    }
  };
}

describe("equation numbering and references", () => {
  it("writes sequential numbers and resolved references to DOCX", async () => {
    const blob = await buildDocxBlob(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "见公式 " },
              { type: "equationReference", attrs: { label: "energy" } }
            ]
          },
          { type: "paragraph", content: [formula("E=mc^2", "energy", true)] },
          { type: "paragraph", content: [formula("a^2+b^2=c^2", "pythagoras", true)] }
        ]
      },
      "编号测试"
    );

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("(1)");
    expect((xml.match(/SEQ Equation/g) ?? []).length).toBe(2);
    expect(xml).toContain(">2</w:t>");
    expect(xml).toContain("<w:tab/>");
    expect(xml).toContain("SEQ Equation");
    expect(xml).toContain("REF Eq_energy");
    expect(xml).toContain("<w:bookmarkStart");
    expect(xml).toContain("见公式 ");
    const settings = await zip.file("word/settings.xml")!.async("string");
    expect(settings).toContain('<w:updateFields w:val="true"/>');
  });

  it("does not number inline formulas", async () => {
    const blob = await buildDocxBlob(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [formula("x+y", "inline", true, false)]
          }
        ]
      },
      "行内测试"
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("(1)");
  });
});
