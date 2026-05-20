/**
 * Boxed message with a tone-colored left edge. Used for every banner-y
 * affordance in the app — "X folders not yet imported", "Anthropic
 * rate-limited", "Base resume ready", first-time hints, etc.
 *
 * Four tones, each tied to an oklch token in app/globals.css:
 *   - info   — neutral surface, used for orientation / status with no
 *              urgency (e.g. "How prism works", "All caught up").
 *   - accent — amber. Real CTAs that aren't problems (Generate, Approve).
 *   - warn   — amber-orange. "You should look at this" but not broken
 *              (stalled loops, missing DOCX, queued items).
 *   - err    — red. Something actually broke (failed runs, errored Jobs).
 *
 * Layout: left border = tone color (2px), light tone background, title
 * row, body in fg-muted. Optional `action` slot on the right for a
 * single button (e.g. "Re-dispatch all" next to an errored banner).
 */
import type { ReactNode } from "react";

type Tone = "info" | "accent" | "warn" | "err";

type Props = {
  tone: Tone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

const TONE_BORDER: Record<Tone, string> = {
  info: "var(--color-border-strong)",
  accent: "var(--color-accent)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
};

const TONE_BG: Record<Tone, string> = {
  info: "var(--color-surface-1)",
  accent: "var(--color-accent-bg)",
  warn: "var(--color-surface-1)",
  err: "var(--color-surface-1)",
};

const TONE_TITLE: Record<Tone, string> = {
  info: "var(--color-fg)",
  accent: "var(--color-accent)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
};

export function Callout({ tone, title, children, action, className }: Props) {
  return (
    <div
      className={`rounded-md border-l-2 border p-4 flex items-start justify-between gap-4 ${className ?? ""}`}
      style={{
        background: TONE_BG[tone],
        borderColor: "var(--color-border)",
        borderLeftColor: TONE_BORDER[tone],
      }}
    >
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-sm font-medium mb-1" style={{ color: TONE_TITLE[tone] }}>
            {title}
          </div>
        )}
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
