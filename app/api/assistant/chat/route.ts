/**
 * POST /api/assistant/chat
 *
 * Send a message to the ⌘J assistant. Creates or resumes a thread and
 * spawns the underlying Claude Code session. The response includes the
 * threadId and the runId for the streaming subscription. `context`
 * carries page-aware hints (pathname, jobId, summary) — sanitized here
 * before being trusted by the run pipeline.
 */
import { NextResponse, type NextRequest } from "next/server";
import { sendMessage } from "@/lib/assistant/run";
import type { ChatContextSnapshot } from "@/lib/assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
  const threadId = typeof body.threadId === "string" ? body.threadId : null;
  const context = sanitizeContext(body.context);
  try {
    const result = await sendMessage({ threadId, message, context });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

function sanitizeContext(raw: any): ChatContextSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const pathname = typeof raw.pathname === "string" ? raw.pathname : "/";
  const out: ChatContextSnapshot = { pathname };
  if (typeof raw.jobId === "string" && raw.jobId.trim()) {
    out.jobId = raw.jobId.trim();
  }
  if (typeof raw.summary === "string") {
    out.summary = raw.summary.slice(0, 4000);
  }
  if (raw.extras && typeof raw.extras === "object") {
    const extras: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(raw.extras)) {
      if (typeof k !== "string") continue;
      if (typeof v === "string") extras[k] = v.slice(0, 500);
      else if (typeof v === "number") extras[k] = v;
      else if (v == null) extras[k] = null;
    }
    out.extras = extras;
  }
  return out;
}
