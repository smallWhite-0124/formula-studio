import { Bookmark, X } from "lucide-react";
import type { EquationInfo } from "../editor/equations";

interface EquationReferenceDialogProps {
  equations: EquationInfo[];
  onClose: () => void;
  onInsert: (label: string) => void;
}

export function EquationReferenceDialog({ equations, onClose, onInsert }: EquationReferenceDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card reference-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="引用公式"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">EQUATION REFERENCE</p>
            <h2>引用公式</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        {equations.length === 0 ? (
          <div className="cloud-empty">
            <Bookmark size={28} />
            <h3>还没有编号公式</h3>
            <p>先插入一个独立公式，点击编辑，然后开启“自动编号”。</p>
          </div>
        ) : (
          <div className="reference-list">
            {equations.map((equation) => (
              <button
                type="button"
                className="reference-item"
                key={`${equation.label}-${equation.position}`}
                onClick={() => onInsert(equation.label)}
              >
                <span className="reference-number">({equation.number})</span>
                <span className="reference-label">{equation.label}</span>
                <code>{equation.source || "未提供源码"}</code>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
