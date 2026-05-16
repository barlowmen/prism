import { NextResponse, type NextRequest } from "next/server";
import { readThread } from "@/lib/assistant/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const t = await readThread(id);
  if (!t) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }
  return NextResponse.json(t);
}
