import { TRUTH_BASE_FILES, type TruthBaseSlug } from "@/lib/paths";
import { readTruthBase } from "@/lib/truth-base";
import { TruthBaseEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function TruthBasePage() {
  const slugs = Object.keys(TRUTH_BASE_FILES) as TruthBaseSlug[];
  const files = await Promise.all(slugs.map((slug) => readTruthBase(slug)));
  const initial = files.map((f) => ({
    ...f,
    title: TRUTH_BASE_FILES[f.slug].title,
    description: TRUTH_BASE_FILES[f.slug].description,
  }));

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Truth Base</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          Source-of-truth markdown files in <code className="text-xs">_meta/</code>.
          Every agent reads these on cold start. Atomic temp-and-rename writes.
        </p>
      </header>
      <TruthBaseEditor initial={initial} />
    </main>
  );
}
