import "server-only";
/**
 * Run-state orphan cleanup. If the server is killed mid-run, the Claude
 * Code subprocess dies but the .state/runs/<runId>.log file is frozen
 * at meta.status="running" forever. Downstream state (Job records,
 * Archetype loops) that points at those runs lies about activity until
 * something forces a reconciliation.
 *
 * On first call (from broker.startRun + page renders) this module:
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
 *   3. Walks <workspace>/.state/jobs/*.json. For every Job in a
 *      transient pipeline status (dispatching / researching / drafting
 *      / hm_review / provenance) whose latestRunId resolves to a
 *      non-running run, resets the Job to status="errored" with a
 *      statusNote explaining WHY (orphaned / timed_out / failed). The
 *      user then sees the Job in the Errored column and can re-dispatch.
 *
 * Idempotent and cached-once-per-process — same shape as ensureSystemFiles.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { APPS_DIR, META_DIR, STATE_DIR } from "../paths";
import {
  readRunsIndex,
  upsertRunIndex,
} from "./store";
import type { RunMetadata } from "./types";

const RUNS_DIR = path.join(STATE_DIR, "runs");
const ARCHETYPES_DIR = path.join(META_DIR, "archetypes");
const JOBS_DIR = path.join(STATE_DIR, "jobs");

const TRANSIENT_JOB_STATUSES = new Set([
  "dispatching",
  "researching",
  "drafting",
  "hm_review",
  "provenance",
]);

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
  // Jobs need reconciliation against the *final* state of every run,
  // not just orphaned ones — a run that completed with exitCode=143
  // (timeout) leaves the Job stuck too. Pass the full runs index so
  // sweepJobs can look up status by latestRunId.
  await sweepJobs();
  // Link orphaned folders on disk back to their owning Jobs by URL.
  // Catches the legacy case where a dispatcher died mid-run, leaving
  // apps/<Co>/<Role>/ on disk but the Job's folderPath still null.
  // Going forward, the dispatcher writes `.prism-job-id` sidecars when
  // it creates the folder, so new orphans don't happen — this only
  // fixes the existing data drift.
  await linkOrphanFolders();
  if (orphanedRunIds.size > 0) {
    await sweepArchetypes(orphanedRunIds);
  }
}

async function sweepJobs(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(JOBS_DIR);
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
  // Build a runId → meta map once. The runs index has post-sweep state
  // so all "running" entries have already been promoted to "failed".
  const runIndex = await readRunsIndex();
  const runByid = new Map(runIndex.map((r) => [r.runId, r] as const));

  let reset = 0;
  for (const name of entries) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const p = path.join(JOBS_DIR, name);
    let job: any;
    try {
      job = JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      continue;
    }
    const status = job?.status as string | undefined;
    const runId = job?.latestRunId as string | undefined;
    if (!status || !TRANSIENT_JOB_STATUSES.has(status) || !runId) continue;
    const run = runByid.get(runId);
    if (!run) continue;
    // The Job's underlying run is no longer active — reconcile.
    if (run.status === "running") continue;

    const reason = describeReason(run);
    job.status = "errored";
    const note = `Run ${runId.slice(0, 8)} ${reason}. Job left ${status} until orphan-sweep reconciled.`;
    // Append a statusHistory entry so the trail isn't lost.
    job.statusHistory = Array.isArray(job.statusHistory) ? job.statusHistory : [];
    job.statusHistory.push({
      at: new Date().toISOString(),
      from: status,
      to: "errored",
      note,
    });
    job.updatedAt = new Date().toISOString();
    try {
      await fs.writeFile(p, JSON.stringify(job, null, 2) + "\n", "utf8");
      reset++;
    } catch {
      // ignore; next sweep retries
    }
  }
  if (reset > 0) {
    console.warn(
      `[orphan-sweep] reconciled ${reset} Job${reset === 1 ? "" : "s"} stuck in a transient state with a dead underlying run`,
    );
  }
}

/**
 * Walk apps/<Co>/<Role>/ folders. For any folder without a
 * .prism-job-id sidecar AND not owned by any Job's folderPath, read
 * its job_description.md to find the source URL, look up the Job by
 * matching sourceUrl, and:
 *   - write `.prism-job-id` sidecar so import-preview skips the folder
 *   - update the Job's folderPath so a future re-dispatch reuses it
 *
 * One-time data migration for folders that pre-date the sidecar fix.
 * Cheap on subsequent runs (early-exits if no Jobs lack folderPath).
 */
