/**
 * Prep index — one card per company that has a `<workspace>/prep/<Co>/`
 * directory. Each card links into the per-company prep workspace
 * (overview + per-round prep + appendix + notes), which is where the
 * actual interview prep editing happens.
 *
 * Companies show up here once the user reaches phone_screen / interview
 * outcome on a job and the prep workspace gets bootstrapped (manually
 * via "Bootstrap prep pack" or auto-spawned by the prep-builder agent).
 */
import Link from "next/link";
import { listPrepCompanies } from "@/lib/prep/store";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const companies = await listPrepCompanies();
  return (
    <main className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Interview prep"
        description={
          <>
            Per-company prep workspaces under{" "}
            <code className="text-xs">prep/</code>. Each one is a set of
            markdown files keyed to an interview round. Click a company to
            open the workspace; new companies bootstrap from a standard
            template.
          </>
        }
      />

      {companies.length === 0 ? (
        <EmptyState title="No prep folders yet.">
          When a job reaches the phone-screen or interview stage, open it
          from <Link href="/applications" className="underline">Applications</Link>{" "}
          and click <strong>Open prep workspace</strong> to bootstrap a
          workspace from the standard template.
        </EmptyState>
      ) : (
        <ul
          className="rounded-md border divide-y"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-border)",
          }}
        >
          {companies.map((c) => (
            <li
              key={c.company}
              style={{ borderColor: "var(--color-border)" }}
            >
              <Link
                href={`/prep/${encodeURIComponent(c.company)}`}
                className="block px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.company}</span>
                    {!c.bootstrapped && (
                      <StatusBadge tone="warn">not bootstrapped</StatusBadge>
                    )}
                  </div>
                  <div
                    className="text-[11px] font-mono mt-0.5"
                    style={{ color: "var(--color-fg-muted)" }}
                  >
                    prep/{c.company}/
                  </div>
                </div>
                <div
                  className="text-xs text-right shrink-0"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  <div>
                    {c.fileCount} file{c.fileCount === 1 ? "" : "s"}
                  </div>
                  <div className="font-mono">
                    {c.lastModifiedMs
                      ? new Date(c.lastModifiedMs).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
