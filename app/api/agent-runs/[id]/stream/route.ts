/**
 * GET /api/agent-runs/<runId>/stream
 *
 * Server-sent events stream of a run's lifecycle. Replays buffered
 * events first (so a late-connecting client doesn't miss anything),
 * then subscribes to the broker for live updates until the run
 * completes or the client disconnects.
 *
 * If the run isn't in memory, replay from the on-disk log and close
 * immediately with `event: end · reason: replay_only`.
 */
import { type NextRequest } from "next/server";
import {
  getRunSnapshot,
  replayFromDisk,
  subscribe,
} from "@/lib/runs/broker";
import type { RecordedEvent } from "@/lib/runs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENCODER = new TextEncoder();

function sseFrame(type: string, data: unknown): Uint8Array {
  return ENCODER.encode(
    `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

function recordedFrame(rec: RecordedEvent): Uint8Array {
  return sseFrame(rec.event.type, { seq: rec.seq, at: rec.at, ...rec.event });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        try {
          controller.close();
        } catch {}
      };

      // Detach when the client goes away.
      req.signal.addEventListener("abort", close);

      const snapshot = getRunSnapshot(id);

      if (!snapshot) {
        // Not in memory — replay from disk and close.
        const { meta, events } = await replayFromDisk(id);
        if (!meta && events.length === 0) {
          controller.enqueue(sseFrame("error", { error: "run_not_found" }));
          close();
          return;
        }
        if (meta) controller.enqueue(sseFrame("meta", meta));
        for (const rec of events) controller.enqueue(recordedFrame(rec));
        controller.enqueue(sseFrame("end", { reason: "replay_only" }));
        close();
        return;
      }

      // Send meta + buffered events first; subscribe to live updates.
      controller.enqueue(sseFrame("meta", snapshot.meta));
      let lastSeq = -1;
      for (const rec of snapshot.events) {
        controller.enqueue(recordedFrame(rec));
        lastSeq = rec.seq;
      }

      if (snapshot.completed) {
        controller.enqueue(sseFrame("end", { reason: "already_complete" }));
        close();
        return;
      }

      const off = subscribe(id, (rec) => {
        if (rec.seq <= lastSeq) return;
        lastSeq = rec.seq;
        try {
          controller.enqueue(recordedFrame(rec));
          if (rec.event.type === "completed") {
            controller.enqueue(sseFrame("end", { reason: "completed" }));
            off();
            close();
          }
        } catch {
          off();
        }
      });

      req.signal.addEventListener("abort", off);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
