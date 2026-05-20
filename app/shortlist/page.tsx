import { listJobs } from "@/lib/jobs/store";
import { findActiveRuns } from "@/lib/runs/store";
import { PageHeader } from "@/components/ui";
import { ShortlistView } from "./view";

export const dynamic = "force-dynamic";

export default async function ShortlistPage() {
  const [jobs, activeDispatchers] = await Promise.all([
    listJobs(),
    findActiveRuns({ phase: "dispatch" }),
  ]);
  const shortlisted = jobs.filter((j) => j.status === "discovered");
  // Hand active dispatcher runs to the view so AgentRunPane stays
  // attached after navigation. Each entry includes the jobId so the
  // view can label panes with company/role.
  const activeRuns = activeDispatchers
    .filter((r) => r.jobId)
    .map((r) => {
      const job = jobs.find((j) => j.id === r.jobId);
      return {
        runId: r.runId,
        company: job?.company ?? "",
        role: job?.role ?? "",
      };
    });
  return (
    <main className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Shortlist"
        description="Discovery candidates awaiting your approve / skip / hold. Approving spawns the dispatcher automatically."
      />
      <ShortlistView initial={shortlisted} initialActiveRuns={activeRuns} />
    </main>
  );
}
