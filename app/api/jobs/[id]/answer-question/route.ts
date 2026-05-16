import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readJob } from "@/lib/jobs/store";
import { startDispatcher } from "@/lib/agents/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append the user's answer to dispatcher_question.md (or questions.md) and
 * re-spawn the dispatcher.
 *
 * Body: { answer: string, target?: "dispatcher" | "research" }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const answer = typeof body.answer === "string" ? body.answer : "";
  const target =
    body.target === "research" ? "questions.md" : "dispatcher_question.md";
  if (answer.trim().length === 0) {
    return NextResponse.json({ error: "answer_required" }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }
  const filePath = path.join(job.folderPath, target);
  let existing: string;
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json({ error: "question_file_missing", target }, { status: 404 });
    }
    throw err;
  }

  const stamped = `\n\n## Answer (${new Date().toISOString()})\n\n${answer.trim()}\n`;
  await fs.appendFile(filePath, stamped, "utf8");

  // Re-spawn dispatcher only for dispatcher questions. Research questions
  // get re-spawned by the research agent.
  if (target === "dispatcher_question.md") {
    if (!job.sourceUrl) {
      return NextResponse.json(
        { error: "answer_recorded_but_no_source_url_for_redispatch" },
        { status: 422 },
      );
    }
    try {
      const { runId, meta } = await startDispatcher({
        jobId: id,
        postingUrl: job.sourceUrl,
      });
      return NextResponse.json({ ok: true, target, runId, meta });
    } catch (err: any) {
      return NextResponse.json(
        { ok: true, target, runId: null, redispatch_error: String(err?.message ?? err) },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ ok: true, target, runId: null });
}
