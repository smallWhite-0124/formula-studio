import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseFormula } from "../formula/parser";
import { toOmml } from "../formula/omml";
import { buildDocxBlob } from "./docx";

it("builds a Word field smoke document", async () => {
  const first = parseFormula("E=mc^2");
  const second = parseFormula("a^2+b^2=c^2");
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
        {
          type: "paragraph",
          content: [
            {
              type: "formula",
              attrs: {
                source: first.source,
                latex: first.latex,
                omml: toOmml(first.ast),
                displayMode: true,
                numbering: true,
                label: "energy"
              }
            }
          ]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "formula",
              attrs: {
                source: second.source,
                latex: second.latex,
                omml: toOmml(second.ast),
                displayMode: true,
                numbering: true,
                label: "pythagoras"
              }
            }
          ]
        }
      ]
    },
    "动态编号测试"
  );

  if (process.env.WRITE_WORD_SMOKE === "1") {
    fs.writeFileSync("C:/Users/18004/Downloads/formula-dynamic-fields.docx", Buffer.from(await blob.arrayBuffer()));
  }
  expect(blob.size).toBeGreaterThan(0);
});
