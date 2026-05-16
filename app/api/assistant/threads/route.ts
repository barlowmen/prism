/**
 * GET /api/assistant/threads
 *
 * Light-weight list of assistant threads (no message bodies). Clients
 * fetch one thread at a time via /api/assistant/threads/<id>.
 */
import { NextResponse } from "next/server";
import { listThreads } from "@/lib/assistant/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const threads = await listThreads();
  // Strip messages from list response — clients fetch one thread at a time.
  const summaries = threads.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messageCount: t.messages.length,
    hasSession: !!t.claudeSessionId,
  }));
  return NextResponse.json({ threads: summaries });
}
