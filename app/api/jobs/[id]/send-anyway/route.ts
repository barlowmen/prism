/**
 * POST /api/jobs/<id>/send-anyway
 *
 * Override switch when the HM-review loop stalls — skip the HM agent
 * and go straight to provenance. The user has decided the draft is
 * good enough; the provenance audit still runs to catch any honesty
 * violations.
 */
import { NextResponse, type NextRequest } from "next/server";
import { bypassHmToProvenance } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { runId, meta } = await bypassHmToProvenance(id);
    return NextResponse.json({ ok: true, runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
