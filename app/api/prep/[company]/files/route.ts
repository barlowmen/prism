import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { PREP_DIR } from "@/lib/paths";
import { isValidCompanySlug, readPrepFiles, writePrepFile } from "@/lib/prep/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/prep/<Company>/files
 *   List files. With ?path=<relPath> returns the body of that one file.
 *
 * PUT /api/prep/<Company>/files
 *   Body: { path: string, content: string }
 *   Atomic write of a single file. Disallows path traversal and binary
 *   extensions — only .md/.txt are writable through this endpoint.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ company: string }> },
) {
  const { company } = await ctx.params;
  if (!isValidCompanySlug(company)) {
    return NextResponse.json({ error: "invalid_company" }, { status: 400 });
  }
  const url = new URL(req.url);
  const wantedPath = url.searchParams.get("path");
  if (wantedPath) {
    if (!isSafeRelPath(wantedPath)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    const abs = path.join(PREP_DIR, company, wantedPath);
    try {
      const content = await fs.readFile(abs, "utf8");
      const stat = await fs.stat(abs);
      return NextResponse.json({
        path: wantedPath,
        content,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      throw err;
    }
  }
  const result = await readPrepFiles(company);
  return NextResponse.json(result);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ company: string }> },
) {
  const { company } = await ctx.params;
  if (!isValidCompanySlug(company)) {
    return NextResponse.json({ error: "invalid_company" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.path !== "string" ||
    typeof body.content !== "string"
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isSafeRelPath(body.path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const ext = path.extname(body.path).toLowerCase();
  if (ext !== ".md" && ext !== ".txt") {
    return NextResponse.json({ error: "only_md_or_txt" }, { status: 400 });
  }

  await writePrepFile(company, body.path, body.content);
  const stat = await fs.stat(path.join(PREP_DIR, company, body.path));
  return NextResponse.json({
    ok: true,
    path: body.path,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  });
}

/** Reject paths with `..`, leading `/`, or weird characters. */
function isSafeRelPath(p: string): boolean {
  if (!p || p.length > 200) return false;
  if (p.startsWith("/") || p.startsWith("\\")) return false;
  if (p.includes("..")) return false;
  if (!/^[\w./\- ]+$/.test(p)) return false;
  return true;
}
