/**
 * POST /api/jobs/manual
 *
 * Manual job-paste path (the "Paste a job" modal). Either supply both
 * company + role (creates apps/<co>/<role>/ up front) or just the URL
 * (the dispatcher picks names from the JD and creates the folder).
 * If `dispatchImmediately` (default true), kicks off the dispatcher
 * agent in the same request.
 */
import { NextResponse, type NextRequest } from "next/server";
import { pasteJob } from "@/lib/agents/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const companyRaw = typeof body.company === "string" ? body.company.trim() : "";
  const roleRaw = typeof body.role === "string" ? body.role.trim() : "";
  const postingUrl = typeof body.postingUrl === "string" ? body.postingUrl.trim() : "";
  const jdText = typeof body.jdText === "string" ? body.jdText : null;
  const dispatchImmediately = body.dispatchImmediately !== false; // default true

  if (!postingUrl) {
    return NextResponse.json(
      { error: "missing_posting_url" },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(postingUrl)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Either both company+role or neither. Partial → reject.
  if ((companyRaw && !roleRaw) || (!companyRaw && roleRaw)) {
    return NextResponse.json(
      { error: "company_and_role_both_or_neither" },
      { status: 400 },
    );
  }

  try {
    const { job, runId } = await pasteJob({
      company: companyRaw ? slugify(companyRaw) : null,
      role: roleRaw ? slugify(roleRaw) : null,
      postingUrl,
      jdText,
      dispatchImmediately,
    });
    return NextResponse.json({ job, runId: runId ?? null });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
