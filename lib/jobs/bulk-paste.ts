import "server-only";
/**
 * Bulk job-paste — takes N posting URLs, creates a Job for each, and
 * fans out dispatcher spawns with a concurrency limit so the
 * subscription quota doesn't get hammered.
 *
 * The route handler returns immediately after the job *records* are
 * created (fast — just file writes). Dispatcher spawning is
 * fire-and-forget on the server: a single async worker pool blocks on
 * each run's `done` promise via awaitRun() so only `concurrency` runs
 * are in flight at a time.
 */
import { pasteJob } from "../agents/dispatch";
import { startDispatcher } from "../agents/dispatch";
import { awaitRun } from "../runs/broker";
import type { Job } from "./types";

export type BulkPasteInput = {
  urls: string[];
  /** Default 2. Clamped to [1, 5]. */
  concurrency?: number;
};

export type BulkPasteResult = {
  /** Number of input URLs after dedup + URL validation. */
  validCount: number;
  /** Number of URLs that were dropped (blank, comment, malformed, duplicate). */
  droppedCount: number;
  /** Jobs successfully created (sourceUrl is the unique key here). */
  created: Array<{
    url: string;
    jobId: string;
    company: string;
    role: string;
  }>;
  /** URLs whose job-record creation failed (rare — disk full, permissions, etc.). */
  errored: Array<{ url: string; error: string }>;
};

/** Parse a multi-line input into a deduplicated list of valid http(s) URLs. */
export function parseBulkUrls(raw: string): {
  urls: string[];
  droppedCount: number;
} {
  const seen = new Set<string>();
  const out: string[] = [];
  let dropped = 0;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    // Allow lines like "https://… some comment" by taking only the URL.
    const m = line.match(/^(https?:\/\/[^\s]+)/i);
    if (!m) {
      dropped++;
      continue;
    }
    const url = m[1].replace(/[.,;:]+$/, "");
    if (seen.has(url)) {
      dropped++;
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return { urls: out, droppedCount: dropped };
}

/**
 * Phase 1 of the bulk operation: create Job records for every URL.
 * Returns the created jobs + any creation errors. Runs sequentially
 * because file writes are cheap and serializing avoids any chance of
 * collision in the per-job write queue.
 */
export async function bulkCreateJobs(input: BulkPasteInput): Promise<BulkPasteResult> {
  const result: BulkPasteResult = {
    validCount: input.urls.length,
    droppedCount: 0,
    created: [],
    errored: [],
  };
  for (const url of input.urls) {
    try {
      const { job } = await pasteJob({
        postingUrl: url,
        dispatchImmediately: false,
      });
      result.created.push({
        url,
        jobId: job.id,
        company: job.company,
        role: job.role,
      });
    } catch (err: any) {
      result.errored.push({
        url,
        error: String(err?.message ?? err),
      });
    }
  }
  return result;
}

/**
 * Phase 2 (fire-and-forget): spawn dispatchers for the just-created
 * jobs, capping in-flight runs at `concurrency`. Each worker grabs the
 * next job from a shared index, spawns its dispatcher, and awaits
 * completion before grabbing the next.
 *
 * Errors per-run are swallowed and recorded on the run itself (the
 * broker writes status='failed' to the runs index). The dispatcher's
 * own post-completion routing handles status transitions.
 */
export async function bulkDispatchInBackground(
  created: Array<{ jobId: string; url: string }>,
  concurrency: number,
): Promise<void> {
  const clamped = Math.max(1, Math.min(concurrency, 5));
  let nextIdx = 0;

  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= created.length) return;
      const { jobId, url } = created[i];
      try {
        const { runId } = await startDispatcher({ jobId, postingUrl: url });
        await awaitRun(runId).catch(() => {});
      } catch {
        // The run record will reflect the failure on disk; nothing else
        // to do from the worker level.
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(clamped, created.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
