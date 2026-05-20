/**
 * Per-section Profile Interview editor. Two-pane workspace: chat with
 * the assistant on the left, draft markdown on the right. The user
 * iterates with the assistant until they're happy, then clicks Commit
 * — which replaces just this section's H2 block in
 * `_meta/about_user.md` atomically (previous version backed up under
 * `_meta/.prism-backups/`).
 *
 * Section keys are validated against the SECTIONS enum so users can't
 * deep-link to nonsense. Page loads:
 *   - the section's metadata (title, prompt, ordering hints)
 *   - the user's draft (if any) from per-section state
 *   - the existing about_user.md content (so the editor can show
 *     the "currently committed" view alongside the draft)
 *   - the assistant chat thread for this section (persisted)
 */
import { notFound } from "next/navigation";
import { loadProfile } from "@/lib/profile/merge";
import { readSectionState } from "@/lib/profile/store";
import { readThread } from "@/lib/assistant/store";
import { getSection, isSectionKey } from "@/lib/profile/sections";
import { BackLink } from "@/components/ui";
import { SectionInterviewView } from "./view";

export const dynamic = "force-dynamic";

export default async function SectionInterviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!isSectionKey(key)) notFound();
  const def = getSection(key);

  const [parsed, state] = await Promise.all([
    loadProfile(),
    readSectionState(key),
  ]);
  const thread = state?.threadId ? await readThread(state.threadId) : null;

  const existingContent =
    parsed?.sections.find((s) => s.key === key && s.present)?.content ?? null;

  return (
    <>
      <BackLink href="/settings/profile" label="Profile Interview" />
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{def.label}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          {def.description}
        </p>
        <p
          className="text-[11px] mt-1 font-mono"
          style={{ color: "var(--color-fg-muted)" }}
        >
          target heading: ## {def.canonicalHeading}
        </p>
      </header>

      <SectionInterviewView
        sectionKey={key}
        sectionLabel={def.label}
        canonicalHeading={def.canonicalHeading}
        existingContent={existingContent}
        initialThread={thread}
        initialState={state}
      />
    </>
  );
}
