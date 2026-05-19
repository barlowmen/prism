/**
 * POST /api/archetypes/<key>/cancel-base
 *
 * Kill an in-flight base-resume loop. Calls broker.cancelRun on the
 * archetype's baseLatestRunId, then writes baseStatus back to `none`
 * with a "cancelled by user" feedback string. The orchestrator's
 * done-handlers fire on the killed subprocess but the runStale guard
 * keeps them from re-stomping the cancellation decision.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cancelBaseGeneration } from "@/lib/agents/base-resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    await cancelBaseGeneration(key);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg.startsWith("archetype_not_found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
