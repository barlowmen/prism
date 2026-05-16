import "server-only";
import { launchClaude, type AgentPhase, type AgentStreamEvent, type LaunchResult } from "../claude-launcher";
import {
  RunLogWriter,
  emptyTokenTotals,
  newRunId,
  readRunLog,
  statusFromExit,
  upsertRunIndex,
} from "./store";
import type { RecordedEvent, RunMetadata } from "./types";

type Listener = (e: RecordedEvent) => void;

type RunState = {
  meta: RunMetadata;
  events: RecordedEvent[]; // recent buffer; full log lives on disk
  listeners: Set<Listener>;
  completed: boolean;
  cancel: () => void;
  result?: LaunchResult;
};

const runs = new Map<string, RunState>();

const MAX_BUFFER = 1000;

export type StartRunInput = {
  jobId: string | null;
  phase: AgentPhase;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  resumeSessionId?: string;
  appendSystemPrompt?: string;
};

/** Start a run and return its id. Events stream via subscribe(); state
 *  persists to disk. */
export function startRun(input: StartRunInput): {
  runId: string;
  meta: RunMetadata;
  done: Promise<LaunchResult>;
} {
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const meta: RunMetadata = {
    runId,
    jobId: input.jobId,
    phase: input.phase,
    startedAt,
    completedAt: null,
    status: "running",
    exitCode: null,
    apiKeySource: null,
    tokenTotals: emptyTokenTotals(),
    finalText: null,
    structuredPayload: null,
  };

  const writer = new RunLogWriter(runId);
  const state: RunState = {
    meta,
    events: [],
    listeners: new Set(),
    completed: false,
    cancel: () => {},
  };
  runs.set(runId, state);

  // Persist initial meta + push to index in the background.
  writer.writeMetaStart(meta).catch(() => {});
  upsertRunIndex(meta).catch(() => {});

  const onStreamEvent = (e: AgentStreamEvent) => {
    // Update aggregate tokens in meta as usage events arrive.
    if (e.type === "usage") {
      meta.tokenTotals.input += e.inputTokens;
      meta.tokenTotals.output += e.outputTokens;
      meta.tokenTotals.cacheRead += e.cacheReadTokens ?? 0;
      meta.tokenTotals.cacheCreation += e.cacheCreationTokens ?? 0;
    }
    writer.appendEvent(e).then((recorded) => {
      state.events.push(recorded);
      if (state.events.length > MAX_BUFFER) {
        state.events.splice(0, state.events.length - MAX_BUFFER);
      }
      for (const l of state.listeners) {
        try {
          l(recorded);
        } catch {}
      }
    });
  };

  const { cancel, done } = launchClaude({
    prompt: input.prompt,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    phase: input.phase,
    jobId: input.jobId ?? undefined,
    resumeSessionId: input.resumeSessionId,
    appendSystemPrompt: input.appendSystemPrompt,
    onStreamEvent,
  });
  state.cancel = cancel;

  done
    .then(async (r) => {
      state.result = r;
      meta.exitCode = r.exitCode;
      meta.apiKeySource = r.apiKeySource ?? null;
      meta.completedAt = new Date().toISOString();
      meta.finalText = r.finalText ?? null;
      meta.status = statusFromExit(r.exitCode, r.timedOut, /*cancelled*/ false);
      meta.structuredPayload = extractResultPayload(r.finalText ?? "");

      await writer.drain();
      await writer.writeMetaEnd(meta);
      await upsertRunIndex(meta);

      state.completed = true;
      // Send a synthetic "run_complete" so SSE clients can flush.
      const recorded: RecordedEvent = {
        seq: state.events.length,
        at: meta.completedAt,
        event: { type: "completed", exitCode: r.exitCode, structuredResult: r.structuredResult },
      };
      state.events.push(recorded);
      for (const l of state.listeners) {
        try {
          l(recorded);
        } catch {}
      }
    })
    .catch(async (err) => {
      meta.completedAt = new Date().toISOString();
      meta.status = "failed";
      meta.exitCode = -1;
      await writer.drain();
      await writer.writeMetaEnd(meta);
      await upsertRunIndex(meta);
      state.completed = true;
      const recorded: RecordedEvent = {
        seq: state.events.length,
        at: meta.completedAt,
        event: { type: "stderr", text: `broker: ${String(err)}` },
      };
      state.events.push(recorded);
      for (const l of state.listeners) {
        try {
          l(recorded);
        } catch {}
      }
    });

  return { runId, meta, done };
}

export function subscribe(runId: string, listener: Listener): () => void {
  const state = runs.get(runId);
  if (!state) return () => {};
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function getRunSnapshot(runId: string): {
  meta: RunMetadata;
  events: RecordedEvent[];
  completed: boolean;
} | null {
  const state = runs.get(runId);
  if (!state) return null;
  return { meta: state.meta, events: state.events, completed: state.completed };
}

/** Cancel a running run. Marks meta cancelled; partial files preserved. */
export async function cancelRun(runId: string): Promise<boolean> {
  const state = runs.get(runId);
  if (!state || state.completed) return false;
  state.meta.status = "cancelled";
  state.cancel();
  return true;
}

/**
 * SSE-friendly replay: returns events from disk for a run that's no
 * longer in memory (e.g. server restart between dispatch and reconnect).
 */
export async function replayFromDisk(runId: string): Promise<{
  meta: RunMetadata | null;
  events: RecordedEvent[];
}> {
  return readRunLog(runId);
}

function extractResultPayload(finalText: string): unknown {
  const m = finalText.match(/<result>([\s\S]*?)<\/result>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

/** Wait for a run to complete. */
export async function awaitRun(runId: string, timeoutMs?: number): Promise<RunMetadata> {
  const state = runs.get(runId);
  if (!state) {
    const { meta } = await readRunLog(runId);
    if (meta && meta.completedAt) return meta;
    throw new Error(`run_not_found:${runId}`);
  }
  if (state.completed) return state.meta;
  await new Promise<void>((resolve, reject) => {
    const t = timeoutMs
      ? setTimeout(() => reject(new Error("run_await_timeout")), timeoutMs)
      : null;
    const off = subscribe(runId, (e) => {
      if (state.completed || e.event.type === "completed") {
        if (t) clearTimeout(t);
        off();
        resolve();
      }
    });
  });
  return state.meta;
}
