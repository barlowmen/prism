import { getHealth } from "@/lib/health";
import { HealthView } from "./view";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  // Skip the slow Claude Code subprocess probe on initial render; the
  // client fires a recheck via /api/health right after mount to fill in
  // the auth card.
  const initial = await getHealth({ skipAuthProbe: true });
  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          Pre-flight check: CLI installed, authenticated to subscription
          (not API key), Truth Base present, base resumes on disk.
        </p>
      </header>
      <HealthView initial={initial} />
    </main>
  );
}
