/**
 * /api/archetypes/scaffold-from-profile
 *
 * GET — preview: lists archetype labels parsed from `about_user.md`
 *       "Tailoring playbook by archetype", flagging which already have
 *       a JSON record on disk.
 * POST — create JSON records for any archetype found in the playbook
 *        that doesn't already exist. Idempotent — never overwrites.
 *        Profile is read-only.
 */
import { NextResponse } from "next/server";
import {
  previewScaffolds,
  scaffoldArchetypesFromProfile,
} from "@/lib/archetypes/scaffold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await previewScaffolds();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await scaffoldArchetypesFromProfile();
  return NextResponse.json(result);
}
