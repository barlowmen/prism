# Dispatcher run for a single posting

You are running **Step 0 of the workflow** in `_meta/workflow.md`. Read `_meta/about_user.md` first — it is the source of truth for the user's career objectives, comp floor, filter list, honesty boundaries, and tailoring playbooks by archetype. Then read `_meta/resume_style_guide_2026.md` for archetype framing context.

## Inputs

- **Posting URL:** {{POSTING_URL}}

{{#COMPANY}}
- **Company:** {{COMPANY}}
- **Role:** {{ROLE}}
- **Per-app folder (relative to working dir):** `{{FOLDER_REL}}`

Use this folder for all your outputs. Do not pick a different name.
{{/COMPANY}}
{{^COMPANY}}
**Company and role are not yet known.** You will pick them yourself based on the JD. Before writing any files:

1. Fetch the JD from the URL above.
2. Pick a short, ATS-friendly **Company** slug — plain ASCII, no spaces, no punctuation. Examples: `Anthropic`, `Mastercard`, `PwC`, `ReflectionAI`.
3. Pick a descriptive **Role** slug — snake_case, no special chars. Lead with the function and add disambiguators if needed. Examples:
   - `AppliedAIArchMgr_EntTechCyber`
   - `Director_Infra_Eng_Udacity`
   - `Senior_Product_Manager_72063674`
   - If the URL contains a unique requisition ID, append it to disambiguate (e.g., `_R-276325`).
4. Create the per-app folder at `apps/<Company>/<Role>/`. If that path already exists for a *different* posting at the same company, append a disambiguator to the role.
5. **Write all your outputs into that folder.** From here on, treat that path as the "per-app folder" referenced below.
{{/COMPANY}}

{{#JD_TEXT}}
The user has provided the raw JD text below (use this verbatim instead of fetching from the URL — the page may be dead or paywalled):

```
{{JD_TEXT}}
```
{{/JD_TEXT}}

## Available archetypes (configured in `_meta/archetypes/`)

{{#ARCHETYPES_INDEX}}
{{ARCHETYPES_INDEX}}
{{/ARCHETYPES_INDEX}}
{{^ARCHETYPES_INDEX}}
*(No archetypes configured yet. Use the legacy `ai` / `cloud` literal naming — `ai` for AI-leaning roles, `cloud` for non-AI infrastructure roles.)*
{{/ARCHETYPES_INDEX}}

## Your job

1. Fetch the job description (if not provided above) and save it to `<per-app folder>/job_description.md`.
2. Pick the best-fitting **archetype** from the list above by consulting each one's *matching hints*. The draft agent will start from that archetype's base resume. If none fit cleanly, pick the closest and note the gap in `classification.md`.
3. Write `<per-app folder>/classification.md` per the dispatcher template in `workflow.md` §0:
   - **Archetype** — `<key>` (`<label>`)
   - **Career archetype** — frontier-lab / enterprise-AI-director / AI-governance / enterprise-cloud-director / PM / unclear *(this is the positioning archetype from `about_user.md` "Tailoring playbook by archetype" — it can differ from the base archetype above)*
   - **Comp signal** — estimated band; whether it credibly clears the user's hard floor (see `about_user.md` Career objectives)
   - **Geography** — remote-OK / in-person required / relocation required
   - **Honesty flags** — cite exact JD phrases that push against `about_user.md` red lines
   - **Special-handling flags** — PM-shaped, federal-contractor-deep, avoid-list match, etc.
4. End with **one** of three decisions:
   - **GO** — no `dispatcher_question.md`. Final line in `classification.md` must be `Decision: GO`.
   - **NEEDS-DISCUSSION** — write `<per-app folder>/dispatcher_question.md` with the specific questions for the user. Final line in `classification.md` must be `Decision: NEEDS-DISCUSSION`.
   - **RECOMMEND-SKIP** — write the skip reasoning into `classification.md`. Final line must be `Decision: RECOMMEND-SKIP`.

## Output contract

When done, your final assistant message must be a single JSON object wrapped in `<result>...</result>` tags. No prose outside the tags. Schema:

```
<result>{"decision":"GO|NEEDS-DISCUSSION|RECOMMEND-SKIP","company":"<company slug>","role":"<role slug>","folderRel":"apps/<Company>/<Role>","archetypeKey":"<archetype key from list above>","archetypeLabel":"<that archetype's human label>","careerArchetype":"<short positioning label>","oneLineSummary":"<≤140 chars>"}</result>
```

`company`, `role`, and `folderRel` must be filled even when they were supplied as inputs — echo them back so the orchestrator can verify.

If you cannot fetch the JD and the user has not supplied raw text, write `classification.md` flagging the dead/paywalled URL, set `decision` to `NEEDS-DISCUSSION`, and write `dispatcher_question.md` asking for the raw JD text.

## Honesty + scope reminders (re-read before deciding)

- Apply the **comp floor** from `about_user.md` "Career objectives & constraints". Below floor + unstated-with-low-signal → RECOMMEND-SKIP.
- Apply every rule in `about_user.md` "Filter & avoidance list" as a hard filter.
- Clearance-required → RECOMMEND-SKIP unless `about_user.md` says clearance is held or clearable.
- PM-shaped roles → NEEDS-DISCUSSION if the user's career archetypes don't explicitly include PM.
- Anything that requires fabrication against `about_user.md` "Honesty boundaries — red lines" → NEEDS-DISCUSSION (cite the JD phrase).

Use the existing folder if it exists; do not overwrite an answered `dispatcher_question.md`. If the folder already has `classification.md` and the user is asking for a re-run after answering a question, treat the answer (under `## Answer` heading in `dispatcher_question.md`) as new context and re-decide.
