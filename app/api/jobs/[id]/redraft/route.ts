/**
 * POST /api/jobs/<id>/redraft
 *
 * After HM review writes feedback.md, redraft the DOCX with that
 * feedback baked into the prompt. Loop continues until the HM agent
 * says "ready to submit" or the user intervenes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { redraftWithFeedback } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { runId, meta } = await redraftWithFeedback(id);
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
