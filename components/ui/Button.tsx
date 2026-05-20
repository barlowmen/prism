"use client";

/**
 * The single button primitive. Wraps a native <button> with the design
 * system's color tokens + spacing scale. All buttons in prism go
 * through this — keeps focus/disabled/hover behavior uniform.
 *
 * Four variants, each tied to a token from app/globals.css:
 *   - primary  — accent (amber) background. The one real CTA per surface.
 *                Use sparingly; competing primaries flatten hierarchy.
 *   - secondary (default) — surface-1 background with a thin border.
 *                Most buttons.
 *   - ghost    — transparent + muted text. For tertiary actions that
 *                shouldn't draw the eye (e.g. Cancel in a modal footer).
 *   - danger   — err-tone outline. For destructive verbs (Delete, etc.).
 *
 * Two sizes: sm (compact, used in tight rows / pills) and md (default).
 *
 * forwardRef is here so callers can attach a ref for focus management
 * (e.g. autofocusing a modal's primary action on open).
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", icon, trailingIcon, children, className, style, ...rest },
  ref,
) {
  const palette =
    variant === "primary"
      ? {
          background: "var(--color-accent)",
          color: "var(--color-bg)",
          borderColor: "var(--color-accent)",
        }
      : variant === "danger"
        ? {
            background: "transparent",
            color: "var(--color-err)",
            borderColor: "var(--color-err)",
            opacity: 0.85,
          }
        : variant === "ghost"
          ? {
              background: "transparent",
              color: "var(--color-fg-muted)",
              borderColor: "transparent",
            }
          : {
              background: "var(--color-surface-1)",
              color: "var(--color-fg)",
              borderColor: "var(--color-border)",
            };
  return (
    <button
      ref={ref}
      className={`${SIZES[size]} rounded-md border transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 ${className ?? ""}`}
      style={{ ...palette, ...style }}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
});
