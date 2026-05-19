import "server-only";
/**
 * Run-state orphan cleanup. If the server is killed mid-run, the Claude
 * Code subprocess dies but the .state/runs/<runId>.log file is frozen
 * at meta.status="running" forever — the Runs page lies about state,
 * AND the archetype concurrency guard reads baseStatus="generating" on
 * an archetype whose actual subprocess is dead, blocking any new
 * generation attempt on that archetype.
 *
 * On first call (from broker.startRun) this module:
 *
 *   1. Walks the runs index. For every entry with status="running",
 *      appends a synthetic meta_end + completion event to the run's log
 *      with status="failed" and a note ("orphaned by server restart"),
 *      then rewrites the index entry.
 *
 *   2. Walks <workspace>/_meta/archetypes/*.json. For every archetype
 *      with baseStatus="generating" or "reviewing" whose baseLatestRunId
 *      points at an orphaned run, resets baseStatus="errored" and writes
 *      a baseLastFeedback explaining the orphan.
 *
 * Idempotent and cached-once-per-process — same shape as ensureSystemFiles.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { META_DIR, STATE_DIR } from "../paths";
import {
  readRunsIndex,
  upsertRunIndex,
} from "./store";
import type { RunMetadata } from "./types";

const RUNS_DIR = path.join(STATE_DIR, "runs");
const ARCHETYPES_DIR = path.join(META_DIR, "archetypes");

let cachedRun: Promise<void> | null = null;

export function ensureOrphanSweep(): Promise<void> {
  if (!cachedRun) {
    cachedRun = doSweep().catch((err) => {
      // Don't block agent runs if cleanup fails — log and let the next
      // process restart retry. Stale state is annoying, not fatal.
      console.warn(`[orphan-sweep] sweep failed: ${String(err?.message ?? err)}`);
      cachedRun = null;
    });
  }
  return cachedRun;
}

async function doSweep(): Promise<void> {
  const orphanedRunIds = await sweepRuns();
  if (orphanedRunIds.size > 0) {
    await sweepArchetypes(orphanedRunIds);
  }
}

async function sweepRuns(): Promise<Set<string>> {
  const orphaned = new Set<string>();
  const all = await readRunsIndex();
  const note = "orphaned by server restart — process died before run completed";
  const now = new Date().toISOString();
  for (const meta of all) {
    if (meta.status !== "running") continue;
    orphaned.add(meta.runId);
    const fixed: RunMetadata = {
      ...meta,
      status: "failed",
      exitCode: -1,
      completedAt: now,
      finalText: meta.finalText ?? note,
    };
    await appendSyntheticTerminator(meta.runId, fixed, note).catch(() => {});
    await upsertRunIndex(fixed).catch(() => {});
  }
  if (orphaned.size > 0) {
    console.warn(
      `[orphan-sweep] cleaned ${orphaned.size} orphaned run${orphaned.size === 1 ? "" : "s"}`,
    );
  }
  return orphaned;
}

async function appendSyntheticTerminator(
  runId: string,
  fixedMeta: RunMetadata,
  note: string,
): Promise<void> {
  const logPath = path.join(RUNS_DIR, `${runId}.log`);
  // Best-effort append — don't fail the whole sweep on a single bad log.
  const terminator =
    JSON.stringify({
      kind: "event",
      seq: -1,
      at: fixedMeta.completedAt,
      event: { type: "completed", exitCode: -1, note },
    }) +
    "\n" +
    JSON.stringify({ kind: "meta_end", meta: fixedMeta }) +
    "\n";
  await fs.appendFile(logPath, terminator, "utf8").catch(() => {});
}

async function sweepArchetypes(orphanedRunIds: Set<string>): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(ARCHETYPES_DIR);
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
  for (const name of entries) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const p = path.join(ARCHETYPES_DIR, name);
    let archetype: any;
    try {
      archetype = JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      continue;
    }
    const status = archetype?.baseStatus;
    const latestRunId = archetype?.baseLatestRunId;
    const isTransient = status === "generating" || status === "reviewing";
    if (!isTransient || !latestRunId || !orphanedRunIds.has(latestRunId)) {
      continue;
    }
    const note =
      `orphaned by server restart — the run that was ${status} (id ${latestRunId.slice(0, 8)}) died ` +
      `with the server process. Click Restart to start a fresh loop, or Generate base resume to retry.`;
    archetype.baseStatus = "errored";
    archetype.baseLastFeedback = note;
    archetype.updatedAt = new Date().toISOString();
    try {
      await fs.writeFile(p, JSON.stringify(archetype, null, 2) + "\n", "utf8");
      console.warn(
        `[orphan-sweep] reset archetype ${archetype.key} (was ${status}, run ${latestRunId.slice(0, 8)})`,
      );
    } catch {
      // ignore; next sweep will retry if the file is recoverable
    }
  }
}
