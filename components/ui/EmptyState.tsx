import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: Props) {
  return (
    <div
      className="rounded-md border p-8 text-center"
      style={{
        background: "var(--color-surface-1)",
        color: "var(--color-fg-muted)",
        borderColor: "var(--color-border)",
      }}
    >
      {title && <div className="text-sm mb-1" style={{ color: "var(--color-fg)" }}>{title}</div>}
      <div className="text-xs">{children}</div>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
