import "server-only";
/**
 * In-process broker for live Claude Code runs.
 *
 * Each call to startRun() spawns a Claude Code subprocess (via
 * launchClaude), persists run metadata + every stream event to disk,
 * and maintains an in-memory buffer plus a set of SSE listener
 * callbacks. The SSE route at /api/agent-runs/<runId>/stream
 * subscribes to this broker for live updates and falls back to
 * replayFromDisk() when the broker no longer knows about the run
 * (server restart between dispatch and reconnect).
 *
 * State transitions:
 *   running → completed | failed | cancelled | timed_out
 *
 * Persistence is the source of truth — the Runs page and the disk
 * replay path both read the same .state/runs/<runId>.log files.
 */
import { launchClaude, type AgentPhase, type AgentStreamEvent, type LaunchResult } from "../claude-launcher";
import { ensureSystemFiles } from "../system-files";
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
 *  persists to disk.
 *
 *  Awaits ensureSystemFiles() before spawning so the agent's first reads
 *  of `_meta/workflow.md` / `_meta/resume_style_guide_2026.md` /
 *  `_meta/build_resume_template.js` see the bundled defaults on a
 *  fresh workspace. The system-files cache means subsequent calls in
 *  the same process are effectively free. */
export async function startRun(input: StartRunInput): Promise<{
  runId: string;
  meta: RunMetadata;
  done: Promise<LaunchResult>;
}> {
  await ensureSystemFiles();
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
    permissionDenials: [],
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

  /**
   * Debounce live updates of the runs index. The in-memory meta object
   * keeps accumulating tokenTotals on every `usage` event; without this,
   * the index file stayed at zero until meta_end, so the Runs page
   * showed `tokens=0 · duration=—` for the entire 5–20 min agent
   * lifetime. We refresh the index every ~3 s while a run is in flight
   * so the Runs page (with its 5 s router.refresh poll) actually shows
   * live token consumption and a "running for Xm" duration computed
   * client-side from startedAt.
   */
  const INDEX_REFRESH_MS = 3000;
  let lastIndexRefresh = Date.now();
  const maybeRefreshIndex = () => {
    const now = Date.now();
    if (now - lastIndexRefresh < INDEX_REFRESH_MS) return;
    lastIndexRefresh = now;
    upsertRunIndex(meta).catch(() => {});
  };

  const onStreamEvent = (e: AgentStreamEvent) => {
    // Update aggregate tokens in meta as usage events arrive.
    if (e.type === "usage") {
      meta.tokenTotals.input += e.inputTokens;
      meta.tokenTotals.output += e.outputTokens;
      meta.tokenTotals.cacheRead += e.cacheReadTokens ?? 0;
      meta.tokenTotals.cacheCreation += e.cacheCreationTokens ?? 0;
      maybeRefreshIndex();
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
      meta.permissionDenials = extractPermissionDenials(r.structuredResult);

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

/**
 * Pull the `permission_denials` array out of Claude Code's
 * structuredResult and shape it into a smaller, typed form. Orchestrators
 * use this to detect when a run "completed" cleanly (exitCode 0) but
 * actually failed because the agent couldn't get permission for a tool
 * it needed — surface that to the user as a specific, actionable error
 * instead of a generic "completed but DOCX not on disk".
 */
function extractPermissionDenials(
  structuredResult: unknown,
): Array<{ toolName: string; command?: string }> {
  if (!structuredResult || typeof structuredResult !== "object") return [];
  const raw = (structuredResult as { permission_denials?: unknown }).permission_denials;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ toolName: string; command?: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const toolName = typeof (entry as any).tool_name === "string"
      ? (entry as any).tool_name
      : "";
    if (!toolName) continue;
    const command =
      typeof (entry as any).tool_input === "object"
      && typeof (entry as any).tool_input?.command === "string"
        ? (entry as any).tool_input.command
        : undefined;
    out.push({ toolName, command });
  }
  return out;
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
