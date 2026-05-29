"use client";

/**
 * Outcome tracker for jobs that have crossed the dispatcher gate.
 *
 * Jobs are bucketed by where they stand so the page isn't one giant
 * scroll when you're hunting for a specific application to log feedback
 * on. Category is derived from status + outcome:
 *
 *   - offer    — outcome=offer. Pinned at the top as a highlight.
 *   - active   — applied / ready-to-apply / ready-for-review and still
 *                in play (no terminal outcome yet).
 *   - rejected — the employer turned you down: outcome=rejected/ghosted,
 *                OR status=rejected after you'd actually applied (an
 *                employer outcome is present). This is where the debrief
 *                worth feeding back into lessons lives.
 *   - skipped  — you didn't pursue it: status=skipped, OR status=rejected
 *                with no employer outcome (you killed the draft before
 *                applying).
 *
 * Offers + Active are expanded by default; Rejected + Skipped collapse
 * to keep the page short. Counts on each header. Changing a row's
 * outcome re-buckets it live (groups recompute from `rows`).
 *
 * The outcome <select> is the primary input — anything in PREP_OUTCOMES
 * (phone_screen / interview / offer) also reveals an inline "Prep" link
 * to the per-company prep workspace.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  NotebookText,
  SquarePen,
} from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/ui";
import type { Job, JobOutcome } from "@/lib/jobs/types";

const PREP_OUTCOMES: ReadonlyArray<JobOutcome> = [
  "phone_screen",
  "interview",
  "offer",
];

const OUTCOMES: { value: JobOutcome | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "awaiting_response", label: "awaiting response" },
  { value: "phone_screen", label: "phone screen" },
  { value: "interview", label: "interview" },
  { value: "offer", label: "offer" },
  { value: "rejected", label: "rejected" },
  { value: "ghosted", label: "ghosted" },
];

type AppCategory = "offer" | "active" | "rejected" | "skipped";

const SECTION_ORDER: AppCategory[] = ["offer", "active", "rejected", "skipped"];

const SECTION_LABELS: Record<AppCategory, string> = {
  offer: "Offers",
  active: "Active",
  rejected: "Rejected",
  skipped: "Skipped",
};

const SECTION_HINT: Record<AppCategory, string> = {
  offer: "you got an offer",
  active: "applied & in play",
  rejected: "track the debrief",
  skipped: "didn't pursue",
};

/** Tone per section: offer = ok (green), active = prominent fg, the two
 *  closed buckets = muted. */
const SECTION_TONE: Record<AppCategory, { fg: string; border: string }> = {
  offer: { fg: "var(--color-ok)", border: "var(--color-ok)" },
  active: { fg: "var(--color-fg)", border: "var(--color-accent)" },
  rejected: { fg: "var(--color-fg-muted)", border: "var(--color-border)" },
  skipped: { fg: "var(--color-fg-muted)", border: "var(--color-border)" },
};

/** Map a job to its Applications bucket. Order matters: offer wins, then
 *  employer-rejection, then the "you decided" buckets. */
function categorize(job: Job): AppCategory {
  const outcome = job.outcome;
  if (outcome === "offer") return "offer";
  if (outcome === "rejected" || outcome === "ghosted") return "rejected";
  if (job.status === "rejected") {
    // status=rejected with an employer outcome (awaiting/phone/interview)
    // means you applied and then got turned down → Rejected. With no
    // outcome at all, you killed the draft before applying → Skipped.
    return outcome ? "rejected" : "skipped";
  }
  if (job.status === "skipped") return "skipped";
  return "active";
}

