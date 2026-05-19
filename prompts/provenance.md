# Provenance audit — §6 of workflow.md

You are running the **provenance audit** for a tailored resume that has already cleared HM review. This is an honesty / fabrication-detection task, distinct from the hiring-manager pass. See `_meta/workflow.md` §6 for the full decision spec.

## Tool-denial rule

If a tool you need (Bash, WebFetch, WebSearch, etc.) returns "requires permission" or a denied error, **do NOT retry**. Emit a clear note in your final result describing what was blocked, write any artifacts that don't depend on the denied tool, then exit. One or two attempts is enough to confirm — retry loops burn subscription quota for no benefit.

Read, in order:
1. `_meta/about_user.md` — the canonical source of truth for every claim.
2. `{{FOLDER_REL}}/job_description.md` — the JD.
3. `{{FOLDER_REL}}/research/jd_analysis.md` and `company_research.md` for context on framing decisions.
4. `{{FOLDER_REL}}/build_resume.js` — the script that generated the DOCX. Use this as the structured source of every bullet rather than re-parsing the DOCX.
5. `{{FOLDER_REL}}/{{DOCX_NAME}}` — the actual DOCX bytes.

## What to produce

Write `{{FOLDER_REL}}/provenance.md` in the exact format below. For **every bullet** in the resume's Experience and any narrative sections (Summary, Cover-letter content if present), produce a provenance entry.

```markdown
# Provenance Report — {{COMPANY}} — {{ROLE}}

## Resume bullet provenance

### Section: <section name> → <Company>, <Role> (<dates>)

**Tailored bullet:**
> <verbatim bullet text from the DOCX>

**Source (about_user.md, "<heading or section pointer>"):**
> <verbatim snippet from about_user.md that this bullet traces to>

**Notes:** <what was combined, framed, or recontextualized. Flag any
specific number / system / claim that does NOT trace to about_user.md
with the literal token "VERIFY:" so it's grep-able.>

---

[... repeat for every bullet ...]

## Honesty boundary check

Cross-referenced against about_user.md "Honesty boundaries — red lines":

[List every red line from `about_user.md` "Honesty boundaries" here, each
on its own line, prefixed `[x]` if respected or `[ ]` if violated. Include
a check for any "exact-language" rules (e.g., date or status framing for
in-progress credentials matches `about_user.md` verbatim).]

(Use `[ ]` instead of `[x]` and add a note for any boundary that's violated.)

## Honest gaps

JD-required skills not present in about_user.md:
- **<skill name>** — JD <required|preferred>. Not in profile. Tailored resume
  <does/does not> claim it. <How it's framed.>

(If no honest gaps, write "None identified.")

## Cover letter claims (if applicable)

<List any cover-letter content that doesn't trace to about_user.md, or
"No cover letter present.">
```

## Decision

Tally honesty issues found. Decide:

- **`clean`** — every bullet traces to `about_user.md`. No red lines violated. No `VERIFY:` tokens beyond minor numeric-rounding nits.
- **`flagged`** — at least one of: a `VERIFY:` token on a load-bearing claim, a checked-off red line that's actually violated, a JD-required skill the resume *claims* the user has but `about_user.md` shows he doesn't.

End the final assistant message with **only** a JSON object wrapped in `<result>...</result>`:

```
<result>{"verdict":"clean","flagsCount":0,"summary":"<1-line summary>"}</result>
```
or
```
<result>{"verdict":"flagged","flagsCount":<int>,"summary":"<1-line summary of the most serious flag>"}</result>
```

No prose outside the tag.

## Hard rules

- **You are not the HM.** This is an honesty audit, not a quality review. Don't suggest rewrites — flag honesty issues. The HM loop already happened.
- **Pull from `about_user.md`, not from the DOCX text alone.** A bullet that *sounds* honest but invents a number is still a flag.
- **A `VERIFY:` note on a confirmable detail (e.g., a specific count of bureaus, a specific year) is a flag unless it's already in `about_user.md`.**
- **Don't speculate** — if a fact isn't in `about_user.md` AND can't be defended from the JD or research files, it's flagged.
