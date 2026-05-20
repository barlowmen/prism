/**
 * Applications page — outcome tracker for jobs that have left the
 * agent pipeline. Filters listJobs() down to terminal-ish statuses
 * (applied / ready_to_apply / ready_for_user_review / rejected /
 * skipped) and hands off to the client view that lets the user mark
 * phone_screen / interview / offer / rejected outcomes per row.
 *
 * Outcome updates feed back into the lessons system — the user can
 * synthesize "what worked / what didn't" patterns into about_user.md
 * over time. That sequencing is why this page sits at the top nav
 * even though most of the day-to-day action lives on Dashboard.
 */
import { listJobs } from "@/lib/jobs/store";
import { PageHeader } from "@/components/ui";
import { ApplicationsView } from "./view";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const jobs = await listJobs();
  const tracked = jobs.filter((j) =>
    ["applied", "ready_to_apply", "ready_for_user_review", "rejected", "skipped"].includes(
      j.status,
    ),
  );

  return (
    <main className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Applications"
        description={
          <>
            Track outcomes. Marking a job as <code>interview</code>,{" "}
            <code>offer</code>, or <code>rejected</code> updates the lessons
            you can synthesize into{" "}
            <code className="text-xs">_meta/about_user.md</code>.
          </>
        }
      />
      <ApplicationsView jobs={tracked} />
    </main>
  );
}
