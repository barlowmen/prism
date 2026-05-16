import { getHealth } from "@/lib/health";
import { PageHeader } from "@/components/ui";
import { HealthView } from "./view";

export const dynamic = "force-dynamic";

/**
 * Skip the slow Claude Code subprocess probe on initial render so the
 * page paints fast. The client fires /api/health right after mount to
 * fill in the auth card with a real probe result.
 */
export default async function HealthPage() {
  const initial = await getHealth({ skipAuthProbe: true });
  return (
    <>
      <PageHeader
        title="System Health"
        description="Pre-flight check: CLI installed, authenticated to subscription (not API key), Truth Base present, base resumes on disk."
      />
      <HealthView initial={initial} />
    </>
  );
}
