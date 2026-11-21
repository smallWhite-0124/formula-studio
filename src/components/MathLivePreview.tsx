import type { MathfieldElement } from "mathlive";
import React, { useEffect, useRef } from "react";

interface MathLivePreviewProps {
  latex: string;
  className?: string;
  readOnly?: boolean;
  syncKey?: number;
  onChange?: (latex: string, asciiMath: string) => void;
}

export function MathLivePreview({
  latex,
  className,
  readOnly = false,
  syncKey,
  onChange
}: MathLivePreviewProps) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const lastSyncKeyRef = useRef<number | null>(null);

  useEffect(() => {
    void import("mathlive");
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.readOnly = readOnly;
  }, [readOnly]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (syncKey !== undefined && lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey ?? null;
    if (field.value !== latex) field.value = latex;
  }, [latex, syncKey]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !onChange) return;
    const handleInput = () => {
      let asciiMath = "";
      try {
        asciiMath = field.getValue("ascii-math");
      } catch {
        asciiMath = field.value;
      }
      onChange(field.value, asciiMath);
    };
    field.addEventListener("input", handleInput);
    return () => field.removeEventListener("input", handleInput);
  }, [onChange]);

  return (
    <div className={["mathlive-shell", className].filter(Boolean).join(" ")}>
      {React.createElement("math-field", {
        ref: fieldRef,
        class: "mathlive-field",
        "math-virtual-keyboard-policy": "manual",
        "aria-label": "公式可视化编辑区"
      })}
    </div>
  );
}

