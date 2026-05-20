/**
 * Tiny pill for inline status / metadata text. Smaller and quieter
 * than a button — used in row metadata ("suggested: skip",
 * "subscription", "rate-limited") and per-card chips on the dashboard.
 *
 * Six tones, all share the same surface-2 chip background; the tone
 * just changes the text color. Default tone (undefined color) inherits
 * from context. Monospace by default since most of what shows up here
 * is status keys / counts / paths.
 */
import type { ReactNode } from "react";

type Tone = "default" | "ok" | "warn" | "err" | "accent" | "muted";

type Props = {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
};

const TONE_COLOR: Record<Tone, string | undefined> = {
  default: undefined,
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  accent: "var(--color-accent)",
  muted: "var(--color-fg-muted)",
};

export function StatusBadge({ children, tone = "default", mono = true }: Props) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px]"
      style={{
        background: "var(--color-surface-2)",
        color: TONE_COLOR[tone],
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </span>
  );
}
