import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { listJobs, readJob, deriveJobId } from "@/lib/jobs/store";
import { ensureShadowDedupe } from "@/lib/jobs/dedupe-shadows";
import { findActiveRuns } from "@/lib/runs/store";
import { groupJobsBySection } from "@/lib/jobs/attention-sections";
import { absWorkspace, APPS_DIR, TRUTH_BASE_FILES } from "@/lib/paths";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

const FIRST_RUN_MIN_BYTES = 200;

async function isFirstRun(): Promise<boolean> {
  try {
    const stat = await fs.stat(
      absWorkspace(TRUTH_BASE_FILES.about_user.relPath),
    );
    return stat.size < FIRST_RUN_MIN_BYTES;
  } catch {
    return true;
  }
}

export default async function HomePage() {
  if (await isFirstRun()) {
    redirect("/settings/profile?first_run=1");
  }

  // Sweep any shadow `pasted_*` records left over from before the
  // dispatcher-rename logic landed. Cached once per process, cheap.
  await ensureShadowDedupe();
  const [jobs, importPreview, activeRuns] = await Promise.all([
    listJobs(),
    countImportPreview(),
    findActiveRuns(),
  ]);
  const sections = groupJobsBySection(jobs);

  // Discovery is the one phase the Dashboard's DiscoveryButton
  // directly spawns + watches. Other phases (dispatcher, etc.) show
  // up in the always-visible active-agents bar but don't get their
  // own mount on this page.
  const activeDiscoveryRunId =
    activeRuns.find((r) => r.phase === "discovery")?.runId ?? null;

  return (
    <Dashboard
      sections={sections}
      totalJobs={jobs.length}
      importPreview={importPreview}
      activeDiscoveryRunId={activeDiscoveryRunId}
      activeRuns={activeRuns.map((r) => ({
        runId: r.runId,
        phase: r.phase,
        startedAt: r.startedAt,
        jobId: r.jobId,
      }))}
    />
  );
}

/**
 * Same dry-run scan as /api/jobs/import/preview, but inlined so the
 * dashboard doesn't have to HTTP-self-fetch its own route during SSR.
 *
 * Two-stage match per folder:
 *   1. Direct id match — `Company__Role` derived from folder names.
 *   2. folderPath ownership — any Job (regardless of its id) whose
 *      folderPath points at this directory.
 *
 * Stage 2 catches bulk-paste records whose id stayed `pasted_<uuid>`
 * because the dispatcher couldn't rename them (e.g. the rename happens
 * after the orchestrator's done handler, which is the typical case).
 * Without it the user sees "X folders not yet imported" pointing at
 * folders prism already tracks — clicking Import would create
 * duplicates.
 */
async function countImportPreview(): Promise<{
  notImported: number;
  preview: Array<{ company: string; role: string }>;
}> {
  let companies: string[] = [];
  try {
    companies = (await fs.readdir(APPS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return { notImported: 0, preview: [] };
    throw err;
  }

  // Build a set of folderPaths owned by any existing Job, so we can
  // skip directories that are already tracked under a different id.
  const { listJobs } = await import("@/lib/jobs/store");
  const ownedPaths = new Set<string>();
  for (const j of await listJobs()) {
    if (j.folderPath) ownedPaths.add(j.folderPath);
  }

  let notImported = 0;
  const preview: Array<{ company: string; role: string }> = [];
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
      const folderAbs = path.join(APPS_DIR, company, role);
      // Skip if any Job already owns this folder, regardless of id shape.
      if (ownedPaths.has(folderAbs)) continue;
      // Skip very-recently-created folders. The dispatcher creates the
      // folder mid-run and the orchestrator's routeAfterDispatch only
      // writes folderPath onto the Job after the subprocess completes
      // — ~5-30 seconds later. Refreshing the dashboard during that
      // window briefly shows the folder as "unimported" even though
      // a dispatcher run is actively producing it. 60 s of headroom
      // covers the worst case; real legacy folders are always older.
      try {
        const st = await fs.stat(folderAbs);
        if (Date.now() - st.mtimeMs < 60_000) continue;
      } catch {}
      // Also skip if a Job with the derived id exists (covers the
      // case where the Job exists but folderPath wasn't set, e.g.
      // legacy imports).
      const existing = await readJob(deriveJobId(company, role));
      if (!existing) {
        notImported++;
        if (preview.length < 5) preview.push({ company, role });
      }
    }
  }
  return { notImported, preview };
}
