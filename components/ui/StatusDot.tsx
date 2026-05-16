import type { CSSProperties } from "react";

type Tone = "ok" | "warn" | "err" | "accent" | "muted";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  accent: "var(--color-accent)",
  muted: "var(--color-fg-muted)",
};

type Props = {
  tone?: Tone;
  pulsing?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function StatusDot({ tone = "accent", pulsing, size = 6, className, style }: Props) {
  return (
    <span
      className={`inline-block rounded-full align-middle ${pulsing ? "animate-[pulse_1.5s_ease-in-out_infinite]" : ""} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: TONE_COLOR[tone],
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
