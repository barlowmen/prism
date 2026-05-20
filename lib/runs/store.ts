import "server-only";
/**
 * Disk persistence for run metadata + every stream event.
 *
 * Layout under <workspace>/.state/:
 *   runs.json                  — index of all runs (one line of meta per run)
 *   runs/<runId>.log           — JSONL stream of every event for one run
 *
 * RunLogWriter buffers in-memory writes and flushes asynchronously so
 * the broker can keep accepting stream events without await-on-fs on the
 * hot path. The Runs page reads runs.json; the SSE replay path reads
 * <runId>.log.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { STATE_DIR } from "../paths";
import type { RecordedEvent, RunMetadata, RunStatus } from "./types";
import type { AgentStreamEvent } from "../claude-launcher";

const RUNS_DIR = path.join(STATE_DIR, "runs");
const RUNS_INDEX = path.join(STATE_DIR, "runs.json");

async function ensureRunsDir() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

function logPath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.log`);
}

export async function readRunLog(runId: string): Promise<{
  meta: RunMetadata | null;
  events: RecordedEvent[];
}> {
  const p = logPath(runId);
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return { meta: null, events: [] };
    throw err;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let meta: RunMetadata | null = null;
  const events: RecordedEvent[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.kind === "meta_start" || obj.kind === "meta_end") {
        meta = obj.meta as RunMetadata;
      } else if (obj.kind === "event") {
        events.push({ seq: obj.seq, at: obj.at, event: obj.event });
      }
    } catch {
      // Skip malformed lines rather than crashing the reader.
    }
  }
  return { meta, events };
}

export async function readRunsIndex(): Promise<RunMetadata[]> {
  try {
    const raw = await fs.readFile(RUNS_INDEX, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.runs)) return parsed.runs as RunMetadata[];
    return [];
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

async function writeRunsIndex(runs: RunMetadata[]): Promise<void> {
  await ensureRunsDir();
  const tmp = RUNS_INDEX + "." + randomUUID() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify({ runs }, null, 2) + "\n", "utf8");
  await fs.rename(tmp, RUNS_INDEX);
}

/** Append-only writer for the per-run log. One JSON object per line. */
export class RunLogWriter {
  private buf: string[] = [];
  private flushing: Promise<void> = Promise.resolve();
  private seq = 0;

  constructor(public readonly runId: string) {}

  private async ensureDir() {
    await ensureRunsDir();
  }

  async writeMetaStart(meta: RunMetadata): Promise<void> {
    await this.ensureDir();
    await fs.appendFile(
      logPath(this.runId),
      JSON.stringify({ kind: "meta_start", meta }) + "\n",
      "utf8",
    );
  }

  async writeMetaEnd(meta: RunMetadata): Promise<void> {
    await this.ensureDir();
    await fs.appendFile(
      logPath(this.runId),
      JSON.stringify({ kind: "meta_end", meta }) + "\n",
      "utf8",
    );
  }

  /** Append an event line. Best-effort batched via appendFile. */
  async appendEvent(event: AgentStreamEvent): Promise<RecordedEvent> {
    const recorded: RecordedEvent = {
      seq: this.seq++,
      at: new Date().toISOString(),
      event,
    };
    const line = JSON.stringify({ kind: "event", ...recorded }) + "\n";
    this.buf.push(line);
    // Coalesce writes: chain a flush after the previous one resolves.
    this.flushing = this.flushing.then(async () => {
      if (this.buf.length === 0) return;
      const toWrite = this.buf.join("");
      this.buf = [];
      try {
        await fs.appendFile(logPath(this.runId), toWrite, "utf8");
      } catch {
        // Don't crash the agent on disk errors; just lose this batch.
      }
    });
    return recorded;
  }

  async drain(): Promise<void> {
    await this.flushing;
  }
}

/** Update the runs index with one record (insert or replace by runId). */
export async function upsertRunIndex(meta: RunMetadata): Promise<void> {
  const all = await readRunsIndex();
  const idx = all.findIndex((r) => r.runId === meta.runId);
  if (idx >= 0) all[idx] = meta;
  else all.unshift(meta);
  // Cap the index to avoid unbounded growth.
  await writeRunsIndex(all.slice(0, 2000));
}

/**
 * Find runs that are still "running" by walking the persisted index.
 * Used by server components to re-attach AgentRunPane on page render
 * after the spawning page lost its React state (e.g. navigation +
 * back). Optional filters narrow by phase or jobId.
 *
 * Returns newest-first.
 */
export async function findActiveRuns(filter?: {
  phase?: string;
  jobId?: string;
}): Promise<RunMetadata[]> {
  const all = await readRunsIndex();
  return all.filter((r) => {
    if (r.status !== "running") return false;
    if (filter?.phase && r.phase !== filter.phase) return false;
    if (filter?.jobId && r.jobId !== filter.jobId) return false;
    return true;
  });
}

export function newRunId(): string {
  return randomUUID();
}

export function emptyTokenTotals(): RunMetadata["tokenTotals"] {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

export function statusFromExit(
  exitCode: number,
  timedOut: boolean,
  cancelled: boolean,
): RunStatus {
  if (cancelled) return "cancelled";
  if (timedOut) return "timed_out";
  if (exitCode === 0) return "completed";
  return "failed";
}

export { logPath };
