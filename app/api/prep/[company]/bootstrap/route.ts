import { NextResponse } from "next/server";
import { bootstrapPrep } from "@/lib/prep/bootstrap";
import { isValidCompanySlug } from "@/lib/prep/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/prep/<Company>/bootstrap
 *
 * Idempotent. Creates the prep/<Company>/ folder if missing and writes
 * the standard template set. Existing files are never overwritten.
 * Returns which files were created vs. already existed.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ company: string }> },
) {
  const { company } = await ctx.params;
  if (!isValidCompanySlug(company)) {
    return NextResponse.json({ error: "invalid_company" }, { status: 400 });
  }
  try {
    const result = await bootstrapPrep(company);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
