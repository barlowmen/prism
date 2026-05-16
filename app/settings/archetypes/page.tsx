import Link from "next/link";
import { listSummaries } from "@/lib/archetypes/store";
import { ArchetypesList } from "./list";

export const dynamic = "force-dynamic";

export default async function ArchetypesPage() {
  const archetypes = await listSummaries();
  return (
    <main className="max-w-5xl mx-auto p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Archetypes</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
            A base resume + matching hints. The dispatcher picks one of
            these for every posting; the draft agent starts from the chosen
            archetype&apos;s DOCX. Stored in{" "}
            <code className="text-xs">_meta/archetypes/&lt;key&gt;.json</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/settings/archetypes/new"
            className="px-3 py-1.5 text-xs rounded border"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              borderColor: "var(--color-accent)",
            }}
          >
            New archetype
          </Link>
        </div>
      </header>
      <ArchetypesList initial={archetypes} />
    </main>
  );
}
