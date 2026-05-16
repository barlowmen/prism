/**
 * POST /api/profile/sections/<key>/chat
 *
 * Send a user message into one section's interview thread. Spawns or
 * resumes the underlying section interview agent and returns the runId
 * + threadId. The agent's task is to converge on a markdown draft of
 * the section, emitted as a <draft>...</draft> block.
 */
import { NextResponse, type NextRequest } from "next/server";
import { sendSectionMessage } from "@/lib/profile/run";
import { isSectionKey } from "@/lib/profile/sections";

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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }
  try {
    const result = await sendSectionMessage({ key, message });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
