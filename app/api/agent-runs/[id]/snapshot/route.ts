import { NextResponse, type NextRequest } from "next/server";
import { getRunSnapshot, replayFromDisk } from "@/lib/runs/broker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const mem = getRunSnapshot(id);
  if (mem) {
    return NextResponse.json({ meta: mem.meta, completed: mem.completed });
  }
  const disk = await replayFromDisk(id);
  if (!disk.meta && disk.events.length === 0) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  return NextResponse.json({ meta: disk.meta, completed: true });
}
