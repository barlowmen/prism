/**
 * GET /api/profile/state
 *
 * Combined view of the profile (parsed about_user.md) and per-section
 * interview state (draft / committed / threadId). Powers the
 * /settings/profile index card list.
 */
import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/profile/merge";
import { readAllSectionStates } from "@/lib/profile/store";
import { SECTIONS, type SectionKey } from "@/lib/profile/sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [parsed, states] = await Promise.all([
    loadProfile(),
    readAllSectionStates(),
  ]);

  const sections = SECTIONS.map((def) => {
    const parsedSection = parsed?.sections.find((s) => s.key === def.key) ?? null;
    const state = states[def.key];
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      canonicalHeading: def.canonicalHeading,
      questionTarget: def.questionTarget,
      filePresent: !!parsedSection?.present,
      foundHeading: parsedSection?.foundHeading ?? null,
      interviewStatus: state?.status ?? "untouched",
      threadId: state?.threadId ?? null,
      hasDraft: !!state?.draft,
      draftAt: state?.draftAt ?? null,
      committedAt: state?.committedAt ?? null,
      updatedAt: state?.updatedAt ?? null,
    };
  });

  return NextResponse.json({
    profileExists: !!parsed,
    title: parsed?.title ?? null,
    sections,
    unknownHeadings: parsed?.unknownHeadings ?? [],
  });
}
