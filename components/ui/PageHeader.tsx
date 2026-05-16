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
