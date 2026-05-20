import type { Job, JobStatus } from "./types";

export type ColumnGroup =
  | "inbox"
  | "in_progress"
  | "review"
  | "action"
  | "done"
  | "archive"
  | "needs_reclassify";

export type ColumnDef = {
  group: ColumnGroup;
  status: JobStatus;
  label: string;
};

/**
 * Column layout from spec §8.2. Imported jobs get their own group at the
 * top of Inbox so the user knows they need reclassifying. errored /
 * cancelled live in a "needs review" group.
 */
export const COLUMNS: ColumnDef[] = [
  // needs_reclassify
  { group: "needs_reclassify", status: "imported", label: "Imported — needs reclassify" },
  { group: "needs_reclassify", status: "errored", label: "Errored" },
  { group: "needs_reclassify", status: "cancelled", label: "Cancelled (partial)" },

  // inbox
  { group: "inbox", status: "discovered", label: "Discovered" },
  { group: "inbox", status: "queued", label: "Queued for dispatcher" },
  { group: "inbox", status: "held", label: "Held" },
  { group: "inbox", status: "recommended_skip", label: "Recommended skip" },
  { group: "inbox", status: "awaiting_input", label: "Awaiting your input" },

  // in_progress
  { group: "in_progress", status: "dispatching", label: "Dispatching" },
  { group: "in_progress", status: "researching", label: "Researching" },
  { group: "in_progress", status: "drafting", label: "Drafting" },
  { group: "in_progress", status: "hm_review", label: "HM review" },
  { group: "in_progress", status: "provenance", label: "Provenance" },

  // review
  { group: "review", status: "ready_for_user_review", label: "Ready for your review" },

  // action
  { group: "action", status: "ready_to_apply", label: "Ready to apply" },

  // done
  { group: "done", status: "applied", label: "Applied" },

  // archive
  { group: "archive", status: "skipped", label: "Skipped" },
  { group: "archive", status: "rejected", label: "Rejected" },
];

export const GROUP_LABELS: Record<ColumnGroup, string> = {
  needs_reclassify: "Needs reclassify",
  inbox: "Inbox",
  in_progress: "In progress",
  review: "Review",
  action: "Action",
  done: "Done",
  archive: "Archive",
};

export const GROUP_ORDER: ColumnGroup[] = [
  "needs_reclassify",
  "inbox",
  "in_progress",
  "review",
  "action",
  "done",
  "archive",
];

export type GroupedJobs = Record<JobStatus, Job[]>;

export function groupJobsByStatus(jobs: Job[]): GroupedJobs {
  const out: Partial<GroupedJobs> = {};
  for (const col of COLUMNS) out[col.status] = [];
  for (const j of jobs) {
    if (!out[j.status]) out[j.status] = [];
    out[j.status]!.push(j);
  }
  // Newest-first within each column.
  for (const status of Object.keys(out) as JobStatus[]) {
    out[status]!.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  return out as GroupedJobs;
}
