import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { builtInTemplates } from "../formula/templates";
import { parseFormula } from "../formula/parser";
import type { FormulaTemplate } from "../formula/types";

interface TemplateDialogProps {
  existing: FormulaTemplate[];
  onClose: () => void;
  onSave: (template: FormulaTemplate) => void;
}

function parseParams(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TemplateDialog({ existing, onClose, onSave }: TemplateDialogProps) {
  const [name, setName] = useState("mytemplate");
  const [label, setLabel] = useState("我的模板");
  const [description, setDescription] = useState("把自定义写法展开成标准公式。");
  const [paramText, setParamText] = useState("a,b,body");
  const [expansion, setExpansion] = useState("sum_(i=$1)^{$2}{$3}");
  const [example, setExample] = useState("mytemplate(1,n){i^2}");
  const [validationError, setValidationError] = useState("");

  const params = useMemo(() => parseParams(paramText), [paramText]);

  const save = () => {
    const cleanName = name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanName)) {
      setValidationError("触发词只能使用英文字母、数字和下划线，且不能以数字开头。");
      return;
    }
    if (builtInTemplates.some((template) => template.name === cleanName)) {
      setValidationError("这个触发词属于内置模板，请换一个名字。");
      return;
    }
    if (existing.some((template) => template.name === cleanName)) {
      setValidationError("已经存在同名模板。");
      return;
    }
    if (params.length === 0) {
      setValidationError("至少需要一个参数。");
      return;
    }
    if (!expansion.trim()) {
      setValidationError("请填写展开表达式。");
      return;
    }

    const highestPlaceholder = Math.max(
      0,
      ...Array.from(expansion.matchAll(/\$(\d+)/g)).map((match) => Number(match[1]))
    );
    if (highestPlaceholder > params.length) {
      setValidationError(`展开表达式引用了 $${highestPlaceholder}，但只定义了 ${params.length} 个参数。`);
      return;
    }

    const samples = ["1", "n", "x", "y", "z"];
    const testExpansion = expansion.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
      return samples[Number(rawIndex) - 1] ?? "1";
    });

    try {
      parseFormula(testExpansion, builtInTemplates);
    } catch (error) {
      setValidationError(`展开表达式无法解析：${errorMessage(error)}`);
      return;
    }

    const template: FormulaTemplate = {
      id: crypto.randomUUID(),
      name: cleanName,
      label: label.trim() || cleanName,
      description: description.trim(),
      params,
      expansion: expansion.trim(),
      example: example.trim() || `${cleanName}(${params.map((_, index) => (index === 0 ? "1" : "n")).join(",")})`
    };
    onSave(template);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="创建自定义公式模板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">PERSONAL MACRO</p>
            <h2>创建自定义模板</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="template-form-grid">
          <label>
            <span className="field-label">触发词</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="sigma" />
          </label>
          <label>
            <span className="field-label">显示名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="我的求和" />
          </label>
          <label className="full-span">
            <span className="field-label">参数</span>
            <input
              value={paramText}
              onChange={(event) => setParamText(event.target.value)}
              placeholder="下限, 上限, 正文"
            />
            <span className="field-hint">用逗号分隔。最后一个参数通常会接收花括号中的正文。</span>
          </label>
          <label className="full-span">
            <span className="field-label">展开表达式</span>
            <textarea
              className="template-expansion-input"
              value={expansion}
              spellCheck={false}
              onChange={(event) => setExpansion(event.target.value)}
              placeholder="sum_(i=$1)^{$2}{$3}"
            />
            <span className="field-hint">
              使用 $1、$2、$3 引用参数。这里使用线性公式语法，而不是 LaTeX。
            </span>
          </label>
          <label className="full-span">
            <span className="field-label">使用示例</span>
            <input
              value={example}
              onChange={(event) => setExample(event.target.value)}
              placeholder="mytemplate(1,n){i^2}"
            />
          </label>
          <label className="full-span">
            <span className="field-label">说明</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <div className="template-note">
          <strong>示例：</strong>
          定义 <code>sigma(下限, 上限, 正文)</code>，展开为
          <code>{"sum_(i=$1)^{$2}{$3}"}</code>。之后输入
          <code>{"sigma(1,n){i^2}"}</code>，按 <kbd>Ctrl</kbd> + <kbd>Enter</kbd> 即可转换。
        </div>

        {validationError ? <div className="formula-error">{validationError}</div> : null}

        <footer className="modal-footer">
          <span className="footer-hint">模板只影响输入，公式会保存展开后的结果。</span>
          <div className="footer-actions-right">
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button type="button" className="primary-button" onClick={save}>
              <Plus size={16} /> 保存模板
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}


