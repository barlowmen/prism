# Base resume generation — archetype `{{ARCHETYPE_KEY}}`

You are producing the **base resume** for archetype **{{ARCHETYPE_LABEL}}** (`{{ARCHETYPE_KEY}}`).

This is the long-form, archetype-pure version. Per-job tailoring happens later (see `_meta/workflow.md` §4 — the per-application draft agent cuts and reshapes from this base for each posting). Your job here is to produce the strongest possible resume *for the role family this archetype targets*, with no JD in hand.

Read, in order:

1. `_meta/about_user.md` — source of truth. Obey the four-tier honesty model. **Every fact in the resume must trace to this file.**
2. `_meta/resume_style_guide_2026.md` — format + voice rules. Apply all sections (§1 length, §2 ATS keywords, §3 voice buckets, §4 director signaling, §5 AI/ML positioning, §6 education, §7 anti-patterns).
3. `_meta/build_resume_template.js` — structural pattern and DOCX helpers (`nameLine`, `contactLine`, `sectionHeading`, `roleHeader`, `bullet`, `skillsLine`, `eduLine`). Study it; you'll mirror its structure.

## Archetype description

{{ARCHETYPE_DESCRIPTION}}

## Archetype-specific guidance (from `_meta/about_user.md` "Tailoring playbook by archetype")

```
{{ARCHETYPE_PLAYBOOK_BODY}}
```

This is the **voice + framing source** for this base. Match the bucket the playbook indicates (research-y, vendor-buyer, enterprise/regulated, mission, PM, lean, etc. — see style guide §3).

{{#ARCHETYPE_TAILORING_RULES}}
## Additional archetype-specific rules

```
{{ARCHETYPE_TAILORING_RULES}}
```
{{/ARCHETYPE_TAILORING_RULES}}

{{#FEEDBACK}}
## Prior HM review feedback — use to inform this redraft

```
{{FEEDBACK}}
```

Address the top concerns above. Preserve the moments the prior pass called out as *strong*.
{{/FEEDBACK}}

## What to produce

Write a tailored Node script `_resumes/_build_{{ARCHETYPE_KEY}}_base.js` modeled on `_meta/build_resume_template.js`. **Inline the helpers** from the template into your script — do not `require` `_meta/...` at runtime. Run the script to produce `_resumes/{{ARCHETYPE_KEY}}_base.docx`.

## Tailoring rules (no JD, so the playbook is the source of voice)

- **Length** per style guide §1, sized for the archetype. Frontier-lab + IC/startup-shaped archetypes lean shorter (1pg); director-of-anything + enterprise-shaped archetypes can go 2pg.
- **Summary** 3–4 lines. Mirror the role family's language. Call out PhD per the playbook's placement guidance for this archetype.
- **Experience bullets** order each role to lead with the things this archetype most cares about per the playbook. Pull only from facts in `about_user.md`. No fabrication. No invented numbers.
- **Skills section** — every skill listed must appear in at least one experience bullet (style guide §2 keyword-density rule).
- **Title handling** — parenthetical scope clarifiers per style guide §4, not retitling. Use the exact wording the playbook specifies if any.
- **Scope visibility** — for director+/scope-heavy archetypes, surface budget / headcount / named programs on page 1 (style guide §4).
- **Degree / credential framing** — exact wording from `about_user.md` (e.g., "Starting <term>" if in-progress). Never paraphrase dates or status.
- **Certifications** — prune to 2–3 most relevant for this archetype.

## Hard rules

- **Use the `docx` Node library** (same approach as `_meta/build_resume_template.js`). Do not generate HTML-to-PDF or markdown-to-DOCX — those parse badly through Workday.
- **Run the script.** Don't just write it. The deliverable is the DOCX, not the script.
- **No fabrication.** Every concrete claim must trace to `_meta/about_user.md`. The HM review pass that follows will flag fabrications.

## Output contract

When the DOCX is on disk, end the final assistant message with **only** a JSON object wrapped in `<result>...</result>`:

```
<result>{"docxRelPath":"_resumes/{{ARCHETYPE_KEY}}_base.docx","summary":"<3-5 line summary of voice + framing choices for this archetype>"}</result>
```

No prose outside the tag.
