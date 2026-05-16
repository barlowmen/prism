/**
 * GET /api/jobs/<id>/docx/download
 *
 * Stream the tailored DOCX as a download. Optional `?name=` query
 * picks a specific DOCX in the folder; default is the most-recent.
 */
import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import { readJob } from "@/lib/jobs/store";
import { readPerAppFiles } from "@/lib/jobs/per-app-files";
import { readDocxBytes } from "@/lib/docx-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }
  const requested = new URL(req.url).searchParams.get("name");
  const files = await readPerAppFiles(job.folderPath);
  let target: string | null = null;
  if (requested) {
    const m = files.finalDocx.find((f) => f.relPath === requested);
    if (!m) return NextResponse.json({ error: "docx_not_found" }, { status: 404 });
    target = requested;
  } else if (files.finalDocx[0]) {
    target = files.finalDocx[0].relPath;
  }
  if (!target) {
    return NextResponse.json({ error: "no_docx_in_folder" }, { status: 404 });
  }
  const abs = path.join(job.folderPath, target);
  const bytes = await readDocxBytes(abs);
  if (!bytes) return NextResponse.json({ error: "docx_disappeared" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${target.split("/").pop()}"`,
      "Cache-Control": "no-store",
    },
  });
}
