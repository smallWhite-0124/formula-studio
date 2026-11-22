import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import katex from "katex";
import { Braces, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { equationNumberAtPosition } from "./equations";

export interface FormulaAttrs {
  source: string;
  latex: string;
  omml: string;
  displayMode: boolean;
  numbering: boolean;
  label: string;
}

export interface FormulaEditDetail {
  position: number;
  source: string;
  displayMode: boolean;
  numbering: boolean;
  label: string;
}

function FormulaNodeView(props: NodeViewProps) {
  const source = String(props.node.attrs.source ?? "");
  const latex = String(props.node.attrs.latex ?? "");
  const displayMode = Boolean(props.node.attrs.displayMode ?? false);
  const numbering = Boolean(props.node.attrs.numbering ?? false);
  const label = String(props.node.attrs.label ?? "");
  const [equationNumber, setEquationNumber] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const position = props.getPos();
      setEquationNumber(
        typeof position === "number" ? equationNumberAtPosition(props.editor.state.doc, position) : null
      );
    };
    update();
    props.editor.on("transaction", update);
    return () => {
      props.editor.off("transaction", update);
    };
  }, [displayMode, label, numbering, props.editor]);

  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        throwOnError: true,
        displayMode,
        strict: false,
        output: "html"
      });
    } catch {
      return "";
    }
  }, [latex, displayMode]);

  const getPosition = () => {
    const position = props.getPos();
    return typeof position === "number" ? position : null;
  };

  const selectFormula = () => {
    const position = getPosition();
    if (position === null) return;
    props.editor.chain().focus().setNodeSelection(position).run();
  };

  const openEditor = () => {
    const position = getPosition();
    if (position === null) return;
    selectFormula();
    window.dispatchEvent(
      new CustomEvent<FormulaEditDetail>("formula:edit", {
        detail: { position, source, displayMode, numbering, label }
      })
    );
  };

  const restoreSource = () => {
    const position = getPosition();
    if (position === null) return;
    props.editor
      .chain()
      .focus()
      .insertContentAt(
        { from: position, to: position + props.node.nodeSize },
        source
      )
      .run();
  };

  const stopButtonEvent = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`formula-node${displayMode ? " formula-node-block" : ""}`}
      contentEditable={false}
      data-formula-node="true"
      title="单击选中公式；双击编辑；右侧按钮可还原源码"
      onClick={selectFormula}
      onDoubleClick={openEditor}
    >
      {html ? (
        <span className="formula-render" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className="formula-fallback">{source}</span>
      )}
      {numbering && displayMode ? (
        <span className="formula-equation-number">({equationNumber ?? "?"})</span>
      ) : null}
      <span className="formula-actions">
        <button
          type="button"
          className="formula-action-button"
          contentEditable={false}
          title="编辑公式"
          aria-label="编辑公式"
          onMouseDown={stopButtonEvent}
          onClick={(event) => {
            stopButtonEvent(event);
            openEditor();
          }}
        >
          <Pencil size={12} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="formula-action-button"
          contentEditable={false}
          title="还原为线性源码"
          aria-label="还原为线性源码"
          onMouseDown={stopButtonEvent}
          onClick={(event) => {
            stopButtonEvent(event);
            restoreSource();
          }}
        >
          <Braces size={12} strokeWidth={2.2} />
        </button>
      </span>
    </NodeViewWrapper>
  );
}

export const FormulaNode = Node.create({
  name: "formula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: { default: "" },
      latex: { default: "" },
      omml: { default: "" },
      displayMode: { default: false },
      numbering: { default: false },
      label: { default: "" }
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-formula]",
        getAttrs: (element) => {
          const htmlElement = element as HTMLElement;
          return {
            source: htmlElement.getAttribute("data-source") ?? "",
            latex: htmlElement.getAttribute("data-latex") ?? "",
            omml: htmlElement.getAttribute("data-omml") ?? "",
            displayMode: htmlElement.getAttribute("data-display-mode") === "true",
            numbering: htmlElement.getAttribute("data-numbering") === "true",
            label: htmlElement.getAttribute("data-label") ?? ""
          };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-formula": "true",
        "data-source": HTMLAttributes.source,
        "data-latex": HTMLAttributes.latex,
        "data-omml": HTMLAttributes.omml,
        "data-display-mode": String(Boolean(HTMLAttributes.displayMode)),
        "data-numbering": String(Boolean(HTMLAttributes.numbering)),
        "data-label": HTMLAttributes.label,
        "data-formula-id": HTMLAttributes.label,
        class: "formula-node"
      }),
      HTMLAttributes.source
    ];
  },

  renderText({ node }) {
    return String(node.attrs.source ?? "");
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaNodeView);
  }
});
