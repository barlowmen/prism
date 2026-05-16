import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProfile } from "@/lib/profile/merge";
import { readSectionState } from "@/lib/profile/store";
import { readThread } from "@/lib/assistant/store";
import { getSection, isSectionKey } from "@/lib/profile/sections";
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
    <main className="max-w-6xl mx-auto p-6">
      <Link
        href="/settings/profile"
        className="text-xs inline-block mb-3 hover:underline"
        style={{ color: "var(--color-fg-muted)" }}
      >
        ← Profile Interview
      </Link>
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
    </main>
  );
}
