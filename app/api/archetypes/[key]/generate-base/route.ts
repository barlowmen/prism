/**
 * POST /api/archetypes/<key>/generate-base
 *
 * Kicks off the base-resume generation loop for one archetype.
 *
 * Body: { overwrite?: boolean } — when the archetype already has a base
 * (baseResumePath set), the request is rejected with 409 unless the
 * client passed `overwrite: true`. The list page surfaces a confirm
 * dialog and re-posts with overwrite=true on accept.
 *
 * On success: resets the loop counters (baseReviewPass=0, baseLastFeedback=""),
 * spawns the generation phase, returns { runId, meta } so the UI can
 * subscribe to live SSE updates via the existing AgentRunPane.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readArchetype } from "@/lib/archetypes/store";
import { startBaseGeneration } from "@/lib/agents/base-resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const archetype = await readArchetype(key);
  if (!archetype) {
    return NextResponse.json({ error: "archetype_not_found" }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine; defaults apply.
  }
  const overwrite = body?.overwrite === true;

  if (archetype.baseResumePath && !overwrite) {
    return NextResponse.json(
      {
        error: "base_already_exists",
        baseResumePath: archetype.baseResumePath,
      },
      { status: 409 },
    );
  }

  try {
    const { runId, meta } = await startBaseGeneration({ archetypeKey: key });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
