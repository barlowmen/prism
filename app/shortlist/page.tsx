import { listJobs } from "@/lib/jobs/store";
import { PageHeader } from "@/components/ui";
import { ShortlistView } from "./view";

export const dynamic = "force-dynamic";

export default async function ShortlistPage() {
  const jobs = await listJobs();
  const shortlisted = jobs.filter((j) => j.status === "discovered");
  return (
    <main className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Shortlist"
        description="Discovery candidates awaiting your approve / skip / hold. Approving spawns the dispatcher automatically."
      />
      <ShortlistView initial={shortlisted} />
    </main>
  );
}
