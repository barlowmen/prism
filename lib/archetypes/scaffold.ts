import "server-only";
/**
 * Scaffold archetype JSON records from the user's `about_user.md`
 * "Tailoring playbook by archetype" H2 section. Each `### X. Label
 * (parenthetical)` subsection becomes one Archetype record — label,
 * description, and matching hints are pre-filled; the base resume DOCX
 * path stays empty (the user uploads that manually per archetype).
 *
 * Idempotent: existing JSON records are never overwritten. The profile
 * is read-only — nothing in about_user.md is touched.
 */
import fs from "node:fs/promises";
import { ABOUT_USER_REL_PATH, absWorkspace } from "../paths";
import { createArchetype, readArchetype, slugify } from "./store";

export type ScaffoldFinding = {
  key: string;
  label: string;
  status: "created" | "already_exists";
};

export type ScaffoldResult = {
  /** True if `_meta/about_user.md` was found and readable. */
  profileFound: boolean;
  /** Number of archetype headings parsed from the playbook section. */
  totalParsed: number;
  findings: ScaffoldFinding[];
  /** Human-readable diagnostics — surfaced to the user when nothing got scaffolded. */
  notes: string[];
};

export type ParsedArchetype = {
  key: string;
  label: string;
  description: string;
  matchingHints: string;
  /** Raw markdown body of the H3 subsection (everything under
   *  `### X. Label` up to the next H3 or the end of the playbook
   *  section). The orchestrator passes this verbatim to the
   *  base-generation + base-review prompts. */
  body: string;
};

const PLAYBOOK_HEADING_RE = /^##\s+Tailoring playbook by archetype\s*$/m;
const NEXT_H2_RE = /\n##\s+/;
const ARCHETYPE_HEADING_RE = /^###\s+(.+?)\s*$/gm;

/**
 * Parse the H3 subsections under "## Tailoring playbook by archetype"
 * in `about_user.md`. Each subsection becomes one scaffold record.
 *
 * Heading shapes handled:
 *   "A. Frontier AI labs (Anthropic, OpenAI, Google DeepMind, …)"
 *   "D. Traditional cloud platform leadership (Director+) — fallback shape"
 *   "F. Product Management — explicit go/no-go gate"
 *   "H. IC architect / staff & Startups (combined — lighter treatment)"
 *
 * Headings that don't yield a reasonable slug after parsing are skipped.
 */
