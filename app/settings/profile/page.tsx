/**
 * Profile Interview index page — the spine of first-time setup.
 *
 * Lists the 12 interview sections (objectives, narrative, experience,
 * skill_depth, education, public_footprint, filters, tailoring,
 * red_lines, lessons, open_items, quick_read), each with its current
 * state (untouched / in_progress / committed) and a deep link into
 * its chat-on-left / draft-on-right editor.
 *
 * `?first_run=1` flips the page into onboarding tone — bigger
 * orientation callout, "Recommended order" panel — because this
 * page is also the redirect target for new users whose
 * `_meta/about_user.md` is missing.
 */
import Link from "next/link";
import { loadProfile } from "@/lib/profile/merge";
import { readAllSectionStates } from "@/lib/profile/store";
import { SECTIONS } from "@/lib/profile/sections";
import { Button, Callout, PageHeader, StatusBadge } from "@/components/ui";

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
    <>
      {firstRun && (
        <div className="mb-5">
          <Callout tone="accent" title="Welcome to prism">
            You don&apos;t have a profile yet. The interview below builds{" "}
            <code className="text-xs">_meta/about_user.md</code> — the source of
            truth every agent reads. Pick any section to start; the agent asks
            one question at a time. You can do this in one sitting or over
            many. Once you have at least the <em>objectives</em>,{" "}
            <em>experience</em>, and <em>skill_depth</em> sections committed,
            set up <a href="/settings/archetypes" className="underline">archetypes</a>{" "}
            and you&apos;re ready to dispatch your first job.
          </Callout>
        </div>
      )}
      <PageHeader
        title="Profile Interview"
        description={
          <>
            Structured intake / refresh for{" "}
            <code className="text-xs">_meta/about_user.md</code>. Each section
            is a focused interview that produces a markdown chunk you review
            and commit. Backups land in{" "}
            <code className="text-xs">_meta/.prism-backups/</code>.
          </>
        }
      />

      <div
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--color-fg-muted)" }}
      >
        <span>
          profile:{" "}
          <span style={{ color: profileExists ? "var(--color-ok)" : "var(--color-warn)" }}>
            {profileExists ? "exists" : "new — first-time intake"}
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          sections present: {totalPresent} / {SECTIONS.length}
        </span>
        <span aria-hidden="true">·</span>
        <span>drafts ready: {totalDrafts}</span>
        <span aria-hidden="true">·</span>
        <span>committed this session: {totalCommitted}</span>
      </div>

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
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                    style={{
                      background: "transparent",
                      color: present ? "var(--color-ok)" : "var(--color-warn)",
                      borderColor: present ? "var(--color-ok)" : "var(--color-warn)",
                    }}
                  >
                    {present ? "in profile" : "missing"}
                  </span>
                  {status !== "untouched" && (
                    <StatusBadge
                      tone={
                        status === "committed"
                          ? "ok"
                          : status === "drafted"
                            ? "accent"
                            : "muted"
                      }
                    >
                      {status}
                    </StatusBadge>
                  )}
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
              <Link href={`/settings/profile/${def.key}`} className="shrink-0">
                <Button variant={status === "drafted" ? "primary" : "secondary"}>
                  {status === "drafted"
                    ? "Review draft"
                    : present
                      ? "Refresh"
                      : "Start interview"}
                </Button>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
