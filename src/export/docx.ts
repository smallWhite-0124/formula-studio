import type { JSONContent } from "@tiptap/core";
import { escapeXml } from "../formula/omml";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
}

function bookmarkName(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]/, "_").slice(0, 36);
  return `Eq_${safe || "formula"}`;
}

function enrichEquationNumbers(document: JSONContent): JSONContent {
  const clone = structuredClone(document) as JSONContent;
  const labels = new Map<string, { number: number; bookmarkName: string; bookmarkId: number }>();
  let number = 0;

  const visit = (node: JSONContent) => {
    if (node.type === "formula" && node.attrs?.numbering && node.attrs?.displayMode) {
      number += 1;
      const label = String(node.attrs.label || `eq${number}`);
      const name = bookmarkName(label);
      const id = 2000 + number;
      node.attrs = { ...node.attrs, label, equationNumber: number, bookmarkName: name, bookmarkId: id };
      labels.set(label, { number, bookmarkName: name, bookmarkId: id });
    }
    for (const child of node.content ?? []) visit(child);
  };

  visit(clone);

  const assignReferences = (node: JSONContent) => {
    if (node.type === "equationReference") {
      const target = labels.get(String(node.attrs?.label ?? ""));
      node.attrs = {
        ...node.attrs,
        equationNumber: target?.number ?? null,
        bookmarkName: target?.bookmarkName ?? null
      };
    }
    for (const child of node.content ?? []) assignReferences(child);
  };

  assignReferences(clone);
  return clone;
}

function textRun(text: string, options: RunOptions = {}): string {
  if (!text) return "";
  const properties = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.strike ? "<w:strike/>" : "",
    options.code
      ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>'
      : "",
    options.color ? `<w:color w:val="${escapeXml(options.color)}"/>` : ""
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function complexField(instruction: string, cachedText: string): string {
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${escapeXml(instruction)}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${textRun(cachedText)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function marksToOptions(marks: JSONContent["marks"] = []): RunOptions {
  return {
    bold: marks?.some((mark) => mark.type === "bold"),
    italic: marks?.some((mark) => mark.type === "italic"),
    strike: marks?.some((mark) => mark.type === "strike"),
    code: marks?.some((mark) => mark.type === "code"),
    color: marks?.find((mark) => mark.type === "textStyle")?.attrs?.color
  };
}

function inlineToXml(node: JSONContent): string {
  if (node.type === "text") return textRun(node.text ?? "", marksToOptions(node.marks));
  if (node.type === "hardBreak") return "<w:r><w:br/></w:r>";
  if (node.type === "formula") {
    const omml = String(node.attrs?.omml ?? "");
    if (omml) {
      if (node.attrs?.displayMode && node.attrs?.numbering) {
        const bookmarkId = Number(node.attrs.bookmarkId ?? 0);
        const bookmark = String(node.attrs.bookmarkName ?? "");
        return `<m:oMathPara><m:oMath>${omml}</m:oMath></m:oMathPara><w:r><w:tab/></w:r><w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(bookmark)}"/>${textRun("(")}${complexField(" SEQ Equation \\* ARABIC ", String(node.attrs.equationNumber ?? "1"))}${textRun(")")}<w:bookmarkEnd w:id="${bookmarkId}"/>`;
      }
      return node.attrs?.displayMode
        ? `<m:oMathPara><m:oMath>${omml}</m:oMath></m:oMathPara>`
        : `<m:oMath>${omml}</m:oMath>`;
    }
    return textRun(String(node.attrs?.source ?? "[formula]"));
  }
  if (node.type === "equationReference") {
    const equationNumber = node.attrs?.equationNumber;
    const bookmark = String(node.attrs?.bookmarkName ?? "");
    if (bookmark) return complexField(` REF ${bookmark} \\h `, `(${equationNumber ?? "?"})`);
    return textRun(equationNumber ? `(${equationNumber})` : `(${node.attrs?.label ?? "?"})`);
  }
  if (node.content) return node.content.map(inlineToXml).join("");
  return "";
}

function paragraphXml(children: JSONContent[] = [], style?: string, prefix?: string): string {
  const properties = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    '<w:spacing w:after="140" w:line="360" w:lineRule="auto"/>',
    '<w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs>'
  ].join("");
  const content = `${prefix ? textRun(prefix) : ""}${children.map(inlineToXml).join("")}`;
  return `<w:p><w:pPr>${properties}</w:pPr>${content}</w:p>`;
}

function listParagraphs(list: JSONContent, ordered: boolean): string[] {
  return (list.content ?? []).flatMap((item, index) => {
    const prefix = ordered ? `${index + 1}. ` : "• ";
    return (item.content ?? []).map((child, childIndex) =>
      paragraphXml(child.content ?? [], undefined, childIndex === 0 ? prefix : "")
    );
  });
}

function documentBody(node: JSONContent): string {
  if (!node.content) return "";

  return node.content
    .flatMap((child) => {
      if (child.type === "paragraph") return [paragraphXml(child.content ?? [])];
      if (child.type === "heading") return [paragraphXml(child.content ?? [], `Heading${child.attrs?.level ?? 1}`)];
      if (child.type === "bulletList") return listParagraphs(child, false);
      if (child.type === "orderedList") return listParagraphs(child, true);
      if (child.content) return [paragraphXml(child.content.flatMap((item) => item.content ?? []))];
      return [];
    })
    .join("");
}

function documentXml(content: JSONContent): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}" xmlns:m="${MATH_NS}">
  <w:body>
    ${documentBody(content)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORD_NS}">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei" w:cs="Arial"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="140" w:line="360" w:lineRule="auto"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="38"/><w:szCs w:val="38"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr>
  </w:style>
</w:styles>`;
}

function settingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${WORD_NS}">
  <w:updateFields w:val="true"/>
  <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>`;
}

function corePropsXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Formula Studio</dc:creator>
  <cp:lastModifiedBy>Formula Studio</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Formula Studio</Application>
  <AppVersion>0.1</AppVersion>
</Properties>`;
}

export async function buildDocxBlob(content: JSONContent, title = "公式文档"): Promise<Blob> {
  const enrichedContent = enrichEquationNumbers(content);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`
  );

  zip.file("word/document.xml", documentXml(enrichedContent));
  zip.file("word/styles.xml", stylesXml());
  zip.file("word/settings.xml", settingsXml());
  zip.file("docProps/core.xml", corePropsXml(title));
  zip.file("docProps/app.xml", appPropsXml());

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE"
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

