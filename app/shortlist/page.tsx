import { listJobs } from "@/lib/jobs/store";
import { ShortlistView } from "./view";

export const dynamic = "force-dynamic";

export default async function ShortlistPage() {
  const jobs = await listJobs();
  const shortlisted = jobs.filter((j) => j.status === "discovered");
  return (
    <main className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Shortlist</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          Discovery candidates awaiting your approve / skip / hold. Approving
          spawns the dispatcher automatically.
        </p>
      </header>
      <ShortlistView initial={shortlisted} />
    </main>
  );
}
