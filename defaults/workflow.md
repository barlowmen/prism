# Resume Tailoring Workflow

End-to-end pipeline for tailoring one resume per posting. **prism** orchestrates this — every step below is triggered from the web UI at `http://127.0.0.1:3737/` or by an action you take in it (Paste a job, Run dispatcher, etc.). This file is read by every agent on cold-start; the numbered sections (§0, §2, §4, §5, §6) are referenced verbatim by the prompts.

The pipeline:

```
Paste a job  →  §0 Dispatcher  →  §2 Research (×3 parallel)
                     │                     │
                     ├── NEEDS-DISCUSSION   ├── gaps? → §3 questions
                     └── RECOMMEND-SKIP     └── clean → §4 Draft
                                                          │
                                                          ▼
                                                §5 HM review loop
                                                          │
                                                  "ready to submit"
                                                          │
                                                          ▼
                                                §6 Provenance audit
                                                          │
                                                          ▼
                                                §7 User review & apply
                                                          │
                                                          ▼
                                                §8 Post-application prep
```

Job status moves through this state machine: `discovered → dispatching → (recommended_skip | awaiting_input | researching) → drafting → hm_review → provenance → ready_for_user_review → ready_to_apply → applied → (interview | offer | rejected | ghosted)`. The orchestrator in `lib/agents/` owns the transitions; the UI surfaces the next action.

---

## Project layout

The prism repo is one piece, the workspace is another. The workspace is configured via `PRISM_WORKSPACE` and lives outside the repo so resume data, JDs, and notes never sit inside the codebase.

```
<workspace>/
  _meta/                       ← source of truth (the "Truth Base" tab)
    about_user.md              ← who the user is, honesty boundaries, tailoring playbook by archetype
    resume_style_guide_2026.md ← format / ATS / voice rules
    workflow.md                ← this file
    archetypes/<key>.json      ← one config per archetype (label, matching hints, base resume path, tailoring rules)
    .prism-backups/            ← timestamped backups before each commit
  _resumes/                    ← base-resume DOCXes referenced by archetype configs
  apps/<Company>/<Role>/       ← per-application working folder (created by the dispatcher)
  postings/                    ← discovery agent's shortlist output (job_postings_YYYY-MM-DD.md)
  prep/<Company>/              ← interview-prep workspace, created on first interview
  .state/                      ← prism's structured state (jobs, runs, profile, assistant threads)
    jobs/<id>.json             ← one record per tracked job
    runs/<runId>.log           ← per-run event log (JSONL)
    runs.json                  ← index of every run, with token totals
```

---

## Inputs every agent reads on cold-start

| Input | Location |
|---|---|
| **Profile (source of truth)** | `_meta/about_user.md` — career objectives & constraints, narrative thesis, mineable facts, honesty boundaries (four-tier model), tailoring playbook **per archetype** |
| **Style guide** | `_meta/resume_style_guide_2026.md` — format, ATS rules, voice norms, anti-patterns |
| **Workflow** | `_meta/workflow.md` (this file) |
| **Archetypes** | `_meta/archetypes/<key>.json` — base-resume path, matching hints (the dispatcher consults these to pick which archetype fits a posting), optional archetype-specific tailoring rules |

The user's tailoring playbook in `about_user.md` defines a set of archetypes (A, B, C, …) keyed by target type. The on-disk `archetypes/<key>.json` files are what the dispatcher actually picks from — one JSON per archetype, each pointing at a base resume DOCX. The two need to stay aligned but they're separate artifacts.

---

## Per-application folder structure

The dispatcher creates this folder in §0. Each agent writes its own outputs into it.

```
apps/<Company>/<Role>/
  job_description.md           ← saved JD (dispatcher)
  classification.md            ← dispatcher's routing decision + reasoning
  dispatcher_question.md       ← only if §0 returned NEEDS-DISCUSSION
  research/
    jd_analysis.md             ← Agent 1 output (§2)
    company_research.md        ← Agent 2 output (§2)
    resume_examples.md         ← Agent 3 output (§2)
  questions.md                 ← only if research surfaces honesty gaps (§3)
  build_resume.js              ← tailored Node script generating the DOCX (§4)
  Resume_<Company>_<Role>.docx ← the deliverable (§4)
  feedback.md                  ← HM review latest pass (§5; overwritten each pass)
  feedback_history.md          ← append-only HM review history (§5)
  user_request.md              ← user-requested changes during §7 review (if any)
  provenance.md                ← honesty audit (§6)
  interview_feedback.md        ← user notes during/after interviews (§8)
```

---

## §0. Dispatcher

The dispatcher is the routing brain. One run per posting. It decides whether the posting is worth pursuing, which archetype to start from, and whether anything about the JD requires user input before research begins.

