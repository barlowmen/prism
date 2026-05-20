/**
 * Top-of-page header pattern used everywhere — Dashboard, Settings
 * subpages, Job detail, Prep, etc. Three slots: title (h1, big),
 * description (one-liner sub), actions (right-side button cluster).
 *
 * Kept narrow on purpose. Different surfaces vary wildly in what they
 * need below the header; this just owns the title row so they all
 * look the same.
 *
 * SectionEyebrow is the smaller all-caps label used to demarcate
 * sub-sections within a page (e.g. "INBOX", "IN PROGRESS" on the
 * kanban). Same muted color, uppercase tracking, no border.
 */
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header className={`mb-6 flex items-start justify-between gap-4 ${className ?? ""}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-xs font-medium uppercase tracking-wider mb-3"
      style={{ color: "var(--color-fg-muted)" }}
    >
      {children}
    </h2>
  );
}
