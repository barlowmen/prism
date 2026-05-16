# Setting up prism

This walks you through a clean install plus the first-time setup of your
workspace. If you're migrating from an existing manual job-application
workflow, see **§4 — Migrating an existing workspace** at the bottom.

---

## 1. Install Claude Code

Follow Anthropic's docs to install the Claude Code CLI:
https://docs.claude.com/en/docs/claude-code/setup

Authenticate it with your **Pro or Max** subscription. **Do not set
`ANTHROPIC_API_KEY`** in your shell — if you have one set, either unset
it or accept that prism will scrub it from the subprocess env (the
launcher does this unconditionally so subscription quota wins).

Verify:
```bash
claude --version          # should print a version number
which claude              # should resolve to a real path
```

---

## 2. Clone and install prism

```bash
git clone https://github.com/<you>/prism
cd prism
npm install
```

---

## 3. Configure the workspace path

prism keeps your data (profile, resumes, per-application folders, state)
in a **workspace directory** that lives outside the repo. Pick a location
and tell prism about it.

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
PRISM_WORKSPACE=/Users/you/prism-workspace
```

Then create the directory and its top-level scaffolding:
```bash
mkdir -p "$HOME/prism-workspace/_meta" \
         "$HOME/prism-workspace/_resumes" \
         "$HOME/prism-workspace/apps" \
         "$HOME/prism-workspace/postings"
```

(`.state/` is created on demand.)

---

## 4. Start the server

```bash
./server.sh start
# logs in .server.log
open http://127.0.0.1:3737
```

The server binds to `127.0.0.1` (loopback only). It is not reachable from
the network.

You can also run `./server.sh {stop|restart|status|logs}`.

---

## 5. First-time use — build your profile

Visiting `http://127.0.0.1:3737/` on a fresh install redirects you to
**Profile Interview** because `_meta/about_user.md` is missing.

The profile is structured into 12 sections (objectives, narrative,
experience, skill depth, education, public footprint, filters, tailoring,
red lines, lessons, open items, plus a quick-read summary generated last).
Each section is its own focused interview — chat on the left, draft on
the right — and only commits to `about_user.md` when you click **Commit**.

Recommended order:

1. **objectives** — what you target, what's off-limits, comp floor.
2. **narrative** — the one-line story and differentiating thesis.
3. **experience** — per-role facts, the longest section. This is the
   source of every resume bullet, so be thorough.
4. **skill_depth** — the four-tier honesty map (can claim with depth /
   at prototype / as direction / cannot claim).
5. **education**, **public_footprint**, **filters**, **red_lines**,
   **tailoring**, **lessons**, **open_items** — in any order.
6. **quick_read** — last. Its prompt synthesizes from the other
   committed sections.

Each commit replaces just that one H2 section in `about_user.md`
atomically; the previous version is backed up under
`_meta/.prism-backups/`.

---

## 6. Set up archetypes

An **archetype** is a base resume DOCX plus matching hints describing
when the dispatcher should pick it for a job. Most users want 1–3:

- An **AI-focused** base — for AI/ML platform leadership roles, frontier
  labs, AI consulting.
- A **traditional infra** base — for cloud platform / SRE / DevOps
  leadership roles where AI is at most adjacent.
- Optionally a **PM-shaped** base if you're targeting product roles.

Visit **Archetypes** in the nav. For each:
1. Click **New archetype**, give it a label and key (e.g. `ai`, `cloud`).
2. Open it. Upload your starter DOCX (the agent will tailor from this
   per job).
3. Fill in **Matching hints** — markdown describing JD signals that
   should route a posting here. The dispatcher reads this verbatim.

You can also use `interviews/_meta/` style legacy resumes in
`_resumes/Foo_AI.docx` etc.; the file path is configurable per archetype.

---

## 7. Paste your first job

From the dashboard, **Paste a job** (top-right). Paste the URL. The
dispatcher fetches the JD, picks your archetype, classifies, and either
auto-progresses to research → draft → HM review → provenance, or asks
you a clarifying question.

The whole chain runs on subscription quota. Token totals are visible per
run on the **Runs** page.

---

## 8. Optional: discovery agent

**Run discovery** (top-right of dashboard) scans Greenhouse / Lever /
Ashby boards plus HackerNews "Who is hiring" and the YC board, filters
against your profile, and produces a shortlist of up to 25 candidates.
This is the most experimental layer — if scoring quality is mediocre,
you can ignore it and rely on **Paste a job**.

---

## §4. Migrating an existing workspace

If you already have an `interviews/` directory from the manual workflow
that pre-dates prism:

1. **Point `PRISM_WORKSPACE` at it** instead of creating a new directory.
2. **Rename `_meta/about_john.md` → `_meta/about_user.md`** (or whatever
   `<your_name>.md` was). The Truth Base editor and every agent reads
   `about_user.md` only.
3. **Seed archetypes from your existing `_resumes/`**: on the Archetypes
   page click "Seed from existing `_resumes/`" — if your DOCXes are
   named `*_AI.docx` / `*_Cloud.docx`, prism creates `ai` and `cloud`
   archetypes pointing at them. Otherwise create them manually.
4. **Import existing per-application folders**: on the dashboard, the
   import banner offers to scan `apps/` and create a tracked Job for
   each folder, with a reclassify suggestion based on file presence.

The existing CLI-driven workflow (`claude` from a terminal pointing at
the workspace) continues to work in parallel — prism writes to the same
files in the same formats.

---

## Troubleshooting

- **Dev server fails to start.** Check `.server.log`. Common causes:
  port 3737 already in use (try `./server.sh stop; ./server.sh start`),
  or `.env.local` pointing at a path that doesn't exist.
- **Health page shows `apiKeySource ≠ none`.** You're authenticated to
  the Anthropic API, not the subscription. Run `claude logout` then
  `claude login` and sign in with your Pro/Max account.
- **Dispatcher run says "user declined the edit".** You're on an older
  prism that's missing `--permission-mode acceptEdits`. Pull latest.
- **Profile Interview chat doesn't stream.** Check the **Runs** page for
  the underlying agent run. If the run failed, the error is in
  `interviews/.state/runs/<runId>.log`.
