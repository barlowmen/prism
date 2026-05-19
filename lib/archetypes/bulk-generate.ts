import "server-only";
/**
 * Bulk base-resume generation — kicks off generation loops for many
 * archetypes with a concurrency cap on the *archetype loop* (not the
 * underlying run). Mirrors lib/jobs/bulk-paste.ts:bulkDispatchInBackground
 * but with one wrinkle: a single archetype loop is multi-run
 * (generation → review → maybe redraft → maybe review → …). The worker
 * keeps awaiting each new run until baseStatus settles into a terminal
 * state (ready / stalled / errored / none).
 */
import { listArchetypes, readArchetype } from "./store";
import { startBaseGeneration } from "../agents/base-resume";
import { awaitRun } from "../runs/broker";

const POLL_MS = 1500;
/** Hard ceiling so a stuck loop can't pin a worker forever. The
 *  orchestrator's per-phase timeouts already cap individual runs; this
 *  is just belt-and-suspenders. */
const PER_ARCHETYPE_WALL_CLOCK_MS = 90 * 60 * 1000;

export type BulkGenerateResult = {
  total: number;
  queued: string[];
  alreadyHasBase: string[];
};

export async function planBulkGenerate(
  includeExisting: boolean,
): Promise<BulkGenerateResult> {
  const all = await listArchetypes();
  const queued: string[] = [];
  const alreadyHasBase: string[] = [];
  for (const a of all) {
    if (a.baseResumePath && !includeExisting) {
      alreadyHasBase.push(a.key);
    } else {
      queued.push(a.key);
    }
  }
  return { total: all.length, queued, alreadyHasBase };
}

/**
 * Fire-and-forget background runner. The handler returns immediately
 * with the plan; this drives the actual loops afterward.
 */
export async function bulkGenerateInBackground(
  keys: string[],
  concurrency: number,
): Promise<void> {
  const clamped = Math.max(1, Math.min(concurrency, 5));
  let nextIdx = 0;

  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= keys.length) return;
      const key = keys[i];
      const startedAt = Date.now();
      try {
        // Kick the first generation run.
        const { runId: firstRunId } = await startBaseGeneration({ archetypeKey: key });
        let currentRunId: string | null = firstRunId;

        // Each completed run may trigger the next (orchestrator routes
        // generation → review → maybe back to generation). Track via
        // baseLatestRunId on the archetype; await whatever it points to
        // until baseStatus settles.
        while (true) {
          if (Date.now() - startedAt > PER_ARCHETYPE_WALL_CLOCK_MS) break;
          if (currentRunId) {
            await awaitRun(currentRunId).catch(() => {});
          }
          // Let the orchestrator's post-completion routing settle.
          await new Promise((r) => setTimeout(r, POLL_MS));
          const a = await readArchetype(key);
          if (!a) break;
          if (
            a.baseStatus === "ready" ||
            a.baseStatus === "stalled" ||
            a.baseStatus === "errored" ||
            a.baseStatus === "none"
          ) {
            break;
          }
          // Pick up the run the orchestrator started next.
          if (a.baseLatestRunId && a.baseLatestRunId !== currentRunId) {
            currentRunId = a.baseLatestRunId;
          } else {
            // Still transient but no new run yet — keep polling.
            currentRunId = null;
          }
        }
      } catch {
        // Errors get reflected on archetype.baseStatus by the orchestrator.
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(clamped, keys.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
