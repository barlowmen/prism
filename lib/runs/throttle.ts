import "server-only";
/**
 * Global concurrency cap for Claude Code subprocess spawns.
 *
 * Background: Anthropic's API has a server-side load shedder distinct
 * from per-account rate limits. When too many concurrent requests
 * arrive — e.g. the user approves 10 shortlist candidates in a few
 * seconds, each spawning its own dispatcher — Anthropic returns
 * "API Error: Server is temporarily limiting requests" and kills the
 * extras. The user ends up with most of their dispatcher pile-up in
 * `errored` status.
 *
 * The fix is a single shared semaphore that every spawn flows through.
 * Bulk-paste already had a per-pool concurrency=2 cap; that was local
 * and didn't compose with other entry points (Shortlist Approve,
 * single Paste, prep build, base-resume) which all bypassed it.
 *
 * Usage:
 *
 *   import { withSpawnSlot } from "./throttle";
 *   const { runId, meta, done } = await withSpawnSlot(() => startRun({ ... }));
 *
 * Pending callers queue rather than fail. The slot is released as soon
 * as startRun() returns the runId — long-running agents don't hold a
 * slot for their whole lifetime, just for the spawn. This matters
 * because base-resume + per-job pipelines chain many spawns over many
 * minutes; holding a slot for the whole chain would deadlock the pool.
 */

const SPAWN_CONCURRENCY = 3;

let inFlight = 0;
const waiting: Array<() => void> = [];

/**
 * Acquire a spawn slot. Resolves when the caller is allowed to spawn
 * a subprocess. The caller MUST call `releaseSpawnSlot()` (typically
 * in the run's done.then/done.catch) once the subprocess has exited
 * so the slot is returned to the pool.
 *
 * Throttling the moment-of-spawn alone isn't enough — Anthropic's load
 * shedder reacts to concurrent in-flight requests, not to spawn rate.
 * So we hold the slot for the run's full lifetime. With cap=3 and
 * typical run durations of 5–15 min, this means at most 3 agents are
 * actively hitting the API at once. Most pipelines (per-job chain,
 * base-resume loop) spawn one phase at a time anyway, so they only
 * consume one slot at a time too.
 */
export async function acquireSpawnSlot(): Promise<void> {
  if (inFlight < SPAWN_CONCURRENCY) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  // The releaser hands us the slot directly without decrementing
  // inFlight, so we don't bump it again here.
}

export function releaseSpawnSlot(): void {
  if (waiting.length > 0) {
    const next = waiting.shift()!;
    // inFlight stays at cap — slot handed to next waiter directly.
    next();
  } else {
    inFlight = Math.max(0, inFlight - 1);
  }
}

/** For diagnostics + tests — current pool state. */
export function spawnPoolState(): { inFlight: number; queued: number; cap: number } {
  return { inFlight, queued: waiting.length, cap: SPAWN_CONCURRENCY };
}
