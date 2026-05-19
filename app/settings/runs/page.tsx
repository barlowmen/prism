import Link from "next/link";
import { readRunsIndex } from "@/lib/runs/store";
import { ensureOrphanSweep } from "@/lib/runs/orphan-sweep";
import { EmptyState, PageHeader } from "@/components/ui";
import { RunsLivePoll } from "./poll";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  // Sweep before reading so any "running" entries left over from a
  // previous process get reconciled before they render as live runs.
  // Cached-once per process — first request after a restart pays the
  // walk; everything else is free.
  await ensureOrphanSweep();
  const runs = await readRunsIndex();
  const hasActive = runs.some((r) => r.status === "running");
  return (
    <>
      <RunsLivePoll hasActive={hasActive} />
      <PageHeader
        title="Agent runs"
        description={
          <>
            History of every Claude Code invocation. For debugging.{" "}
            Stored in <code className="text-xs">.state/runs.json</code> +{" "}
            <code className="text-xs">.state/runs/&lt;runId&gt;.log</code>.
          </>
        }
      />

      {runs.length === 0 ? (
        <EmptyState title="No runs yet.">
          Spawn a dispatcher or run a probe from <Link href="/settings/health" className="underline">Health</Link> to see entries here.
        </EmptyState>
      ) : (
        <div
          className="rounded-md border overflow-hidden"
          style={{ background: "var(--color-surface-1)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--color-fg-muted)" }}>
                <th className="font-normal py-2 px-3">When</th>
                <th className="font-normal py-2 px-3">Phase</th>
                <th className="font-normal py-2 px-3">Job</th>
                <th className="font-normal py-2 px-3">Status</th>
                <th className="font-normal py-2 px-3 text-right">Duration</th>
                <th className="font-normal py-2 px-3 text-right">Tokens</th>
                <th className="font-normal py-2 px-3">Billing</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                // For in-flight runs, compute "running for Xm Ys" against
                // wall-clock at render time. The 5s poll keeps this fresh.
                const endMs = r.completedAt
                  ? new Date(r.completedAt).getTime()
                  : r.status === "running"
                    ? Date.now()
                    : null;
                const dur =
                  endMs && r.startedAt
                    ? endMs - new Date(r.startedAt).getTime()
                    : null;
                const durLabel =
                  dur == null
                    ? "—"
                    : dur < 60_000
                      ? `${(dur / 1000).toFixed(1)}s`
                      : `${Math.floor(dur / 60_000)}m ${Math.floor((dur % 60_000) / 1000)}s`;
                const totalTokens =
                  r.tokenTotals.input + r.tokenTotals.output;
                return (
                  <tr key={r.runId} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-2 px-3 text-xs font-mono">
                      {new Date(r.startedAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono">{r.phase}</td>
                    <td className="py-2 px-3 text-xs">
                      {r.jobId ? (
                        <Link
                          href={`/jobs/${encodeURIComponent(r.jobId)}`}
                          className="hover:underline"
                        >
                          {r.jobId}
                        </Link>
                      ) : (
                        <span style={{ color: "var(--color-fg-muted)" }}>—</span>
                      )}
                    </td>
                    <td
                      className="py-2 px-3 text-xs font-mono"
                      style={{
                        color:
                          r.status === "completed"
                            ? "var(--color-ok)"
                            : r.status === "failed" || r.status === "timed_out"
                              ? "var(--color-err)"
                              : r.status === "cancelled"
                                ? "var(--color-fg-muted)"
                                : "var(--color-accent)",
                      }}
                    >
                      {r.status}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono text-right">
                      {durLabel}
                    </td>
                    <td
                      className="py-2 px-3 text-xs font-mono text-right"
                      title={`in ${r.tokenTotals.input} · out ${r.tokenTotals.output} · cache_r ${r.tokenTotals.cacheRead} · cache_c ${r.tokenTotals.cacheCreation}`}
                    >
                      {totalTokens.toLocaleString()}
                    </td>
                    <td
                      className="py-2 px-3 text-xs font-mono"
                      style={{
                        color:
                          r.apiKeySource === "none"
                            ? "var(--color-ok)"
                            : "var(--color-warn)",
                      }}
                      title="apiKeySource — 'none' means Pro/Max subscription, anything else means API key billing"
                    >
                      {r.apiKeySource === "none"
                        ? "subscription"
                        : (r.apiKeySource ?? "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
