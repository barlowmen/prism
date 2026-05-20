import "server-only";
/**
 * One-shot cleanup of `pasted_<uuid>.json` shadow records that the
 * dispatcher never managed to rename (or that were created before the
 * rename logic was added). For each pasted_* record:
 *
 *   - If a non-pasted Job exists with the same folderPath → the
 *     pasted record is a true shadow → delete it.
 *   - If no other Job owns the folder → preserve it. It may still get
 *     renamed on a future dispatcher run.
 *
 * Same cached-once-per-process pattern as ensureSystemFiles /
 * ensureOrphanSweep. Cheap (just file reads + a few deletes); runs on
 * first listJobs / readRunsIndex call after server start.
 */
import fs from "node:fs/promises";
import path from "node:path";
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
  const pasted = all.filter((j) => j.id.startsWith("pasted_"));
  if (pasted.length === 0) return;

  // Build a map of folderPath → list of jobs owning it (excluding the
  // pasted_* ones we're considering for deletion).
  const owners = new Map<string, typeof all>();
  for (const j of all) {
    if (j.id.startsWith("pasted_")) continue;
    if (!j.folderPath) continue;
    const list = owners.get(j.folderPath) ?? [];
    list.push(j);
    owners.set(j.folderPath, list);
  }

  let deleted = 0;
  for (const shadow of pasted) {
    if (!shadow.folderPath) continue;
    const competitors = owners.get(shadow.folderPath);
    if (!competitors || competitors.length === 0) continue;
    // A non-pasted record owns the same folder. Drop the shadow.
    const shadowPath = path.join(JOBS_DIR, `${shadow.id}.json`);
    try {
      await fs.unlink(shadowPath);
      deleted++;
    } catch {
      // Race or already-gone; ignore.
    }
  }
  if (deleted > 0) {
    console.warn(
      `[shadow-dedupe] removed ${deleted} pasted_* shadow record${deleted === 1 ? "" : "s"} that duplicated existing Company__Role records`,
    );
  }
}
