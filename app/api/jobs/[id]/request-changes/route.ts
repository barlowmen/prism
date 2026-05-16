import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readJob, updateJob } from "@/lib/jobs/store";
import { startDraft } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User reviewed the final draft and wants changes. Per spec §7.5:
 *   - Status moves to awaiting_input
 *   - Notes recorded as the question
 *   - Drafting re-runs with those notes baked in as feedback
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
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!notes) {
    return NextResponse.json({ error: "notes_required" }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }

  // Append the request to a user_request.md file under the per-app folder
  // so the agent has a durable record of what was asked.
  const reqPath = path.join(job.folderPath, "user_request.md");
  const stamped = `\n\n## Request (${new Date().toISOString()})\n\n${notes}\n`;
  try {
    await fs.appendFile(reqPath, stamped, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      await fs.writeFile(
        reqPath,
        `# User-requested changes\n${stamped}`,
        "utf8",
      );
    } else {
      throw err;
    }
  }

  await updateJob(id, {
    status: "awaiting_input",
    statusNote: "user requested changes",
    notes: notes.slice(0, 500),
  });

  try {
    const { runId, meta } = await startDraft({
      jobId: id,
      feedback: `USER-REQUESTED CHANGES on final draft:\n\n${notes}`,
    });
    return NextResponse.json({ ok: true, runId, meta });
  } catch (err: any) {
    return NextResponse.json(
      { ok: true, runId: null, redraft_error: String(err?.message ?? err) },
      { status: 200 },
    );
  }
}
