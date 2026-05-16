import { NextResponse } from "next/server";
import { readRunsIndex } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await readRunsIndex();
  return NextResponse.json({ runs });
}
