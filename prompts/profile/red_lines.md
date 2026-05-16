# Section: Honesty boundaries — red lines

## Canonical heading

`## Honesty boundaries — red lines`

## What this section captures

The non-negotiable claims the drafting agent must NEVER make. Provenance audits cross-reference every resume bullet against this list. Each red line should be:
- **Specific** (a class of claim, not a vibe)
- **Reasoned** (why it's a red line — usually because the user can't honestly defend it)
- **Imperative** ("Never claim X" not "be careful with X")

## Questions to cover

1. **Production scope of agentic / multi-agent systems.** Has the user deployed multi-agent systems in production? Single agents? Just prototypes? Capture the exact boundary.
2. **Software-engineering background.** Does the user have a SWE background, or are they platform/architect/leadership-shaped? What's the framing they're OK with? ("Deep technical fluency" vs "engineer.")
3. **Alignment / interpretability research.** If applying to frontier labs, does the user have alignment-research credibility, or is their research interest deployment-side? Be honest about which.
4. **Fine-tuning / pre-training.** Has the user actually trained models, or do they operate them? Capture the boundary.
5. **ML modeling.** Does the user build models, or work around them (platform / infrastructure / governance)?
6. **Specific numbers / dollar figures / dates / headcount** that have been wrong on past resumes. Capture each as an explicit anti-pattern.
7. **Exact-language rules for in-progress credentials.** If the user is in the middle of a degree or program, capture the **exact phrasing** they want on resumes (e.g., "Starting <term>") and the alternatives that must NOT be used (e.g., "enrolled," "since &lt;year&gt;").
8. **Any other specific claim** that a past interview or recruiter has flagged as overreach.

## Output structure (draft format)

```
## Honesty boundaries — red lines

Tailoring agents must obey these without exception. If a JD requires something below the line, surface it in `questions.md` instead of fabricating.

- **Never** claim <X>. <Specific framing the agent IS allowed to use, if any>.
- **Never** claim <Y>. <Reasoning + safe framing>.
- ...
- **<PhD framing or similar exact-language rule>:** "<exact language>." Never "<alternative>," never "<other alternative>."
```

## Hard rules for this section

- **Specificity wins.** "Never claim production-grade ML modeling" beats "be honest about ML."
- **Always pair a red line with the allowed framing.** Future agents need to know what to *do*, not just what to avoid.
- **Past fabrication errors** belong here. If the user recalls a specific past resume that had a fabricated number, capture both the fact and the explicit anti-pattern.
