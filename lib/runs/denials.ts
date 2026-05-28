import "server-only";
/**
 * Shared helpers for turning a run's permission_denials into actionable
 * orchestrator errors.
 *
 * Claude Code reports tools it refused to run (the headless permission
 * gate denied them) in its structuredResult.permission_denials; the
 * broker extracts those into RunMetadata.permissionDenials. When a
 * completion handler finds its expected artifact missing (no DOCX, no
 * parseable verdict), a denial is the most common cause — surfacing the
 * specific tool name lets the user pre-approve it instead of guessing,
 * and lets the job error immediately rather than sitting in a transient
 * state until the next server restart's orphan-sweep reconciles it.
 */
import { getRunSnapshot } from "./broker";
import { readRunLog } from "./store";

/**
 * De-duplicated tool names a completed run was denied permission for.
 * Reads the in-memory snapshot first (present at done-time), falling
 * back to the on-disk log. Empty array on any error or when none.
 */
export async function deniedToolNames(runId: string): Promise<string[]> {
  try {
    let denials = getRunSnapshot(runId)?.meta.permissionDenials ?? null;
    if (!denials) {
      denials = (await readRunLog(runId)).meta?.permissionDenials ?? [];
    }
    return Array.from(new Set((denials ?? []).map((d) => d.toolName)));
  } catch {
    return [];
  }
}

/**
 * Compose a status note for an output-missing failure, appending the
 * denied-tools cause when present. `base` is the generic reason
 * (e.g. "draft completed but no DOCX was produced").
 */
export function failureNote(base: string, deniedTools: string[]): string {
  if (deniedTools.length === 0) return base;
  return `${base} — agent was denied tools it needed (${deniedTools.join(", ")}). Pre-approve them in .claude/settings.json, then re-run.`;
}
