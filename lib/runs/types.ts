/**
 * Run-broker type definitions. Persisted in .state/runs.json (one
 * RunMetadata per run) and .state/runs/<runId>.log (RunLogLine per
 * line, ordered by seq).
 */
import type { AgentPhase, AgentStreamEvent } from "../claude-launcher";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type RunMetadata = {
  runId: string;
  jobId: string | null;
  phase: AgentPhase;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  exitCode: number | null;
  apiKeySource: string | null;
  tokenTotals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  /** Final assistant text (often contains the <result>...</result> tag). */
  finalText: string | null;
  /** Extracted structured payload from the <result> tag, if parseable. */
  structuredPayload: unknown;
  /**
   * Tools the agent tried to invoke that Claude Code denied (typically
   * because the workspace `.claude/settings.json` doesn't allow them).
   * Extracted from the CLI's structuredResult.permission_denials at
   * completion. Orchestrators surface this to the user instead of the
   * generic "DOCX not on disk" / "no parseable verdict" errors that
   * the denial path used to produce.
   */
  permissionDenials: Array<{ toolName: string; command?: string }>;
  /**
   * True when the run's finalText contains Anthropic's server-side
   * rate-limit signature ("API Error … Rate limited" / "temporarily
   * limiting requests"). This is distinct from the user's subscription
   * quota — it's API load shedding. Orchestrators check this before
   * marking jobs errored and route through scheduleRetry instead so
   * the user doesn't have to manually re-dispatch every transient
   * failure.
   */
  rateLimited: boolean;
};

/** A line in the per-run log file. */
export type RunLogLine =
  | ({ kind: "event" } & RecordedEvent)
  | { kind: "meta_start"; meta: RunMetadata }
  | { kind: "meta_end"; meta: RunMetadata };

export type RecordedEvent = {
  seq: number;
  at: string;
  event: AgentStreamEvent;
};
