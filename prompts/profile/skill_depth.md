# Section: Skill depth — honest map

## Canonical heading

`## Skill depth — honest map`

## What this section captures

A four-tier classification of every skill the user might be asked about. The drafting agent uses this to decide what claims to make on a resume. This is the **single most-cited section** in honesty audits — get it right and provenance audits stay clean.

The four tiers:

1. **Can claim with depth** (deploy on resume freely) — real, defensible expertise. The user has shipped it, run it, debugged it in production.
2. **Can claim at prototype / single-instance level** — built a working example, but not at production scale or breadth.
3. **Can claim as research direction / interest** (not yet evidence) — actively learning or planning to work on, but no shipped artifacts.
4. **Cannot claim** — would be fabrication. Often comes from past mistakes ("a recruiter assumed X because of Y; clarify that I don't have X").

## Questions to cover

1. Walk through skill domains relevant to the user's target archetypes. For each, ask which tier it belongs in. Domains commonly include: **cloud infrastructure** (per cloud), **MLOps**, **RAG**, **LLM gateway / inference infra**, **evals**, **agentic systems**, **fine-tuning / pre-training**, **alignment / interpretability**, **specific languages**, **specific frameworks**, **org leadership scopes** (team size brackets), **regulated environments**, **specific industries**, **PM-shaped skills**, **research output**.
2. For "Can claim with depth" items, ask for the **specific evidence** that makes it tier 1. (This often reveals tier-2 items mislabeled as tier 1.)
3. For "Can claim at prototype level" items, push for the **honest framing** — what's the agent allowed to say? "Prototyped X with stakeholders" vs "Built X in production" — capture the exact language.
4. For "Cannot claim" items, get a **specific reason**. ("I read code and write IaC but don't have a software-developer background" is more useful than "not a developer.") This is where past interview lessons get encoded.
5. After the four tiers, ask the user to **double-check** by walking through the JDs they've recently been most interested in. Anything in those JDs that's tier-3 or tier-4? That's the most resume-vulnerable category.

## Output structure (draft format)

```
## Skill depth — honest map

Use this to decide what <name> can credibly *claim* vs. *signal interest in*. **Do not blur these in resume bullets.**

### Can claim with depth (deploy on resume freely)
- <Skill 1>
- <Skill 2>
- ...

### Can claim at prototype / <descriptor> level
- **<Skill>** — <specific framing the agent is allowed to use>. Do NOT claim <thing this gets confused with>.

### Can claim as research direction / interest (not yet evidence)
- <Skill>
- ...

### Cannot claim
- <Skill> — <specific reason, often with anti-pattern note>.
- ...
```

## Hard rules for this section

- **Be ruthlessly honest.** This file is the source of truth for honesty audits. If the user is uncertain about a skill, ask them to defend it as if in an interview — "if a panelist asked you to deep-dive on this, would you be solid?"
- **Capture the exact framing** for tier-2 skills. The drafting agent will use this language verbatim.
- **Anti-pattern notes** for tier-4 skills are valuable — they prevent future agents from falling into the same trap.
