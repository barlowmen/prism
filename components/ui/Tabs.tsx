"use client";

import type { ReactNode } from "react";

/**
 * Top-level tab strip — used as the primary navigation inside Job
 * detail, Prep workspace, and Truth Base. Active tab carries both a
 * surface-1 background pill and a 2px accent underline that overlaps
 * the strip's border-bottom.
 *
 * The whole pattern previously existed in three near-identical
 * implementations across jobs/[id]/view.tsx, prep/[company]/view.tsx,
 * and truth-base/editor.tsx. Consolidate here so a future change
 * affects all three at once.
 */

type Props = {
  children: ReactNode;
  className?: string;
};

export function TabStrip({ children, className }: Props) {
  return (
    <div
      className={`border-b flex items-center flex-wrap gap-1 ${className ?? ""}`}
      role="tablist"
    >
      {children}
    </div>
  );
}

type TabProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
};

export function Tab({ active, onClick, children, size = "md" }: TabProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`${size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs"} transition-colors -mb-px border-b-2`}
      style={{
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        borderBottomColor: active ? "var(--color-accent)" : "transparent",
        background: active ? "var(--color-surface-1)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Secondary tab strip — used when an active primary tab needs to
 * surface its own children (e.g. Job-detail "Posting" group splitting
 * into JD / classification / questions). Sits below the primary strip
 * with no border, smaller text, surface-2 background for the active
 * pill.
 */
export function SubTabStrip({ children, className }: Props) {
  return (
    <div
      className={`flex items-center flex-wrap gap-1 pl-1 ${className ?? ""}`}
      role="tablist"
    >
      {children}
    </div>
  );
}

type SubTabProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  mono?: boolean;
};

export function SubTab({ active, onClick, children, mono }: SubTabProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="px-2 py-1 text-[11px] rounded-md transition-colors"
      style={{
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        background: active ? "var(--color-surface-2)" : "transparent",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </button>
  );
}
