import fs from "node:fs/promises";
import { redirect } from "next/navigation";
import { listJobs } from "@/lib/jobs/store";
import {
  COLUMNS,
  GROUP_LABELS,
  GROUP_ORDER,
  groupJobsByStatus,
  type ColumnGroup,
} from "@/lib/jobs/grouping";
import { absWorkspace, TRUTH_BASE_FILES } from "@/lib/paths";
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
    fetchImportPreview(),
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

async function fetchImportPreview(): Promise<{ notImported: number; preview: Array<{ company: string; role: string }> }> {
  // Call the API locally — same logic could be inlined, but reusing the
  // route keeps the import counter and the dry-run identical.
  try {
    const r = await fetch("http://127.0.0.1:3737/api/jobs/import/preview", {
      cache: "no-store",
    });
    if (!r.ok) return { notImported: 0, preview: [] };
    return await r.json();
  } catch {
    return { notImported: 0, preview: [] };
  }
}
