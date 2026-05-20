"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Inbox,
  Loader2,
  Pause,
  Sparkles,
} from "lucide-react";
import type { Job, JobStatus } from "@/lib/jobs/types";
import {
  ATTENTION_SECTION_ORDER,
  SECTION_LABELS,
  SECTION_STATUSES,
  STATUS_LABELS,
  type AttentionSection,
} from "@/lib/jobs/attention-sections";
import { PasteJobModal } from "@/components/PasteJobModal";
import { AgentRunPane } from "@/components/AgentRunPane";
import { usePageContext } from "@/components/ChatContext";
import { Button, Callout, PageHeader, StatusBadge } from "@/components/ui";

type ActiveRun = {
  runId: string;
  phase: string;
  startedAt: string;
  jobId: string | null;
};

type Props = {
  sections: Record<AttentionSection, Record<string, Job[]>>;
  totalJobs: number;
  importPreview: { notImported: number; preview: Array<{ company: string; role: string }> };
  /** Server-resolved active discovery run. Used by DiscoveryButton +
   *  the inline AgentRunPane (re-attach across navigation). */
  activeDiscoveryRunId: string | null;
  /** All active agent runs across the app, for the always-visible
   *  active-agents bar at the top of the page. */
  activeRuns: ActiveRun[];
};

const FIRST_RUN_HINT_KEY = "prism:dashboard:dismissed-first-run-hint";

export function Dashboard({
  sections,
  totalJobs,
  importPreview,
  activeDiscoveryRunId,
  activeRuns,
}: Props) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [discoveryRunId, setDiscoveryRunId] = useState<string | null>(activeDiscoveryRunId);

  // Each section's expanded/collapsed state. Defaults are tuned for
  // "morning glance" — top sections expanded, working+parked+done
  // collapsed to keep the page short until the user reaches for them.
  const [expanded, setExpanded] = useState<Record<AttentionSection, boolean>>({
    blocked: true,
    ready: true,
    working: false,
    parked: false,
    done: false,
  });
  const toggle = (s: AttentionSection) =>
    setExpanded((e) => ({ ...e, [s]: !e[s] }));

  // First-time orientation callout. Dismissed permanently via
  // localStorage so we don't pester returning users.
  const [showFirstRunHint, setShowFirstRunHint] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowFirstRunHint(localStorage.getItem(FIRST_RUN_HINT_KEY) !== "1");
  }, []);
  const dismissFirstRun = () => {
    localStorage.setItem(FIRST_RUN_HINT_KEY, "1");
    setShowFirstRunHint(false);
  };
  const reopenFirstRun = () => {
    localStorage.removeItem(FIRST_RUN_HINT_KEY);
    setShowFirstRunHint(true);
  };

  const blockedCount = countInSection(sections, "blocked");
  const readyCount = countInSection(sections, "ready");
  const workingCount = countInSection(sections, "working");
  const parkedCount = countInSection(sections, "parked");
  const doneCount = countInSection(sections, "done");

  // Chat-context: keep the assistant aware of what's on screen.
  const summary =
    `Dashboard. ${totalJobs} jobs tracked.\n` +
    `Sections: blocked=${blockedCount}, ready=${readyCount}, working=${workingCount}, parked=${parkedCount}, done=${doneCount}.\n` +
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

  const erroredCount = sections.ready["errored"]?.length ?? 0;
  const everythingDone = blockedCount + readyCount + workingCount === 0 && totalJobs > 0;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {totalJobs} job{totalJobs === 1 ? "" : "s"} tracked.{" "}
            <button
              type="button"
              onClick={reopenFirstRun}
              className="hover:underline text-xs inline-flex items-center gap-1"
              style={{ color: "var(--color-fg-muted)" }}
              title="Show the how-prism-works orientation again"
            >
              <HelpCircle className="w-3 h-3" />
              How prism works
            </button>
          </>
        }
        actions={
          <>
            <DiscoveryButton onSpawned={setDiscoveryRunId} disabled={!!discoveryRunId} />
            <Button variant="primary" onClick={() => setPasteOpen(true)}>
              Paste a job
            </Button>
          </>
        }
      />

      <ActiveAgentsBar runs={activeRuns} />

      {showFirstRunHint && <FirstRunHint onDismiss={dismissFirstRun} />}

      {discoveryRunId && (
        <div className="mb-6">
          <AgentRunPane
            runId={discoveryRunId}
            onCompleted={() => {
              setDiscoveryRunId(null);
              router.refresh();
            }}
          />
        </div>
      )}

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

      {erroredCount > 0 && (
        <div className="mb-6">
          <RedispatchErroredBanner count={erroredCount} />
        </div>
      )}

      {everythingDone ? (
        <AllCaughtUp
          workingCount={workingCount}
          doneCount={doneCount}
          parkedCount={parkedCount}
        />
      ) : null}

      <div className="space-y-3">
        {ATTENTION_SECTION_ORDER.map((section) => {
          const count = countInSection(sections, section);
          if (count === 0 && section !== "blocked" && section !== "ready") {
            // Hide empty system/parked/done sections to keep the page focused.
            return null;
          }
          return (
            <Section
              key={section}
              section={section}
              jobs={sections[section]}
              expanded={expanded[section]}
              onToggle={() => toggle(section)}
              totalJobs={totalJobs}
            />
          );
        })}
      </div>

      {totalJobs === 0 && importPreview.notImported === 0 && (
        <div className="mt-4">
          <Callout tone="info" title="No jobs yet">
            Run discovery to find candidates, or paste a job URL to dispatch
            directly. The first time? Click <em>How prism works</em> in the
            page header for the two-path tour.
          </Callout>
        </div>
      )}

      {pasteOpen && <PasteJobModal onClose={() => setPasteOpen(false)} />}
    </main>
  );
}

