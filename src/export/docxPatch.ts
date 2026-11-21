export interface PatchedDocxResult {
  blob: Blob;
  formulaCount: number;
}

/**
 * Patch formulas inside the original DOCX package without rebuilding the
 * document. Tables, images, comments, headers/footers and page layout remain in
 * the original OOXML parts.
 */
export async function exportPatchedDocx(
  original: ArrayBuffer,
  formulaOmml: string[]
): Promise<PatchedDocxResult> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(original);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("原始 DOCX 缺少 word/document.xml。");

  const xml = await documentFile.async("string");
  let index = 0;
  let matched = 0;

  const patched = xml.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, (originalMath) => {
    if (index >= formulaOmml.length) return originalMath;
    const replacement = formulaOmml[index++];
    matched += 1;
    return `<m:oMath>${replacement}</m:oMath>`;
  });

  if (matched !== formulaOmml.length) {
    throw new Error(
      `保真导出要求公式数量与原文一致：原文匹配 ${matched} 个，当前文档有 ${formulaOmml.length} 个。请先恢复为普通导出，或删除新增公式。`
    );
  }

  zip.file("word/document.xml", patched);
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE"
  });

  return { blob, formulaCount: matched };
}
