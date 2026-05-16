import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { APPS_DIR } from "@/lib/paths";
import { deriveJobId, readJob } from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dry-run: count apps/<Co>/<Role>/ folders that don't yet have a state
 * file. Used by the Dashboard import banner.
 */
export async function GET() {
  let notImported = 0;
  const previewList: Array<{ company: string; role: string }> = [];

  let companies: string[] = [];
  try {
    companies = (await fs.readdir(APPS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return NextResponse.json({ notImported: 0, preview: [] });
    throw err;
  }

  for (const company of companies) {
    let roles: string[] = [];
    try {
      roles = (await fs.readdir(path.join(APPS_DIR, company), { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const role of roles) {
      const id = deriveJobId(company, role);
      const existing = await readJob(id);
      if (!existing) {
        notImported++;
        if (previewList.length < 5) previewList.push({ company, role });
      }
    }
  }

  return NextResponse.json({ notImported, preview: previewList });
}
