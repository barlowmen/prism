/**
 * POST /api/jobs/redispatch-errored
 *
 * Batch recovery for jobs piled up in `status="errored"`. Spawns a
 * dispatcher for every errored job that has a sourceUrl, throttled
 * through the global spawn pool (lib/runs/throttle.ts) so we don't
 * immediately re-trigger the rate limit that produced the failures
 * in the first place.
 *
 * Returns immediately with a summary; dispatchers continue in the
 * background. The Runs page + Dashboard will reflect their progress.
 */
import { NextResponse } from "next/server";
import { listJobs, updateJob } from "@/lib/jobs/store";
import { startDispatcher } from "@/lib/agents/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jobs = await listJobs();
  const errored = jobs.filter((j) => j.status === "errored");

  const dispatched: string[] = [];
  const skippedNoUrl: string[] = [];

  for (const j of errored) {
    if (!j.sourceUrl) {
      skippedNoUrl.push(j.id);
      continue;
    }
    // Reset retry counter on manual re-dispatch — user has decided to
    // try again from scratch.
    await updateJob(j.id, {
      status: "dispatching",
      statusNote: "re-dispatching from Errored column (manual recovery)",
      retryAttempts: 0,
    });
    // Fire-and-forget — the global spawn throttle will queue these
    // behind any already-running runs so they don't all hit Anthropic
    // simultaneously.
    startDispatcher({ jobId: j.id, postingUrl: j.sourceUrl }).catch(async (err) => {
      await updateJob(j.id, {
        status: "errored",
        statusNote: `re-dispatch failed: ${String(err?.message ?? err)}`,
      });
    });
    dispatched.push(j.id);
  }

  return NextResponse.json({
    total: errored.length,
    dispatched,
    skippedNoUrl,
  });
}
