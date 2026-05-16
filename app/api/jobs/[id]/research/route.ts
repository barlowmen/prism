/**
 * POST /api/jobs/<id>/research
 *
 * Spawn the parallel research agents (JD analysis + company research +
 * resume examples). Writes into <folder>/research/. Auto-progresses to
 * draft phase per workflow.md.
 */
import { NextResponse, type NextRequest } from "next/server";
import { startResearch } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { runId, meta } = await startResearch({ jobId: id });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
