# prism

Local control surface for a job-application workflow built around Claude Code.
One source of truth — your profile — refracted into many tailored resumes,
one per role you apply to.

You run it on your own machine. All agent work goes through the Claude Code
CLI as a subprocess, so it uses your Pro/Max subscription quota rather than
the per-token Anthropic API. The web UI is the orchestrator; Claude Code is
the engine.

---

## What it does

0. *(Setup, once.)* You scaffold *archetypes* (AI-leaning, cloud-infra-leaning,
   etc.) from your profile's tailoring playbook, then click **Generate all
   bases** — a base-resume agent drafts a long-form resume per archetype,
   reviewed by a median-HM agent in a loop until it passes the bar.
1. You **paste a job posting URL** — or paste a list of 10+ URLs at
   once in bulk mode — or run discovery against ATS boards.
2. A **dispatcher agent** fetches the JD, picks the right archetype
   for the posting, and decides GO / NEEDS-DISCUSSION / RECOMMEND-SKIP
   based on your profile's filter rules.
3. Three **research agents** run in parallel: JD analysis, company
   research, archetype-specific tailoring playbook.
4. A **drafting agent** writes a tailored Node script (`docx` library) and
   runs it to produce a real Word DOCX based on your chosen archetype's
   base resume.
5. A **hiring-manager review agent** roleplays as the actual HM for that
   posting and iterates the resume until it's ready.
6. A **provenance agent** audits every bullet against your profile — no
   invented numbers, no claims that cross your honesty red lines.
7. You **review the final DOCX** in-browser (mammoth render) and submit
   externally.

Throughout: a context-aware assistant (⌘J) sees what you're looking at
and can drive the workflow, answer questions, and edit files.

---

## Requirements

- **macOS** (Linux probably works; not tested).
- **Node 22+** and npm.
- **[Claude Code CLI](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview)** installed and authenticated to your **Pro or Max subscription**
  (not an API key). Verify with `claude --version`. If `ANTHROPIC_API_KEY`
  is set in your shell, prism unsets it for every subprocess so subscription
  auth is forced.

---

## Quick start

```bash
# 1. Install
git clone https://github.com/barlowmen/prism
cd prism
npm install

# 2. Point prism at a workspace directory (defaults to ~/prism-workspace)
cp .env.example .env.local
# edit .env.local — PRISM_WORKSPACE=/path/to/your/workspace
mkdir -p $(grep PRISM_WORKSPACE .env.local | cut -d= -f2)

# 3. Start the server (production by default — builds, then runs)
./server.sh start
# open http://127.0.0.1:3737
#
# For active development with HMR + on-demand compile:
#   ./server.sh start --dev   (or: ./server.sh dev)
```

First visit redirects you to **Profile** to do the structured intake interview
that builds `_meta/about_user.md`. Once you have a few sections committed,
set up at least one **Archetype** (a base resume DOCX + matching hints) and
you're ready to paste your first job.

See [SETUP.md](./SETUP.md) for the full first-time setup walkthrough.

---

## How it's organized

```
prism/                     # this repo — the orchestrator
  app/                     # Next.js routes
  components/              # React components
  lib/                     # server-side libs (launcher, jobs, profile, archetypes, …)
  prompts/                 # Claude Code prompt templates per phase
  defaults/                # shipped defaults seeded into workspace on first run
  server.sh                # start|stop|restart|status|logs

<your workspace>/          # data, configured via PRISM_WORKSPACE
  _meta/
    about_user.md              # your profile — the source of truth (you own)
    archetypes/<key>.json      # one config per base-resume archetype (you own)
    resume_style_guide_2026.md # style/ATS/voice rules (seeded; you can edit)
    workflow.md                # pipeline spec / agent contract (prism-managed)
    build_resume_template.js   # DOCX builder template (prism-managed)
  _resumes/                # base resume DOCXes (one per archetype)
  apps/<Company>/<Role>/   # per-application folder: JD, research, draft, feedback
  postings/                # discovery output (job_postings_YYYY-MM-DD.md)
  .state/                  # prism's structured state (jobs, runs, profile, assistant)
```

The workspace is intentionally separate from this repo so your resume
data, JDs, and notes never sit inside the codebase.

---

## Why subscription, not API

In April 2026 Anthropic cut subscription-quota access for third-party
tools and harnesses; the policy was revised in May/June with a split
billing model. The current state is that Anthropic's *first-party*
tools — Claude Code CLI, claude.ai, Claude Desktop — still use your
full Pro/Max subscription quota, while third-party agents and SDK
callers get a separate, much smaller monthly credit pool billed at
API rates. Backends that call the Anthropic API directly are billed
per-token regardless of subscription. See:

- [Anthropic cuts off the ability to use Claude subscriptions with OpenCode and third-party AI agents](https://venturebeat.com/technology/anthropic-cuts-off-the-ability-to-use-claude-subscriptions-with-openclaw-and) — VentureBeat, April 2026 (initial cut)
- [Anthropic reinstates OpenCode and third-party agent usage on Claude subscriptions — with a catch](https://venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch) — VentureBeat (the split-billing reversal)
- [Anthropic tosses agents into the API billing pool](https://www.theregister.com/ai-ml/2026/05/14/anthropic-tosses-agents-into-the-api-billing-pool/5240748) — The Register, May 2026
- [Anthropic blocks third-party use of Claude Code subscriptions](https://news.ycombinator.com/item?id=46549823) — Hacker News discussion

That's why prism's launcher (`lib/claude-launcher.ts`) is the only
place in the codebase that touches Claude. It spawns `claude` as a
subprocess with `--print --output-format=stream-json --verbose
--permission-mode acceptEdits`, deletes `ANTHROPIC_API_KEY` from the
subprocess env, and parses stream-json events into per-event records
the UI streams via SSE.

The `apiKeySource: "none"` value in each run's metadata is the canary —
if it ever flips to anything else, the Health page surfaces a yellow
banner.

---

## License

MIT. See [LICENSE](./LICENSE).
