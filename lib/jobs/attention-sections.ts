import type { Job, JobStatus } from "./types";

/**
 * Re-organizes the kanban around **who owns the next move** instead of
 * the pipeline phase. The flat status list maps into five sections,
 * top-down by urgency:
 *
 *   1. blocked — agent literally stalled until the user answers
 *   2. ready   — system-done work waiting for a decision
 *   3. working — system actively processing, no user action expected
 *   4. parked  — held / queued / triage / dispatcher-recommended skip
 *   5. done    — terminal states (applied, skipped, rejected)
 *
 * Each section can be expanded inline. The empty-state for top
 * sections is "all caught up" with motion-stats from working + done.
 */
export type AttentionSection = "blocked" | "ready" | "working" | "parked" | "done";

export const ATTENTION_SECTION_ORDER: AttentionSection[] = [
  "blocked",
  "ready",
  "working",
  "parked",
  "done",
];

export const SECTION_STATUSES: Record<AttentionSection, JobStatus[]> = {
  blocked: ["awaiting_input"],
  // `imported` and `recommended_skip` both need a quick user decision
  // — reclassify the legacy folder, or accept/override the dispatcher's
  // skip recommendation. Living in Parked made them feel deferrable
  // when really they're decisive single-click actions, same category
  // as ready_for_user_review and errored ("system did something, you
  // decide"). Parked is reserved for truly no-decision-pending states.
  ready: [
    "ready_for_user_review",
    "ready_to_apply",
    "errored",
    "recommended_skip",
    "imported",
  ],
  working: ["dispatching", "researching", "drafting", "hm_review", "provenance"],
  parked: [
    "discovered", // discovery candidates → triage on /shortlist
    "queued",
    "held",
    "cancelled",
  ],
  done: ["applied", "skipped", "rejected"],
};

export const SECTION_LABELS: Record<AttentionSection, string> = {
  blocked: "Blocked on you",
  ready: "Ready when you are",
  working: "Working on it",
  parked: "Parked",
  done: "Done",
};

/** Human-readable labels for individual job statuses. Used in section
 *  contents — distinct from the section labels above. */
export const STATUS_LABELS: Record<JobStatus, string> = {
  imported: "Imported — needs reclassify",
  discovered: "Discovered (Shortlist)",
  queued: "Queued for dispatcher",
  held: "Held",
  skipped: "Skipped",
  dispatching: "Dispatching",
  recommended_skip: "Recommended skip",
  awaiting_input: "Awaiting your input",
  researching: "Researching",
  drafting: "Drafting",
  hm_review: "HM review",
  provenance: "Provenance",
  ready_for_user_review: "Ready for your review",
  ready_to_apply: "Ready to apply",
  applied: "Applied",
  rejected: "Rejected",
  cancelled: "Cancelled (partial)",
  errored: "Errored",
};

/** Bucket jobs by section, with a status-keyed inner map for ordering.
 *  Newest-first within each status (matches existing kanban behavior). */
export function groupJobsBySection(jobs: Job[]): Record<
  AttentionSection,
  Record<string, Job[]>
> {
  const out: Record<AttentionSection, Record<string, Job[]>> = {
    blocked: {},
    ready: {},
    working: {},
    parked: {},
    done: {},
  };
  for (const section of ATTENTION_SECTION_ORDER) {
    for (const s of SECTION_STATUSES[section]) out[section][s] = [];
  }
  for (const j of jobs) {
    const section = sectionForStatus(j.status);
    if (!section) continue;
    if (!out[section][j.status]) out[section][j.status] = [];
    out[section][j.status].push(j);
  }
  for (const section of ATTENTION_SECTION_ORDER) {
    for (const s of Object.keys(out[section])) {
      out[section][s].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }
  }
  return out;
}

function sectionForStatus(s: JobStatus): AttentionSection | null {
  for (const section of ATTENTION_SECTION_ORDER) {
    if ((SECTION_STATUSES[section] as readonly string[]).includes(s)) {
      return section;
    }
  }
  return null;
}

/** Counts per section, plus per-status drill-down inside each. Used
 *  by collapsed-section summary cards. */
export type SectionCounts = Record<AttentionSection, {
  total: number;
  byStatus: Record<string, number>;
}>;

export function countBySection(jobs: Job[]): SectionCounts {
  const grouped = groupJobsBySection(jobs);
  const out = {} as SectionCounts;
  for (const section of ATTENTION_SECTION_ORDER) {
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const [s, list] of Object.entries(grouped[section])) {
      byStatus[s] = list.length;
      total += list.length;
    }
    out[section] = { total, byStatus };
  }
  return out;
}
