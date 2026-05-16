import { NextResponse, type NextRequest } from "next/server";
import { cancelRun } from "@/lib/runs/broker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = await cancelRun(id);
  if (!ok) {
    return NextResponse.json({ error: "not_running" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
