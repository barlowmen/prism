import { listJobs } from "@/lib/jobs/store";
import { ApplicationsView } from "./view";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const jobs = await listJobs();
  // Show anything past dispatcher gate — applied is the primary case but
  // ready_to_apply / rejected / skipped help the user see the broader pipeline.
  const tracked = jobs.filter((j) =>
    ["applied", "ready_to_apply", "ready_for_user_review", "rejected", "skipped"].includes(
      j.status,
    ),
  );

  return (
    <main className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          Outcome tracking. Updates feed back into{" "}
          <code className="text-xs">_meta/about_user.md</code>{" "}
          &quot;Open items / lessons&quot;.
        </p>
      </header>
      <ApplicationsView jobs={tracked} />
    </main>
  );
}
