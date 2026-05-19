"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import type { ArchetypeSummary } from "@/lib/archetypes/types";

export function ArchetypesList({ initial }: { initial: ArchetypeSummary[] }) {
  if (initial.length === 0) {
    return (
      <div className="space-y-3">
        <Callout tone="accent" title="No archetypes yet">
          The dispatcher can&apos;t pick a base resume until you create at
          least one. Each archetype points at a base resume DOCX in your
          workspace and carries matching hints the dispatcher uses to pick
          which one fits a given posting.
        </Callout>
        <div className="flex items-center gap-2">
          <Link href="/settings/archetypes/new">
            <Button variant="primary">New archetype</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {initial.map((a) => (
        <li
          key={a.key}
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: a.baseResumeExists
              ? "var(--color-border)"
              : "var(--color-warn)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <Link
                  href={`/settings/archetypes/${encodeURIComponent(a.key)}`}
                  className="text-sm font-medium hover:underline"
                >
                  {a.label}
                </Link>
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  {a.key}
                </span>
              </div>
              {a.description ? (
                <p
                  className="text-xs mt-1 line-clamp-2"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  {a.description}
                </p>
              ) : (
                <p
                  className="text-xs mt-1 italic"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  No description
                </p>
              )}
              <div
                className="mt-2 flex items-center gap-3 text-[11px] font-mono"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {a.baseResumePath ? (
                  <>
                    <span>{a.baseResumePath}</span>
                    <span
                      className="inline-flex items-center gap-1"
                      style={{
                        color: a.baseResumeExists
                          ? "var(--color-ok)"
                          : "var(--color-warn)",
                      }}
                    >
                      {!a.baseResumeExists && (
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      )}
                      {a.baseResumeExists
                        ? `${fmtBytes(a.baseResumeSize!)} · ${new Date(a.baseResumeMtimeMs!).toLocaleDateString()}`
                        : "missing on disk"}
                    </span>
                  </>
                ) : (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: "var(--color-warn)" }}
                  >
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    no base DOCX set
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/settings/archetypes/${encodeURIComponent(a.key)}`}
              className="shrink-0"
            >
              <Button>Edit</Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
