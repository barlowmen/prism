/**
 * POST /api/archetypes/<key>/accept-base-anyway
 *
 * User override for a stalled base-resume loop. Promotes the latest
 * generated DOCX to `ready` without another generation pass. The last
 * HM feedback stays attached on the archetype record.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readArchetype } from "@/lib/archetypes/store";
import { acceptBaseAnyway } from "@/lib/agents/base-resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    await acceptBaseAnyway(key);
    const archetype = await readArchetype(key);
    return NextResponse.json({ ok: true, archetype });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status =
      msg.startsWith("archetype_not_found") || msg.startsWith("no_base_docx_to_accept")
        ? 404
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
