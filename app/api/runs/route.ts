/**
 * GET /api/runs
 *
 * Returns the on-disk runs index — every Claude Code invocation prism
 * has ever spawned, with token totals and final status. Powers the
 * /settings/runs table.
 */
import { NextResponse } from "next/server";
import { readRunsIndex } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await readRunsIndex();
  return NextResponse.json({ runs });
}
