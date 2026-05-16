import "server-only";

/**
 * Built-in templates for the interview-prep workspace. Modeled after the
 * worked example at workspace/prep/CareFirst/. The bootstrap action writes
 * each of these (only when the file doesn't already exist) so the user has
 * a scaffold to fill in.
 */

export type PrepTemplate = {
  relPath: string;
  /** Function receives company + role + optional company-research blob. */
  render: (ctx: TemplateContext) => string;
};

export type TemplateContext = {
  company: string;
  /** May be empty if no apps/<Company>/<Role>/ exists yet. */
  role: string;
  /** Optional company research markdown to inline at the bottom of overview. */
  companyResearch?: string;
};

const overviewTpl = (ctx: TemplateContext): string => `# ${ctx.company} — ${ctx.role || "(role)"}
## Interview Prep (End-to-End)

**Role:** ${ctx.role || "(fill in)"}
**Company:** ${ctx.company}
**Location:** (fill in)
**Band / Salary:** (fill in)

---

## Files in this prep pack

The prep is organized by interview round. Splits become per-question files under subdirectories when a round's depth warrants it.

- **[00-overview.md](./00-overview.md)** — this file. Context, how to use, three-tier answer structure, company background.
- **[01-round-1-recruiter-hr.md](./01-round-1-recruiter-hr.md)** — Recruiter / HR phone screen. Two-tier answers.
- **[02-round-2-hiring-manager.md](./02-round-2-hiring-manager.md)** — Hiring manager screen. Three-tier for technical + architecture; lighter two-tier for behavioral.
- **[03-round-3-technical-panel.md](./03-round-3-technical-panel.md)** — Technical deep-dive panel. Full three-tier.
- **[04-round-4-final.md](./04-round-4-final.md)** — Final / executive loop. Three-tier for strategic; lighter for behavioral.
- **[05-appendix.md](./05-appendix.md)** — Questions to ask, red flags, follow-up email templates, prep checklist.
- **[interview-notes-template.md](./interview-notes-template.md)** — Take-as-you-go notes template; duplicate per round.

---

## The three-tier answer structure

Most prep here is organized around a consistent structure for technical and strategic questions:

- **High level** — the spoken opener. 60 to 90 seconds. What you say first if asked the question cold. Declarative, direct, grounded in real work.
- **Medium** — what you say if they probe on a specific aspect. Expands each element of the high level with components, patterns, specific decisions.
- **Deep** — what you reach for if they keep pushing. Architecture, implementation mechanics, decision narrative, operational experience, failure modes / edge cases.

The deep tier is narrative prose, not bullet lists. Structure comes from headings. That format holds up in a spoken interview where you're reconstructing the content from memory.

Not every question gets the full three tiers. Behavioral questions get tone-passed narrative without the full deep treatment. Round 1 is two-tier because it's a screen.

---

## How to use this pack

Read each round's file before the corresponding interview. Pick the top few questions most likely to anchor the round. Read those in full — opener out loud, medium tier scanned, deep tier skimmed. Don't memorize; absorb.

Notes during the interview go into a copy of \`interview-notes-template.md\`. After each round, update with what was asked, what threw you, what the interviewer volunteered, and anything for the follow-up email.

---

## Context to internalize before any round

> _Use the assistant's "Build prep pack" action to draft this section from the company_research.md output of the dispatcher. Or fill in by hand._

${ctx.companyResearch ? "\n---\n\n## Company research (from dispatcher pipeline)\n\n" + ctx.companyResearch.trim() + "\n" : ""}
`;

const round1Tpl = (_ctx: TemplateContext): string => `# Round 1 — Recruiter / HR phone screen

**File index:** [Overview](./00-overview.md) · **Round 1** · [Round 2](./02-round-2-hiring-manager.md) · [Round 3](./03-round-3-technical-panel.md) · [Round 4](./04-round-4-final.md) · [Appendix](./05-appendix.md)

---

The recruiter is filtering for basic fit: can you articulate the role in your own words, do the numbers line up (years, salary, location), are you genuinely interested, are there obvious disqualifiers. Keep answers tight — 60 to 90 seconds. Pattern-matching against a scorecard, not evaluating depth.

Answers here are two-tier: a spoken opener and a short probe-ready section.

---

### Q1. "Walk me through your background."

**What to say:**

(fill in)

**If probed:**

(fill in)

---

### Q2. "Why are you looking, and why this company?"

**What to say:**

(fill in)

**If probed:**

(fill in)

---

### Q3. "What do you know about us?"

**What to say:**

(fill in)

**If probed:**

(fill in)

---

### Q4. "What are your compensation expectations?"

**What to say:**

(fill in)

**If probed:**

(fill in)

---

### Q5. "Are you authorized to work in the US? Location / travel constraints?"

**What to say:**

(fill in)

---

### Q6. "What's your timeline? Are you interviewing elsewhere?"

**What to say:**

(fill in)

---

### Q7. "Any concerns about us as an employer?"

**What to say:**

(fill in)

---

### Q8. "Do you have questions for me?"

**What to say:**

See [05-appendix.md](./05-appendix.md) for the always-have-three-ready list. For a recruiter round, pick lighter ones:

- What does the interview process look like from here?
- What's the timeline you're working against?
- Anything that would make me an obviously strong or obviously weak fit for this team?
`;

