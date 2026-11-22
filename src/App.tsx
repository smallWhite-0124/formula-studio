import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Bookmark,
  Braces,
  Cloud,
  Copy,
  Download,
  FileSearch,
  Heading1,
  Heading2,
  Italic,
  List,
  Plus,
  Redo2,
  RotateCcw,
  Share2,
  Sigma,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudDialog } from "./components/CloudDialog";
import { EquationReferenceDialog } from "./components/EquationReferenceDialog";
import { FormulaEditorDialog } from "./components/FormulaEditorDialog";
import { MathLivePreview } from "./components/MathLivePreview";
import { TemplateDialog } from "./components/TemplateDialog";
import { WordPreviewDialog } from "./components/WordPreviewDialog";
import { FormulaNode, type FormulaEditDetail } from "./editor/FormulaNode";
import { EquationReferenceNode } from "./editor/EquationReferenceNode";
import { collectEquationLabels, nextEquationLabel } from "./editor/equations";
import { collectFormulaOmml } from "./export/formulaCollection";
import { buildShareUrl, parseSharedDocumentHash } from "./share/documentLink";
import {
  cloudConfigured,
  cloudShareUrl,
  createCloudDocument,
  createCloudShare,
  currentCloudShareToken,
  deleteCloudDocument,
  getCloudDocument,
  getCloudUser,
  getSharedCloudDocument,
  getSupabaseClient,
  listCloudDocuments,
  sendCloudLoginLink,
  signOutCloud,
  updateCloudDocument,
  type CloudDocumentSummary
} from "./cloud/supabase";
import { toOmml } from "./formula/omml";
import { parseFormula } from "./formula/parser";
import { builtInTemplates } from "./formula/templates";
import type { FormulaTemplate, ParsedFormula } from "./formula/types";

const CUSTOM_TEMPLATES_KEY = "formula-studio:custom-templates:v1";
const DOCUMENT_KEY = "formula-studio:document:v1";
const DOCUMENT_TITLE_KEY = 'formula-studio:document-title:v1';
const INITIAL_SOURCE = "sigma(1,n){i^2} + a/b";
const EXAMPLES = [
  "a/b + sqrt(x^2+1)",
  "sigma(1,n){i^2}",
  "integral(0,1){f(x)dx}",
  "matrix(a,b;c,d)",
  "cases(x^2,x>=0;-x,x<0)",
  "align(x&=1;y&=2)",
  "f'(x) + partial f / partial x",
  "vec(a) + hat(x) + bar(y)",
  "binom(n,k)",
  "augmatrix(1,2|3;4,5|6)"
];
const INITIAL_DOCUMENT = `
  <h1>公式工坊</h1>
  <p>把公式当作普通文字写出来，选中后按 <strong>Ctrl + Enter</strong>，它就会变成可编辑的公式。</p>
  <p>先试试选中这一行：<strong>a/b + sqrt(x^2 + 1)</strong></p>
  <p>再试试自定义模板：<strong>sigma(1,n){i^2}</strong></p>
  <p>公式不是图片。导出 DOCX 后，它仍然是 Word 中可编辑的 OMML 公式。</p>
`;

type ToastKind = "success" | "error" | "info";
interface ToastState {
  message: string;
  kind: ToastKind;
}

function loadCustomTemplates(): FormulaTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FormulaTemplate => {
      return Boolean(item && typeof item === "object" && "name" in item && "expansion" in item);
    });
  } catch {
    return [];
  }
}

