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
 * Three-stage match per folder:
 *   1. Direct id match — `Company__Role` derived from folder names.
 *   2. folderPath ownership — any Job (regardless of its id) whose
 *      folderPath points at this directory.
 *   3. Active-dispatcher suppression — when ANY dispatcher is running
 *      somewhere in the app, every folder is suppressed. Dispatchers
 *      create their folders during the run and only set the owning
 *      Job's folderPath in the post-completion handler — sometimes
 *      5-20 minutes later. During that window the folder looks like
 *      an orphan but isn't. Wait for all dispatchers to settle, then
 *      re-evaluate; truly-orphaned folders re-emerge with no false
 *      positives.
 *
 * Stage 2 catches bulk-paste records whose id stayed `pasted_<uuid>`
 * because the dispatcher couldn't rename them. Stage 3 is the
 * belt-and-suspenders fix for the in-flight race that stage 2's
 * folderPath check can't catch (Job exists but its folderPath is null
 * until the orchestrator gets to it).
 */
async function countImportPreview(): Promise<{
  notImported: number;
  preview: Array<{ company: string; role: string }>;
}> {
  // Stage 3 suppression — short-circuit before any disk work.
  const { findActiveRuns } = await import("@/lib/runs/store");
  const activeDispatchers = await findActiveRuns({ phase: "dispatch" });
  if (activeDispatchers.length > 0) {
    return { notImported: 0, preview: [] };
  }

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
