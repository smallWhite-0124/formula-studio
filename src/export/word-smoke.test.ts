// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseFormula } from "../formula/parser";
import { toOmml } from "../formula/omml";

describe("new formula OMML smoke tests", () => {
  it("exports derivative, accents, binomial and alignment structures", () => {
    const derivative = parseFormula("f'(x) + partial f / partial x");
    const accents = parseFormula("vec(a) + hat(x) + bar(y)");
    const binom = parseFormula("binom(n,k)");
    const aligned = parseFormula("align(x&=1;y&=2)");

    expect(toOmml(derivative.ast)).toContain("∂");
    expect(toOmml(accents.ast)).toContain("<m:acc>");
    expect(toOmml(accents.ast)).toContain("<m:bar>");
    expect(toOmml(binom.ast)).toContain('m:type m:val="noBar"');
    expect(toOmml(aligned.ast)).toContain("<m:eqArr>");
  });
});

