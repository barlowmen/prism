/**
 * POST /api/archetypes/generate-all-bases
 *
 * Kick off base-resume generation for many archetypes in parallel,
 * capped at `concurrency` archetype loops in flight at once.
 *
 * Body:
 *   { concurrency?: number, includeExisting?: boolean }
 *
 * Defaults: concurrency=2 (clamped to [1, 5]), includeExisting=false
 * (only archetypes without an existing baseResumePath get queued).
 *
 * Returns immediately with the plan { total, queued, alreadyHasBase }.
 * The actual generation loops run in the background — the UI watches
 * archetype.baseStatus to render progress.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  bulkGenerateInBackground,
  planBulkGenerate,
} from "@/lib/archetypes/bulk-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body → defaults.
  }
  const concurrency =
    typeof body?.concurrency === "number" ? body.concurrency : 2;
  const includeExisting = body?.includeExisting === true;

  const plan = await planBulkGenerate(includeExisting);
  if (plan.queued.length === 0) {
    return NextResponse.json(plan);
  }

  // Fire-and-forget — don't await; the response goes back immediately
  // and the workers continue on the Node event loop.
  bulkGenerateInBackground(plan.queued, concurrency).catch(() => {});

  return NextResponse.json(plan);
}
