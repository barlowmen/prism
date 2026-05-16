/**
 * GET /api/jobs/<id>/files
 *
 * Enumerate every known and "other" file in the per-app folder. Returns
 * metadata + inline UTF-8 content for text files. Powers the All-files
 * tab on the job detail page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readJob } from "@/lib/jobs/store";
import { readPerAppFiles } from "@/lib/jobs/per-app-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job) {
    return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  }
  if (!job.folderPath) {
    return NextResponse.json({
      folderPath: null,
      exists: false,
      known: [],
      finalDocx: [],
      other: [],
    });
  }
  const files = await readPerAppFiles(job.folderPath, { loadContent: true });
  return NextResponse.json(files);
}
