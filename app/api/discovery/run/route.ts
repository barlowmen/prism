import { NextResponse } from "next/server";
import { startDiscovery } from "@/lib/agents/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { runId, meta } = await startDiscovery();
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
