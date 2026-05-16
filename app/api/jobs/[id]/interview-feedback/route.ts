import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readJob } from "@/lib/jobs/store";
import { INTERVIEW_FEEDBACK_REL_PATH } from "@/lib/jobs/per-app-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function feedbackPath(folderAbs: string): string {
  return path.join(folderAbs, INTERVIEW_FEEDBACK_REL_PATH);
}

async function atomicWrite(absPath: string, content: string): Promise<void> {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.${randomUUID()}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(content, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }
  const abs = feedbackPath(job.folderPath);
  try {
    const content = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    return NextResponse.json({
      content,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      exists: true,
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json({
        content: "",
        size: 0,
        mtimeMs: null,
        exists: false,
      });
    }
    throw err;
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job?.folderPath) {
    return NextResponse.json({ error: "job_not_found_or_no_folder" }, { status: 404 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "expected_body_content_string" }, { status: 400 });
  }

  const abs = feedbackPath(job.folderPath);
  await atomicWrite(abs, body.content);
  const stat = await fs.stat(abs);
  return NextResponse.json({ size: stat.size, mtimeMs: stat.mtimeMs });
}