const round2Tpl = (_ctx: TemplateContext): string => `# Round 2 — Hiring manager

**File index:** [Overview](./00-overview.md) · [Round 1](./01-round-1-recruiter-hr.md) · **Round 2** · [Round 3](./03-round-3-technical-panel.md) · [Round 4](./04-round-4-final.md) · [Appendix](./05-appendix.md)

---

The hiring manager is testing scope, decision-making, and culture fit against their team's actual problem set. Mix of behavioral and architecture / scope questions. Three-tier for technical and architecture questions; lighter two-tier for behavioral.

---

### Q9. "Tell me about a system you led the design of."

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q10. "Paved roads — what does that mean to you?"

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q11. "Architecture governance — how do you run it without becoming a blocker?"

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q12. "Tell me about a time you had to influence without authority."

**What to say:**

(fill in, narrative — 2 minutes)

---

### Q13. "How do you coach engineers?"

**What to say:**

(fill in)

---

### Q14. "Build vs. buy — how do you frame the decision?"

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q15. "Your biggest professional mistake."

**What to say:**

(fill in — be specific, name what you learned)
`;

const round3Tpl = (_ctx: TemplateContext): string => `# Round 3 — Technical deep-dive panel

**File index:** [Overview](./00-overview.md) · [Round 1](./01-round-1-recruiter-hr.md) · [Round 2](./02-round-2-hiring-manager.md) · **Round 3** · [Round 4](./04-round-4-final.md) · [Appendix](./05-appendix.md)

---

Panel of 3-5 engineers / architects. They will probe depth on the things you've claimed and dig for cracks. Full three-tier (architecture, implementation mechanics, decision narrative, operational experience, failure modes / edge cases) on every question that can support it.

The questions below are placeholders — replace with the specific topics this team is likely to probe based on the JD and company_research.md.

---

### Q. "Walk us through your MLOps pipeline."

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep — architecture:**

(fill in)

**Deep — implementation mechanics:**

(fill in)

**Deep — decision narrative:**

(fill in)

**Deep — operational experience:**

(fill in)

**Deep — failure modes / edge cases:**

(fill in)

---

### Q. (Replace with another deep technical topic — e.g. RAG, LLM gateway, evaluation, observability, vendor evaluation, cost governance, incident response.)

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q. (Another deep technical topic — pick one from research/jd_analysis.md "must-haves".)

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)
`;

const round4Tpl = (_ctx: TemplateContext): string => `# Round 4 — Final / executive loop

**File index:** [Overview](./00-overview.md) · [Round 1](./01-round-1-recruiter-hr.md) · [Round 2](./02-round-2-hiring-manager.md) · [Round 3](./03-round-3-technical-panel.md) · **Round 4** · [Appendix](./05-appendix.md)

---

VP / SVP level. Strategic questions plus a few behavioral. Three-tier on the strategic ones; lighter on behavioral.

---

### Q. "What's your 90-day plan?"

**High level:**

(fill in)

**Medium:**

(fill in)

**Deep:**

(fill in)

---

### Q. "If you had to bet on one thing this team should focus on, what would it be?"

**High level:**

(fill in)

**Medium:**

(fill in)

---

### Q. "Tell me about a time you had to say no to a senior stakeholder."

**What to say:**

(fill in)

---

### Q. "What does 'great' look like for this role 12 months in?"

**High level:**

(fill in)

**Medium:**

(fill in)

---

### Q. (Questions you have for them — see appendix.md.)
`;

