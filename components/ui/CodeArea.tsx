"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * Monospace textarea — the canonical "type or paste markdown / code"
 * input. Previously hand-rolled in 6+ places with subtle styling drift
 * (`px-2 py-1.5` vs `p-4`, `surface-1` vs `surface-2`, varying minHeights).
 *
 * Defaults: surface-1 background, monospace font, rounded-md border,
 * 14px text, vertical resize. Pass `surface="surface-2"` for the
 * darker variant used inside Callout panels. Pass `minHeight` and
 * `className` to override.
 */

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  surface?: "surface-1" | "surface-2";
  minHeight?: number | string;
};

export const CodeArea = forwardRef<HTMLTextAreaElement, Props>(function CodeArea(
  { surface = "surface-1", minHeight = 100, className, style, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      className={`w-full px-3 py-2 rounded-md border text-sm leading-relaxed ${className ?? ""}`}
      style={{
        background:
          surface === "surface-2"
            ? "var(--color-surface-2)"
            : "var(--color-surface-1)",
        fontFamily: "var(--font-mono)",
        minHeight,
        resize: "vertical",
        tabSize: 2,
        ...style,
      }}
      {...rest}
    />
  );
});
