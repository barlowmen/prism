"use client";

/**
 * Discovery candidates pending user triage. Each row offers three
 * actions: Approve (spawn dispatcher), Skip (modal asks for an
 * optional reason that becomes the status note), Hold (parks the job
 * until the user comes back).
 *
 * Rows are enriched with discovery-agent metadata (score, source,
 * location) when available — see lib/discovery/candidates.ts.
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button, CodeArea, EmptyState } from "@/components/ui";
import { AgentRunPane } from "@/components/AgentRunPane";
import type { Job } from "@/lib/jobs/types";

/** What the Shortlist page passes to this view — one entry per Job
 *  with optional discovery metadata pulled from the latest disc-*.json. */
export type ShortlistRow = {
  job: Job;
  company: string;
  role: string;
  scoreTotal?: number;
  source?: string;
  location?: string;
  whyMatched?: string;
};

export function ShortlistView({
  initial,
  initialActiveRuns,
}: {
  initial: ShortlistRow[];
  /** Server-resolved dispatcher runs that were already in flight when
   *  the page rendered. Pre-populates activeRuns so AgentRunPane
   *  re-attaches after the user navigated away and back. */
  initialActiveRuns?: Array<{ runId: string; company: string; role: string }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ShortlistRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<{ jobId: string; reason: string } | null>(null);
  /**
   * Pending dispatcher runs spawned from Approve clicks (or recovered
   * from the server on render). Each entry gets its own AgentRunPane
   * below the list so the user can watch the dispatcher pick an
   * archetype + classify, instead of staring at a blank shortlist
   * wondering if the spawn worked.
   */
  const [activeRuns, setActiveRuns] = useState<
    Array<{ runId: string; company: string; role: string }>
  >(initialActiveRuns ?? []);

  const setStatus = async (jobId: string, status: string, note: string) => {
    setBusy(jobId + ":" + status);
    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, statusNote: note }),
      });
      setRows((prev) => prev.filter((r) => r.job.id !== jobId));
    } finally {
      setBusy(null);
    }
  };

  const approve = async (row: ShortlistRow) => {
    const j = row.job;
    if (!j.sourceUrl) return;
    setBusy(j.id + ":approve");
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(j.id)}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        setRows((prev) => prev.filter((x) => x.job.id !== j.id));
        if (typeof data?.runId === "string") {
          setActiveRuns((prev) => [
            ...prev,
            { runId: data.runId, company: row.company, role: row.role },
          ]);
        }
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const runPanes = activeRuns.length > 0 && (
    <div className="space-y-2 mb-4">
      {activeRuns.map((run) => (
        <div key={run.runId}>
          <div
            className="text-[11px] font-mono mb-1"
            style={{ color: "var(--color-fg-muted)" }}
          >
            dispatcher · {run.company} / {run.role}
          </div>
          <AgentRunPane
            runId={run.runId}
            onCompleted={() => {
              setActiveRuns((prev) => prev.filter((x) => x.runId !== run.runId));
              router.refresh();
            }}
          />
        </div>
      ))}
    </div>
  );

  if (rows.length === 0) {
    return (
      <>
        {runPanes}
        <EmptyState title="Shortlist is empty.">
          Run discovery from the Dashboard or paste a job manually.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {runPanes}
      <ul className="space-y-2">
        {rows.map((row) => {
          const j = row.job;
          const hostname = hostnameFromUrl(j.sourceUrl);
          const title = row.company || hostname || "Pasted URL";
          return (
            <li
              key={j.id}
              className="rounded-md border p-3"
              style={{ background: "var(--color-surface-1)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/jobs/${encodeURIComponent(j.id)}`}
                    className="hover:underline"
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <div className="text-sm font-medium">{title}</div>
                      {typeof row.scoreTotal === "number" && (
                        <ScoreBadge score={row.scoreTotal} />
                      )}
                      {row.source && (
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: "var(--color-fg-muted)" }}
                          title="Discovery source board"
                        >
                          {row.source}
                        </span>
                      )}
                      {row.location && (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--color-fg-muted)" }}
                        >
                          {row.location}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--color-fg-muted)" }}
                    >
                      {row.role || (
                        <em>Awaiting dispatcher classification…</em>
                      )}
                    </div>
                  </Link>
                  {row.whyMatched && (
                    <div
                      className="text-[11px] mt-1 italic"
                      style={{ color: "var(--color-fg-muted)" }}
                    >
                      {row.whyMatched}
                    </div>
                  )}
                  {j.sourceUrl && (
                    <a
                      href={j.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[11px] hover:underline mt-1 inline-flex items-center gap-1 truncate max-w-md"
                      style={{ color: "var(--color-fg-muted)" }}
                      title={j.sourceUrl}
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{j.sourceUrl}</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    onClick={() => approve(row)}
                    disabled={!j.sourceUrl || !!busy}
                    title={
                      j.sourceUrl
                        ? "Run dispatcher"
                        : "No URL on this candidate — paste a job manually with a URL"
                    }
                  >
                    {busy === j.id + ":approve" ? "Spawning…" : "Approve"}
                  </Button>
                  <Button
                    onClick={() => setSkipping({ jobId: j.id, reason: "" })}
                    disabled={!!busy}
                  >
                    Skip
                  </Button>
                  <Button
                    onClick={() =>
                      setStatus(j.id, "held", "user held from shortlist")
                    }
                    disabled={!!busy}
                  >
                    Hold
                  </Button>
                </div>
              </div>
            </li>
          );
        })}

        {skipping && (
          <SkipModal
            onClose={() => setSkipping(null)}
            onSubmit={async (reason) => {
              await setStatus(skipping.jobId, "skipped", reason || "skipped from shortlist");
              setSkipping(null);
            }}
          />
        )}
      </ul>
    </>
  );
}

/** Score 0–100 → small color-coded badge. Cheap signal-at-a-glance for
 *  triage decisions. >= 80 green, 60-79 accent, < 60 muted. */
function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "var(--color-ok)"
      : score >= 60
        ? "var(--color-accent)"
        : "var(--color-fg-muted)";
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{
        background: "var(--color-surface-2)",
        color,
      }}
      title={`Discovery fit score: ${score}/100`}
    >
      {score}
    </span>
  );
}

function hostnameFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function SkipModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{ background: "var(--color-scrim)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md border p-5"
        style={{ background: "var(--color-surface-1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-1">Why skip?</div>
        <div className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
          Optional. Used as the status note; later, this can feed a
          skip-patterns list to filter future discovery runs.
        </div>
        <CodeArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          surface="surface-2"
          minHeight={80}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              setBusy(true);
              await onSubmit(reason);
              setBusy(false);
            }}
            disabled={busy}
          >
            {busy ? "Saving…" : "Skip"}
          </Button>
        </div>
      </div>
    </div>
  );
}
