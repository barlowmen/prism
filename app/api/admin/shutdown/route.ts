/**
 * POST /api/admin/shutdown
 *
 * Single-click "step away cleanly" endpoint. The button on
 * /settings/health calls this when the user wants to leave prism for
 * a while without leaving Claude subprocesses chewing tokens.
 *
 * Sequence (must run in this order — see comments in body):
 *   1. Snapshot the broker's in-memory active-runs list.
 *   2. Reconcile stale "running" index entries that AREN'T in memory
 *      (orphans from previous server processes, or rows the index lost
 *      track of via the upsertRunIndex race). Skip the in-memory ones —
 *      they get cancelled in the next step.
 *   3. Cancel every truly-running run in parallel.
 *   4. Wait for confirmed termination of each cancelled run, with a
 *      15s-per-run timeout. The subprocess takes time to actually die
 *      and write its meta_end after SIGTERM; we want the API response
 *      to mean "they're really stopped", not "we asked them to stop".
 *   5. Build the response body.
 *   6. Schedule process.exit(0) ~1.5s later so the response has time
 *      to flush before the Next.js server dies.
 *
 * Worst-case end-to-end latency is bounded by step 4 (~15s) + step 6
 * (1.5s) ≈ ~17s. The UI sets that expectation in its "Stopping…" copy.
 *
 * No authentication is required: the server only binds 127.0.0.1, so
 * a single-user local app already implicitly trusts the loopback.
 */
import { NextResponse } from "next/server";
import {
  awaitRun,
  cancelRun,
  listInMemoryActiveRunIds,
} from "@/lib/runs/broker";
import { reconcileStaleRunningEntries } from "@/lib/runs/orphan-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_RUN_AWAIT_TIMEOUT_MS = 15_000;
const EXIT_DELAY_MS = 1500;

export async function POST() {
  // Step 1: snapshot what's truly running right now. Take this BEFORE
  // step 2 mutates the index so we know which runIds the reconcile
  // pass should skip.
  const activeIds = listInMemoryActiveRunIds();
  const skip = new Set(activeIds);

  // Step 2: reconcile stale "running" entries that aren't in memory.
  const { reconciled, orphanedIds } = await reconcileStaleRunningEntries({
    skipRunIds: skip,
    orphanNote:
      "orphaned by graceful shutdown — server stopped before run completed",
  });
  const reconciledTotal = reconciled + orphanedIds.length;

  // Steps 3 + 4: cancel each active run AND wait for confirmed
  // termination, in parallel. cancelRun returns immediately after
  // sending SIGTERM — the broker's done.then handler is what writes
  // meta_end and flips state.completed=true. awaitRun resolves when
  // either of those signals lands. Per-run timeout falls into
  // timedOutWaiting so the UI can flag stragglers.
  const cancelled: string[] = [];
  const timedOutWaiting: string[] = [];
  await Promise.all(
    activeIds.map(async (id) => {
      try {
        const ok = await cancelRun(id);
        if (!ok) return; // already completed between snapshot + here
        cancelled.push(id);
        try {
          await awaitRun(id, PER_RUN_AWAIT_TIMEOUT_MS);
        } catch {
          timedOutWaiting.push(id);
        }
      } catch {
        // Best-effort — losing the slot to a race shouldn't block shutdown.
      }
    }),
  );

  // Step 5: build the response. The body is informational only — the
  // browser will lose its connection ~1.5s after this lands.
  const body = {
    cancelled: cancelled.length,
    reconciled: reconciledTotal,
    timedOutWaiting,
    message: "Server stopping — restart with ./server.sh start",
  };

  // Step 6: schedule exit AFTER the response body is constructed.
  // setTimeout fires after the current microtask queue, so the
  // NextResponse below gets returned + flushed before exit(0) fires.
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);

  return NextResponse.json(body);
}
