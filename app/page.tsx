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
 * Three ways a folder can be claimed (any one = skip):
 *   1. `.prism-job-id` sidecar — the dispatcher writes this when it
 *      creates the folder. Authoritative claim, written synchronously
 *      mid-run. Survives orchestrator crashes.
 *   2. folderPath match — any Job's `folderPath` field equals this
 *      directory. Set by the orchestrator's routeAfterDispatch after
 *      the run completes, OR by the createJob path for known names.
 *   3. Derived-id match — a Job exists at `deriveJobId(company, role)`.
 *      Covers legacy records whose folderPath wasn't set (e.g. older
 *      imported entries from before this code existed).
 *
 * Without #1 the import-preview races with in-flight dispatchers and
 * shows their just-created folders as orphans for the 5-20 minutes
 * between mkdir and the orchestrator writing folderPath. The sidecar
 * fixes that for good — no mtime guards, no "suppress while running"
 * heuristics, just an explicit on-disk ownership claim.
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

      // Stage 1: sidecar claim. Authoritative — written by the
      // dispatcher when it creates the folder.
      try {
        await fs.stat(path.join(folderAbs, ".prism-job-id"));
        continue;
      } catch {
        // No sidecar — fall through to stages 2 & 3.
      }

      // Stage 2: folderPath ownership.
      if (ownedPaths.has(folderAbs)) continue;

      // Stage 3: derived-id match. Catches legacy records whose
      // folderPath wasn't populated.
      const existing = await readJob(deriveJobId(company, role));
      if (!existing) {
        notImported++;
        if (preview.length < 5) preview.push({ company, role });
      }
    }
  }
  return { notImported, preview };
}
