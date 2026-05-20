import { notFound } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { PREP_DIR } from "@/lib/paths";
import { readPrepFiles, isValidCompanySlug } from "@/lib/prep/store";
import { renderMarkdown } from "@/lib/markdown";
import { findActiveRuns } from "@/lib/runs/store";
import { BackLink, PageHeader } from "@/components/ui";
import { PrepCompanyView } from "./view";
import { companyHasApps } from "@/lib/prep/bootstrap";

export const dynamic = "force-dynamic";

export default async function PrepCompanyPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;
  if (!isValidCompanySlug(company)) notFound();

  const { exists, files } = await readPrepFiles(company);
  const hasApps = await companyHasApps(company);
  // prep_builder runs are spawned with jobId=null and don't carry a
  // company field in RunMetadata today, so we can't filter precisely.
  // Pick the newest active prep_builder run — for solo single-user
  // workflow this is almost always the right one. If the user is
  // running two prep loops in parallel, the more-recent one wins.
  const activePrep = await findActiveRuns({ phase: "prep_builder" });
  const activeBuildRunId = activePrep[0]?.runId ?? null;

  // Eagerly render every markdown file server-side so the client gets
  // ready-to-paint HTML — same pattern as the Job detail page.
  const rendered: Record<string, string> = {};
  for (const f of files) {
    if (f.binary) continue;
    try {
      const body = await fs.readFile(
        path.join(PREP_DIR, company, f.relPath),
        "utf8",
      );
      rendered[f.relPath] = await renderMarkdown(body);
    } catch {}
  }

  return (
    <main className="max-w-5xl mx-auto p-6">
      <BackLink href="/prep" label="Prep" />
      <PageHeader
        title={company}
        description={
          <>
            Interview prep workspace —{" "}
            <code className="text-xs">prep/{company}/</code>. {files.length}{" "}
            file{files.length === 1 ? "" : "s"}.
          </>
        }
      />
      <PrepCompanyView
        company={company}
        folderExists={exists}
        hasApps={hasApps}
        files={files}
        rendered={rendered}
        initialBuildRunId={activeBuildRunId}
      />
    </main>
  );
}
