import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface WordPreviewDialogProps {
  originalBuffer: ArrayBuffer;
  formulaOmml: string[];
  onClose: () => void;
}

export function WordPreviewDialog({ originalBuffer, formulaOmml, onClose }: WordPreviewDialogProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;
    const style = styleRef.current;
    if (!body) return;

    const render = async () => {
      setLoading(true);
      setError("");
      setWarning("");
      body.innerHTML = "";
      if (style) style.innerHTML = "";

      try {
        let data: ArrayBuffer | Blob = originalBuffer;
        try {
          const { exportPatchedDocx } = await import("../export/docxPatch");
          const patched = await exportPatchedDocx(originalBuffer, formulaOmml);
          data = patched.blob;
        } catch (patchError) {
          setWarning(
            patchError instanceof Error
              ? `${patchError.message} 当前预览使用原始文档。`
              : "公式数量变化，当前预览使用原始文档。"
          );
        }

        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;
        await renderAsync(data, body, style ?? undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: true,
          renderChanges: true,
          useBase64URL: true,
          className: "docx-preview"
        });
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : String(renderError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
      body.innerHTML = "";
      if (style) style.innerHTML = "";
    };
  }, [originalBuffer, formulaOmml, reloadKey]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card word-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Word 保真预览"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">FAITHFUL WORD PREVIEW</p>
            <h2>Word 保真预览</h2>
          </div>
          <div className="preview-header-actions">
            <button type="button" className="secondary-button" onClick={() => setReloadKey((value) => value + 1)}>
              刷新预览
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
              <X size={18} />
            </button>
          </div>
        </header>

        <p className="word-preview-note">
          使用原始 DOCX 渲染。表格、图片、页眉页脚、分页、批注和修订会按 Word 文件内容显示。
        </p>

        {warning ? (
          <div className="word-preview-warning">
            <AlertTriangle size={15} /> {warning}
          </div>
        ) : null}

        {error ? <div className="formula-error">Word 预览失败：{error}</div> : null}

        {loading ? (
          <div className="word-preview-loading">
            <LoaderCircle size={24} className="spin" /> 正在生成 Word 预览…
          </div>
        ) : null}

        <div className="docx-preview-style" ref={styleRef} />
        <div className="docx-preview-viewport">
          <div className="docx-preview-body" ref={bodyRef} />
        </div>
      </section>
    </div>
  );
}
