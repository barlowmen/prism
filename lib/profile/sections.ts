/**
 * Section schema for the Profile Interview tool.
 *
 * Each section maps to a single H2 heading in `_meta/about_user.md`.
 * The `headingMatchers` are regexes used to find existing content; the
 * `canonicalHeading` is what new content gets written under. Multiple
 * matchers let us tolerate small drift in user-edited headings.
 */

export type SectionKey =
  | "quick_read"
  | "objectives"
  | "narrative"
  | "experience"
  | "skill_depth"
  | "education"
  | "public_footprint"
  | "filters"
  | "tailoring"
  | "red_lines"
  | "lessons"
  | "open_items";

export type SectionDef = {
  key: SectionKey;
  /** Short label shown in the section list UI. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** Canonical H2 heading text (no `## ` prefix). New writes use this. */
  canonicalHeading: string;
  /** Regexes to match an existing H2 heading. Case-insensitive. First match wins. */
  headingMatchers: RegExp[];
  /** Approximate question count the interview prompt should ask. */
  questionTarget: number;
};

/** Canonical order used when rendering a fresh about_user.md from scratch. */
export const SECTIONS: SectionDef[] = [
  {
    key: "quick_read",
    label: "Quick read",
    description: "The 4-line pitch at the top of the profile. Generate last; depends on the others.",
    canonicalHeading: "Quick read (the 4-line pitch)",
    headingMatchers: [/^quick read/i, /^summary/i, /^pitch/i],
    questionTarget: 0, // generated, not interviewed
  },
  {
    key: "objectives",
    label: "Career objectives & constraints",
    description: "Target archetypes, what to avoid, role shape, geography, comp floor, timeline.",
    canonicalHeading: "Career objectives & constraints",
    headingMatchers: [/^career objectives/i, /^objectives/i, /^career goals/i],
    questionTarget: 7,
  },
  {
    key: "narrative",
    label: "Career narrative & thesis",
    description: "The one-line story, the differentiating thesis, how to deploy it per archetype.",
    canonicalHeading: "Career narrative & positioning thesis",
    headingMatchers: [/^career narrative/i, /^narrative/i, /^positioning/i, /^thesis/i],
    questionTarget: 5,
  },
  {
    key: "experience",
    label: "Experience & accomplishments",
    description: "Per-role facts: scope, what you built, quantified outcomes, named systems.",
    canonicalHeading: "Core experience & accomplishments (mineable facts)",
    headingMatchers: [/^core experience/i, /^experience/i, /^work history/i, /^accomplishments/i],
    questionTarget: 10,
  },
  {
    key: "skill_depth",
    label: "Skill depth (honest 4-tier map)",
    description: "Can claim with depth / at prototype / as direction / cannot claim.",
    canonicalHeading: "Skill depth — honest map",
    headingMatchers: [/^skill depth/i, /^skills/i, /^technical skills/i, /^expertise/i],
    questionTarget: 8,
  },
  {
    key: "education",
    label: "Education & credentials",
    description: "Degrees, certifications, what you do NOT have.",
    canonicalHeading: "Education & credentials",
    headingMatchers: [/^education/i, /^credentials/i, /^degrees/i],
    questionTarget: 5,
  },
  {
    key: "public_footprint",
    label: "Public footprint",
    description: "Talks, papers, blog, OSS, panels — current state + trajectory.",
    canonicalHeading: "Public footprint (current = thin, trajectory = building)",
    headingMatchers: [/^public footprint/i, /^public work/i, /^publications/i, /^writing/i],
    questionTarget: 5,
  },
  {
    key: "filters",
    label: "Filter & avoidance list",
    description: "Hard nos — companies, industries, role shapes, comp floors.",
    canonicalHeading: "Filter & avoidance list",
    headingMatchers: [/^filter/i, /^avoidance/i, /^avoid/i, /^hard.?nos?\b/i],
    questionTarget: 5,
  },
  {
    key: "tailoring",
    label: "Tailoring playbook per archetype",
    description: "How to position for each target archetype: voice, format, what to lead with.",
    canonicalHeading: "Tailoring playbook by archetype",
    headingMatchers: [/^tailoring playbook/i, /^tailoring/i, /^positioning playbook/i, /^playbook/i],
    questionTarget: 6,
  },
  {
    key: "red_lines",
    label: "Honesty red lines",
    description: "Specific claims that would be fabrication. Non-negotiable for every agent.",
    canonicalHeading: "Honesty boundaries — red lines",
    headingMatchers: [/^honesty/i, /^red lines?/i, /^boundaries/i],
    questionTarget: 6,
  },
  {
    key: "lessons",
    label: "Lessons from past interviews",
    description: "What you learned from past interviews — outcomes, feedback, positioning errors.",
    canonicalHeading: "Lessons from past interviews (use to calibrate)",
    headingMatchers: [/^lessons/i, /^past interviews/i, /^interview lessons/i],
    questionTarget: 4,
  },
  {
    key: "open_items",
    label: "Open items / things to update",
    description: "Things you want to surface later (PhD advisor TBD, first public talk, etc.).",
    canonicalHeading: "Open items / things to update",
    headingMatchers: [/^open items/i, /^to update/i, /^todo/i, /^todos$/i],
    questionTarget: 3,
  },
];

export const SECTION_KEYS: SectionKey[] = SECTIONS.map((s) => s.key);

export function getSection(key: SectionKey): SectionDef {
  const s = SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`unknown_section:${key}`);
  return s;
}

export function isSectionKey(s: string): s is SectionKey {
  return SECTION_KEYS.includes(s as SectionKey);
}
