import { notFound } from "next/navigation";
import fs from "node:fs/promises";
import { absInterviews } from "@/lib/paths";
import { readArchetype } from "@/lib/archetypes/store";
import { BackLink } from "@/components/ui";
import { ArchetypeEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function ArchetypePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const a = await readArchetype(key);
  if (!a) notFound();

  let baseInfo: { exists: boolean; size: number | null; mtimeMs: number | null } = {
    exists: false,
    size: null,
    mtimeMs: null,
  };
  if (a.baseResumePath) {
    try {
      const stat = await fs.stat(absInterviews(a.baseResumePath));
      baseInfo = { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
    } catch {}
  }

  return (
    <div className="max-w-3xl">
      <BackLink href="/settings/archetypes" label="Archetypes" />
      <header className="mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{a.label}</h1>
          <span
            className="text-sm font-mono"
            style={{ color: "var(--color-fg-muted)" }}
          >
            {a.key}
          </span>
        </div>
        <p
          className="text-[11px] mt-1 font-mono"
          style={{ color: "var(--color-fg-muted)" }}
        >
          _meta/archetypes/{a.key}.json
        </p>
      </header>

      <ArchetypeEditor initial={a} initialBaseInfo={baseInfo} />
    </div>
  );
}
