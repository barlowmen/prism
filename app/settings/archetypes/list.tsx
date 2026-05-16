"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";
import type { ArchetypeSummary } from "@/lib/archetypes/types";

export function ArchetypesList({ initial }: { initial: ArchetypeSummary[] }) {
  const router = useRouter();
  const [archetypes] = useState<ArchetypeSummary[]>(initial);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const seed = async () => {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const r = await fetch("/api/archetypes/seed", { method: "POST" });
      const data = await r.json();
      const parts: string[] = [];
      if (data.created?.length) parts.push(`created: ${data.created.join(", ")}`);
      if (data.skipped?.length) parts.push(`already existed: ${data.skipped.join(", ")}`);
      if (data.missing?.length)
        parts.push(`skipped (base DOCX missing): ${data.missing.join(", ")}`);
      setSeedMsg(parts.join(" · ") || "nothing to seed");
      router.refresh();
    } catch (e) {
      setSeedMsg(`error: ${String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  if (archetypes.length === 0) {
    return (
      <div className="space-y-3">
        <Callout tone="accent" title="No archetypes yet">
          The dispatcher can&apos;t pick a base resume until you create at least
          one. If you already have DOCXes in{" "}
          <code className="text-xs">_resumes/</code> from the original workflow,
          try the seed action below.
        </Callout>
        <div className="flex items-center gap-2">
          <Button onClick={seed} disabled={seeding}>
            {seeding ? "Seeding…" : "Seed from existing _resumes/"}
          </Button>
          <Link href="/settings/archetypes/new">
            <Button>Start from scratch</Button>
          </Link>
        </div>
        {seedMsg && (
          <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            {seedMsg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {archetypes.map((a) => (
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
                        style={{
                          color: a.baseResumeExists
                            ? "var(--color-ok)"
                            : "var(--color-warn)",
                        }}
                      >
                        {a.baseResumeExists
                          ? `${fmtBytes(a.baseResumeSize!)} · ${new Date(a.baseResumeMtimeMs!).toLocaleDateString()}`
                          : "missing on disk"}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--color-warn)" }}>
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

      <details
        className="rounded-md border p-3"
        style={{ background: "var(--color-surface-1)" }}
      >
        <summary
          className="text-xs cursor-pointer"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Seed from existing _resumes/ (idempotent)
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            Creates standard <code>ai</code> and <code>cloud</code> archetypes
            if their DOCXes are present in <code>_resumes/</code> and the
            archetype doesn&apos;t already exist. Safe to re-run.
          </p>
          <Button onClick={seed} disabled={seeding}>
            {seeding ? "Seeding…" : "Run seed"}
          </Button>
          {seedMsg && (
            <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              {seedMsg}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
