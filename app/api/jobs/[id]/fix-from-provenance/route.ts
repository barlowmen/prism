import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readJob } from "@/lib/jobs/store";
import { startDraft } from "@/lib/agents/research-draft-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }
  let provenance: string;
  try {
    provenance = await fs.readFile(path.join(job.folderPath, "provenance.md"), "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json({ error: "no_provenance_to_fix_from" }, { status: 404 });
    }
    throw err;
  }
  try {
    const { runId, meta } = await startDraft({
      jobId: id,
      feedback: `PROVENANCE FLAGS (must fix before re-submit):\n\n${provenance}`,
    });
    return NextResponse.json({ runId, meta });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
