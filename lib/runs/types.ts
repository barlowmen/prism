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