**Inputs:** the posting URL (or raw JD text if the URL is dead), `_meta/about_user.md`, `_meta/resume_style_guide_2026.md`, the configured `_meta/archetypes/<key>.json` files.

**Actions:**

1. **Create the folder.** `apps/<Company>/<Role>/`. If the dispatcher received only a URL (URL-only paste mode), it picks `<Company>` and `<Role>` slugs itself from the JD and creates the folder. The orchestrator patches the Job record with the discovered names afterward.
2. **Fetch the JD** and save to `job_description.md`. If URL is dead/paywalled, write `classification.md` flagging this and return `NEEDS-DISCUSSION` asking for the raw text.
3. **Classify** and write `classification.md` with:
   - **Archetype** — the matched archetype key from `_meta/archetypes/`, with one-line rationale
   - **Career archetype** — the positioning label from `about_user.md` "Tailoring playbook by archetype" (can differ from the base archetype)
   - **Comp signal** — estimated band; whether it clears the user's hard floor (see `about_user.md` "Career objectives & constraints")
   - **Geography** — remote-OK / in-person required / relocation required; flag conflicts with the user's geo preferences
   - **Honesty flags** — JD requirements that push against `about_user.md` "Honesty boundaries — red lines". Cite exact JD phrases.
   - **Special-handling flags** — PM-shaped, federal-contractor-deep, avoid-list match, etc.

4. **Decide one of three outcomes:**

   **GO** — proceed automatically to §2. Final line of `classification.md`: `Decision: GO`. The orchestrator auto-kicks research.

   **NEEDS-DISCUSSION** — write `dispatcher_question.md` with specific questions for the user and stop. Final line: `Decision: NEEDS-DISCUSSION`. Triggers (any one is sufficient):
   - PM-shaped role and the user's archetypes don't explicitly include PM
   - Comp band looks below floor (with reasoning)
   - Clearance-required and `about_user.md` doesn't list a held/clearable status
   - JD requires something the user can't honestly claim per `about_user.md`
   - Genuinely ambiguous archetype (could fit two equally and the choice matters)
   - Relocation explicitly required and user hasn't pre-approved

   **RECOMMEND-SKIP** — write the skip reasoning in `classification.md` and stop. Final line: `Decision: RECOMMEND-SKIP`. The user can still override via JobActions. Triggers: comp clearly below floor, hard-avoid company, clearance dealbreaker, role wildly above or below scope.

5. **Final assistant message** is a single JSON object wrapped in `<result>…</result>` with the decision, picked archetype, and folder path. The orchestrator (`lib/agents/dispatch.ts` → `routeAfterDispatch`) parses this, updates the Job's status + chosen archetype, and either auto-kicks §2 or stops.

---

## §1. Folder setup

Handled by the dispatcher in §0. This section preserved for compatibility with downstream agents that reference workflow sections by number.

---

## §2. Parallel research (3 sub-agents)

Triggered automatically after §0 returns GO, or manually via JobActions "Run research" when status is `researching` or `errored`. Spins up three sub-agents in **one message** so they run concurrently. Each writes its output into `apps/<Company>/<Role>/research/`.

**Agent 1 — JD analysis.** Read the saved JD. Extract: required skills (with quotes), preferred skills, scope (IC/lead/exec), domain (healthcare/fintech/gov/etc.), buzzwords to mirror, top 5 things a resume must hit to clear ATS + first human screen, ambiguities to surface. Output: `research/jd_analysis.md`.

**Agent 2 — Company research.** Web-search the company: recent news (last 12 months), AI/platform strategy, leadership team, funding/financials, regulatory posture, recent product launches, engineering-culture signal. Output: `research/company_research.md`, ending with "What the user's background lines up with right now" — 3-5 specific signal-matches grounded in `about_user.md`.

**Agent 3 — Resume examples.** Web-search for strong resume examples and tailoring commentary for similar roles. Identify: section ordering, summary style, how to present scope (budget / headcount / $-impact), what to cut at director+, common mistakes. Output: `research/resume_examples.md`, a tailoring playbook specific to **this role**, grounded in what's actually in `about_user.md` (don't suggest claims the user can't honestly make).

All three must ground in `about_user.md` — they don't invent experience.

---

## §3. Decision gate — questions or draft?

After §2's three outputs land, scan for **gaps** the existing profile can't fill (a required skill not in `about_user.md`, a certification not held, a domain not present).

- **If gaps exist** → write `questions.md` listing each gap as a concise question to the user. Final `<result>` is `{"verdict":"questions"}`. The orchestrator moves the job to `awaiting_input`.
- **If no gaps** → final `<result>` is `{"verdict":"ready_to_draft"}`. The orchestrator auto-kicks §4.

---

## §4. Draft the resume (.docx)

