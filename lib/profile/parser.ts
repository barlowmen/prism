import { SECTIONS, type SectionDef, type SectionKey } from "./sections";

export type ParsedSection = {
  key: SectionKey;
  /** The H2 heading actually found in the document (or canonical if absent). */
  foundHeading: string | null;
  /** True if a heading matched in the doc and content was extracted. */
  present: boolean;
  /** Markdown content for this section, INCLUDING the H2 heading line at top.
   *  Empty string if not present. */
  content: string;
  /** Character offset (start) of this section in the source. -1 if absent. */
  startOffset: number;
  /** Character offset (end, exclusive) — points to the start of the next H2,
   *  or end-of-file. -1 if absent. */
  endOffset: number;
};

export type ParsedProfile = {
  /** Source text. */
  source: string;
  /** Optional H1 title at the very top, e.g. "# About <Name> — Resume Tailoring Profile". */
  title: string | null;
  /** Per-section parses, in canonical section order. */
  sections: ParsedSection[];
  /** Headings the parser didn't recognize (so we don't lose them on merge). */
  unknownHeadings: Array<{ heading: string; startOffset: number; endOffset: number }>;
};

const H2_RE = /^##\s+(.+?)\s*$/gm;

export function parseProfile(source: string): ParsedProfile {
  // Find every H2 heading with its position.
  const headings: Array<{ text: string; startOffset: number }> = [];
  H2_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = H2_RE.exec(source)) !== null) {
    headings.push({ text: m[1].trim(), startOffset: m.index });
  }

  // Title = everything before the first H2 if it starts with an H1 line.
  let title: string | null = null;
  const firstHeadingStart = headings.length > 0 ? headings[0].startOffset : source.length;
  const preamble = source.slice(0, firstHeadingStart);
  const h1Match = preamble.match(/^#\s+(.+?)\s*$/m);
  if (h1Match) title = h1Match[1].trim();

  // For each section def, find the first matching heading in the doc.
  const sectionDefByMatchedHeading = new Map<number, SectionDef>();
  for (const def of SECTIONS) {
    for (const head of headings) {
      if (sectionDefByMatchedHeading.has(head.startOffset)) continue;
      if (def.headingMatchers.some((re) => re.test(head.text))) {
        sectionDefByMatchedHeading.set(head.startOffset, def);
        break;
      }
    }
  }

  // Build offsets: each H2's section ends where the NEXT H2 begins.
  const headingsWithEnd: Array<{
    text: string;
    startOffset: number;
    endOffset: number;
  }> = headings.map((h, i) => ({
    text: h.text,
    startOffset: h.startOffset,
    endOffset: i + 1 < headings.length ? headings[i + 1].startOffset : source.length,
  }));

  // Resolve each section def to its parsed section.
  const sections: ParsedSection[] = SECTIONS.map((def) => {
    const matched = headingsWithEnd.find(
      (h) => sectionDefByMatchedHeading.get(h.startOffset) === def,
    );
    if (!matched) {
      return {
        key: def.key,
        foundHeading: null,
        present: false,
        content: "",
        startOffset: -1,
        endOffset: -1,
      };
    }
    return {
      key: def.key,
      foundHeading: matched.text,
      present: true,
      content: source.slice(matched.startOffset, matched.endOffset).trimEnd() + "\n",
      startOffset: matched.startOffset,
      endOffset: matched.endOffset,
    };
  });

  // Unknown headings = headings not claimed by any section def.
  const claimed = new Set(
    headingsWithEnd
      .filter((h) => sectionDefByMatchedHeading.has(h.startOffset))
      .map((h) => h.startOffset),
  );
  const unknownHeadings = headingsWithEnd
    .filter((h) => !claimed.has(h.startOffset))
    .map((h) => ({
      heading: h.text,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
    }));

  return { source, title, sections, unknownHeadings };
}

/** Convenience: extract just the content (with heading) for one section. */
export function getSectionContent(
  source: string,
  key: SectionKey,
): string | null {
  const parsed = parseProfile(source);
  const s = parsed.sections.find((x) => x.key === key);
  return s?.present ? s.content : null;
}
