import { NextResponse, type NextRequest } from "next/server";
import { isSectionKey } from "@/lib/profile/sections";
import { readSectionState, upsertSectionState } from "@/lib/profile/store";
import { commitSection } from "@/lib/profile/merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  if (!isSectionKey(key)) {
    return NextResponse.json({ error: "unknown_section" }, { status: 404 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // body optional
  }
  const overrideDraft = typeof body?.draft === "string" ? body.draft : null;

  const state = await readSectionState(key);
  const draft = overrideDraft ?? state?.draft ?? null;
  if (!draft || !draft.trim()) {
    return NextResponse.json({ error: "no_draft_to_commit" }, { status: 400 });
  }

  try {
    const result = await commitSection({ key, draft });
    await upsertSectionState(key, {
      status: "committed",
      committedAt: new Date().toISOString(),
      draft, // keep the committed draft on record
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
