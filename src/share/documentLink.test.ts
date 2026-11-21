import { describe, expect, it } from "vitest";
import { decodeSharedDocument, encodeSharedDocument, parseSharedDocumentHash } from "./documentLink";

describe("shared document links", () => {
  it("roundtrips a document through a compressed hash", () => {
    const document = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "共享公式文档" }] }]
    };
    const encoded = encodeSharedDocument(document, "共享测试");
    const decoded = decodeSharedDocument(encoded);
    expect(decoded?.title).toBe("共享测试");
    expect(decoded?.document.content?.[0]?.content?.[0]?.text).toBe("共享公式文档");
    expect(parseSharedDocumentHash(`#doc=${encoded}`)?.title).toBe("共享测试");
  });

  it("rejects invalid payloads", () => {
    expect(decodeSharedDocument("not-a-valid-payload")).toBeNull();
    expect(parseSharedDocumentHash("#other=1")).toBeNull();
  });
});
