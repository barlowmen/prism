import { notFound } from "next/navigation";
import Link from "next/link";
import { readRunLog } from "@/lib/runs/store";
import { ensureOrphanSweep } from "@/lib/runs/orphan-sweep";
import { BackLink, PageHeader } from "@/components/ui";
import { RunDetailPane } from "./view";

export const dynamic = "force-dynamic";

/**
 * Shareable detail page for a single run. Loads the persisted meta
 * + events from disk and hands them to a client component that mounts
 * AgentRunPane against the runId — same live-streaming surface as
 * inline panes elsewhere, just at a stable URL.
 *
 * Replays even after the broker has dropped the run from its in-memory
 * Map (the AgentRunPane component already does replay-from-disk via
 * the snapshot endpoint).
 */
export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureOrphanSweep();
  const { id } = await params;
  const { meta } = await readRunLog(id);
  if (!meta) notFound();

  return (
    <div className="max-w-4xl">
      <BackLink href="/settings/runs" label="Runs" />
      <PageHeader
        title={
          <>
            Run <span className="font-mono text-base">{id.slice(0, 8)}</span>
          </>
        }
        description={
          <>
            <span className="font-mono text-xs">{meta.phase}</span>
            {meta.jobId && (
              <>
                {" · job "}
                <Link
                  href={`/jobs/${encodeURIComponent(meta.jobId)}`}
                  className="font-mono text-xs hover:underline"
                >
                  {meta.jobId}
                </Link>
              </>
            )}
            {" · started "}
            <span className="font-mono text-xs">
              {new Date(meta.startedAt).toLocaleString()}
            </span>
          </>
        }
      />
      <RunDetailPane runId={id} initialStatus={meta.status} />
    </div>
  );
}
