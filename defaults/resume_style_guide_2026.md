# Resume Style Guide — 2026

This is the shipped default. It lives at `_meta/resume_style_guide_2026.md` in your workspace and you can edit it freely — prism only seeds this file if it's missing.

**What belongs here:** universal-in-2026 format / ATS / voice rules that apply across roles and targets.

**What does NOT belong here:** per-target tailoring decisions. Those live in:

- `_meta/about_user.md` "Tailoring playbook by archetype" — your overall philosophy per target type
- `_meta/archetypes/<key>.json` `tailoringRules` field — archetype-specific deltas the draft agent reads on top of about_user.md

Section numbers (§1, §2, §4, etc.) are referenced verbatim by prism's agent prompts — don't renumber.

---

## 1. Format & Length

### Length

The "one page for everyone" rule is dead at director+ scope. ~54% of hiring managers prefer two pages, and the preference is strongest at director/VP level where breadth of scope is the signal ([AiApply 2026 Guide](https://aiapply.co/blog/one-page-resume-vs-two-page-resume), [Scale.jobs](https://scale.jobs/blog/one-page-vs-two-page-resume-ats-preferences)). The one-page rule originated with fax machines and broken parsers — both gone.

**Default rule:**
- **IC / early-career / PM:** 1 page.
- **Senior IC / staff / principal / Director+:** 2 pages. Page 1 sufficient on its own to answer "should I interview this person?" Page 2 is supporting evidence.
- **Frontier research targets (research labs, top AI labs):** 1 page if dense with signal (production systems, public artifacts, real research depth). Brevity reads as confidence at this tier.

For per-target overrides, see your `about_user.md` "Tailoring playbook by archetype" entries.

### Layout

Single column, reverse-chronological. Hybrid/functional formats trip ATS parsers and read as "hiding something" to senior recruiters ([Jobscan](https://www.jobscan.co/blog/ats-formatting-mistakes/)). Two-column layouts cause parsers to read content in wrong order — the #1 ATS auto-reject cause for senior candidates ([Resume Optimizer Pro](https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work)).

**Do:** single column, reverse-chronological, clear `Section Heading` → role block → bullets hierarchy.
**Don't:** sidebars, skill bars, icons, infographics, photo. All ATS poison and read as junior in 2026.

### File format

- **DOCX by default.** Workday and Taleo (dominant at large enterprises) parse DOCX materially better; PDF text-order frequently scrambles depending on the producing app.
- **PDF only when requested**, or for Greenhouse / Lever / Ashby targets where PDFs parse cleanly.
- Keep both versions ready. Submit DOCX unless the posting says PDF. Keep a PDF for emailing humans (recruiter referrals, warm intros).

### Fonts

Calibri 11, Arial 10.5–11, or Helvetica 10.5–11. These hit 90%+ parse accuracy on Workday, Greenhouse, Lever, iCIMS, Taleo ([Resume Optimizer Pro fonts](https://resumeoptimizerpro.com/blog/ats-friendly-resume-fonts-and-styles), [JobShinobi](https://www.jobshinobi.com/blog/best-fonts-for-ats-resumes-2026)).

- **Aptos** (Microsoft's new default): safe in modern Word, but older parsers occasionally substitute. Use Calibri if in doubt.
- **Inter / Source Sans / Poppins:** look great on screen but higher ATS risk because they often embed as subsetted fonts and confuse parsers ([JobShinobi](https://www.jobshinobi.com/blog/best-fonts-for-ats-resumes-2026)). Avoid.
- Body 10.5–11pt, headers 12–14pt, name 16–20pt.

### Whitespace & header treatment

- 0.5"–0.75" margins. Don't go under 0.5".
- Standard section names: `Summary`, `Experience`, `Education`, `Skills`. ATS systems literally pattern-match these strings — clever variants like "My Story" or "Where I've Made an Impact" get section-mis-tagged ([Resumemate](https://www.resumemate.io/blog/ats-myths-vs.-facts-in-2026-with-recruiter-quotes/)).
- Bold company names and titles. Right-align dates. No tables for the role-header line — use tab stops.

---

## 2. ATS in 2026

### State of the art

ATS parsers improved substantially 2023–2025, but the "no graphics, no tables, no columns" rules still hold because the **median** parser in production at Fortune 500s is still 2–4 years behind the SOTA. Optimize for the worst parser your resume will hit, not the best.

### Platform-specific notes

- **Workday** (most enterprise targets — large health plans, insurers, banks, consulting, government contractors): strictest parser. DOCX, single column, standard section names. Workday auto-populates fields from your resume; if parsing fails you get to manually retype everything, a soft signal of an unhealthy application.
- **Greenhouse** (most well-run mid-size tech, many AI labs and AI infra cos): forgiving parser. Handles PDFs cleanly. Reads bullets well.
- **Lever:** similar to Greenhouse.
- **Ashby** (newer AI-native companies): modern parser, handles PDFs well, but the recruiters using Ashby tend to read every resume by hand — optimize for human readability, not keyword stuffing.
- **LinkedIn Easy Apply:** parses your LinkedIn profile, not your resume. Keep LinkedIn in sync.

### Keyword density

ML-based parsers (most are, now) cross-reference your skills section against your experience bullets. **A skill listed but never demonstrated in a bullet scores LOWER than that skill being absent entirely** ([Resume Optimizer Pro](https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work), [BeachHead](https://www.beach-head.com/2026/04/top-7-resume-mistakes-it-professionals-make-in-2026/)). Keyword-stuffing is a 2018 strategy that now actively hurts.

**Rule:** every skill in your skills section must appear in context in at least one bullet.

### AI-role-specific gotchas

- Spell out acronyms on first use: "Retrieval-Augmented Generation (RAG)", "Large Language Models (LLMs)". Some enterprise ATS taxonomies still don't have "RAG" as a recognized skill.
- Use both "LLM" and "Large Language Model" somewhere on the resume.
- "MLOps" is recognized; "LLMOps" still isn't on some Workday installs — pair it with "ML/LLM operations."
- "Agentic systems" is a coin-flip. Use it AND a more concrete description: "agentic systems (multi-step tool-use LLM workflows with eval harness)."

---

## 3. Content & Voice

### Summary section

**3–4 lines, dense, specific, and front-loads scope.** The "results-driven leader passionate about innovation" opener reads junior and out-of-touch ([Think-MBA](https://think-mba.com/why-experience-and-titles-no-longer-cut-it-and-how-to-create-a-winning-executive-resume-in-2026/), [WahResume](https://www.wahresume.com/blog/executive-resumes-2026-crafting-leadership-stories-over-duty-lists)).

**Structure of a 2026 summary line:**

> [Scope number first] · [named systems / programs second] · [forward-looking research or thesis hook] · [role target last].

Pull scope, named programs, and the forward-looking hook from `about_user.md`. The summary mirrors the role-target language from the JD's first paragraph. No adjectives. Read aloud — if it sounds like corporate boilerplate, rewrite.

### Quantification norms

The bar has moved from "include numbers" to **"every bullet answers: how much, how many, over what timeframe, vs. what baseline"** ([HBR](https://hbr.org/2016/05/improve-your-resume-by-turning-bullet-points-into-stories), [Resumemate](https://www.resumemate.io/blog/best-professional-summary-examples-for-resume-2026-20-roles/)).

**Weak (2020):** "Led cloud migration, saving costs."
**Strong (2026):** "Migrated 140 workloads to multi-cloud, cutting infra spend $18M/yr (22%) over 14 months while reducing P1 incidents 60%."

The 2026 wrinkle: pair the quant with the **mechanism**. Hiring managers screen for "did this person actually do the thing or did they manage a contractor who did it." A bullet without mechanism reads as ghostwritten.

### AI/ML accomplishments — signal vs. padding

**Real depth signals:**
- Named systems with architecture detail ("built RAG pipeline using BGE-large embeddings, OpenSearch vector store, reranking via Cohere, eval harness on 4k labeled QA pairs").
- Eval-first language ("shipped an eval suite covering hallucination, jailbreak resistance, and PII leakage before production rollout").
- Honest scope ("served 80k internal users at 99.5% availability, p95 latency 1.2s").
- Failure-modes addressed ("reduced hallucination rate from 14% to 3.8% via retrieval reranking + chain-of-verification").

**Padding signals (avoid):**
- "Leveraged LLMs to drive transformation." Says nothing.
- "Implemented GenAI solutions across the enterprise." Where? What model? What use case?
- Listing every framework (LangChain, LlamaIndex, Haystack, DSPy, AutoGen) — reads as tutorial-watcher.
- "Cutting-edge" / "state-of-the-art." Empty.

### Voice — two general buckets

Most senior candidates pick from two voices depending on target:

**Research-y voice** — for research labs and research-adjacent roles. Lead with public artifacts, named systems with architecture detail, research hooks. Frame eval and safety work as the first-class concern. PhD or research credentials near the top.

**Enterprise / outcomes voice** — for Director+ at large enterprises, consulting, traditional cloud platform. Lead with budget + headcount + named programs. Stakeholder altitude (who you brief) is signal. PhD goes in normal Education section.

Most candidates need both versions ready. Your `about_user.md` "Tailoring playbook by archetype" maps your targets to these voices (or hybrids).

---

## 4. Director-Level Signaling

The gap to close at this scope: 15-YOE Directors have more roles to point to. You close it on **scope-per-role**, not roles-count.

### Scope levers (use all of them on page 1)

Pull all of these from `about_user.md`:

- **Budget:** dollar figure, named explicitly, on the role header line, not buried in a bullet.
- **Headcount:** direct + dotted-line, with org structure when it adds clarity.
- **User scale / impact:** real numbers when defensible.
- **Named programs:** program-as-proper-noun reads more senior than generic "led cloud strategy."
- **Stakeholder altitude:** who do you brief? CIO/CTO/board-level → say so explicitly.
- **Decision authority:** chair / approving authority on governance bodies, architecture review boards.

Typical director scope benchmarks from 2026 templates: $5–25M budget, 15–100 engineers ([Resume Worded — Senior Director Engineering](https://resumeworded.com/senior-director-of-engineering-resume-example), [Director of Technology](https://resumeworded.com/director-of-technology-resume-example)). Significantly larger scope reads as Senior-Director / VP-adjacent even with a Manager HR title.

### Handling title inflation/deflation

When the HR title under-states the scope (common with federal contractors and many large enterprises), three options in order of preference:

1. **Title + parenthetical scope-clarifier** (recommended):
   `Cloud Engineering Manager (Director-level scope: $XXM program, NN-person org)`
   Honest, ATS-safe, and scope-legible at a glance. Karpiak and most senior recruiters endorse this pattern ([Karpiak Consulting](https://www.karpiakconsulting.com/post/resume-scope-determines-relevance)).
2. **Functional title with HR title in fine print** — riskier; can read as inflation.
3. **Just the HR title** — leaves scope on the table; will get screened against true-Manager peers (much smaller scope).

Pair with a summary line that names the scope numbers, and the recruiter does the mental upgrade themselves. **Don't fabricate. Do clarify.**

---

## 5. AI / ML Specific Positioning

### Table stakes in 2026 (everyone applying has these — they don't differentiate)

- "Built a RAG system." Generic.
- "Used LangChain / LlamaIndex." Generic.
- "Deployed model on AWS/Azure." Generic.
- "Prompted GPT-4." Generic.

### Differentiators in 2026 (these still move the needle)

- **Evals as a first-class concern:** owning an eval program, eval harness design, golden datasets, regression testing for LLMs. Rare and highly signal-positive at both enterprise and frontier targets.
- **Production scale numbers:** RPS, p95 latency, # of users, token throughput, $/query at scale.
- **Safety/trust work:** prompt injection mitigation, PII redaction, jailbreak testing, red-teaming, output filtering.
- **Cost engineering:** quantization, distillation, prompt compression, caching, model routing.
- **Multi-model orchestration:** routing, fallback chains, comparative eval across providers (Claude/GPT/Gemini/open-weights).
- **Governance:** AI use-case intake, model cards, risk classification, working with Legal/Risk/Privacy.
- **Agentic systems with teeth:** tool use, sandboxing, multi-step planning, monitoring/observability for agents.

### Hot keywords/phrases for 2026

**Use freely:**
agentic systems, evals/evaluation harness, LLM gateway, retrieval (over "RAG" alone), guardrails, model routing, eval-driven development, interpretability, alignment, capability/safety, justified trust, observability for LLMs, RLHF/RLAIF, fine-tuning vs. prompting trade-off, inference cost, prompt injection, jailbreak resistance, red-teaming, AI governance.

**Words used so much they're noise (avoid alone, always pair with concrete detail):**
GenAI transformation, AI-powered, leveraging AI, cutting-edge LLM, enterprise AI, AI-first, copilot.

**Dead/cliché — do not use:**
"results-driven," "passionate," "synergy," "innovative," "proven track record," "thought leader," "10x engineer," "rockstar," "ninja," "go-getter" ([Resume Genius](https://resumegenius.com/blog/resume-help/resume-buzzwords), [CareerAddict](https://www.careeraddict.com/resume-buzzwords), [Korn Ferry](https://www.kornferry.com/insights/this-week-in-leadership/5-cliches-to-keep-off-your-resume)).

---

## 6. Education Section

### Where in-progress credentials go

For most targets: normal Education section. Mention in the Summary as a forward-looking hook if the credential is directly relevant to the role.

For research-y targets (top AI labs, research roles): consider lifting research credentials to the top of the resume — either a dedicated `Research` section above Experience or as part of the Summary's opening line. Labs index hard on research orientation.

**Use the exact wording from `about_user.md`** for in-progress credentials (e.g., "Starting Fall 2026" — never paraphrase dates or status). The provenance audit (workflow.md §6) will catch any drift from the canonical phrasing.

### Framing in-progress

Format:
```
PhD, <Field> — <Institution>
Expected start: <Term> <Year> | Focus: <topic>
Advisor: <Name, if confirmed>
```

**Is an in-progress credential additive?** Strongly, if framed correctly. For research-y targets, 100% additive. For enterprise, additive but pre-empt the "are you about to leave for academia?" question with one line in the summary noting it's part-time or executive-program if applicable.

**Don't** list it as if already-enrolled with current dates. Recruiters can verify and the lie is fatal.

### Does the school matter?

For applied-AI PhDs:

- **Top-tier (Stanford, CMU, MIT, Berkeley, Oxford, ETH):** strong signal everywhere.
- **Strong second tier (UT Austin, UW, Georgia Tech, U Michigan, Princeton):** strong for enterprise, fine for labs.
- **Mid-tier R1 / specialized programs:** fine if advisor + research topic are strong. Frontier labs care about **research output**, not name. Anthropic explicitly doesn't require PhDs and ranks "direct evidence of ability" above pedigree ([Let's Data Science](https://letsdatascience.com/blog/how-to-land-a-job-at-openai-anthropic-or-google-deepmind)).
- **Online/executive PhDs:** acceptable for enterprise (commitment signal), weaker for labs unless advisor is well-known.

**Rule:** lead with the research topic, then advisor, then institution. Topic and advisor carry more weight than the school name for applied AI.

---

## 7. Anti-Patterns — Top 5 Auto-Rejects in 2026

1. **Two-column layouts.** Single highest cause of ATS scramble for senior candidates. Recruiter sees gibberish, moves on. ([Jobscan](https://www.jobscan.co/blog/ats-formatting-mistakes/))
2. **Skills section listing tech you can't defend.** ML-based parsers compare skills-section claims to bullet evidence; mismatches drop your score. Plus you'll fail the interview. The four-tier honesty model in `about_user.md` "Skill depth — honest map" is the source of truth for what's claimable. ([Resume Optimizer Pro](https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work))
3. **Buzzword-only bullets** ("Led GenAI transformation across the enterprise") with no system named, no metric, no mechanism. Reads as resume-padding, especially for AI roles where depth is the screen. ([Think-MBA](https://think-mba.com/why-experience-and-titles-no-longer-cut-it-and-how-to-create-a-winning-executive-resume-in-2026/))
4. **Cluttered formatting** — icons, skill bars, headshots, sidebars, color blocks, emoji. ATS-hostile, and at senior level reads as junior or insecure. ([Jobscan](https://www.jobscan.co/blog/ats-formatting-mistakes/), [Easyresume.online](https://www.easyresume.online/blog/resume-dos-and-donts))
5. **Title without scope.** A role header with no $/people/scope numbers visible on page 1. The recruiter doesn't know your real scope and slots you in the wrong pile. ([Karpiak Consulting](https://www.karpiakconsulting.com/post/resume-scope-determines-relevance))

### Things that USED to work but don't in 2026

- **One-page resume at senior level** — used to be table stakes, now reads as missing scope (exception: research-y targets and PM-shaped roles, where 1 page is still right).
- **Objective statement** — fully dead. Replaced by Summary.
- **Skills-matrix tables with proficiency levels** — parser-hostile and reads as junior. List skills inline.
- **Listing every cloud certification** — at director level, certs read as IC-tier signal. Keep at most 2 high-value ones.
- **"References available upon request"** — dead since ~2015 but still seen. Delete.
- **Hyperlink-only contact** ("see my LinkedIn" with no other contact info) — fine in 2018, now reads as low-effort.
- **Keyword stuffing footer** ("Keywords: Python, AWS, LLM, RAG...") — actively hurts because ML parsers detect orphan keywords and downweight.

---

## Quick Decision Cheat Sheet

Two voice buckets cover most targets. Map your archetypes to these in `about_user.md` "Tailoring playbook by archetype."

| Decision | Research-y voice | Enterprise / outcomes voice |
|---|---|---|
| Length | 1 page dense if signal-rich; else 2 | 2 pages |
| File | PDF (Greenhouse/Ashby) | DOCX (Workday) |
| PhD placement | Top, near summary | Normal Education, mentioned in summary |
| Title handling | Function over HR title | Parenthetical scope-clarifier |
| Voice | Research-y, specific, modest | Outcomes, scope, business impact |
| Lead with | Public work + named systems | Budget + team + named programs |
| Eval/safety work | Highlight heavily | Frame as governance/risk |
| Hot keywords | alignment, evals, agentic, interpretability | AI governance, platform, scale, ROI |

---

## Sources

- [AiApply — One Page vs Two Page Resume 2026](https://aiapply.co/blog/one-page-resume-vs-two-page-resume)
- [Scale.jobs — One vs Two Page Resume ATS](https://scale.jobs/blog/one-page-vs-two-page-resume-ats-preferences)
- [Resume Optimizer Pro — How Resume Parsers Actually Work](https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work)
- [Resume Optimizer Pro — Best ATS-Friendly Fonts](https://resumeoptimizerpro.com/blog/ats-friendly-resume-fonts-and-styles)
- [Resume Optimizer Pro — Builder vs Word](https://resumeoptimizerpro.com/blog/resume-builder-vs-word)
- [Jobscan — 5 Critical ATS Formatting Mistakes 2026](https://www.jobscan.co/blog/ats-formatting-mistakes/)
- [JobShinobi — Best Fonts for ATS Resumes 2026](https://www.jobshinobi.com/blog/best-fonts-for-ats-resumes-2026)
- [Resumemate — ATS Myths vs Facts 2026](https://www.resumemate.io/blog/ats-myths-vs.-facts-in-2026-with-recruiter-quotes/)
- [Anthropic Careers](https://www.anthropic.com/careers)
- [Let's Data Science — How to Land a Job at OpenAI, Anthropic, DeepMind](https://letsdatascience.com/blog/how-to-land-a-job-at-openai-anthropic-or-google-deepmind)
- [Dataexec — Breaking into AI 2026](https://dataexec.io/p/breaking-into-ai-in-2026-what-anthropic-openai-and-meta-actually-hire-for)
- [Karpiak Consulting — Scope Determines Relevance](https://www.karpiakconsulting.com/post/resume-scope-determines-relevance)
- [Resume Worded — Senior Director of Engineering Examples](https://resumeworded.com/senior-director-of-engineering-resume-example)
- [Think-MBA — 2026 Executive Resumes Beyond Titles](https://think-mba.com/why-experience-and-titles-no-longer-cut-it-and-how-to-create-a-winning-executive-resume-in-2026/)
- [WahResume — Executive Resumes 2026 Leadership Stories](https://www.wahresume.com/blog/executive-resumes-2026-crafting-leadership-stories-over-duty-lists)
- [HBR — Bullet Points to Stories](https://hbr.org/2016/05/improve-your-resume-by-turning-bullet-points-into-stories)
- [Korn Ferry — 5 Clichés to Keep Off Your Resume](https://www.kornferry.com/insights/this-week-in-leadership/5-cliches-to-keep-off-your-resume)
- [Resume Genius — Resume Buzzwords](https://resumegenius.com/blog/resume-help/resume-buzzwords)
- [CareerAddict — Buzzwords & Clichés to Avoid 2026](https://www.careeraddict.com/resume-buzzwords)
- [BeachHead — Top 7 Resume Mistakes IT 2026](https://www.beach-head.com/2026/04/top-7-resume-mistakes-it-professionals-make-in-2026/)
- [Easyresume — 30 Resume Do's and Don'ts 2026](https://www.easyresume.online/blog/resume-dos-and-donts)
