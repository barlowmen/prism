import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readJob } from "@/lib/jobs/store";
import { sendSectionMessage } from "@/lib/profile/run";
import { INTERVIEW_FEEDBACK_REL_PATH } from "@/lib/jobs/per-app-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Synthesize a fresh "Lessons from past interviews" section draft from
 * this job's interview_feedback.md. The Profile Interview's `lessons`
 * section interview is reused: the orchestrator sends a structured
 * message that includes the feedback as context plus an explicit ask for
 * a refreshed draft. The resulting `<draft>` is captured on the lessons
 * section state, ready to commit at `/settings/profile/lessons`.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }

  const feedbackAbs = path.join(job.folderPath, INTERVIEW_FEEDBACK_REL_PATH);
  let feedback: string;
  try {
    feedback = await fs.readFile(feedbackAbs, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json(
        { error: "no_interview_feedback_to_synthesize" },
        { status: 404 },
      );
    }
    throw err;
  }
  if (!feedback.trim()) {
    return NextResponse.json(
      { error: "interview_feedback_is_empty" },
      { status: 400 },
    );
  }

  const message = [
    `I just closed out an application. Read the priors (existing lessons section), then incorporate the new entry below.`,
    ``,
    `**Application:**`,
    `- Company: ${job.company}`,
    `- Role: ${job.role}`,
    `- Final outcome: ${job.outcome ?? job.status}`,
    job.sourceUrl ? `- Posting: ${job.sourceUrl}` : "",
    ``,
    `**Interview feedback notes I took during the process:**`,
    ``,
    "```",
    feedback.trim(),
    "```",
    ``,
    `Update the section to add one entry for this application. Distill the lessons — pull out the implication. Then emit the full updated section as a single \`<draft>\` block, ready to commit.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const result = await sendSectionMessage({ key: "lessons", message });
    return NextResponse.json({
      runId: result.runId,
      threadId: result.threadId,
      redirectTo: "/settings/profile/lessons",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