function loadDocument(): JSONContent | string {
  try {
    const raw = localStorage.getItem(DOCUMENT_KEY);
    if (!raw) return INITIAL_DOCUMENT;
    return JSON.parse(raw) as JSONContent;
  } catch {
    return INITIAL_DOCUMENT;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formulaAttrs(parsed: ParsedFormula, displayMode = false, numbering = false, label = "") {
  const numbered = displayMode && numbering;
  return {
    source: parsed.source,
    latex: parsed.latex,
    omml: toOmml(parsed.ast),
    displayMode,
    numbering: numbered,
    label: numbered ? label : ""
  };
}

function selectionCoversParagraph(editor: NonNullable<ReturnType<typeof useEditor>>, from: number, to: number): boolean {
  const start = editor.state.doc.resolve(from);
  const end = editor.state.doc.resolve(to);
  if (start.parent !== end.parent || start.parent.type.name !== "paragraph") return false;
  const selected = editor.state.doc.textBetween(from, to, "\n", "\n").trim();
  const paragraph = start.parent.textBetween(0, start.parent.content.size, "\n", "\n").trim();
  return selected.length > 0 && selected === paragraph;
}

function selectedFormula(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const node = editor.state.doc.nodeAt(from);
  if (node?.type.name !== "formula" || from + node.nodeSize !== to) return null;
  return { from, to, node };
}

function firstHeadingText(document: JSONContent): string {
  const heading = document.content?.find((node) => node.type === "heading");
  const text = heading?.content?.map((node) => node.text ?? "").join("").trim();
  return text || "公式文档";
}

interface ToolbarButtonProps {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ title, active = false, disabled = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`toolbar-button${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [sharedDocument] = useState(() => parseSharedDocumentHash(window.location.hash));
  const [customTemplates, setCustomTemplates] = useState<FormulaTemplate[]>(loadCustomTemplates);
  const [documentTitle, setDocumentTitle] = useState(() => sharedDocument?.title || localStorage.getItem(DOCUMENT_TITLE_KEY) || '公式文档');
  const [isImporting, setIsImporting] = useState(false);
  const [labSource, setLabSource] = useState(INITIAL_SOURCE);
  const [insertDisplayMode, setInsertDisplayMode] = useState(false);
  const [insertNumbering, setInsertNumbering] = useState(false);
  const [editingFormula, setEditingFormula] = useState<FormulaEditDetail | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [wordPreviewOpen, setWordPreviewOpen] = useState(false);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudDocuments, setCloudDocuments] = useState<CloudDocumentSummary[]>([]);
  const [cloudDocumentId, setCloudDocumentId] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [fidelityMode, setFidelityMode] = useState(false);
  const fidelityMetaRef = useRef<{ buffer: ArrayBuffer; formulaCount: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [revision, setRevision] = useState(0);
  const toastTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const convertRef = useRef<() => void>(() => {});

  const templates = useMemo(() => [...builtInTemplates, ...customTemplates], [customTemplates]);
  const templatesRef = useRef(templates);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  const showToast = useCallback((message: string, kind: ToastKind = "info", duration = 3200) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  const refreshCloudDocuments = useCallback(async (silent = false) => {
    if (!cloudConfigured) return;
    setCloudLoading(true);
    try {
      const documents = await listCloudDocuments();
      setCloudDocuments(documents);
    } catch (error) {
      if (!silent) showToast(`加载云端文档失败：${errorMessage(error)}`, "error", 5000);
    } finally {
      setCloudLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!cloudConfigured) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const initialize = async () => {
      const client = await getSupabaseClient();
      if (cancelled) return;

      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        setCloudUserEmail(session?.user.email ?? null);
        if (session?.user) {
          void refreshCloudDocuments(true);
        } else {
          setCloudDocuments([]);
          setCloudDocumentId(null);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();

      const user = await getCloudUser();
      if (cancelled) return;
      setCloudUserEmail(user?.email ?? null);
      if (user) await refreshCloudDocuments(true);
    };

    void initialize();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refreshCloudDocuments]);

  useEffect(() => {
    if (sharedDocument) {
      showToast("已从分享链接加载文档。", "success", 4200);
    }
  }, [sharedDocument, showToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const editor = useEditor({
    extensions: [StarterKit, FormulaNode, EquationReferenceNode],
    content: sharedDocument?.document ?? loadDocument(),
    editorProps: {
      attributes: {
        class: "prose-editor",
        spellcheck: "false"
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          convertRef.current();
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      localStorage.setItem(DOCUMENT_KEY, JSON.stringify(currentEditor.getJSON()));
      setRevision((value) => value + 1);
    },
    onSelectionUpdate: () => setRevision((value) => value + 1),
    onTransaction: () => setRevision((value) => value + 1)
  });

  const labResult = useMemo(() => {
    try {
      return { parsed: parseFormula(labSource, templates), error: "" };
    } catch (error) {
      return { parsed: null, error: errorMessage(error) };
    }
  }, [labSource, templates]);

  useEffect(() => {
    const handleFormulaEdit = (event: Event) => {
      const detail = (event as CustomEvent<FormulaEditDetail>).detail;
      if (detail) setEditingFormula(detail);
    };
    window.addEventListener("formula:edit", handleFormulaEdit);
    return () => window.removeEventListener("formula:edit", handleFormulaEdit);
  }, []);

  useEffect(() => {
    if (!editor || !cloudConfigured) return;
    const token = currentCloudShareToken();
    if (!token) return;
    let cancelled = false;

    const loadShared = async () => {
      try {
        const shared = await getSharedCloudDocument(token);
        if (cancelled) return;
        if (!shared) throw new Error("分享链接无效或已过期。");
        editor.commands.setContent(shared.content, { emitUpdate: true });
        setDocumentTitle(shared.title);
        setCloudDocumentId(null);
        setFidelityMode(false);
        fidelityMetaRef.current = null;
        showToast("已加载云端分享文档。", "success", 4200);
      } catch (error) {
        if (!cancelled) showToast(`加载分享文档失败：${errorMessage(error)}`, "error", 5000);
      }
    };

    void loadShared();
    return () => {
      cancelled = true;
    };
  }, [editor, showToast]);

  useEffect(() => {
    if (!editor || !cloudDocumentId || !cloudUserEmail || revision === 0) return;
    setCloudSyncing(true);
    const timer = window.setTimeout(async () => {
      try {
        await updateCloudDocument(cloudDocumentId, documentTitle, editor.getJSON());
      } catch (error) {
        showToast(`云端保存失败：${errorMessage(error)}`, "error", 5000);
      } finally {
        setCloudSyncing(false);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [cloudDocumentId, cloudUserEmail, documentTitle, editor, revision, showToast]);

  const handleConvertSelection = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;


    if (from === to) {
      showToast("先选中一段线性公式文本，再按 Ctrl + Enter。", "info");
      return;
    }

    const formula = selectedFormula(editor);
    if (formula) {
      const source = String(formula.node.attrs.source ?? "");
      editor.chain().focus().insertContentAt({ from: formula.from, to: formula.to }, source).run();
      showToast("公式已还原为线性源码。", "success");
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, "\n", "\n");
    if (selectedText.includes("\n")) {
      showToast("第一版一次只转换一个段落内的内容。", "error");
      return;
    }

    const referenceMatch = selectedText.trim().match(/^(?:\\?eqref|\\?ref|@eq)\(([^()]+)\)$/);
    if (referenceMatch) {
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to },
          { type: "equationReference", attrs: { label: referenceMatch[1].trim() } }
        )
        .run();
      showToast("已插入公式引用。", "success");
      return;
    }

    try {
      const parsed = parseFormula(selectedText, templatesRef.current);
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to },
          {
            type: "formula",
            attrs: formulaAttrs(parsed, selectionCoversParagraph(editor, from, to))
          }
        )
        .run();
      const suffix = parsed.usedTemplates.length ? `，使用了 ${parsed.usedTemplates.join("、")}` : "";
      showToast(`已转换为公式${suffix}。再次选中后按 Ctrl + Enter 可还原。`, "success");
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }, [editor, showToast]);

  useEffect(() => {
    convertRef.current = handleConvertSelection;
  }, [handleConvertSelection]);


  const insertFormula = useCallback(
    (parsed: ParsedFormula, displayMode = false, numbering = false) => {
      if (!editor) return;
      const numbered = displayMode && numbering;
      const label = numbered ? nextEquationLabel(editor.state.doc) : "";
      editor
        .chain()
        .focus()
        .insertContent({ type: "formula", attrs: formulaAttrs(parsed, displayMode, numbering, label) })
        .insertContent(" ")
        .run();
      showToast(
        numbered ? `编号公式已插入：${label}。` : displayMode ? "独立公式已插入文档。" : "行内公式已插入文档。",
        "success"
      );
    },
    [editor, showToast]
  );

  const copyLabLatex = async () => {
    if (!labResult.parsed) return;
    await navigator.clipboard.writeText(labResult.parsed.latex);
    showToast("LaTeX 已复制。", "success");
  };

  const copyLabOmml = async () => {
    if (!labResult.parsed) return;
    await navigator.clipboard.writeText(toOmml(labResult.parsed.ast));
    showToast("OMML 已复制。", "success");
  };

  const saveEditedFormula = (
    source: string,
    parsed: ParsedFormula,
    displayMode: boolean,
    numbering: boolean,
    label: string
  ) => {
    if (!editor || !editingFormula) return;
    const node = editor.state.doc.nodeAt(editingFormula.position);
    if (!node || node.type.name !== "formula") {
      showToast("找不到正在编辑的公式，请重试。", "error");
      setEditingFormula(null);
      return;
    }

    const numbered = displayMode && numbering;
    const finalLabel = numbered ? (label.trim() || nextEquationLabel(editor.state.doc)) : "";
    if (numbered) {
      const duplicate = collectEquationLabels(editor.state.doc).find(
        (equation) => equation.label === finalLabel && equation.position !== editingFormula.position
      );
      if (duplicate) {
        showToast(`引用标签“${finalLabel}”已被另一条公式使用。`, "error", 5000);
        return;
      }
    }

    const transaction = editor.state.tr.setNodeMarkup(editingFormula.position, undefined, {
      source,
      latex: parsed.latex,
      omml: toOmml(parsed.ast),
      displayMode,
      numbering: numbered,
      label: finalLabel
    });
    editor.view.dispatch(transaction);
    setEditingFormula(null);
    showToast(numbered ? `公式已更新，自动编号为 (${collectEquationLabels(editor.state.doc).find((equation) => equation.position === editingFormula.position)?.number ?? "?"})。` : "公式已更新。", "success");
  };

  const saveTemplate = (template: FormulaTemplate) => {
    const next = [...customTemplates, template];
    setCustomTemplates(next);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next));
    setTemplateDialogOpen(false);
    setLabSource(template.example);
    showToast(`模板 ${template.name} 已保存。`, "success");
  };

  const removeTemplate = (id: string) => {
    const next = customTemplates.filter((template) => template.id !== id);
    setCustomTemplates(next);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next));
    showToast("模板已删除，已有公式不受影响。", "info");
  };

  const handleDocxImport = async (file: File) => {
    if (!editor) return;
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const { importDocx } = await import("./import/docxImport");
      const result = await importDocx(buffer);
      editor.commands.setContent(result.content, { emitUpdate: true });
      setDocumentTitle(result.title);
      localStorage.setItem(DOCUMENT_TITLE_KEY, result.title);
      fidelityMetaRef.current = result.formulaCount > 0 ? { buffer, formulaCount: result.formulaCount } : null;
      setFidelityMode(result.formulaCount > 0);
      const warningText = result.warnings.length > 0 ? ` ${result.warnings.slice(0, 2).join(" ")}` : "";
      const fidelityText = result.formulaCount > 0
        ? " 已启用保真导出：表格、图片、批注和页面布局保留，公式修改会回写原文档。"
        : "";
      showToast(
        `已导入 ${result.paragraphCount} 个段落、${result.formulaCount} 个 OMML 公式。${warningText}${fidelityText}`,
        result.warnings.length > 0 ? "info" : "success",
        8000
      );
    } catch (error) {
      showToast(`导入失败：${errorMessage(error)}`, "error", 5000);
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const saveCurrentToCloud = async () => {
    if (!editor) throw new Error("编辑器还没有准备好。");
    if (!cloudUserEmail) {
      setCloudDialogOpen(true);
      throw new Error("请先登录云端账号。");
    }
    if (cloudDocumentId) {
      await updateCloudDocument(cloudDocumentId, documentTitle, editor.getJSON());
    } else {
      const created = await createCloudDocument(documentTitle, editor.getJSON());
      setCloudDocumentId(created.id);
    }
    await refreshCloudDocuments(true);
  };

  const openCloudDocumentHandler = async (id: string) => {
    if (!editor) throw new Error("编辑器还没有准备好。");
    setCloudLoading(true);
    try {
      const document = await getCloudDocument(id);
      editor.commands.setContent(document.content, { emitUpdate: true });
      setDocumentTitle(document.title);
      setCloudDocumentId(document.id);
      setFidelityMode(false);
      fidelityMetaRef.current = null;
      localStorage.setItem(DOCUMENT_TITLE_KEY, document.title);
      setCloudDialogOpen(false);
      showToast(`已打开云端文档：${document.title}`, "success");
    } finally {
      setCloudLoading(false);
    }
  };

  const deleteCloudDocumentHandler = async (id: string) => {
    await deleteCloudDocument(id);
    if (id === cloudDocumentId) setCloudDocumentId(null);
    await refreshCloudDocuments(true);
  };

  const signOutCloudHandler = async () => {
    await signOutCloud();
    setCloudUserEmail(null);
    setCloudDocuments([]);
    setCloudDocumentId(null);
  };

  const shareDocument = async () => {
    if (!editor) return;
    try {
      let url: string;
      if (cloudUserEmail && cloudDocumentId) {
        await updateCloudDocument(cloudDocumentId, documentTitle, editor.getJSON());
        const token = await createCloudShare(cloudDocumentId);
        url = cloudShareUrl(token);
        showToast("云端分享链接已复制。", "success", 5000);
      } else {
        url = buildShareUrl(editor.getJSON(), documentTitle);
        showToast("分享链接已复制。链接中包含压缩后的文档内容。", "success", 5000);
      }
      await navigator.clipboard.writeText(url);
    } catch (error) {
      showToast(`生成分享链接失败：${errorMessage(error)}`, "error", 5000);
    }
  };

  const exportDocx = async () => {
    if (!editor) return;
    try {
      const document = editor.getJSON();
      const title = documentTitle || firstHeadingText(document);
      let blob: Blob;
      let faithful = false;

      if (fidelityMode && fidelityMetaRef.current) {
        const { exportPatchedDocx } = await import("./export/docxPatch");
        const formulas = collectFormulaOmml(document);
        blob = (await exportPatchedDocx(fidelityMetaRef.current.buffer, formulas)).blob;
        faithful = true;
      } else {
        const { buildDocxBlob } = await import("./export/docx");
        blob = await buildDocxBlob(document, title);
      }

      const { downloadBlob } = await import("./export/docx");
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, "-")}-${date}.docx`);
      showToast(
        faithful
          ? "保真 DOCX 已导出：表格、图片、批注和页面布局保留，公式修改已回写。"
          : "DOCX 已导出，公式以 OMML 写入。",
        "success",
        5000
      );
    } catch (error) {
      showToast(`导出失败：${errorMessage(error)}`, "error", 6000);
    }
  };

  const switchToNormalExport = () => {
    setFidelityMode(false);
    fidelityMetaRef.current = null;
    showToast("已切换为普通编辑导出。表格、图片和复杂布局将按编辑器内容重建。", "info", 5500);
  };

  const resetDocument = () => {
    if (!editor) return;
    if (!window.confirm("确定要清空当前文档并恢复示例内容吗？")) return;
    editor.commands.setContent(INITIAL_DOCUMENT, { emitUpdate: true });
    setDocumentTitle("公式文档");
    setFidelityMode(false);
    fidelityMetaRef.current = null;
    localStorage.setItem(DOCUMENT_TITLE_KEY, "公式文档");
    showToast("文档已重置。", "info");
  };


  const numberedEquations = useMemo(
    () => (editor ? collectEquationLabels(editor.state.doc) : []),
    [editor, revision]
  );

  const insertEquationReference = (label: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent({ type: "equationReference", attrs: { label } }).run();
    setReferenceDialogOpen(false);
    showToast(`已插入公式引用：${label}`, "success");
  };

  const hasSelection = Boolean(editor && editor.state.selection.from !== editor.state.selection.to);
  const isFormulaSelected = Boolean(editor && selectedFormula(editor));

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">
            <Sigma size={21} />
          </div>
          <div>
            <div className="brand-name">公式工坊</div>
            <div className="brand-subtitle">Formula Studio · Word-native math</div>
          </div>
        </div>

        <div className="header-shortcut">
          <span className="shortcut-label">选中文本</span>
          <kbd>Ctrl</kbd>
          <span>+</span>
          <kbd>Enter</kbd>
          <span className="shortcut-label">转公式</span>
        </div>

        <div className="header-actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleDocxImport(file);
            }}
          />
          <button
            type="button"
            className={"ghost-button" + (cloudUserEmail ? " cloud-connected" : "")}
            onClick={() => setCloudDialogOpen(true)}
          >
            <Cloud size={15} /> {cloudUserEmail ? "云端 · 已登录" : "云端"}
          </button>
          <button type="button" className="ghost-button" onClick={() => void shareDocument()}>
            <Share2 size={15} /> 分享链接
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload size={15} /> {isImporting ? "导入中…" : "导入 DOCX"}
          </button>
          <button type="button" className="ghost-button" onClick={resetDocument}>
            <RotateCcw size={15} /> 重置
          </button>
          <button type="button" className="primary-button export-button" onClick={() => void exportDocx()}>
            <Download size={16} /> 导出 DOCX
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section className="side-card formula-lab">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">INPUT LAB</p>
                <h2>公式输入台</h2>
              </div>
              <Sparkles size={18} className="card-icon" />
            </div>

            <textarea
              className="lab-input"
              value={labSource}
              spellCheck={false}
              onChange={(event) => setLabSource(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && labResult.parsed) {
                  event.preventDefault();
                  insertFormula(labResult.parsed, insertDisplayMode, insertNumbering);
                }
              }}
            />

            <div className="example-row">
              {EXAMPLES.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="example-chip"
                  onClick={() => setLabSource(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            <div className={`lab-preview${labResult.error ? " has-error" : ""}`}>
              {labResult.error ? (
                <p>{labResult.error}</p>
              ) : (
                <MathLivePreview latex={labResult.parsed?.latex ?? ""} readOnly />
              )}
            </div>

            <div className="lab-latex">
              <span>LaTeX</span>
              <code>{labResult.parsed?.latex ?? "—"}</code>
            </div>

            <div className="formula-mode-toggle lab-mode-toggle" role="group" aria-label="插入公式方式">
              <button
                type="button"
                className={!insertDisplayMode && !insertNumbering ? "is-active" : ""}
                onClick={() => { setInsertDisplayMode(false); setInsertNumbering(false); }}
              >
                行内
              </button>
              <button
                type="button"
                className={insertDisplayMode && !insertNumbering ? "is-active" : ""}
                onClick={() => { setInsertDisplayMode(true); setInsertNumbering(false); }}
              >
                独立
              </button>
              <button
                type="button"
                className={insertNumbering ? "is-active" : ""}
                onClick={() => { setInsertDisplayMode(true); setInsertNumbering(true); }}
              >
                编号
              </button>
            </div>

            <div className="lab-actions">
              <button
                type="button"
                className="primary-button grow-button"
                disabled={!labResult.parsed}
                onClick={() => labResult.parsed && insertFormula(labResult.parsed, insertDisplayMode, insertNumbering)}
              >
                <Plus size={16} /> 插入到文档
              </button>
              <button type="button" className="icon-button bordered" title="复制 LaTeX" disabled={!labResult.parsed} onClick={() => void copyLabLatex()}>
                <Copy size={16} />
              </button>
              <button type="button" className="icon-button bordered" title="复制 OMML" disabled={!labResult.parsed} onClick={() => void copyLabOmml()}>
                <Braces size={16} />
              </button>
            </div>
          </section>

          <section className="side-card templates-card">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">MACROS</p>
                <h2>我的公式模板</h2>
              </div>
              <button type="button" className="icon-button bordered" title="新建模板" onClick={() => setTemplateDialogOpen(true)}>
                <Plus size={16} />
              </button>
            </div>

            <div className="template-list">
              {templates.map((template) => (
                <article className="template-item" key={template.id}>
                  <button type="button" className="template-main" onClick={() => setLabSource(template.example)}>
                    <span className="template-name">{template.name}</span>
                    <span className="template-label">{template.label}</span>
                    <code>{template.example}</code>
                  </button>
                  {!template.builtin ? (
                    <button
                      type="button"
                      className="template-delete"
                      title="删除模板"
                      onClick={() => removeTemplate(template.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </aside>

        <section className="document-area">
          <div className="editor-toolbar">
            <div className="toolbar-group">
              <ToolbarButton title="撤销" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
                <Undo2 size={17} />
              </ToolbarButton>
              <ToolbarButton title="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
                <Redo2 size={17} />
              </ToolbarButton>
            </div>

            <div className="toolbar-separator" />

            <div className="toolbar-group">
              <ToolbarButton title="粗体" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
                <Bold size={17} />
              </ToolbarButton>
              <ToolbarButton title="斜体" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                <Italic size={17} />
              </ToolbarButton>
              <ToolbarButton title="一级标题" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 size={18} />
              </ToolbarButton>
              <ToolbarButton title="二级标题" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 size={18} />
              </ToolbarButton>
              <ToolbarButton title="无序列表" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                <List size={18} />
              </ToolbarButton>
            </div>

            <div className="toolbar-separator" />

            <button
              type="button"
              className={`convert-button${isFormulaSelected ? " is-restore" : ""}`}
              onClick={handleConvertSelection}
              disabled={!hasSelection}
            >
              <WandSparkles size={16} />
              {isFormulaSelected ? "还原为源码" : "转换为公式"}
            </button>

            <button
              type="button"
              className="secondary-button reference-toolbar-button"
              onClick={() => setReferenceDialogOpen(true)}
            >
              <Bookmark size={15} /> 引用公式
            </button>

            <span className="toolbar-tip">选中文本后按 Ctrl + Enter</span>
          </div>

          {fidelityMode ? (
            <div className="fidelity-banner">
              <div>
                <strong>保真导出模式</strong>
                <span>表格、图片、批注、页眉页脚和页面布局会原样保留；当前只回写公式修改。</span>
              </div>
              <div className="fidelity-banner-actions">
                <button type="button" className="secondary-button" onClick={() => setWordPreviewOpen(true)}>
                  <FileSearch size={14} /> Word 预览
                </button>
                <button type="button" className="secondary-button" onClick={switchToNormalExport}>
                  切换普通导出
                </button>
              </div>
            </div>
          ) : null}

          <div className="paper-wrap">
            <article className="paper">
              <EditorContent editor={editor} />
            </article>
          </div>

          <footer className="status-bar">
            <span className="status-dot" />
            <span>{cloudDocumentId ? (cloudSyncing ? "云端同步中…" : "云端自动保存") : "本地自动保存"}</span>
            <span className="status-divider" />
            <span>公式以语义结构保存</span>
            <span className="status-spacer" />
            <span>DOCX · OMML ready</span>
          </footer>
        </section>
      </main>

      {editingFormula ? (
        <FormulaEditorDialog
          title="编辑公式"
          initialSource={editingFormula.source}
          initialDisplayMode={editingFormula.displayMode}
          templates={templates}
          onClose={() => setEditingFormula(null)}
          onSave={saveEditedFormula}
        />
      ) : null}

      {templateDialogOpen ? (
        <TemplateDialog
          existing={customTemplates}
          onClose={() => setTemplateDialogOpen(false)}
          onSave={saveTemplate}
        />
      ) : null}

      {wordPreviewOpen && fidelityMetaRef.current && editor ? (
        <WordPreviewDialog
          originalBuffer={fidelityMetaRef.current.buffer}
          formulaOmml={collectFormulaOmml(editor.getJSON())}
          onClose={() => setWordPreviewOpen(false)}
        />
      ) : null}

      {referenceDialogOpen ? (
        <EquationReferenceDialog
          equations={numberedEquations}
          onClose={() => setReferenceDialogOpen(false)}
          onInsert={insertEquationReference}
        />
      ) : null}

      {cloudDialogOpen ? (
        <CloudDialog
          configured={cloudConfigured}
          userEmail={cloudUserEmail}
          documents={cloudDocuments}
          activeDocumentId={cloudDocumentId}
          loading={cloudLoading}
          onClose={() => setCloudDialogOpen(false)}
          onSendLogin={sendCloudLoginLink}
          onSignOut={signOutCloudHandler}
          onSaveCurrent={saveCurrentToCloud}
          onOpenDocument={openCloudDocumentHandler}
          onDeleteDocument={deleteCloudDocumentHandler}
          onRefresh={() => refreshCloudDocuments(false)}
        />
      ) : null}

      {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
    </div>
  );
}













