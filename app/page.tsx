import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { listJobs, readJob, deriveJobId } from "@/lib/jobs/store";
import {
  COLUMNS,
  GROUP_LABELS,
  GROUP_ORDER,
  groupJobsByStatus,
  type ColumnGroup,
} from "@/lib/jobs/grouping";
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

  const [jobs, importPreview] = await Promise.all([
    listJobs(),
    countImportPreview(),
  ]);
  const grouped = groupJobsByStatus(jobs);

  const columnsByGroup = GROUP_ORDER.reduce(
    (acc, g) => {
      acc[g] = COLUMNS.filter((c) => c.group === g);
      return acc;
    },
    {} as Record<ColumnGroup, typeof COLUMNS>,
  );

  return (
    <Dashboard
      grouped={grouped}
      columnsByGroup={columnsByGroup}
      groupOrder={GROUP_ORDER}
      groupLabels={GROUP_LABELS}
      totalJobs={jobs.length}
      importPreview={importPreview}
    />
  );
}

/**
 * Same dry-run scan as /api/jobs/import/preview, but inlined so the
 * dashboard doesn't have to HTTP-self-fetch its own route during SSR.
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
      const existing = await readJob(deriveJobId(company, role));
      if (!existing) {
        notImported++;
        if (preview.length < 5) preview.push({ company, role });
      }
    }
  }
  return { notImported, preview };
}
