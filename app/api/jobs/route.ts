/**
 * GET /api/jobs
 *
 * Full list of tracked jobs sorted by most-recently-updated. Backs
 * Applications and Shortlist; the Dashboard kanban uses listJobs()
 * directly from a server component.
 */
import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  // Stable order: most recently updated first.
  jobs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return NextResponse.json({ jobs });
}