export function parseTailoringPlaybook(source: string): ParsedArchetype[] {
  const playbookStart = source.search(PLAYBOOK_HEADING_RE);
  if (playbookStart < 0) return [];

  // Bound the section to the next H2 (or end of file).
  const rest = source.slice(playbookStart + 1); // skip the leading newline of the next match
  const nextH2Match = rest.match(NEXT_H2_RE);
  const sectionEnd = nextH2Match
    ? playbookStart + 1 + nextH2Match.index!
    : source.length;
  const section = source.slice(playbookStart, sectionEnd);

  ARCHETYPE_HEADING_RE.lastIndex = 0;
  const matches = [...section.matchAll(ARCHETYPE_HEADING_RE)];
  const out: ParsedArchetype[] = [];
  for (let i = 0; i < matches.length; i++) {
    const headingText = matches[i][1];
    const bodyStart = matches[i].index! + matches[i][0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : section.length;
    const body = section.slice(bodyStart, bodyEnd).trim();

    const parsed = parseHeading(headingText);
    if (!parsed) continue;

    out.push({
      key: parsed.key,
      label: parsed.label,
      description: parsed.description,
      matchingHints: buildMatchingHints(parsed.label, parsed.parenthetical, body),
      body,
    });
  }
  return out;
}

function parseHeading(heading: string): {
  key: string;
  label: string;
  description: string;
  parenthetical: string | null;
} | null {
  // Strip "A. " / "B. " etc. prefix.
  const stripped = heading.replace(/^[A-Za-z]\.\s+/, "").trim();

  let label = stripped;
  let parenthetical: string | null = null;
  let trailing: string | null = null;

  // Try `Label (parenthetical) — trailing`
  const parenMatch = stripped.match(/^([^(]+?)\s*\(([^)]+)\)\s*(?:[—-]\s*(.*))?$/);
  if (parenMatch) {
    label = parenMatch[1].trim();
    parenthetical = parenMatch[2].trim();
    trailing = parenMatch[3]?.trim() || null;
  } else {
    // Try `Label — trailing`
    const dashMatch = stripped.match(/^(.+?)\s+[—-]\s+(.*)$/);
    if (dashMatch) {
      label = dashMatch[1].trim();
      trailing = dashMatch[2].trim();
    }
  }

  if (!label || label.length < 2) return null;

  const key = slugify(label);
  if (!key) return null;

  const descParts: string[] = [];
  if (parenthetical) descParts.push(parenthetical);
  if (trailing) descParts.push(trailing);
  const description = descParts.join(" — ");

  return { key, label, description, parenthetical };
}

function buildMatchingHints(
  label: string,
  parenthetical: string | null,
  _body: string,
): string {
  const lines: string[] = [];
  lines.push(
    `*Auto-scaffolded from \`about_user.md\` "Tailoring playbook by archetype" → **${label}**.*`,
  );
  lines.push("");
  if (parenthetical) {
    lines.push(`**Target examples:** ${parenthetical}`);
    lines.push("");
  }
  lines.push(
    "**Match this archetype when** the JD signals match the targets above. Edit this block to refine routing — add specific company names, role keywords, regulatory or stack signals, level / scope cues, etc.",
  );
  lines.push("");
  lines.push(
    "**The dispatcher also reads** `about_user.md` \"Tailoring playbook by archetype\" alongside this file — the full per-archetype tailoring guidance lives there, so this block can stay focused on JD-routing signals only.",
  );
  return lines.join("\n");
}

/**
 * Read `about_user.md` and return the H3 subsection body for one
 * archetype key, or `null` if no subsection slugifies to that key.
 * Used by the base-resume orchestrator to pass per-archetype voice
 * + framing guidance into the generator + reviewer prompts.
 */
export async function readArchetypePlaybookBody(
  archetypeKey: string,
): Promise<string | null> {
  const profilePath = absWorkspace(ABOUT_USER_REL_PATH);
  let source: string;
  try {
    source = await fs.readFile(profilePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  const parsed = parseTailoringPlaybook(source);
  const match = parsed.find((p) => p.key === archetypeKey);
  return match?.body ?? null;
}

/**
 * Read about_user.md, parse the tailoring playbook, and create JSON
 * records for any archetype that doesn't already exist. Existing JSON
 * records are left alone (idempotent).
 */
export async function scaffoldArchetypesFromProfile(): Promise<ScaffoldResult> {
  const profilePath = absWorkspace(ABOUT_USER_REL_PATH);
  let source: string;
  try {
    source = await fs.readFile(profilePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return {
        profileFound: false,
        totalParsed: 0,
        findings: [],
        notes: [
          "about_user.md not found — complete the Profile Interview first.",
        ],
      };
    }
    throw err;
  }

  const parsed = parseTailoringPlaybook(source);
  if (parsed.length === 0) {
    return {
      profileFound: true,
      totalParsed: 0,
      findings: [],
      notes: [
        "No '## Tailoring playbook by archetype' section found in about_user.md, or it has no '### X. Label' subsections. Complete that section of the Profile Interview first.",
      ],
    };
  }

  const findings: ScaffoldFinding[] = [];
  for (const p of parsed) {
    const existing = await readArchetype(p.key);
    if (existing) {
      findings.push({ key: p.key, label: p.label, status: "already_exists" });
      continue;
    }
    try {
      await createArchetype({
        key: p.key,
        label: p.label,
        description: p.description,
        matchingHints: p.matchingHints,
      });
      findings.push({ key: p.key, label: p.label, status: "created" });
    } catch {
      findings.push({ key: p.key, label: p.label, status: "already_exists" });
    }
  }

  return {
    profileFound: true,
    totalParsed: parsed.length,
    findings,
    notes: [],
  };
}

/**
 * Read-only preview: returns the archetype labels available to scaffold
 * from `about_user.md`, flagging which already have a JSON record.
 * Used by the Archetypes page to render an accurate affordance.
 */
export async function previewScaffolds(): Promise<{
  profileFound: boolean;
  available: Array<{ key: string; label: string; exists: boolean }>;
  notes: string[];
}> {
  const profilePath = absWorkspace(ABOUT_USER_REL_PATH);
  let source: string;
  try {
    source = await fs.readFile(profilePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return {
        profileFound: false,
        available: [],
        notes: ["about_user.md not found."],
      };
    }
    throw err;
  }
  const parsed = parseTailoringPlaybook(source);
  if (parsed.length === 0) {
    return {
      profileFound: true,
      available: [],
      notes: [
        "No tailoring playbook subsections found in about_user.md.",
      ],
    };
  }
  const available: Array<{ key: string; label: string; exists: boolean }> = [];
  for (const p of parsed) {
    const existing = await readArchetype(p.key);
    available.push({ key: p.key, label: p.label, exists: !!existing });
  }
  return { profileFound: true, available, notes: [] };
}
