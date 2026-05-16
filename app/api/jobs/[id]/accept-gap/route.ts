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
