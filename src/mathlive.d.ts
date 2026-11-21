import type { MathfieldElement } from "mathlive";
import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement> & {
        ref?: React.Ref<MathfieldElement>;
        "math-virtual-keyboard-policy"?: "auto" | "manual" | "onfocus" | "off";
      };
    }
  }
}
