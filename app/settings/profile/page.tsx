import Link from "next/link";
import { loadProfile } from "@/lib/profile/merge";
import { readAllSectionStates } from "@/lib/profile/store";
import { SECTIONS } from "@/lib/profile/sections";

export const dynamic = "force-dynamic";

export default async function ProfileInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ first_run?: string }>;
}) {
  const sp = await searchParams;
  const firstRun = sp.first_run === "1";
  const [parsed, states] = await Promise.all([
    loadProfile(),
    readAllSectionStates(),
  ]);

  const profileExists = !!parsed;
  const totalPresent = parsed
    ? parsed.sections.filter((s) => s.present).length
    : 0;
  const totalDrafts = Object.values(states).filter((s) => s?.draft).length;
  const totalCommitted = Object.values(states).filter(
    (s) => s?.status === "committed",
  ).length;

  return (
    <main className="max-w-5xl mx-auto p-6">
      {firstRun && (
        <div
          className="rounded-md border p-4 mb-5"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-accent)",
          }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: "var(--color-accent)" }}>
            Welcome to prism
          </div>
          <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            You don&apos;t have a profile yet. The interview below builds{" "}
            <code className="text-xs">_meta/about_user.md</code> — the source
            of truth every agent reads. Pick any section to start; the agent
            asks one question at a time. You can do this in one sitting or
            over many. Once you have at least the <em>objectives</em>,{" "}
            <em>experience</em>, and <em>skill_depth</em> sections committed,
            set up <a href="/settings/archetypes" className="underline">archetypes</a> and
            you&apos;re ready to dispatch your first job.
          </p>
        </div>
      )}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile Interview</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          Structured intake / refresh for{" "}
          <code className="text-xs">_meta/about_user.md</code>. Each section is
          a focused interview that produces a markdown chunk you review and
          commit. Backups land in{" "}
          <code className="text-xs">_meta/.prism-backups/</code>.
        </p>
        <div
          className="mt-3 flex gap-4 text-xs"
          style={{ color: "var(--color-fg-muted)" }}
        >
          <span>
            profile:{" "}
            <span
              style={{
                color: profileExists ? "var(--color-ok)" : "var(--color-warn)",
              }}
            >
              {profileExists ? "exists" : "new — first-time intake"}
            </span>
          </span>
          <span>·</span>
          <span>
            sections present: {totalPresent} / {SECTIONS.length}
          </span>
          <span>·</span>
          <span>drafts ready: {totalDrafts}</span>
          <span>·</span>
          <span>committed this session: {totalCommitted}</span>
        </div>
      </header>

      <ul className="space-y-2">
        {SECTIONS.map((def) => {
          const parsedSection = parsed?.sections.find((s) => s.key === def.key);
          const present = !!parsedSection?.present;
          const state = states[def.key];
          const status = state?.status ?? "untouched";
          return (
            <li
              key={def.key}
              className="rounded-md border p-4 flex items-start justify-between gap-4"
              style={{ background: "var(--color-surface-1)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{def.label}</span>
                  <FilePresenceBadge present={present} />
                  <InterviewStatusBadge status={status} />
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  {def.description}
                </div>
                {state?.committedAt && (
                  <div
                    className="text-[10px] mt-1 font-mono"
                    style={{ color: "var(--color-fg-muted)" }}
                  >
                    last committed {new Date(state.committedAt).toLocaleString()}
                  </div>
                )}
                {state?.draftAt && status !== "committed" && (
                  <div
                    className="text-[10px] mt-1 font-mono"
                    style={{ color: "var(--color-accent)" }}
                  >
                    draft from {new Date(state.draftAt).toLocaleString()} — review
                  </div>
                )}
              </div>
              <Link
                href={`/settings/profile/${def.key}`}
                className="px-3 py-1.5 text-xs rounded border shrink-0"
                style={{
                  background:
                    status === "drafted"
                      ? "var(--color-accent)"
                      : "var(--color-surface-2)",
                  color:
                    status === "drafted" ? "var(--color-bg)" : "var(--color-fg)",
                  borderColor:
                    status === "drafted"
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                }}
              >
                {status === "drafted"
                  ? "Review draft"
                  : present
                    ? "Refresh"
                    : "Start interview"}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function FilePresenceBadge({ present }: { present: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{
        background: "var(--color-surface-2)",
        color: present ? "var(--color-ok)" : "var(--color-warn)",
      }}
    >
      {present ? "in profile" : "missing"}
    </span>
  );
}

function InterviewStatusBadge({ status }: { status: string }) {
  if (status === "untouched") return null;
  const color =
    status === "committed"
      ? "var(--color-ok)"
      : status === "drafted"
        ? "var(--color-accent)"
        : "var(--color-fg-muted)";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{ background: "var(--color-surface-2)", color }}
    >
      {status}
    </span>
  );
}
