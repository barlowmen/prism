import "server-only";
/**
 * Schedule a delayed retry for a run that failed with a transient
 * error (today: Anthropic API rate limiting). Backoff schedule is
 * fixed; caller passes attempt count, we decide the delay and either
 * fire the retry or signal "max attempts reached, give up".
 *
 * Usage from an orchestrator's done handler:
 *
 *   if (snap.meta.rateLimited) {
 *     const next = scheduleRetry(attempt, () => spawnAgainSomehow(jobId));
 *     if (next.scheduled) {
 *       await updateJob(jobId, {
 *         statusNote: `rate-limited, retrying in ${next.humanDelay} (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
 *       });
 *     } else {
 *       await updateJob(jobId, {
 *         status: "errored",
 *         statusNote: "rate-limited, max retries reached — re-dispatch manually",
 *       });
 *     }
 *     return;
 *   }
 *
 * The retry runs in the background via setTimeout. If the server
 * restarts mid-wait, the retry is lost — that's intentional. Stale
 * retries after a long downtime aren't worth special-casing; the user
 * can re-dispatch the errored jobs manually.
 */

const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000];
export const MAX_RETRY_ATTEMPTS = BACKOFF_MS.length;

export type ScheduledRetry =
  | { scheduled: true; delayMs: number; humanDelay: string; nextAttempt: number }
  | { scheduled: false; reason: "max_attempts_reached" };

export function scheduleRetry(
  currentAttempt: number,
  retryFn: () => Promise<unknown>,
): ScheduledRetry {
  if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
    return { scheduled: false, reason: "max_attempts_reached" };
  }
  const delayMs = BACKOFF_MS[currentAttempt];
  setTimeout(() => {
    retryFn().catch((err) => {
      console.warn("[retry] retry attempt failed:", String(err?.message ?? err));
    });
  }, delayMs);
  return {
    scheduled: true,
    delayMs,
    humanDelay: humanizeMs(delayMs),
    nextAttempt: currentAttempt + 1,
  };
}

function humanizeMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const min = Math.round(ms / 60_000);
  return `${min} min`;
}
