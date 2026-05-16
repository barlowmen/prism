/**
 * POST /api/jobs/<id>/review
 *
 * Spawn the hiring-manager review agent. Reads the JD + research +
 * drafted DOCX and writes feedback.md (overwrites) plus appends to
 * feedback_history.md. Returns the runId so the UI can stream.
 */
import { NextResponse, type NextRequest } from "next/server";
import { startHmReview } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { runId, meta } = await startHmReview({ jobId: id });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
