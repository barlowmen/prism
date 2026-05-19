"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import type { ArchetypeSummary } from "@/lib/archetypes/types";

type ScaffoldPreview = {
  profileFound: boolean;
  available: Array<{ key: string; label: string; exists: boolean }>;
  unscaffoldedCount: number;
  notes: string[];
};

type ScaffoldResponse = {
  profileFound: boolean;
  totalParsed: number;
  findings: Array<{ key: string; label: string; status: "created" | "already_exists" }>;
  notes: string[];
};

export function ArchetypesList({
  initial,
  scaffoldPreview,
}: {
  initial: ArchetypeSummary[];
  scaffoldPreview: ScaffoldPreview;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runScaffold = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/archetypes/scaffold-from-profile", {
        method: "POST",
      });
      const data = (await r.json()) as ScaffoldResponse;
      if (!r.ok) {
        setErr(data.notes?.[0] ?? `HTTP ${r.status}`);
        return;
      }
      const created = data.findings.filter((f) => f.status === "created").length;
      const existed = data.findings.filter((f) => f.status === "already_exists").length;
      if (created === 0 && existed === 0) {
        setMsg(data.notes?.[0] ?? "Nothing to scaffold.");
      } else {
        setMsg(
          `Created ${created} archetype${created === 1 ? "" : "s"}` +
            (existed > 0 ? ` · ${existed} already existed` : "") +
            ". Upload a base resume DOCX for each to activate.",
        );
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Empty state: never created an archetype yet.
  if (initial.length === 0) {
    return (
      <div className="space-y-3">
        {scaffoldPreview.profileFound && scaffoldPreview.unscaffoldedCount > 0 ? (
          <>
            <Callout
              tone="accent"
              title={`Scaffold ${scaffoldPreview.unscaffoldedCount} archetype${
                scaffoldPreview.unscaffoldedCount === 1 ? "" : "s"
              } from your profile?`}
            >
              Found {scaffoldPreview.unscaffoldedCount}{" "}
              {scaffoldPreview.unscaffoldedCount === 1 ? "subsection" : "subsections"} under{" "}
              <code className="text-xs">about_user.md</code> &rsaquo;{" "}
              <em>Tailoring playbook by archetype</em>. Scaffold creates a JSON
              record for each with label, description, and matching hints
              pre-filled. You&apos;ll still need to upload a base resume DOCX
              per archetype to activate it. Your profile is read-only —
              nothing in <code className="text-xs">about_user.md</code> gets
              changed.
              <details className="mt-2">
                <summary
                  className="cursor-pointer text-xs select-none"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  Show what would be scaffolded
                </summary>
                <ul className="mt-2 ml-3 space-y-0.5">
                  {scaffoldPreview.available
                    .filter((a) => !a.exists)
                    .map((a) => (
                      <li key={a.key} className="font-mono text-[11px]">
                        {a.key}  <span className="opacity-70">{a.label}</span>
                      </li>
                    ))}
                </ul>
              </details>
            </Callout>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={runScaffold}
                disabled={busy}
                icon={<Sparkles className="w-3 h-3" />}
              >
                {busy ? "Scaffolding…" : "Scaffold from profile"}
              </Button>
              <Link href="/settings/archetypes/new">
                <Button>Add one manually</Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <Callout tone="accent" title="No archetypes yet">
              The dispatcher can&apos;t pick a base resume until you create at
              least one. Each archetype points at a base resume DOCX in your
              workspace and carries matching hints the dispatcher uses to pick
              which one fits a given posting.
              {scaffoldPreview.notes.length > 0 && (
                <div
                  className="mt-2 text-[11px]"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  {scaffoldPreview.notes[0]}
                </div>
              )}
            </Callout>
            <div className="flex items-center gap-2">
              <Link href="/settings/archetypes/new">
                <Button variant="primary">New archetype</Button>
              </Link>
            </div>
          </>
        )}
        <Messages msg={msg} err={err} />
      </div>
    );
  }

  // Non-empty: show the list. If unscaffolded items exist in the profile,
  // show a small top-banner offering to scaffold them.
  return (
    <div className="space-y-3">
      {scaffoldPreview.unscaffoldedCount > 0 && (
        <>
          <Callout
            tone="info"
            title={`${scaffoldPreview.unscaffoldedCount} more archetype${
              scaffoldPreview.unscaffoldedCount === 1 ? "" : "s"
            } in your profile not yet scaffolded`}
            action={
              <Button
                variant="primary"
                onClick={runScaffold}
                disabled={busy}
                icon={<Sparkles className="w-3 h-3" />}
              >
                {busy ? "Scaffolding…" : "Scaffold"}
              </Button>
            }
          >
            {scaffoldPreview.available
              .filter((a) => !a.exists)
              .map((a) => a.label)
              .join(", ")}
            . Creating JSON records is non-destructive; existing archetypes
            stay as they are.
          </Callout>
          <Messages msg={msg} err={err} />
        </>
      )}

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
    </div>
  );
}

function Messages({ msg, err }: { msg: string | null; err: string | null }) {
  if (!msg && !err) return null;
  return (
    <div
      className="text-xs"
      style={{ color: err ? "var(--color-err)" : "var(--color-fg-muted)" }}
    >
      {err ?? msg}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
