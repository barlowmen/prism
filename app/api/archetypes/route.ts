/**
 * /api/archetypes
 *
 * GET — list all archetypes (summaries only, with base-resume on-disk stats).
 * POST — create a new archetype. Body: { label, key?, description?,
 *        matchingHints?, baseResumePath?, tailoringRules? }. The key is
 *        derived from label if omitted; 409 if it collides.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  createArchetype,
  isValidKey,
  listSummaries,
  slugify,
} from "@/lib/archetypes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const archetypes = await listSummaries();
  return NextResponse.json({ archetypes });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  let key = typeof body.key === "string" ? body.key.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "label_required" }, { status: 400 });
  }
  if (!key) key = slugify(label);
  if (!isValidKey(key)) {
    return NextResponse.json(
      { error: "invalid_key", got: key },
      { status: 400 },
    );
  }
  try {
    const a = await createArchetype({
      key,
      label,
      description: typeof body.description === "string" ? body.description : "",
      matchingHints: typeof body.matchingHints === "string" ? body.matchingHints : "",
      baseResumePath: typeof body.baseResumePath === "string" ? body.baseResumePath : "",
      tailoringRules: typeof body.tailoringRules === "string" ? body.tailoringRules : "",
    });
    return NextResponse.json(a);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg.startsWith("archetype_already_exists") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
