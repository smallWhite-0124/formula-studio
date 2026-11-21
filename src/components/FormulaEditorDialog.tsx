import { Braces, Copy, Keyboard, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseFormula } from "../formula/parser";
import { toOmml } from '../formula/omml';
import { mathLiveLatexToLinear } from '../formula/mathlive';
import type { FormulaParseError, FormulaTemplate, ParsedFormula } from "../formula/types";
import { MathLivePreview } from "./MathLivePreview";

interface FormulaEditorDialogProps {
  title: string;
  initialSource: string;
  templates: FormulaTemplate[];
  onClose: () => void;
  onSave: (source: string, parsed: ParsedFormula) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function FormulaEditorDialog({
  title,
  initialSource,
  templates,
  onClose,
  onSave
}: FormulaEditorDialogProps) {
  const [source, setSource] = useState(initialSource);
  const [copyState, setCopyState] = useState<"latex" | "omml" | null>(null);
  const [syncKey, setSyncKey] = useState(0);

  const result = useMemo(() => {
    try {
      return { parsed: parseFormula(source, templates), error: "" };
    } catch (error) {
      return { parsed: null, error: errorMessage(error) };
    }
  }, [source, templates]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && result.parsed) {
        event.preventDefault();
        onSave(source, result.parsed);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result.parsed, onClose, onSave, source]);

  const copy = async (kind: "latex" | "omml") => {
    if (!result.parsed) return;
    const value = kind === "latex" ? result.parsed.latex : toOmml(result.parsed.ast);
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopyState(kind);
    window.setTimeout(() => setCopyState(null), 1200);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card formula-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">FORMULA</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="formula-dialog-grid">
          <div className="field-column">
            <label className="field-label" htmlFor="formula-source">
              线性输入
            </label>
            <textarea
              id="formula-source"
              autoFocus
              className="formula-source-input"
              value={source}
              spellCheck={false}
              onChange={(event) => {
                setSource(event.target.value);
                setSyncKey((value) => value + 1);
              }}
              placeholder="例如：sigma(1,n){i^2} + a/b"
            />
            <p className="field-hint">
              支持上下标、分数、根号、求和、积分，以及你保存的自定义模板。
            </p>
          </div>

          <div className="preview-column">
            <div className="field-label-row">
              <span className="field-label">MathLive 可视化编辑</span>
              <span className="preview-badge">可直接输入</span>
            </div>
            <MathLivePreview
              latex={result.parsed?.latex ?? ""}
              syncKey={syncKey}
              onChange={(mathLiveLatex, asciiMath) => {
                const candidates = [asciiMath.trim(), mathLiveLatexToLinear(mathLiveLatex)].filter(Boolean);
                let nextSource = candidates.at(-1) ?? "";
                for (const candidate of candidates) {
                  try {
                    parseFormula(candidate, templates);
                    nextSource = candidate;
                    break;
                  } catch {
                    // Try the next representation before showing a syntax error.
                  }
                }
                if (nextSource) setSource(nextSource);
              }}
            />
            <p className="field-hint visual-edit-hint">
              可直接用键盘或虚拟键盘修改公式，修改会同步回左侧线性源码。
            </p>
            <div className="latex-preview">
              <span>LaTeX</span>
              <code>{result.parsed?.latex || "—"}</code>
            </div>
          </div>
        </div>

        {result.error ? <div className="formula-error">{result.error}</div> : null}

        {result.parsed?.usedTemplates.length ? (
          <div className="template-usage">
            使用了：
            {result.parsed.usedTemplates.map((name) => (
              <span key={name} className="template-pill">
                {name}
              </span>
            ))}
          </div>
        ) : null}

        <footer className="modal-footer">
          <div className="footer-actions-left">
            <button
              type="button"
              className="ghost-button"
              disabled={!result.parsed}
              onClick={() => void copy("latex")}
            >
              <Copy size={15} /> {copyState === "latex" ? "已复制" : "复制 LaTeX"}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!result.parsed}
              onClick={() => void copy("omml")}
            >
              <Braces size={15} /> {copyState === "omml" ? "已复制" : "复制 OMML"}
            </button>
            <button type="button" className="ghost-button" onClick={showVirtualKeyboard}>
              <Keyboard size={15} /> 虚拟键盘
            </button>
          </div>
          <div className="footer-actions-right">
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!result.parsed}
              onClick={() => result.parsed && onSave(source, result.parsed)}
            >
              保存公式
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function showVirtualKeyboard() {
  const keyboard = window.mathVirtualKeyboard;
  if (!keyboard) return;
  keyboard.show();
}



