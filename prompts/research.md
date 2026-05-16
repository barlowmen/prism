# Research run — Step 2 of workflow.md

You are running **Step 2 of `_meta/workflow.md`** for the posting below. Read the workflow file first. Read `_meta/about_user.md` and `_meta/resume_style_guide_2026.md`. Read the per-app `classification.md` to see what archetype the dispatcher picked and which base resume to lean toward.

In **one assistant message**, dispatch **three Task tool calls in parallel** (each `subagent_type=general-purpose`). Each sub-agent writes its output file directly into `{{FOLDER_REL}}/research/`. Wait for all three before continuing.

## Inputs

- **Per-app folder (relative to working dir):** `{{FOLDER_REL}}`
- **Job description:** `{{FOLDER_REL}}/job_description.md`
- **Classification:** `{{FOLDER_REL}}/classification.md`
- **About the user:** `_meta/about_user.md`

## Sub-agents to dispatch (in one assistant turn)

### Agent 1 — JD analysis
`description`: "jd analysis"
`prompt`:

> Read `{{FOLDER_REL}}/job_description.md` and `_meta/about_user.md`. Extract:
> - **Required skills** (with JD quotes)
> - **Preferred / nice-to-have skills**
> - **Scope of the role** (IC / lead / exec; team size implied)
> - **Domain** (healthcare / fintech / gov / etc.)
> - **Buzzwords to mirror** (their exact language)
> - **Top 5 things a resume must hit** to clear ATS + first human screen
> - **Ambiguities or red flags** to surface to the user
> Write the result as markdown to `{{FOLDER_REL}}/research/jd_analysis.md`. Use clear headings. Cite the JD by quoting short phrases.

### Agent 2 — Company research
`description`: "company research"
`prompt`:

> Web-search the company described in `{{FOLDER_REL}}/job_description.md` and `{{FOLDER_REL}}/classification.md`. Cover:
> - **Recent news** (last 12 months) — funding, layoffs, product launches, leadership changes
> - **AI / platform strategy** — what they say publicly about AI direction
> - **Leadership team** for the function the role sits inside
> - **Regulatory posture** (if relevant: healthcare/finance/gov)
> - **Engineering culture signal** (Glassdoor, Blind, blog posts, etc.)
> Write a one-page brief to `{{FOLDER_REL}}/research/company_research.md` that ends with **"What the user's background lines up with right now"** — 3-5 specific signal-matches.

### Agent 3 — Resume examples / tailoring playbook
`description`: "resume examples"
`prompt`:

> Web-search for strong resume examples and tailoring commentary for the role's archetype (look at `{{FOLDER_REL}}/classification.md` for the archetype label). Identify:
> - Section ordering that wins for this archetype
> - Summary style + length
> - How to present scope (budget / headcount / $-impact)
> - What to cut at director+ scope
> - Common mistakes
> Write a tailoring playbook to `{{FOLDER_REL}}/research/resume_examples.md` that's specific to **this role**, grounded in what's actually in `_meta/about_user.md` (don't suggest claims the user can't honestly make).

## Decision after all three return

Scan the three outputs for **gaps** the existing resume can't fill (a required skill not in `about_user.md`, a certification not held, a domain not present). If any exist:
- **Write `{{FOLDER_REL}}/questions.md`** listing each gap as a concise question to the user. End the final assistant turn with `<result>{"verdict":"questions"}</result>`.

Otherwise:
- End with `<result>{"verdict":"ready_to_draft"}</result>`.

No prose outside the `<result>` tag in the final assistant message.

## Hard rules

- **Use the Task tool 3× in one message**. Do not run searches yourself; the sub-agents do that.
- All three agents must ground their advice in `_meta/about_user.md` — they should not invent experience.
- **Obey honesty boundaries.** If the JD demands something the user can't honestly claim, surface it in `questions.md`; do not paper over it in the playbook.
