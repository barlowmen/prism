/**
 * POST /api/jobs/<id>/accept-gap
 *
 * User reviewed provenance flags and chose to proceed despite them.
 * Status advances to ready_for_user_review; the flags stay in
 * provenance.md as a paper trail.
 */
import { NextResponse, type NextRequest } from "next/server";
import { acceptProvenanceGap } from "@/lib/agents/provenance";
import { readJob } from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    await acceptProvenanceGap(id);
    const job = await readJob(id);
    return NextResponse.json({ ok: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
