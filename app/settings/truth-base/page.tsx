/**
 * Truth Base page — hosts the raw markdown editor for the user-owned
 * source-of-truth files (about_user.md + style guide). All editing
 * UI lives in the client component TruthBaseEditor; this server file
 * just loads each allowlisted file and passes the snapshot in.
 *
 * The allowlist (TRUTH_BASE_FILES in lib/paths.ts) is intentionally
 * narrow — `workflow.md` and `build_resume_template.js` used to be
 * here but were promoted to prism-managed system files (seeded from
 * defaults/, not user-editable).
 */
import { TRUTH_BASE_FILES, type TruthBaseSlug } from "@/lib/paths";
import { readTruthBase } from "@/lib/truth-base";
import { PageHeader } from "@/components/ui";
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
    <>
      <PageHeader
        title="Truth Base"
        description={
          <>
            Source-of-truth markdown files in <code className="text-xs">_meta/</code>.
            Every agent reads these on cold start. Atomic temp-and-rename writes.
          </>
        }
      />
      <TruthBaseEditor initial={initial} />
    </>
  );
}
