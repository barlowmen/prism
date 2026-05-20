# Draft run — Step 4 of workflow.md

You are running **Step 4 of `_meta/workflow.md`** for the posting below.

## Tool-denial rule

If a tool you need (Bash, WebFetch, WebSearch, etc.) returns "requires permission" or a denied error, **do NOT retry**. Emit a clear note in your final result describing what was blocked, write any artifacts that don't depend on the denied tool, then exit. One or two attempts is enough to confirm — retry loops burn subscription quota for no benefit.

## Read first

Read the workflow file first, then in order:

1. `_meta/about_user.md` — source of truth. Obey the four-tier honesty model.
2. `_meta/resume_style_guide_2026.md` — format and voice rules.
3. `{{FOLDER_REL}}/job_description.md` — the JD.
4. `{{FOLDER_REL}}/classification.md` — the dispatcher's archetype choice + framing notes.
5. `{{FOLDER_REL}}/research/jd_analysis.md`, `company_research.md`, `resume_examples.md`.
6. `{{FOLDER_REL}}/questions.md` *if it exists* — research-pass questions the user has answered. Each answer lives under a `## Answer (<timestamp>)` heading. Read these as additional context — they often resolve framing choices the resume examples flagged as needing the user's input (engagement counts, briefing frequency, exact wording for a sensitive role title, etc.). Honor the user's answers verbatim.
7. `_meta/build_resume_template.js` — the DOCX builder template (study its structure).
8. **The base resume DOCX for this job:** `{{BASE_RESUME_PATH}}`{{#ARCHETYPE_LABEL}} (archetype: **{{ARCHETYPE_LABEL}}**){{/ARCHETYPE_LABEL}}. Start from this file and tailor it.

{{#ARCHETYPE_TAILORING_RULES}}
## Archetype-specific tailoring rules

The chosen archetype carries additional rules that augment `about_user.md`'s general tailoring playbook:

```
{{ARCHETYPE_TAILORING_RULES}}
```
{{/ARCHETYPE_TAILORING_RULES}}

{{#FEEDBACK}}
A previous HM review pass returned this feedback. Use it to inform the redraft:

```
{{FEEDBACK}}
```
{{/FEEDBACK}}

## What to produce

Write a tailored Node script `{{FOLDER_REL}}/build_resume.js` modeled on `_meta/build_resume_template.js` (use the `docx` library; Calibri 11; 0.6" margins per the style guide). Run it from the per-app folder to produce `{{FOLDER_REL}}/Resume_{{COMPANY}}_{{ROLE_SHORT}}.docx`.

The DOCX must reflect tailoring choices documented in `research/resume_examples.md` (section order, summary style, what to cut, archetype-specific levers from `about_user.md`).

## Tailoring rules

- **Summary:** 3–4 lines. Mirror role language. Call out PhD per archetype guidance in `about_user.md`.
- **Experience bullets:** reorder + rewrite within each role to lead with the JD's must-haves. **Pull only from facts in `about_user.md`**. No fabrication. No invented numbers.
- **Skills:** every skill listed must appear in context in at least one experience bullet (per style guide §2 keyword-density rule).
- **Degree/credential framing:** use the exact wording captured in `about_user.md` (e.g., "Starting <term>" if in-progress). Never paraphrase dates or status.
- **Title handling:** parenthetical scope-clarifier per style guide §4, not retitling.
- **Certifications:** prune to 2–3 most-relevant per the role.
- **Length:** per style guide §1 by archetype.

## Output contract

When the DOCX is on disk, end the final assistant message with **only** a JSON object wrapped in `<result>...</result>`:

```
<result>{"docxRelPath":"{{FOLDER_REL}}/Resume_{{COMPANY}}_{{ROLE_SHORT}}.docx","summary":"<3-5 line summary of what was tailored>"}</result>
```

No prose outside the tag.

## Hard rules

- **Use the `docx` Node library** (same approach as `_meta/build_resume_template.js`). Do not generate HTML-to-PDF or markdown-to-DOCX — those parse badly through Workday.
- **Run the script.** Don't just write it. The deliverable is the DOCX, not the script.
- **No fabrication.** Every fact must trace to `_meta/about_user.md`. The provenance audit (step 7) will catch leaks; flagging them now saves a re-draft.
