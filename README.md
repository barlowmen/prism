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

1. You **paste a job posting URL** (or run discovery against ATS boards).
2. A **dispatcher agent** fetches the JD, picks one of your *archetypes*
   (e.g. AI-leaning vs cloud-infra-leaning), and decides GO /
   NEEDS-DISCUSSION / RECOMMEND-SKIP based on your profile's filter rules.
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
git clone https://github.com/<you>/prism
cd prism
npm install

# 2. Point prism at a workspace directory (defaults to ~/prism-workspace)
cp .env.example .env.local
# edit .env.local — PRISM_WORKSPACE=/path/to/your/workspace
mkdir -p $(grep PRISM_WORKSPACE .env.local | cut -d= -f2)

# 3. Start the server
./server.sh start
# open http://127.0.0.1:3737
```

First visit redirects you to **Profile** to do the structured intake interview
that builds `_meta/about_user.md`. Once you have a few sections committed,
set up at least one **Archetype** (a base resume DOCX + matching hints) and
you're ready to paste your first job.

See [SETUP.md](./SETUP.md) for the full first-time setup walkthrough,
including how to migrate an existing workflow into prism.

---

## How it's organized

```
prism/                     # this repo — the orchestrator
  app/                     # Next.js routes
  components/              # React components
  lib/                     # server-side libs (launcher, jobs, profile, archetypes, …)
  prompts/                 # Claude Code prompt templates per phase
  server.sh                # start|stop|restart|status|logs

<your workspace>/          # data, configured via PRISM_WORKSPACE
  _meta/
    about_user.md          # your profile — the source of truth
    archetypes/<key>.json  # one config per base-resume archetype
    resume_style_guide_2026.md
    workflow.md
  _resumes/                # base resume DOCXes (one per archetype)
  apps/<Company>/<Role>/   # per-application folder: JD, research, draft, feedback
  postings/                # discovery output (job_postings_YYYY-MM-DD.md)
  .state/                  # prism's structured state (jobs, runs, profile, assistant)
```

The workspace is intentionally separate from this repo so your resume
data, JDs, and notes never sit inside the codebase.

---

## Why subscription, not API

As of April 2026, Anthropic explicitly cut subscription-quota access for
third-party tools. Pro/Max quota is reachable only from **Claude Code CLI,
claude.ai, Claude Desktop, and Cowork**. Any backend that calls the
Anthropic API directly is billed per-token regardless of subscription.

So prism's launcher (`lib/claude-launcher.ts`) is the only place in the
codebase that touches Claude. It spawns `claude` as a subprocess with
`--print --output-format=stream-json --verbose --permission-mode acceptEdits`,
deletes `ANTHROPIC_API_KEY` from the subprocess env, and parses
stream-json events into per-event records the UI streams via SSE.

The `apiKeySource: "none"` value in each run's metadata is the canary —
if it ever flips to anything else, the Health page surfaces a yellow
banner.

---

## License

MIT. See [LICENSE](./LICENSE).
