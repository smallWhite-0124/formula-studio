import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { resolveEquationNumber } from "./equations";

function EquationReferenceView(props: NodeViewProps) {
  const label = String(props.node.attrs.label ?? "");
  const [number, setNumber] = useState<number | null>(() =>
    resolveEquationNumber(props.editor.state.doc, label)
  );

  useEffect(() => {
    const update = () => setNumber(resolveEquationNumber(props.editor.state.doc, label));
    update();
    props.editor.on("transaction", update);
    return () => {
      props.editor.off("transaction", update);
    };
  }, [label, props.editor]);

  return (
    <NodeViewWrapper
      as="span"
      className="equation-reference"
      contentEditable={false}
      title={number ? `引用公式 ${label}（第 ${number} 式）` : `未找到公式标签 ${label}`}
    >
      ({number ?? "?"})
    </NodeViewWrapper>
  );
}

export const EquationReferenceNode = Node.create({
  name: "equationReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: { default: "" }
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-equation-reference]",
        getAttrs: (element) => ({
          label: (element as HTMLElement).getAttribute("data-label") ?? ""
        })
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-equation-reference": "true",
        "data-label": HTMLAttributes.label,
        class: "equation-reference"
      }),
      `((${HTMLAttributes.label}))`
    ];
  },

  renderText({ node }) {
    return `@eq(${node.attrs.label})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(EquationReferenceView);
  }
});