const appendixTpl = (_ctx: TemplateContext): string => `# Appendix — questions to ask, red flags, follow-ups

---

## Questions to ask the interviewer

Always have three ready. Pick the ones that fit the round.

### About the role and team

- What does the team look like today — composition, seniority, focus split?
- What's the org's biggest constraint right now — people, capital, talent, regulation?
- Who would I be partnering with closest across the org?
- What does the first 90 days look like?
- What does 12 months of success look like for this role?

### About the work and tech stack

- What's the dominant cloud, the AI/ML stack, the data platform?
- What's the most active piece of infrastructure work right now?
- What's a recent architecture decision you debated hard — and how did it land?
- Where's the technical debt the team is most uncomfortable with?

### About the company and trajectory

- What's the company trying to be in 3 years that it isn't today?
- What's the most contentious priority across the leadership team?
- How is performance evaluated at the leadership level?

---

## Red flags to listen for

- Vague answers about scope, decision rights, or who I'd report to (signals unclear mandate).
- Tension between leaders when asked about strategy (signals dysfunction at the top).
- "We move fast" with no examples of how decisions actually get made.
- Comp / level / title evasiveness in the final round.
- Anyone trash-talking the prior person in the role.

---

## Follow-up email templates

### After Round 1 (recruiter)

> Subject: Thanks — and quick note from today
>
> Hi [Recruiter],
>
> Thanks for the time today. Quick note: [one sentence reinforcing the strongest signal from the call]. Looking forward to next steps — please let me know what the hiring manager round will focus on so I can be ready.
>
> Best,
> [Your name]

### After Round 2/3 (technical / hiring manager)

> Subject: Thanks for today
>
> Hi [Interviewer name],
>
> Thanks for the deep dive on [specific topic]. [One sentence connecting back to something they mentioned — shows you listened.] I left the conversation more interested in [specific aspect of the team / problem]. Happy to follow up on [one technical thing you'd elaborate on] if useful.
>
> Best,
> [Your name]

### After Round 4 (final / executive)

> Subject: Thanks for today
>
> Hi [Exec name],
>
> Thanks for the time. [One sentence on the strategic question they pushed on, with your read.] The combination of [thing about the org] and [thing about the role] is rare, and I'd be glad to do this work with this team. Standing by for next steps.
>
> Best,
> [Your name]

---

## Prep checklist (24h before each round)

- [ ] Reread the round's file in full
- [ ] Read company_research.md again
- [ ] Reread interview-notes-template.md and have a fresh copy ready
- [ ] Check news for the last 48 hours on the company
- [ ] Charge laptop / test camera / test mic
- [ ] Three questions ready for the interviewer
- [ ] Identify two stories that map to the top probable questions
- [ ] Decide what NOT to volunteer
`;

const notesTpl = (_ctx: TemplateContext): string => `# Interview Notes — [Company] · [Role]

> Copy this file into the prep folder for each round. Rename as \`round-1-notes.md\`, \`round-2-notes.md\`, etc. Fill in same-day — memory fades fast.

**Round:** [1 recruiter / 2 hiring manager / 3 technical panel / 4 final]
**Date:**
**Format:** [phone / video / in-person]
**Duration:**

---

## Interviewers

- **Name** — Role / title · [notes: e.g., seemed most technical, led the questions]
- **Name** — Role / title

---

## Questions they asked

Capture as many as you can remember, in rough order.

1.
2.
3.
4.
5.

---

## Questions that threw me

Where I stumbled, hesitated, or felt unsure. Highest-value entries for the next prep pass.

-
-

---

## Unexpected follow-ups

Where their follow-ups went somewhere I didn't expect.

-
-

---

## What they volunteered about the role / team / org

Anything not in the JD — priorities, challenges, team shape, culture, recent changes.

-
-

---

## What landed well

Moments where they nodded, built on my answer, or asked a positive follow-up. Stories and framings to keep using.

-
-

---

## What I'd say differently next time

-
-

---

## My gut read

Fill in the same day. Write it cold before processing it with anyone else.

- **Interest level after this round:**
- **Confidence about moving forward:**
- **Anything that gave me pause:**
`;

export const PREP_TEMPLATES: PrepTemplate[] = [
  { relPath: "00-overview.md", render: overviewTpl },
  { relPath: "01-round-1-recruiter-hr.md", render: round1Tpl },
  { relPath: "02-round-2-hiring-manager.md", render: round2Tpl },
  { relPath: "03-round-3-technical-panel.md", render: round3Tpl },
  { relPath: "04-round-4-final.md", render: round4Tpl },
  { relPath: "05-appendix.md", render: appendixTpl },
  { relPath: "interview-notes-template.md", render: notesTpl },
];
