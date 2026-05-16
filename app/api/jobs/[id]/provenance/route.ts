/**
 * POST /api/jobs/<id>/provenance
 *
 * Spawn the provenance audit agent — checks every claim in the final
 * DOCX against about_user.md, flags fabricated numbers / claims that
 * cross honesty red lines, writes provenance.md.
 */
import { NextResponse, type NextRequest } from "next/server";
import { startProvenance } from "@/lib/agents/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { runId, meta } = await startProvenance(id);
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
