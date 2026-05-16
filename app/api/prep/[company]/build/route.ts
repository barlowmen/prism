import { NextResponse } from "next/server";
import { startPrepBuilder } from "@/lib/prep/builder";
import { isValidCompanySlug } from "@/lib/prep/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/prep/<Company>/build
 *
 * Spawns the prep-builder agent. Returns the runId so the UI can stream
 * progress via /api/agent-runs/<runId>/stream.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ company: string }> },
) {
  const { company } = await ctx.params;
  if (!isValidCompanySlug(company)) {
    return NextResponse.json({ error: "invalid_company" }, { status: 400 });
  }
  try {
    const { runId, meta } = await startPrepBuilder(company);
    return NextResponse.json({
      runId,
      phase: meta.phase,
      message: `prep-builder agent spawned (runId ${runId.slice(0, 8)}). Watch the Runs page.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