Triggered automatically after §2 returns `ready_to_draft`, or manually via JobActions "Run draft" / "Re-draft w/ feedback" / "Fix and re-draft" (the last with provenance flags baked in).

**Inputs** (read in this order):
1. `_meta/about_user.md` — source of truth. Obey the four-tier honesty model.
2. `_meta/resume_style_guide_2026.md` — format and voice rules.
3. `apps/<Company>/<Role>/job_description.md`
4. `apps/<Company>/<Role>/classification.md` — the dispatcher's archetype choice + framing notes.
5. `apps/<Company>/<Role>/research/{jd_analysis,company_research,resume_examples}.md`
6. `_meta/build_resume_template.js` — the DOCX builder template; study its structure.
7. The base resume DOCX for the chosen archetype (path comes from `_meta/archetypes/<key>.json`).

**Output:** a tailored Node script `apps/<Company>/<Role>/build_resume.js` modeled on `_meta/build_resume_template.js` (uses the `docx` Node library). Run it from the per-app folder to produce `apps/<Company>/<Role>/Resume_<Company>_<RoleShort>.docx`.

**Tailoring rules:**

- **Summary**: 3–4 lines. Mirror role language. PhD framing per `about_user.md` and per archetype.
- **Experience bullets**: reorder and rewrite within each role to lead with JD must-haves. **Pull only from facts in `about_user.md`.** No fabrication. No invented numbers.
- **Skills**: every skill listed must appear in context in at least one experience bullet (style guide §2 keyword-density rule).
- **Degree/credential framing**: use the exact wording from `about_user.md` for in-progress credentials (e.g., "Starting Fall YYYY" or "Expected MM/YYYY" — never paraphrase dates or status).
- **Title handling**: parenthetical scope-clarifier per style guide §4 (e.g., `Engineering Manager (Director-level scope: $XXM program, NN-person org)`), not retitling.
- **Certifications**: prune to 2–3 most-relevant for this role.
- **Length**: per style guide §1 by archetype.

**Hard rules:** use the `docx` Node library; do not generate HTML-to-PDF or markdown-to-DOCX (those parse badly through Workday). **Run the script** — the deliverable is the DOCX, not the script.

Final `<result>` is `{"docxRelPath":"…","summary":"…"}`. The orchestrator auto-kicks §5.

---

## §5. Hiring-manager review loop

Triggered automatically after §4 finishes, or manually via JobActions "Run HM review again". The agent **becomes the hiring manager for this specific role at this specific company** and writes feedback as that persona.

