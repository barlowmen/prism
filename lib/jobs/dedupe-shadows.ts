import "server-only";
/**
 * One-shot cleanup of duplicate Job records. Two shadow patterns get
 * caught:
 *
 *   1. **pasted_<uuid>** records that the dispatcher never managed to
 *      rename (rename logic only landed in #35; older sessions left
 *      these behind). Drop if any non-pasted Job owns the same folder.
 *
 *   2. **imported** records that overlap an in-flight pipeline Job.
 *      The user clicked "Import folders" before the import API had
 *      its folderPath ownership check; result: two records, same
 *      folder + URL, one in status="imported" + the other at
 *      researching/awaiting_input/etc. Drop the imported record —
 *      the active pipeline one is the real Job.
 *
 * Same cached-once-per-process pattern as ensureSystemFiles /
 * ensureOrphanSweep. Cheap (just file reads + a few deletes); runs on
 * first listJobs call after server start.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Job } from "./types";
import { STATE_DIR } from "../paths";
import { listJobs } from "./store";

const JOBS_DIR = path.join(STATE_DIR, "jobs");

let cachedRun: Promise<void> | null = null;

export function ensureShadowDedupe(): Promise<void> {
  if (!cachedRun) {
    cachedRun = sweep().catch((err) => {
      console.warn(`[shadow-dedupe] failed: ${String(err?.message ?? err)}`);
      cachedRun = null;
    });
  }
  return cachedRun;
}

async function sweep(): Promise<void> {
  const all = await listJobs();
  // Group by folderPath; only paths owned by 2+ records can have shadows.
  const byFolder = new Map<string, Job[]>();
  for (const j of all) {
    if (!j.folderPath) continue;
    const list = byFolder.get(j.folderPath) ?? [];
    list.push(j);
    byFolder.set(j.folderPath, list);
  }

  let deleted = 0;
  for (const [folder, owners] of byFolder) {
    if (owners.length < 2) continue;
    // Pick the canonical record: prefer the one with the most-advanced
    // pipeline status. Fall back to "not pasted_*" then "not imported".
    const canonical = pickCanonical(owners);
    if (!canonical) continue;
    for (const j of owners) {
      if (j.id === canonical.id) continue;
      if (!isShadowOf(j, canonical)) continue;
      const shadowPath = path.join(JOBS_DIR, `${j.id}.json`);
      try {
        await fs.unlink(shadowPath);
        deleted++;
      } catch {
        // Race or already-gone; ignore.
      }
    }
  }
  if (deleted > 0) {
    console.warn(
      `[shadow-dedupe] removed ${deleted} duplicate Job record${deleted === 1 ? "" : "s"} sharing a folderPath with another record`,
    );
  }
}

/** Of N Jobs sharing a folderPath, which one is the "real" one to keep? */
function pickCanonical(owners: Job[]): Job | null {
  // Status priority: further along in the pipeline wins. Imported and
  // pasted_* are at the bottom — they're the shadow shapes.
  const PRIORITY: Record<string, number> = {
    applied: 100,
    ready_to_apply: 95,
    ready_for_user_review: 90,
    provenance: 85,
    hm_review: 80,
    drafting: 75,
    researching: 70,
    awaiting_input: 65,
    dispatching: 60,
    recommended_skip: 50,
    queued: 45,
    discovered: 40,
    held: 35,
    skipped: 30,
    rejected: 25,
    cancelled: 20,
    errored: 15,
    imported: 5, // shadow-prone
  };
  const score = (j: Job) => {
    let s = PRIORITY[j.status] ?? 10;
    if (j.id.startsWith("pasted_")) s -= 1; // tiebreak away from pasted ids
    return s;
  };
  return [...owners].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Only consider a candidate a "shadow" if it's safely deletable —
 *  i.e. its status is one of the known shadow-prone bottom buckets,
 *  not e.g. an applied/done state we'd accidentally erase. */
function isShadowOf(candidate: Job, _canonical: Job): boolean {
  if (candidate.id.startsWith("pasted_")) return true;
  if (candidate.status === "imported") return true;
  // Conservative: don't touch anything in an in-flight or terminal-real
  // state. Manual review only.
  return false;
}
