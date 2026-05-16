/**
 * Client-safe types and constants for the prep workspace. Anything in
 * lib/prep/store.ts is server-only (uses node:fs); UI files import from
 * here instead so Next.js doesn't try to bundle Node built-ins into the
 * browser chunk.
 */

export type PrepGroup =
  | "overview"
  | "round-1"
  | "round-2"
  | "round-3"
  | "round-4"
  | "appendix"
  | "notes"
  | "other";

export type PrepFile = {
  /** Forward-slash-joined path relative to prep/<Company>/ */
  relPath: string;
  name: string;
  group: PrepGroup;
  size: number;
  mtimeMs: number;
  binary: boolean;
};

export const GROUP_ORDER: PrepGroup[] = [
  "overview",
  "round-1",
  "round-2",
  "round-3",
  "round-4",
  "appendix",
  "notes",
  "other",
];

export const GROUP_LABELS: Record<PrepGroup, string> = {
  overview: "Overview",
  "round-1": "Round 1 — Recruiter",
  "round-2": "Round 2 — Hiring manager",
  "round-3": "Round 3 — Technical panel",
  "round-4": "Round 4 — Final / executive",
  appendix: "Appendix",
  notes: "Notes",
  other: "Other",
};

/** Slug for putting human company names into URLs. We preserve casing. */
export function isValidCompanySlug(slug: string): boolean {
  return /^[A-Za-z0-9._-][A-Za-z0-9._\- ]{0,79}$/.test(slug);
}

/** Map a relative path under prep/<Company>/ to a UI group. */
export function classifyGroup(relPath: string): PrepGroup {
  const leaf = relPath.split("/").pop()!.toLowerCase();
  const top = relPath.split("/")[0].toLowerCase();
  if (/^00-overview\.md$/.test(leaf)) return "overview";
  if (/^01-round-1/.test(top) || /^01-round-1/.test(leaf)) return "round-1";
  if (/^02-round-2/.test(top) || /^02-round-2/.test(leaf)) return "round-2";
  if (/^03-round-3/.test(top) || /^03-round-3/.test(leaf)) return "round-3";
  if (/^04-round-4/.test(top) || /^04-round-4/.test(leaf)) return "round-4";
  if (/^05-appendix\.md$/.test(leaf)) return "appendix";
  if (/notes/i.test(leaf) || /notes/i.test(top)) return "notes";
  return "other";
}
