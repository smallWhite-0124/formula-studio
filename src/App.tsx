import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Braces,
  Copy,
  Download,
  Heading1,
  Heading2,
  Italic,
  List,
  Plus,
  Redo2,
  RotateCcw,
  Sigma,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormulaEditorDialog } from "./components/FormulaEditorDialog";
import { MathLivePreview } from "./components/MathLivePreview";
import { TemplateDialog } from "./components/TemplateDialog";
import { FormulaNode, type FormulaEditDetail } from "./editor/FormulaNode";
import { buildDocxBlob, downloadBlob } from "./export/docx";
import { importDocx } from "./import/docxImport";
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
  "align(x=1;y=2)"
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

function formulaAttrs(parsed: ParsedFormula, displayMode = false) {
  return {
    source: parsed.source,
    latex: parsed.latex,
    omml: toOmml(parsed.ast),
    displayMode
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
  const [customTemplates, setCustomTemplates] = useState<FormulaTemplate[]>(loadCustomTemplates);
  const [documentTitle, setDocumentTitle] = useState(() => localStorage.getItem(DOCUMENT_TITLE_KEY) || '公式文档');
  const [isImporting, setIsImporting] = useState(false);
  const [labSource, setLabSource] = useState(INITIAL_SOURCE);
  const [insertDisplayMode, setInsertDisplayMode] = useState(false);
  const [editingFormula, setEditingFormula] = useState<FormulaEditDetail | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [, setRevision] = useState(0);
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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const editor = useEditor({
    extensions: [StarterKit, FormulaNode],
    content: loadDocument(),
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
    (parsed: ParsedFormula, displayMode = false) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({ type: "formula", attrs: formulaAttrs(parsed, displayMode) })
        .insertContent(" ")
        .run();
      showToast(displayMode ? "独立公式已插入文档。" : "行内公式已插入文档。", "success");
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

  const saveEditedFormula = (source: string, parsed: ParsedFormula, displayMode: boolean) => {
    if (!editor || !editingFormula) return;
    const node = editor.state.doc.nodeAt(editingFormula.position);
    if (!node || node.type.name !== "formula") {
      showToast("找不到正在编辑的公式，请重试。", "error");
      setEditingFormula(null);
      return;
    }

    const transaction = editor.state.tr.setNodeMarkup(editingFormula.position, undefined, {
      source,
      latex: parsed.latex,
      omml: toOmml(parsed.ast),
      displayMode
    });
    editor.view.dispatch(transaction);
    setEditingFormula(null);
    showToast("公式已更新。", "success");
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
      const result = await importDocx(file);
      editor.commands.setContent(result.content, { emitUpdate: true });
      setDocumentTitle(result.title);
      localStorage.setItem(DOCUMENT_TITLE_KEY, result.title);
      const warningText = result.warnings.length > 0 ? ` ${result.warnings.slice(0, 2).join(" ")}` : "";
      showToast(
        `已导入 ${result.paragraphCount} 个段落、${result.formulaCount} 个 OMML 公式。${warningText}`,
        result.warnings.length > 0 ? "info" : "success",
        6500
      );
    } catch (error) {
      showToast(`导入失败：${errorMessage(error)}`, "error", 5000);
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const exportDocx = async () => {
    if (!editor) return;
    try {
      const document = editor.getJSON();
      const title = documentTitle || firstHeadingText(document);
      const blob = await buildDocxBlob(document, title);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, "-")}-${date}.docx`);
      showToast("DOCX 已导出，公式以 OMML 写入。", "success");
    } catch (error) {
      showToast(`导出失败：${errorMessage(error)}`, "error");
    }
  };

  const resetDocument = () => {
    if (!editor) return;
    if (!window.confirm("确定要清空当前文档并恢复示例内容吗？")) return;
    editor.commands.setContent(INITIAL_DOCUMENT, { emitUpdate: true });
    setDocumentTitle("公式文档");
    localStorage.setItem(DOCUMENT_TITLE_KEY, "公式文档");
    showToast("文档已重置。", "info");
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
                  insertFormula(labResult.parsed, insertDisplayMode);
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
                className={!insertDisplayMode ? "is-active" : ""}
                onClick={() => setInsertDisplayMode(false)}
              >
                行内
              </button>
              <button
                type="button"
                className={insertDisplayMode ? "is-active" : ""}
                onClick={() => setInsertDisplayMode(true)}
              >
                独立
              </button>
            </div>

            <div className="lab-actions">
              <button
                type="button"
                className="primary-button grow-button"
                disabled={!labResult.parsed}
                onClick={() => labResult.parsed && insertFormula(labResult.parsed, insertDisplayMode)}
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

            <span className="toolbar-tip">选中文本后按 Ctrl + Enter</span>
          </div>

          <div className="paper-wrap">
            <article className="paper">
              <EditorContent editor={editor} />
            </article>
          </div>

          <footer className="status-bar">
            <span className="status-dot" />
            <span>本地自动保存</span>
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

      {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
    </div>
  );
}












