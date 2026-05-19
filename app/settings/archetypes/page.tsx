import Link from "next/link";
import { listSummaries } from "@/lib/archetypes/store";
import { previewScaffolds } from "@/lib/archetypes/scaffold";
import { Button, PageHeader } from "@/components/ui";
import { ArchetypesList } from "./list";

export const dynamic = "force-dynamic";

export default async function ArchetypesPage() {
  const [archetypes, scaffolds] = await Promise.all([
    listSummaries(),
    previewScaffolds(),
  ]);
  const unscaffolded = scaffolds.available.filter((a) => !a.exists);

  return (
    <>
      <PageHeader
        title="Archetypes"
        description={
          <>
            A base resume + matching hints. The dispatcher picks one of
            these for every posting; the draft agent starts from the chosen
            archetype&apos;s DOCX. Stored in{" "}
            <code className="text-xs">_meta/archetypes/&lt;key&gt;.json</code>.
          </>
        }
        actions={
          <Link href="/settings/archetypes/new">
            <Button variant="primary">New archetype</Button>
          </Link>
        }
      />
      <ArchetypesList
        initial={archetypes}
        scaffoldPreview={{
          profileFound: scaffolds.profileFound,
          available: scaffolds.available,
          unscaffoldedCount: unscaffolded.length,
          notes: scaffolds.notes,
        }}
      />
    </>
  );
}
