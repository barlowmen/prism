import { listJobs } from "@/lib/jobs/store";
import { findActiveRuns } from "@/lib/runs/store";
import { loadDiscoveryIndex } from "@/lib/discovery/candidates";
import { PageHeader } from "@/components/ui";
import { ShortlistView, type ShortlistRow } from "./view";

export const dynamic = "force-dynamic";

export default async function ShortlistPage() {
  const [jobs, activeDispatchers, discoveryIndex] = await Promise.all([
    listJobs(),
    findActiveRuns({ phase: "dispatch" }),
    loadDiscoveryIndex(),
  ]);
  // Shortlist is now strictly for discovery candidates awaiting triage.
  // Manual / bulk-paste jobs land at status="queued" instead of
  // "discovered" — keeps them off this page entirely.
  const rows: ShortlistRow[] = jobs
    .filter((j) => j.status === "discovered")
    .map((j) => {
      const meta = j.sourceUrl ? discoveryIndex.get(j.sourceUrl) : undefined;
      return {
        job: j,
        // Prefer the Job record's own company/role (set when the Job
        // was created from a disc-*.json entry); fall back to the
        // index if the Job's fields are empty (shouldn't usually
        // happen but cheap to handle).
        company: j.company || meta?.company || "",
        role: j.role || meta?.role || "",
        scoreTotal: meta?.scoreTotal,
        source: meta?.source,
        location: meta?.location,
        whyMatched: meta?.whyMatched,
      };
    });
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
      <ShortlistView initial={rows} initialActiveRuns={activeRuns} />
    </main>
  );
}
