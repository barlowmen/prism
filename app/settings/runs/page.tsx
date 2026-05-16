import Link from "next/link";
import { readRunsIndex } from "@/lib/runs/store";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await readRunsIndex();
  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent runs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          History of every Claude Code invocation. For debugging.
          {" "}Stored in <code className="text-xs">.state/runs.json</code> +{" "}
          <code className="text-xs">.state/runs/&lt;runId&gt;.log</code>.
        </p>
      </header>

      {runs.length === 0 ? (
        <div
          className="rounded-md border p-8 text-center text-sm"
          style={{ background: "var(--color-surface-1)", color: "var(--color-fg-muted)" }}
        >
          No runs yet.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden" style={{ background: "var(--color-surface-1)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--color-fg-muted)" }}>
                <th className="font-normal py-2 px-3">When</th>
                <th className="font-normal py-2 px-3">Phase</th>
                <th className="font-normal py-2 px-3">Job</th>
                <th className="font-normal py-2 px-3">Status</th>
                <th className="font-normal py-2 px-3 text-right">Duration</th>
                <th className="font-normal py-2 px-3 text-right">Tokens (in/out/cache)</th>
                <th className="font-normal py-2 px-3">Auth</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const dur =
                  r.completedAt && r.startedAt
                    ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
                    : null;
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
                      {dur != null ? `${(dur / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono text-right">
                      {r.tokenTotals.input}/{r.tokenTotals.output}/{r.tokenTotals.cacheRead}
                    </td>
                    <td
                      className="py-2 px-3 text-xs font-mono"
                      style={{
                        color:
                          r.apiKeySource === "none"
                            ? "var(--color-ok)"
                            : "var(--color-warn)",
                      }}
                      title="apiKeySource — 'none' means subscription, anything else means API key billing"
                    >
                      {r.apiKeySource ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