**Inputs:**
1. `apps/<Company>/<Role>/job_description.md`
2. `apps/<Company>/<Role>/research/company_research.md`
3. `apps/<Company>/<Role>/research/jd_analysis.md`
4. The latest tailored resume DOCX (read the bytes — don't infer from filename)
5. `apps/<Company>/<Role>/feedback_history.md` if it exists, so the review doesn't repeat itself

Web searches are allowed.

**Output:** overwrite `feedback.md` with the latest pass only; append the same content to `feedback_history.md` under a heading `## Pass N — <ISO timestamp>` (increment N from the prior history).

`feedback.md` contains:
- Top concerns / gaps — would you advance this candidate? Why?
- Specific line-level suggestions — quote the bullets you'd change and propose rewrites
- What reads generic / padded / unconvincing
- **At least 2 concrete things that are strong** so the writer knows what to keep
- An explicit verdict line, exactly: `**Verdict:** ready to submit` or `**Verdict:** needs revision`

Final `<result>` is `{"verdict":"ready_to_submit|needs_revision","passNumber":<int>,"topConcerns":[…]}`.

**Loop behavior:** the orchestrator (`lib/agents/research-draft-review.ts`) checks the verdict. If `needs_revision`, the user sees the feedback in the UI and triggers a re-draft (JobActions "Re-draft w/ feedback") — this re-enters §4 with `feedback.md` passed in as context. If `ready_to_submit`, the orchestrator auto-kicks §6.

**Stall-detection:** if the same concerns repeat 3+ passes, the agent should mark `needs_revision` but note in `feedback.md` that the loop is stalling and propose a human review — the user can then "Send anyway" (skip HM, go straight to provenance).

---

## §6. Provenance audit

Auto-runs after §5 returns `ready_to_submit`. Honesty / fabrication-detection — distinct from HM review's quality lens.

**Inputs:**
1. `_meta/about_user.md` — canonical source of truth for every claim.
2. `apps/<Company>/<Role>/job_description.md`
3. `apps/<Company>/<Role>/research/jd_analysis.md` + `company_research.md` for context
4. `apps/<Company>/<Role>/build_resume.js` — the structured source of every bullet (use this rather than re-parsing the DOCX)
5. `apps/<Company>/<Role>/<Resume>.docx` — the actual bytes

**Output:** `apps/<Company>/<Role>/provenance.md` per the spec format. For every bullet in Experience and any narrative sections (Summary, cover letter content if present), produce a provenance entry mapping:
- The verbatim bullet
- The source snippet in `about_user.md` it traces to
- A note on what was combined / framed / recontextualized, with the literal token `VERIFY:` on any claim that doesn't trace cleanly

Plus an "Honesty boundary check" section that ticks `[x]` or `[ ]` against every red line in `about_user.md` "Honesty boundaries — red lines", plus an "Honest gaps" section for JD-required skills not present in the profile.

**Decision:**
- **clean** — every bullet traces, no red lines violated, no `VERIFY:` on load-bearing claims.
- **flagged** — at least one of: `VERIFY:` on a load-bearing claim, a violated red line, a JD-required skill the resume claims but the profile doesn't support.

Final `<result>` is `{"verdict":"clean|flagged","flagsCount":<int>,"summary":"…"}`.

**On `flagged`:** the orchestrator moves the job to `awaiting_input` with the provenance-flagged panel surfaced in JobActions. Two paths:
- **Fix and re-draft** → re-enters §4 with provenance flags as context.
- **Accept the gap** → status moves to `ready_for_user_review`; flags stay on disk as the paper trail.

**On `clean`:** status moves directly to `ready_for_user_review`.

---

## §7. User review & apply

User-driven, not agent-driven. The user opens the job in the UI:

- **Resume preview** tab (top-level) renders the DOCX via mammoth so they can read it without leaving the browser.
- **Posting / Research / Audit** tabs surface the JD, research outputs, HM feedback, and provenance — everything that went into the draft.
- **JobActions** primary buttons: **Approve → ready to apply**, **Request changes** (re-enters §4 with notes appended to `user_request.md`), **Reject** (terminal).

On approve, status moves to `ready_to_apply`. The user submits externally (Workday, Greenhouse, Lever, email — wherever the posting requires), then clicks **Mark applied**. Status moves to `applied`.

The user sets `outcome` on the Applications page as the application progresses: `awaiting_response → phone_screen → interview → offer | rejected | ghosted`.

---

## §8. Post-application — interview prep & lessons

When `outcome` crosses into `phone_screen`, `interview`, or `offer`, the UI surfaces a "Prep" link to `/prep/<Company>/`. First open offers **Bootstrap prep pack** — writes a standard scaffold (`00-overview.md`, four round files, appendix, notes template) into `prep/<Company>/`, inlining `company_research.md` into the overview if it exists. **Build with assistant** spawns an agent that fills in the round files using `about_user.md` + the per-app research bundle.

During / after each round, the user fills in `apps/<Company>/<Role>/interview_feedback.md` (an inline editor under the Job detail's Notes tab). Once an application reaches a terminal outcome, **Synthesize lessons** spawns a focused agent that reads the interview feedback plus the current `about_user.md` "Lessons from past interviews" section, then produces a refreshed draft of that section ready to commit at `/settings/profile/lessons`.

---

## Grounding rules (non-negotiable across every phase)

- **Never fabricate** experience, numbers, dollar figures, team sizes, dates, or stories. Pull only from `about_user.md`.
- **Four-tier honesty model.** Every claim is one of: can-claim-with-depth / can-claim-at-prototype / can-claim-as-direction / cannot-claim. The user's `about_user.md` "Skill depth — honest map" section defines which is which. The resume only deploys claims at the first tier; the second tier gets a hedged framing if used; the third never appears as a deployed skill; the fourth is a red line.
- **PhD framing**: use the exact in-progress wording from `about_user.md`. Never invent dates or status.
- **One source of truth**: the base resume DOCX for the chosen archetype (referenced by `_meta/archetypes/<key>.json`). If conflicting facts appear between `about_user.md` and the base resume, `about_user.md` wins.
- **No buzzword stuffing**: mirror the JD's language only when it maps to something real in the profile.

---

## Tips

- `prep/<Company>/` is the reference for tone, depth, and structure of interview-prep materials. The resume workflow (in `apps/`) is separate from the prep workflow (in `prep/`).
- If a posting URL is dead/paywalled, paste the raw JD text into the "Paste a job" modal's optional JD-text field — the dispatcher uses it verbatim.
- When in doubt about a tailoring choice, the dispatcher should return `NEEDS-DISCUSSION` rather than guess — cheaper than a full HM-review-and-redraft cycle.
- The Runs page (`/settings/runs`) shows every Claude Code subprocess prism has ever spawned, with token totals and `apiKeySource` per run. If `apiKeySource` ever shows anything other than `"none"`, you're on API-key billing, not subscription — fix immediately.
