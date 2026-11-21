import type { JSONContent } from "@tiptap/core";
import JSZip from "jszip";
import { mathLiveLatexToLinear } from "../formula/mathlive";
import { ommlToLatex } from "../formula/ommlToLatex";

export interface DocxImportResult {
  content: JSONContent;
  title: string;
  formulaCount: number;
  paragraphCount: number;
  warnings: string[];
}

interface TextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

function directChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === name);
}

function firstDirectChild(element: Element, name: string): Element | undefined {
  return directChildren(element, name)[0];
}

function attribute(element: Element | undefined, name: string): string | undefined {
  if (!element) return undefined;
  for (const attributeName of element.getAttributeNames()) {
    if (attributeName === name || attributeName.endsWith(`:${name}`)) {
      return element.getAttribute(attributeName) ?? undefined;
    }
  }
  return undefined;
}

function hasChild(element: Element, name: string): boolean {
  return Boolean(firstDirectChild(element, name));
}

function runMarks(run: Element): TextMark[] {
  const properties = firstDirectChild(run, "rPr");
  if (!properties) return [];
  const marks: TextMark[] = [];
  if (hasChild(properties, "b")) marks.push({ type: "bold" });
  if (hasChild(properties, "i")) marks.push({ type: "italic" });
  if (hasChild(properties, "strike") || hasChild(properties, "dstrike")) marks.push({ type: "strike" });
  return marks;
}

function textNode(text: string, marks: TextMark[]): JSONContent {
  return marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

function formulaNode(mathElement: Element): JSONContent {
  const omml = mathElement.innerHTML;
  const latex = ommlToLatex(omml);
  const linear = mathLiveLatexToLinear(latex);
  return {
    type: "formula",
    attrs: {
      source: linear || latex || "\\text{导入公式}",
      latex,
      omml
    }
  };
}

function inlineContent(element: Element): JSONContent[] {
  const result: JSONContent[] = [];

  for (const child of Array.from(element.children)) {
    switch (child.localName) {
      case "oMath":
        result.push(formulaNode(child));
        break;
      case "oMathPara":
        for (const math of directChildren(child, "oMath")) result.push(formulaNode(math));
        break;
      case "r": {
        const marks = runMarks(child);
        for (const runChild of Array.from(child.children)) {
          if (runChild.localName === "t") {
            const text = runChild.textContent ?? "";
            if (text) result.push(textNode(text, marks));
          } else if (runChild.localName === "tab") {
            result.push(textNode(" ", marks));
          } else if (runChild.localName === "br") {
            result.push({ type: "hardBreak" });
          }
        }
        break;
      }
      case "hyperlink":
      case "smartTag":
      case "ins":
      case "customXml":
      case "sdt":
      case "sdtContent":
        result.push(...inlineContent(child));
        break;
      case "del":
      case "moveFrom":
      case "pPr":
      case "rPr":
      case "proofErr":
      case "bookmarkStart":
      case "bookmarkEnd":
        break;
      default:
        if (child.children.length > 0 && !child.localName.endsWith("Pr")) {
          result.push(...inlineContent(child));
        }
        break;
    }
  }

  return result;
}

function paragraphStyle(paragraph: Element): string {
  const properties = firstDirectChild(paragraph, "pPr");
  const style = firstDirectChild(properties ?? paragraph, "pStyle");
  return attribute(style, "val") ?? "Normal";
}

function paragraphNode(paragraph: Element): JSONContent {
  const style = paragraphStyle(paragraph);
  const headingMatch = style.match(/^Heading\s*([1-6])$/i);
  const isTitle = /^Title$/i.test(style);
  const level = isTitle ? 1 : headingMatch ? Number(headingMatch[1]) : null;
  const content = inlineContent(paragraph);

  if (level) {
    return {
      type: "heading",
      attrs: { level },
      ...(content.length > 0 ? { content } : {})
    };
  }

  return {
    type: "paragraph",
    ...(content.length > 0 ? { content } : {})
  };
}

function extractTitle(coreXml: string | null): string {
  if (!coreXml) return "导入的 Word 文档";
  try {
    const document = new DOMParser().parseFromString(coreXml, "application/xml");
    const elements = Array.from(document.getElementsByTagName("*"));
    const title = elements.find((element) => element.localName === "title")?.textContent?.trim();
    return title || "导入的 Word 文档";
  } catch {
    return "导入的 Word 文档";
  }
}

export async function importDocx(source: ArrayBuffer | Blob): Promise<DocxImportResult> {
  const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("这个 DOCX 缺少 word/document.xml，无法导入。");

  const xml = await documentFile.async("string");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("DOCX 的 document.xml 无法解析。");
  }

  const allElements = Array.from(document.getElementsByTagName("*"));
  const paragraphElements = allElements.filter((element) => element.localName === "p");
  const content = paragraphElements.map(paragraphNode);
  const formulaCount = allElements.filter((element) => element.localName === "oMath").length;
  const tableCount = allElements.filter((element) => element.localName === "tbl").length;
  const imageCount = allElements.filter((element) => ["drawing", "pict"].includes(element.localName)).length;
  const warnings: string[] = [];

  if (tableCount > 0) warnings.push(`检测到 ${tableCount} 个表格：编辑器中只显示单元格文字，保真导出会保留原表格结构。`);
  if (imageCount > 0) warnings.push(`检测到 ${imageCount} 个图片或绘图对象：编辑器中不显示，保真导出会保留原图片。`);
  if (formulaCount > 0) warnings.push(`已导入 ${formulaCount} 个 OMML 公式，导出时会保留原始 OMML。`);

  const coreFile = zip.file("docProps/core.xml");
  const coreXml = coreFile ? await coreFile.async("string") : null;

  return {
    content: { type: "doc", content },
    title: extractTitle(coreXml),
    formulaCount,
    paragraphCount: paragraphElements.length,
    warnings
  };
}

