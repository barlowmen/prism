import { NextResponse } from "next/server";
import { seedDefaults } from "@/lib/archetypes/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await seedDefaults();
  return NextResponse.json(result);
}
