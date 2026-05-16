import { NextResponse, type NextRequest } from "next/server";
import {
  deleteArchetype,
  readArchetype,
  updateArchetype,
} from "@/lib/archetypes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const a = await readArchetype(key);
  if (!a) return NextResponse.json({ error: "archetype_not_found" }, { status: 404 });
  return NextResponse.json(a);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch: any = {};
  for (const f of ["label", "description", "matchingHints", "baseResumePath", "tailoringRules"]) {
    if (typeof body[f] === "string") patch[f] = body[f];
  }
  try {
    const a = await updateArchetype(key, patch);
    return NextResponse.json(a);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg.startsWith("archetype_not_found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const removed = await deleteArchetype(key);
  if (!removed) return NextResponse.json({ error: "archetype_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