/* ------------------------- Active agents bar ------------------------- */

function ActiveAgentsBar({ runs }: { runs: ActiveRun[] }) {
  const router = useRouter();
  // Re-render the elapsed-time counter every ~10s while runs are active.
  const [, force] = useState(0);
  useEffect(() => {
    if (runs.length === 0) return;
    const t = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [runs.length]);

  if (runs.length === 0) return null;

  const elapsed = (startedAt: string) => {
    const ms = Date.now() - new Date(startedAt).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const min = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${min}m ${s}s`;
  };

  return (
    <div
      className="mb-4 rounded-md border px-3 py-2 flex items-center gap-3 flex-wrap"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-accent)",
      }}
    >
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--color-accent)" }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {runs.length === 1
          ? "1 agent running"
          : `${runs.length} agents running`}
      </span>
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        {runs.slice(0, 3).map((r) => (
          <Link
            key={r.runId}
            href={`/settings/runs/${encodeURIComponent(r.runId)}`}
            className="font-mono hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
            title={`${r.phase} since ${new Date(r.startedAt).toLocaleTimeString()}`}
          >
            {r.phase} · {elapsed(r.startedAt)}
          </Link>
        ))}
        {runs.length > 3 && (
          <Link
            href="/settings/runs"
            className="hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            +{runs.length - 3} more
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="ml-auto text-[11px] hover:underline"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Refresh
      </button>
    </div>
  );
}

/* ------------------------- First-run hint ------------------------- */

function FirstRunHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-6">
      <Callout
        tone="info"
        title="How prism works"
        action={
          <Button onClick={onDismiss}>Got it</Button>
        }
      >
        <p className="mb-2">
          Two paths to apply for a job, both converging at the same review step:
        </p>
        <ol className="space-y-1 ml-4 list-decimal">
          <li>
            <strong>Discovery</strong> — click <em>Run discovery</em>, wait
            (~5–20 min), triage candidates on the{" "}
            <Link href="/shortlist" className="underline">Shortlist</Link>{" "}
            tab. Approve = spawn dispatcher.
          </li>
          <li>
            <strong>Paste a job</strong> — drop one URL or 10. Skips the
            Shortlist; goes straight to the dispatcher.
          </li>
        </ol>
        <p className="mt-2">
          Both then run dispatcher → research → draft → HM review → provenance
          automatically. The job lands in{" "}
          <strong>Ready when you are</strong> when there&apos;s a DOCX for you
          to read. You only re-engage if the system asks (Blocked on you) or
          if a job finishes (Ready).
        </p>
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-fg-muted)" }}>
          Dismiss this card with Got it — bring it back via the{" "}
          <em>How prism works</em> link in the page header.
        </p>
      </Callout>
    </div>
  );
}

/* ------------------------- Empty-state celebration ------------------------- */

function AllCaughtUp({
  workingCount,
  doneCount,
  parkedCount,
}: {
  workingCount: number;
  doneCount: number;
  parkedCount: number;
}) {
  return (
    <div className="mb-6">
      <Callout
        tone="info"
        title={
          <span className="inline-flex items-center gap-2" style={{ color: "var(--color-ok)" }}>
            <CheckCircle2 className="w-4 h-4" /> All caught up
          </span>
        }
      >
        Nothing needs your attention right now.
        {workingCount > 0 && (
          <> {workingCount} job{workingCount === 1 ? "" : "s"} in the pipeline.</>
        )}
        {doneCount > 0 && (
          <> {doneCount} archived (applied / skipped / rejected).</>
        )}
        {parkedCount > 0 && (
          <> {parkedCount} parked.</>
        )}
      </Callout>
    </div>
  );
}

/* ------------------------- Section ------------------------- */

function Section({
  section,
  jobs,
  expanded,
  onToggle,
  totalJobs,
}: {
  section: AttentionSection;
  jobs: Record<string, Job[]>;
  expanded: boolean;
  onToggle: () => void;
  totalJobs: number;
}) {
  const count = Object.values(jobs).reduce((n, list) => n + list.length, 0);
  const tone = SECTION_TONE[section];
  const icon = SECTION_ICON[section];

  return (
    <section
      className="rounded-md border"
      style={{
        background: "var(--color-surface-1)",
        borderColor: tone.borderColor,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-[var(--color-surface-2)] transition-colors rounded-t-md"
        aria-expanded={expanded}
        aria-label={`${SECTION_LABELS[section]} — ${count} job${count === 1 ? "" : "s"}`}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: tone.fgColor }} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: tone.fgColor }} />
        )}
        <span style={{ color: tone.fgColor }} aria-hidden="true">
          {icon}
        </span>
        <span className="text-sm font-medium" style={{ color: tone.fgColor }}>
          {SECTION_LABELS[section]}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-mono"
          style={{
            background: count > 0 ? tone.badgeBg : "var(--color-surface-2)",
            color: count > 0 ? tone.badgeFg : "var(--color-fg-muted)",
          }}
        >
          {count}
        </span>
        <span
          className="text-[11px] ml-auto"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {section === "blocked" && count > 0 && "answer me"}
          {section === "ready" && count > 0 && "review at your pace"}
          {section === "working" && count > 0 && "no action needed"}
          {section === "parked" && count > 0 && "for later"}
          {section === "done" && count > 0 && "archive"}
        </span>
      </button>
      {expanded && (
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {count === 0 ? (
            <div
              className="px-4 py-3 text-xs italic"
              style={{ color: "var(--color-fg-muted)" }}
            >
              {section === "blocked" && totalJobs > 0 && "No agents waiting on you — keep going."}
              {section === "blocked" && totalJobs === 0 && "Run discovery or paste a job to get started."}
              {section === "ready" && "Nothing to review yet. Agents will land jobs here as they finish."}
              {section === "working" && "Nothing in the pipeline right now."}
              {section === "parked" && "Nothing parked."}
              {section === "done" && "Nothing archived yet."}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {SECTION_STATUSES[section].map((status) => {
                const list = jobs[status] ?? [];
                if (list.length === 0) return null;
                return (
                  <StatusGroup
                    key={status}
                    status={status as JobStatus}
                    jobs={list}
                    section={section}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusGroup({
  status,
  jobs,
  section,
}: {
  status: JobStatus;
  jobs: Job[];
  section: AttentionSection;
}) {
  return (
    <div className="px-4 py-3">
      <div
        className="flex items-baseline justify-between mb-1.5 text-[11px] uppercase tracking-wider"
        style={{ color: "var(--color-fg-muted)" }}
      >
        <span>{STATUS_LABELS[status]}</span>
        <span className="font-mono">{jobs.length}</span>
      </div>
      <ul className="space-y-1">
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} section={section} status={status} />
        ))}
      </ul>
      {status === "discovered" && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--color-fg-muted)" }}>
          Triage these on the <Link href="/shortlist" className="underline">Shortlist</Link>.
        </div>
      )}
    </div>
  );
}

function JobRow({
  job,
  status,
}: {
  job: Job;
  section: AttentionSection;
  status: JobStatus;
}) {
  const hasName = job.company || job.role;
  const hostname = hostnameFromUrl(job.sourceUrl);
  const title = hasName ? job.company : hostname || "Pasted URL";
  const subtitle = hasName ? job.role : <em>Awaiting dispatcher…</em>;
  return (
    <li>
      <Link
        href={`/jobs/${encodeURIComponent(job.id)}`}
        className="block px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{title}</div>
            <div
              className="text-[11px] mt-0.5 truncate"
              style={{ color: "var(--color-fg-muted)" }}
            >
              {subtitle}
            </div>
          </div>
          <JobMeta job={job} status={status} />
        </div>
      </Link>
    </li>
  );
}

function JobMeta({ job, status }: { job: Job; status: JobStatus }) {
  return (
    <div
      className="flex items-center gap-2 text-[10px] shrink-0"
      style={{ color: "var(--color-fg-muted)" }}
    >
      {job.reclassifySuggestion && status === "imported" && (
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

/* ------------------------- Section visuals ------------------------- */

const SECTION_TONE: Record<
  AttentionSection,
  { borderColor: string; fgColor: string; badgeBg: string; badgeFg: string }
> = {
  blocked: {
    borderColor: "var(--color-err)",
    fgColor: "var(--color-err)",
    badgeBg: "var(--color-err)",
    badgeFg: "var(--color-bg)",
  },
  ready: {
    borderColor: "var(--color-accent)",
    fgColor: "var(--color-accent)",
    badgeBg: "var(--color-accent)",
    badgeFg: "var(--color-bg)",
  },
  working: {
    borderColor: "var(--color-border)",
    fgColor: "var(--color-fg)",
    badgeBg: "var(--color-surface-2)",
    badgeFg: "var(--color-fg)",
  },
  parked: {
    borderColor: "var(--color-border)",
    fgColor: "var(--color-fg-muted)",
    badgeBg: "var(--color-surface-2)",
    badgeFg: "var(--color-fg-muted)",
  },
  done: {
    borderColor: "var(--color-border)",
    fgColor: "var(--color-fg-muted)",
    badgeBg: "var(--color-surface-2)",
    badgeFg: "var(--color-fg-muted)",
  },
};

const SECTION_ICON: Record<AttentionSection, React.ReactNode> = {
  blocked: <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />,
  ready: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />,
  working: <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />,
  parked: <Pause className="w-3.5 h-3.5" aria-hidden="true" />,
  done: <Inbox className="w-3.5 h-3.5" aria-hidden="true" />,
};

function countInSection(
  sections: Record<AttentionSection, Record<string, Job[]>>,
  s: AttentionSection,
): number {
  return Object.values(sections[s]).reduce((n, list) => n + list.length, 0);
}

function hostnameFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* ------------------------- Banners + buttons (unchanged) ------------------------- */

function RedispatchErroredBanner({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/jobs/redispatch-errored", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setMsg(`error: ${data?.error ?? `HTTP ${r.status}`}`);
        return;
      }
      const parts: string[] = [];
      if (data.dispatched.length > 0) {
        parts.push(`re-dispatching ${data.dispatched.length}`);
      }
      if (data.skippedNoUrl.length > 0) {
        parts.push(`skipped ${data.skippedNoUrl.length} (no source URL)`);
      }
      setMsg(parts.join(" · ") || "nothing to do");
      router.refresh();
    } catch (e) {
      setMsg(`error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Callout
      tone="warn"
      title={
        <>
          <strong>{count}</strong> errored job{count === 1 ? "" : "s"} — most often Anthropic rate-limiting
        </>
      }
      action={
        <Button variant="primary" onClick={run} disabled={busy}>
          {busy ? "Queuing…" : "Re-dispatch all"}
        </Button>
      }
    >
      Re-dispatch runs through the global spawn throttle (3 in flight at most)
      so we don&apos;t re-trigger the same load shedder that produced the failures.
      Jobs without a stored source URL are skipped.
      {msg && <div className="mt-1 text-xs font-mono">{msg}</div>}
    </Callout>
  );
}

function DiscoveryButton({
  onSpawned,
  disabled,
}: {
  /** Called with the runId when /api/discovery/run returns successfully so the
   *  parent can mount AgentRunPane for live SSE updates. */
  onSpawned: (runId: string) => void;
  /** True while a previous discovery run is still in flight — prevents the
   *  user from kicking off a second one before the first completes. */
  disabled: boolean;
}) {
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
      if (typeof data.runId === "string") {
        onSpawned(data.runId);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={run}
      disabled={busy || disabled}
      title={
        err ??
        (disabled
          ? "Discovery already running — watch the pane below."
          : "Spawn discovery agent. Writes to postings/ + .state/discovery/. Long-running (~5–15 min).")
      }
    >
      {busy ? "Spawning…" : disabled ? "Running…" : "Run discovery"}
    </Button>
  );
}
