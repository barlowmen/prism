import { NextResponse, type NextRequest } from "next/server";
import { isSectionKey } from "@/lib/profile/sections";
import { clearSectionState, readSectionState } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  if (!isSectionKey(key)) {
    return NextResponse.json({ error: "unknown_section" }, { status: 404 });
  }
  const existing = await readSectionState(key);
  await clearSectionState(key);
  return NextResponse.json({ ok: true, hadState: !!existing });
}
