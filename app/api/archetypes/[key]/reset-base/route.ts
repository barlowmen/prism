/**
 * POST /api/archetypes/<key>/reset-base
 *
 * Clear the base-resume loop state (baseStatus → 'none', counters → 0,
 * baseLatestRunId → null, baseLastFeedback → ""). The DOCX on disk is
 * preserved — the user can still upload manually or re-trigger
 * generation, which will overwrite it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resetBaseGeneration } from "@/lib/agents/base-resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    await resetBaseGeneration(key);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg.startsWith("archetype_not_found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
