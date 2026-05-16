/**
 * POST /api/archetypes/seed
 *
 * Idempotent bootstrap for users migrating from the pre-prism workflow.
 * Looks for *_AI.docx / *_Cloud.docx in <workspace>/_resumes/ and
 * creates standard `ai` / `cloud` archetypes pointing at them. Safe to
 * re-run; existing archetypes are left alone.
 */
import { NextResponse } from "next/server";
import { seedDefaults } from "@/lib/archetypes/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await seedDefaults();
  return NextResponse.json(result);
}
