import { NextResponse } from "next/server";
import { importAppsFolders } from "@/lib/jobs/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const findings = await importAppsFolders();
  const summary = {
    total: findings.length,
    created: findings.filter((f) => f.status === "created").length,
    alreadyExisted: findings.filter((f) => f.status === "already_exists").length,
    skipped: findings.filter((f) => f.status === "skipped").length,
    errored: findings.filter((f) => f.status === "error").length,
  };
  return NextResponse.json({ summary, findings });
}
