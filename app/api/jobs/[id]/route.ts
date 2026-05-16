/**
 * /api/jobs/<id>
 *
 * GET — fetch one job's full record.
 * PATCH — partial update. Validates status / outcome / reclassifySuggestion
 *         against their enums. Status changes append to statusHistory in
 *         the store; concurrent PATCHes for the same id are serialized.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readJob, updateJob } from "@/lib/jobs/store";
import { isJobStatus, type JobOutcome, type JobStatus } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_OUTCOMES = new Set<JobOutcome>([
  "awaiting_response",
  "phone_screen",
  "interview",
  "rejected",
  "offer",
  "ghosted",
]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await readJob(id);
  if (!job) {
    return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "expected_object_body" }, { status: 400 });
  }

  // Validate status if present.
  if (body.status !== undefined && !isJobStatus(body.status)) {
    return NextResponse.json(
      { error: "invalid_status", got: body.status },
      { status: 400 },
    );
  }

  // Validate outcome if present.
  if (
    body.outcome !== undefined &&
    body.outcome !== null &&
    !VALID_OUTCOMES.has(body.outcome)
  ) {
    return NextResponse.json(
      { error: "invalid_outcome", got: body.outcome },
      { status: 400 },
    );
  }

  // Validate reclassifySuggestion if present.
  if (
    body.reclassifySuggestion !== undefined &&
    body.reclassifySuggestion !== null &&
    !isJobStatus(body.reclassifySuggestion)
  ) {
    return NextResponse.json(
      { error: "invalid_reclassify_suggestion", got: body.reclassifySuggestion },
      { status: 400 },
    );
  }

  try {
    const updated = await updateJob(id, {
      status: body.status as JobStatus | undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      sourceUrl:
        body.sourceUrl === null
          ? null
          : typeof body.sourceUrl === "string"
            ? body.sourceUrl
            : undefined,
      outcome: body.outcome,
      reclassifySuggestion: body.reclassifySuggestion,
      statusNote: typeof body.statusNote === "string" ? body.statusNote : undefined,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (String(err?.message).startsWith("job_not_found")) {
      return NextResponse.json({ error: "job_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
