/**
 * /api/truth-base/<slug>
 *
 * GET — read one truth-base file (about_user, style_guide, workflow).
 * PUT — overwrite. Atomic temp-and-rename so half-written files never
 *       appear on disk. The slug must be in the allowlist at
 *       lib/paths.ts:TRUTH_BASE_FILES; anything else is rejected.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  isValidTruthBaseSlug,
  readTruthBase,
  writeTruthBase,
} from "@/lib/truth-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidTruthBaseSlug(slug)) {
    return NextResponse.json({ error: "unknown_truth_base_slug" }, { status: 404 });
  }
  const data = await readTruthBase(slug);
  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidTruthBaseSlug(slug)) {
    return NextResponse.json({ error: "unknown_truth_base_slug" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as any).content !== "string"
  ) {
    return NextResponse.json(
      { error: "expected_body_content_string" },
      { status: 400 },
    );
  }
  const content = (body as { content: string }).content;
  // Disallow truly empty writes — the existing CLI workflow reads these
  // files on every cold start; an empty Truth Base would silently break
  // every agent. If the user wants to delete a file they can do it from
  // the filesystem.
  if (content.trim().length === 0) {
    return NextResponse.json({ error: "refusing_empty_write" }, { status: 400 });
  }
  const { size, mtimeMs } = await writeTruthBase(slug, content);
  return NextResponse.json({ ok: true, slug, size, mtimeMs });
}
