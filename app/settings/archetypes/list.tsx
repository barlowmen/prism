"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import type { ArchetypeSummary, BaseStatus } from "@/lib/archetypes/types";

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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const missingBaseCount = initial.filter(
    (a) => !a.baseResumePath || a.baseStatus === "none",
  ).length;
  const activeArchetypes = initial.filter(
    (a) => a.baseStatus === "generating" || a.baseStatus === "reviewing",
  );

  // Poll while any archetype is in a transient state. The bulk endpoint
  // is fire-and-forget on the server — the only way the UI learns about
  // progress is by re-reading the archetype JSONs.
  useEffect(() => {
    if (activeArchetypes.length === 0) return;
    const t = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [activeArchetypes.length, router]);

  const runBulkGenerate = async () => {
    setBulkBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/archetypes/generate-all-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data?.error ?? `HTTP ${r.status}`);
        return;
      }
      // The API already returns `alreadyRunning` separately from
      // `queued` / `alreadyHasBase` so a stray double-click on
      // Generate-all doesn't silently re-spawn loops on archetypes that
      // are mid-flight. Surface that list in the success message so the
      // user sees what got skipped and why.
      const skipped: string[] = [];
      if (Array.isArray(data.alreadyRunning) && data.alreadyRunning.length > 0) {
        skipped.push(
          `${data.alreadyRunning.length} already running: ${data.alreadyRunning.join(", ")}`,
        );
      }
      if (Array.isArray(data.alreadyHasBase) && data.alreadyHasBase.length > 0) {
        skipped.push(
          `${data.alreadyHasBase.length} already have a base: ${data.alreadyHasBase.join(", ")}`,
        );
      }
      const skippedSuffix = skipped.length > 0 ? ` Skipped — ${skipped.join("; ")}.` : "";

      if (data.queued.length === 0) {
        setMsg(
          (skippedSuffix ? `Nothing to queue.${skippedSuffix}` : "Nothing to queue — every archetype already has a base."),
        );
      } else {
        setMsg(
          `Queued ${data.queued.length} archetype${data.queued.length === 1 ? "" : "s"}: ${data.queued.join(", ")}. ` +
            `Each will run generate → HM review until ready (or stalled at pass 5).` +
            skippedSuffix,
        );
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBulkBusy(false);
    }
  };

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

      {activeArchetypes.length > 0 ? (
        <Callout
          tone="info"
          title={`${activeArchetypes.length} archetype${
            activeArchetypes.length === 1 ? "" : "s"
          } generating base resumes…`}
        >
          {activeArchetypes
            .map(
              (a) =>
                `${a.label} (${a.baseStatus === "generating" ? "drafting" : "HM review"}, pass ${a.baseReviewPass || 1})`,
            )
            .join(" · ")}
          . Each loop runs draft → HM review → maybe redraft, up to 5 passes.
          This banner refreshes automatically.
        </Callout>
      ) : missingBaseCount > 0 ? (
        <Callout
          tone="accent"
          title={`${missingBaseCount} archetype${missingBaseCount === 1 ? "" : "s"} ${
            missingBaseCount === 1 ? "has" : "have"
          } no base resume yet`}
          action={
            <Button
              variant="primary"
              onClick={runBulkGenerate}
              disabled={bulkBusy}
              icon={<Sparkles className="w-3 h-3" />}
            >
              {bulkBusy ? "Queuing…" : "Generate all bases"}
            </Button>
          }
        >
          Generate all bases spawns the base-resume agent for every archetype
          without a DOCX, capped at 2 in parallel. Each goes through a
          draft → HM-review loop (up to 5 passes). Re-generate individual
          ones from each archetype's edit page.
        </Callout>
      ) : null}

      <Messages msg={msg} err={err} />

      <ul className="space-y-2">
        {initial.map((a) => (
          <li
            key={a.key}
            className="rounded-md border p-4"
            style={{
              background: "var(--color-surface-1)",
              borderColor:
                a.baseStatus === "errored"
                  ? "var(--color-err)"
                  : a.baseStatus === "stalled"
                    ? "var(--color-warn)"
                    : a.baseStatus === "generating" || a.baseStatus === "reviewing"
                      ? "var(--color-accent)"
                      : a.baseResumeExists
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
                  className="mt-2 flex items-center gap-3 text-[11px] font-mono flex-wrap"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  <StatusBadge a={a} />
                  {a.baseResumePath && a.baseResumeExists && (
                    <span>{a.baseResumePath}</span>
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

function StatusBadge({ a }: { a: ArchetypeSummary }) {
  const status: BaseStatus = a.baseStatus;

  if (status === "generating" || status === "reviewing") {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: "var(--color-accent)" }}
      >
        <span className="relative inline-flex w-2 h-2">
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "var(--color-accent)", opacity: 0.6 }}
          />
          <span
            className="relative inline-block w-2 h-2 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
        </span>
        {status === "generating" ? "drafting" : "HM review"} · pass {a.baseReviewPass || 1}
      </span>
    );
  }

  if (status === "stalled") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{ color: "var(--color-warn)" }}
      >
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        stalled at pass {a.baseReviewPass} — Edit to accept or restart
      </span>
    );
  }

  if (status === "errored") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{ color: "var(--color-err)" }}
      >
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        generation errored — Edit for details
      </span>
    );
  }

  // status === 'ready' or 'none' — fall back to the file-on-disk signal.
  if (a.baseResumePath && a.baseResumeExists) {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{ color: "var(--color-ok)" }}
      >
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
        {`${fmtBytes(a.baseResumeSize!)} · ${new Date(a.baseResumeMtimeMs!).toLocaleDateString()}`}
      </span>
    );
  }
  if (a.baseResumePath && !a.baseResumeExists) {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{ color: "var(--color-warn)" }}
      >
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        path set but missing on disk
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: "var(--color-warn)" }}
    >
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      no base DOCX set
    </span>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