async function linkOrphanFolders(): Promise<void> {
  let companies: string[];
  try {
    companies = (await fs.readdir(APPS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }

  // Load all Jobs into a URL → Job map. We're looking for matches where
  // a Job has a sourceUrl but no (or wrong) folderPath.
  let entries: string[];
  try {
    entries = await fs.readdir(JOBS_DIR);
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }

  type SimpleJob = {
    id: string;
    sourceUrl: string | null;
    folderPath: string | null;
    raw: any;
    diskPath: string;
  };
  const byUrl = new Map<string, SimpleJob>();
  const ownedPaths = new Set<string>();
  for (const name of entries) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const p = path.join(JOBS_DIR, name);
    let j: any;
    try {
      j = JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      continue;
    }
    if (j?.folderPath) ownedPaths.add(j.folderPath);
    if (typeof j?.sourceUrl === "string" && j.sourceUrl) {
      // Prefer Jobs that don't already have a folderPath set when
      // multiple share a URL.
      const existing = byUrl.get(j.sourceUrl);
      if (!existing || (existing.folderPath && !j.folderPath)) {
        byUrl.set(j.sourceUrl, {
          id: j.id,
          sourceUrl: j.sourceUrl,
          folderPath: j.folderPath ?? null,
          raw: j,
          diskPath: p,
        });
      }
    }
  }

  let linked = 0;
  for (const company of companies) {
    let roles: string[];
    try {
      roles = (
        await fs.readdir(path.join(APPS_DIR, company), { withFileTypes: true })
      )
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const role of roles) {
      const folderAbs = path.join(APPS_DIR, company, role);
      // Skip if claimed already (sidecar OR folderPath ownership).
      try {
        await fs.stat(path.join(folderAbs, ".prism-job-id"));
        continue;
      } catch {}
      if (ownedPaths.has(folderAbs)) continue;

      // Extract source URL from job_description.md.
      let jdContent: string;
      try {
        jdContent = await fs.readFile(
          path.join(folderAbs, "job_description.md"),
          "utf8",
        );
      } catch {
        continue;
      }
      const urlMatch = jdContent.match(/https?:\/\/[^\s)"<>]+/);
      if (!urlMatch) continue;
      // Clean trailing punctuation a URL extractor might pick up.
      const url = urlMatch[0].replace(/[.,;:'"`)]+$/, "");
      const job = byUrl.get(url);
      if (!job) continue;

      // Link: write sidecar + update Job's folderPath.
      try {
        await fs.writeFile(
          path.join(folderAbs, ".prism-job-id"),
          job.id,
          "utf8",
        );
        const updated = {
          ...job.raw,
          folderPath: folderAbs,
          updatedAt: new Date().toISOString(),
        };
        await fs.writeFile(
          job.diskPath,
          JSON.stringify(updated, null, 2) + "\n",
          "utf8",
        );
        linked++;
      } catch {
        // best-effort; next sweep retries
      }
    }
  }
  if (linked > 0) {
    console.warn(
      `[orphan-sweep] linked ${linked} orphan folder${linked === 1 ? "" : "s"} back to their owning Jobs by URL match`,
    );
  }
}

function describeReason(run: RunMetadata): string {
  if (run.status === "timed_out") return "timed out";
  if (run.status === "cancelled") return "was cancelled";
  if (run.rateLimited) return "hit Anthropic API rate limits";
  if (run.finalText && /orphan/i.test(run.finalText)) return "was orphaned by a server restart";
  if (run.permissionDenials && run.permissionDenials.length > 0) {
    return `was denied tools the agent needed (${run.permissionDenials.map((d) => d.toolName).join(", ")})`;
  }
  return `ended with status ${run.status} (exit ${run.exitCode ?? "?"})`;
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
