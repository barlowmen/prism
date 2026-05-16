"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Job, JobStatus } from "@/lib/jobs/types";
import type { ColumnGroup, GroupedJobs } from "@/lib/jobs/grouping";
import { PasteJobModal } from "@/components/PasteJobModal";
import { usePageContext } from "@/components/ChatContext";
import { Button, Callout, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

type ColumnDef = { group: ColumnGroup; status: JobStatus; label: string };

type Props = {
  grouped: GroupedJobs;
  columnsByGroup: Record<ColumnGroup, ColumnDef[]>;
  groupOrder: ColumnGroup[];
  groupLabels: Record<ColumnGroup, string>;
  totalJobs: number;
  importPreview: { notImported: number; preview: Array<{ company: string; role: string }> };
};

export function Dashboard(props: Props) {
  const { grouped, columnsByGroup, groupOrder, groupLabels, totalJobs, importPreview } = props;
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  // Chat-context: summarize the kanban so the assistant knows what's on screen.
  const byStatus: Record<string, number> = {};
  for (const status of Object.keys(grouped)) {
    const n = grouped[status as JobStatus]?.length ?? 0;
    if (n > 0) byStatus[status] = n;
  }
  const summary =
    `Dashboard / kanban. ${totalJobs} jobs total.\n` +
    `By status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}.\n` +
    (importPreview.notImported > 0
      ? `${importPreview.notImported} app folders in apps/ not yet imported.`
      : "All apps/ folders imported.");
  usePageContext({ summary, extras: { totalJobs } });

  const runImport = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await fetch("/api/jobs/import", { method: "POST" });
      const data = await r.json();
      setImportMsg(
        `imported ${data.summary.created}; ${data.summary.alreadyExisted} already existed`,
      );
      router.refresh();
    } catch (e) {
      setImportMsg(`error: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto p-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {totalJobs} job{totalJobs === 1 ? "" : "s"} tracked. Click a row to
            act on it; <kbd className="text-[10px]">⌘J</kbd> for the assistant.
          </>
        }
        actions={
          <>
            <DiscoveryButton router={router} />
            <Button variant="primary" onClick={() => setPasteOpen(true)}>
              Paste a job
            </Button>
          </>
        }
      />

      {importPreview.notImported > 0 && (
        <div className="mb-6">
          <Callout
            tone="accent"
            title={
              <>
                <strong>{importPreview.notImported}</strong> application folder
                {importPreview.notImported === 1 ? "" : "s"} in{" "}
                <code className="text-xs">apps/</code> not yet imported
              </>
            }
            action={
              <Button variant="primary" onClick={runImport} disabled={importing}>
                {importing ? "Importing…" : "Import folders"}
              </Button>
            }
          >
            {importPreview.preview
              .map((p) => `${p.company}/${p.role}`)
              .join(", ")}
            {importPreview.notImported > importPreview.preview.length && " …"}
            {importMsg && <div className="mt-1">{importMsg}</div>}
          </Callout>
        </div>
      )}

      <div className="space-y-8">
        {groupOrder.map((group) => {
          const cols = columnsByGroup[group];
          const totalInGroup = cols.reduce(
            (n, c) => n + (grouped[c.status]?.length ?? 0),
            0,
          );
          if (totalInGroup === 0) return null;
          const accent = group === "needs_reclassify" || group === "inbox";
          return (
            <section key={group}>
              <div className="flex items-baseline justify-between mb-3">
                <h2
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: accent ? "var(--color-fg)" : "var(--color-fg-muted)" }}
                >
                  {groupLabels[group]}
                </h2>
                <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                  {totalInGroup}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {cols.map((col) => {
                  const items = grouped[col.status] ?? [];
                  if (items.length === 0) return null;
                  return (
                    <Column
                      key={col.status}
                      label={col.label}
                      jobs={items}
                      accent={col.status === "awaiting_input"}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {totalJobs === 0 && importPreview.notImported === 0 && (
          <EmptyState title="No jobs yet.">
            Run discovery or paste a job manually.
          </EmptyState>
        )}
      </div>

      {pasteOpen && <PasteJobModal onClose={() => setPasteOpen(false)} />}
    </main>
  );
}

function DiscoveryButton({ router }: { router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/discovery/run", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={run}
      disabled={busy}
      title={err ?? "Spawn discovery agent. Writes to postings/ + .state/discovery/. Long-running (~5–15 min)."}
    >
      {busy ? "Spawning…" : "Run discovery"}
    </Button>
  );
}

function Column({
  label,
  jobs,
  accent,
}: {
  label: string;
  jobs: Job[];
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        background: "var(--color-surface-1)",
        borderColor: accent ? "var(--color-accent)" : "var(--color-border)",
      }}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between text-xs">
        <span
          className="font-medium"
          style={{ color: accent ? "var(--color-accent)" : "var(--color-fg)" }}
        >
          {label}
        </span>
        <span style={{ color: "var(--color-fg-muted)" }}>{jobs.length}</span>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {jobs.map((j) => (
          <li key={j.id}>
            <Link
              href={`/jobs/${encodeURIComponent(j.id)}`}
              className="block px-3 py-2 hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <div className="text-xs font-medium truncate">{j.company}</div>
              <div
                className="text-[11px] mt-0.5 truncate"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {j.role}
              </div>
              <JobMeta job={j} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobMeta({ job }: { job: Job }) {
  return (
    <div
      className="flex items-center gap-2 mt-1.5 text-[10px]"
      style={{ color: "var(--color-fg-muted)" }}
    >
      {job.reclassifySuggestion && job.status === "imported" && (
        <StatusBadge>suggested: {job.reclassifySuggestion}</StatusBadge>
      )}
      {job.sourceUrl && (
        <ExternalLink
          className="w-3 h-3 shrink-0"
          style={{ color: "var(--color-fg-muted)" }}
          aria-label="has source URL"
        />
      )}
      {job.outcome && <StatusBadge>{job.outcome}</StatusBadge>}
    </div>
  );
}
