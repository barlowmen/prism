/**
 * GET /api/health
 *
 * Full system-health report: CLI installed, subscription auth probe,
 * truth-base files on disk, base resumes per archetype on disk. The
 * auth probe is slow (~3s — spawns a Claude Code subprocess), so the
 * /settings/health page calls this from the client after first paint
 * rather than on initial server render.
 */
import { NextResponse } from "next/server";
import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getHealth();
  return NextResponse.json(report);
}