export function ApplicationsView({ jobs }: { jobs: Job[] }) {
  const [rows, setRows] = useState<Job[]>(() =>
    [...jobs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<AppCategory, boolean>>({
    offer: false,
    active: false,
    rejected: true,
    skipped: true,
  });

  const grouped = useMemo(() => {
    const out: Record<AppCategory, Job[]> = {
      offer: [],
      active: [],
      rejected: [],
      skipped: [],
    };
    for (const j of rows) out[categorize(j)].push(j);
    return out;
  }, [rows]);

  const setOutcome = async (job: Job, outcome: JobOutcome | "") => {
    setSavingId(job.id);
    try {
      const body = outcome === "" ? { outcome: null } : { outcome };
      const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const updated = (await r.json()) as Job;
        setRows((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      }
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState title="Nothing here yet.">
        Jobs land here once they&apos;re approved for submission.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {SECTION_ORDER.map((cat) => {
        const list = grouped[cat];
        // Hide empty Offers/Rejected/Skipped; always show Active so the
        // page has an anchor even when nothing's in flight.
        if (list.length === 0 && cat !== "active") return null;
        return (
          <Section
            key={cat}
            category={cat}
            jobs={list}
            collapsed={collapsed[cat]}
            onToggle={() =>
              setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))
            }
            savingId={savingId}
            onOutcome={setOutcome}
          />
        );
      })}
    </div>
  );
}

function Section({
  category,
  jobs,
  collapsed,
  onToggle,
  savingId,
  onOutcome,
}: {
  category: AppCategory;
  jobs: Job[];
  collapsed: boolean;
  onToggle: () => void;
  savingId: string | null;
  onOutcome: (job: Job, outcome: JobOutcome | "") => void;
}) {
  const tone = SECTION_TONE[category];
  return (
    <section
      className="rounded-md border"
      style={{ background: "var(--color-surface-1)", borderColor: tone.border }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-[var(--color-surface-2)] transition-colors rounded-t-md"
        aria-expanded={!collapsed}
        aria-label={`${SECTION_LABELS[category]} — ${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: tone.fg }} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: tone.fg }} />
        )}
        <span className="text-sm font-medium" style={{ color: tone.fg }}>
          {SECTION_LABELS[category]}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-mono"
          style={{
            background:
              jobs.length > 0 ? "var(--color-surface-2)" : "var(--color-surface-2)",
            color: tone.fg,
          }}
        >
          {jobs.length}
        </span>
        <span
          className="text-[11px] ml-auto"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {jobs.length > 0 ? SECTION_HINT[category] : ""}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {jobs.length === 0 ? (
            <div
              className="px-4 py-3 text-xs italic"
              style={{ color: "var(--color-fg-muted)" }}
            >
              {category === "active"
                ? "Nothing in flight. Approved drafts show up here once you submit them."
                : "Nothing here."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  <th className="font-normal py-2 px-3">Company / Role</th>
                  <th className="font-normal py-2 px-3">Status</th>
                  <th className="font-normal py-2 px-3">Last update</th>
                  <th className="font-normal py-2 px-3">Outcome</th>
                  <th className="font-normal py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <ApplicationRow
                    key={j.id}
                    job={j}
                    saving={savingId === j.id}
                    onOutcome={onOutcome}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function ApplicationRow({
  job,
  saving,
  onOutcome,
}: {
  job: Job;
  saving: boolean;
  onOutcome: (job: Job, outcome: JobOutcome | "") => void;
}) {
  return (
    <tr className="border-t" style={{ borderColor: "var(--color-border)" }}>
      <td className="py-2 px-3">
        <Link
          href={`/jobs/${encodeURIComponent(job.id)}`}
          className="hover:underline"
        >
          <div className="text-sm">{job.company}</div>
          <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            {job.role}
          </div>
        </Link>
      </td>
      <td className="py-2 px-3">
        <StatusBadge>{job.status}</StatusBadge>
      </td>
      <td className="py-2 px-3 text-xs" style={{ color: "var(--color-fg-muted)" }}>
        {new Date(job.updatedAt).toLocaleDateString()}
      </td>
      <td className="py-2 px-3">
        <div className="relative inline-block">
          <select
            value={job.outcome ?? ""}
            onChange={(e) => onOutcome(job, e.target.value as JobOutcome | "")}
            disabled={saving}
            className="appearance-none pl-2 pr-7 py-1 text-xs rounded-md border disabled:opacity-50"
            style={{
              background: "var(--color-surface-2)",
              borderColor: "var(--color-border)",
            }}
          >
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
            style={{ color: "var(--color-fg-muted)" }}
          />
        </div>
      </td>
      <td className="py-2 px-3 text-right">
        <div className="inline-flex items-center gap-3">
          <Link
            href={`/jobs/${encodeURIComponent(job.id)}#notes`}
            className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
            title="Open the Notes tab to log interview / debrief feedback"
          >
            <SquarePen className="w-3 h-3" />
            Feedback
          </Link>
          {job.outcome && PREP_OUTCOMES.includes(job.outcome) && (
            <Link
              href={`/prep/${encodeURIComponent(job.company)}`}
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: "var(--color-accent)" }}
              title="Open the interview prep workspace for this company"
            >
              <NotebookText className="w-3 h-3" />
              Prep
            </Link>
          )}
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: "var(--color-fg-muted)" }}
              title={job.sourceUrl}
            >
              <ExternalLink className="w-3 h-3" />
              Posting
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
