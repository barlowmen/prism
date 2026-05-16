import { NextResponse, type NextRequest } from "next/server";
import { readArchetype, uploadBaseResume } from "@/lib/archetypes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const existing = await readArchetype(key);
  if (!existing) {
    return NextResponse.json({ error: "archetype_not_found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected_multipart_form_data" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err: any) {
    return NextResponse.json(
      { error: `failed_to_parse_form: ${String(err?.message ?? err)}` },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const name = file.name;
  if (!name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "must_be_docx" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const { archetype, absPath } = await uploadBaseResume(key, bytes, name);
    return NextResponse.json({ archetype, absPath });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
