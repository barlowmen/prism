/**
 * Label/value definition-list row. Used in metadata panels — Health,
 * Job detail header, archetype edit summary — anywhere we show
 * "field: value" pairs in a stack rather than a table.
 *
 * Value truncates by default with a native browser tooltip showing the
 * full string. fullWidthValue=true bypasses truncation when the value
 * is a path you want to be readable at a glance.
 *
 * `tone` colors only the value, not the label — keeps the label always
 * readable while letting numeric/status values pop (e.g. "Status: ok"
 * green, "Tokens used: 1.2M" warn).
 */
import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "err" | "muted" | "accent";

type Props = {
  label: ReactNode;
  value: ReactNode;
  sublabel?: ReactNode;
  mono?: boolean;
  tone?: Tone;
  /** Render value with no `truncate`, useful for paths. */
  fullWidthValue?: boolean;
};

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  muted: "var(--color-fg-muted)",
  accent: "var(--color-accent)",
};

export function Row({ label, value, sublabel, mono, tone, fullWidthValue }: Props) {
  return (
    <div className="flex items-start justify-between text-xs py-1 gap-3">
      <div className="min-w-0">
        <div style={{ color: "var(--color-fg-muted)" }}>{label}</div>
        {sublabel && (
          <div
            className="font-mono"
            style={{ color: "var(--color-fg-muted)", fontSize: "10px" }}
          >
            {sublabel}
          </div>
        )}
      </div>
      <div
        className={`text-right ${fullWidthValue ? "" : "truncate max-w-[60%]"}`}
        style={{
          color: tone ? TONE_COLOR[tone] : undefined,
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}
