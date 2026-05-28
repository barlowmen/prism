// Job status enum from spec §8.1. Order is workflow order.
export const JOB_STATUSES = [
  "imported",
  "discovered",
  "queued",
  "held",
  "skipped",
  "dispatching",
  "recommended_skip",
  "awaiting_input",
  "researching",
  "drafting",
  "hm_review",
  "provenance",
  "ready_for_user_review",
  "ready_to_apply",
  "applied",
  "rejected",
  "cancelled",
  "errored",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(s: string): s is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(s);
}

export type JobSource = "imported" | "discovered" | "manual";

export type StatusHistoryEntry = {
  at: string; // ISO timestamp
  from: JobStatus | null;
  to: JobStatus;
  note?: string;
};

export type JobOutcome =
  | "awaiting_response"
  | "phone_screen"
  | "interview"
  | "rejected"
  | "offer"
  | "ghosted";

export type Job = {
  /** Stable slug derived from company/role folder names. */
  id: string;
  company: string;
  role: string;
  /** Absolute path to apps/<Company>/<Role>/. null when discovery created
   *  this row but it hasn't been dispatched yet. */
  folderPath: string | null;
  status: JobStatus;
  source: JobSource;
  sourceUrl: string | null;
  /** ISO. Best-effort — file mtime for imported jobs, real timestamp otherwise. */
  discoveredAt: string;
  /** ISO. Updated on every status transition. */
  updatedAt: string;
  statusHistory: StatusHistoryEntry[];
  /** The most recent note about the current status. Recorded on every
   *  updateJob that passes a statusNote — including same-status updates
   *  (e.g. an HM-review pass that re-affirms `hm_review` with a "needs
   *  revision" note). statusHistory only captures notes on status
   *  *changes*, so without this field a same-status note was silently
   *  dropped and the user never saw the agent's feedback signal. */
  statusNote?: string;
  /** Set when an imported job hasn't been reclassified yet. */
  reclassifySuggestion?: JobStatus | null;
  notes?: string;
  outcome?: JobOutcome;
  /** Most recent agent run for this job, regardless of phase. */
  latestRunId?: string | null;
  latestRunPhase?: string | null;
  /** Archetype key the dispatcher chose for this job. Drives the draft
   *  agent's base-resume selection. */
  chosenArchetypeKey?: string | null;
  /** How many times the orchestrator has scheduled a retry for the
   *  current phase because of a transient failure (Anthropic API
   *  rate-limiting, typically). Resets to 0 on a successful run.
   *  Counted by lib/runs/retry.ts; capped at MAX_RETRY_ATTEMPTS (4). */
  retryAttempts?: number;
};

/** What a list endpoint returns per row. Full Job for now; thin if needed later. */
export type JobListEntry = Job;
