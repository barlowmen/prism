/**
 * POST /api/assistant/threads/<id>/cancel
 *
 * Cancel the most recent still-running assistant message in this
 * thread. 409 if nothing is in flight.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readThread } from "@/lib/assistant/store";
import { cancelRun } from "@/lib/runs/broker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const t = await readThread(id);
  if (!t) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }
  // Cancel the most recent running assistant message's run.
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const m = t.messages[i];
    if (m.role === "assistant" && m.status === "running" && m.runId) {
      const ok = await cancelRun(m.runId);
      return NextResponse.json({ ok, runId: m.runId });
    }
  }
  return NextResponse.json({ ok: false, error: "no_running_message" }, { status: 409 });
}
