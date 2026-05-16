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
