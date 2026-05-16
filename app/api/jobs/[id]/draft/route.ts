/**
 * POST /api/jobs/<id>/draft
 *
 * Spawn the drafting agent. Generates the tailored Node + docx script
 * and runs it to produce the final DOCX. Optional `feedback` body
 * field is appended as context (used after HM review).
 */
import { NextResponse, type NextRequest } from "next/server";
import { startDraft } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  try {
    const { runId, meta } = await startDraft({
      jobId: id,
      feedback: typeof body.feedback === "string" ? body.feedback : undefined,
    });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
