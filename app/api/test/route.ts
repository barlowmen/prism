/**
 * POST /api/test
 *
 * Connectivity test card on /settings/health. One-shot Claude Code
 * roundtrip that reads about_user.md and extracts two facts. Verifies
 * auth + stream-json parsing without touching any job state.
 */
import { NextResponse } from "next/server";
import { INTERVIEWS_DIR, launchClaude, type AgentStreamEvent } from "@/lib/claude-launcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPT = `Read \`_meta/about_user.md\` (it lives at the root of your current working directory).

From it, extract:
1. The user's hard comp floor for fully-remote roles (number with currency).
2. Their #1 top-priority target archetype.

Reply with ONLY a single JSON object wrapped in <result>...</result> tags. Schema:

<result>{"compFloor":"<string e.g. $230K base>","topArchetype":"<short label>"}</result>

No prose outside the tags.`;

export async function POST() {
  const events: AgentStreamEvent[] = [];
  const { done } = launchClaude({
    prompt: PROMPT,
    cwd: INTERVIEWS_DIR,
    timeoutMs: 120_000,
    phase: "probe",
    onStreamEvent: (e) => events.push(e),
  });

  const result = await done;

  // Extract <result>...</result> from the finalText.
  let extracted: unknown = null;
  let extractedRaw: string | null = null;
  if (result.finalText) {
    const m = result.finalText.match(/<result>([\s\S]*?)<\/result>/);
    if (m) {
      extractedRaw = m[1].trim();
      try {
        extracted = JSON.parse(extractedRaw);
      } catch {
        extracted = null;
      }
    }
  }

  // Count unknown_event occurrences (the spec wants confirmation that the
  // launcher does not crash on unrecognized events).
  const unknownEvents = events.filter((e) => e.type === "unknown_event").length;
  const usageEvents = events.filter((e) => e.type === "usage").length;
  const rateLimitEvents = events.filter((e) => e.type === "rate_limit").length;

  return NextResponse.json({
    runId: result.runId,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    apiKeySource: result.apiKeySource,
    durationMs: result.durationMs,
    tokenTotals: {
      input: result.totalInputTokens,
      output: result.totalOutputTokens,
      cacheRead: result.totalCacheReadTokens,
      cacheCreation: result.totalCacheCreationTokens,
    },
    eventCounts: {
      total: events.length,
      usage: usageEvents,
      unknown: unknownEvents,
      rateLimit: rateLimitEvents,
    },
    extractedRaw,
    extracted,
    finalText: result.finalText,
  });
}
