/**
 * POST /api/jobs/<id>/dispatch
 *
 * Spawn the dispatcher agent for an existing job. Used for re-dispatch
 * after editing dispatcher_question.md or for jobs the user manually
 * promoted from imported/recommended_skip. Body may override
 * `postingUrl` / `jdText`; otherwise the job's stored sourceUrl is used.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readJob } from "@/lib/jobs/store";
import { startDispatcher } from "@/lib/agents/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is OK
  }

  const job = await readJob(id);
  if (!job) {
    return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  }

  const postingUrl = typeof body.postingUrl === "string" ? body.postingUrl : job.sourceUrl;
  if (!postingUrl) {
    return NextResponse.json(
      { error: "missing_posting_url" },
      { status: 400 },
    );
  }
  const jdText = typeof body.jdText === "string" ? body.jdText : null;

  try {
    const { runId, meta } = await startDispatcher({
      jobId: id,
      postingUrl,
      jdText,
    });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
