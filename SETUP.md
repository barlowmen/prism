# Setting up prism

This walks you through a clean install plus the first-time setup of your
workspace.

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
git clone https://github.com/barlowmen/prism
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
# default is production mode: builds, then runs `next start`. Idle CPU
# is essentially zero. First start takes ~30s for the build.
#
# For active development with HMR + on-demand compile (heavier CPU):
#   ./server.sh start --dev    (or: ./server.sh dev)
#
# logs in .server.log
open http://127.0.0.1:3737
```

The server binds to `127.0.0.1` (loopback only). It is not reachable from
the network.

You can also run `./server.sh {stop|restart|status|logs}`. `restart`
defaults to prod just like `start`; pass `--dev` if you want dev mode.

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

### Recommended: scaffold from your profile

If you completed the **Tailoring playbook by archetype** section in
the Profile Interview (one `### X. Label` subsection per target type),
prism can auto-create archetype JSON records from those.

Visit **Settings → Archetypes**. If the page detects un-scaffolded
archetypes in your profile, an amber callout offers a **Scaffold from
profile** primary button. Click it: prism creates one JSON record per
playbook subsection, with `label`, `description`, and `matchingHints`
pre-filled from your profile prose. Your `about_user.md` is read-only —
nothing in it gets changed. Existing archetype records are left alone
(idempotent — safe to re-run).

After scaffolding, open each archetype and:
1. **Upload a base resume DOCX** — or *generate one automatically* (see
   the next subsection). Either way, the file lands in
   `<workspace>/_resumes/`. The draft agent starts from this DOCX and
   tailors it per job.
2. *(Optional)* Refine the **Matching hints** — the auto-generated
   block is a starter. Add specific company names, role keywords, JD
   phrases that should route to this archetype.
3. *(Optional)* Fill **Tailoring rules** — archetype-specific deltas
   the draft agent reads on top of `about_user.md`. Usually unnecessary
   if your profile's playbook already covers tailoring per archetype.

### Generate base resumes

After scaffolding, the Archetypes page shows an accent **Generate all
bases** button at the top. Click it: prism spawns a Claude Code agent
per archetype that drafts a long-form base resume from
`about_user.md` + the archetype's tailoring-playbook entry, then runs
an HM review loop (up to 5 passes) against the median hiring-manager
bar for that archetype's role family. Default concurrency is 2
archetypes in flight at a time (max 5).

Each archetype card flips through `drafting → HM review → drafting`
(if revisions are needed) until it lands on a green check `ready`
state, typically within 3–5 minutes. The banner refreshes every 5
seconds while runs are active.

If a loop stalls after 5 passes, the card surfaces **Accept anyway**
(promote the latest draft as-is) and **Restart** (clear state and try
again) so you can intervene. You can also click **Generate base
resume** on an individual archetype's edit page to run it one at a
time — useful for re-generating a specific archetype after editing
its tailoring rules.

These bases are the long-form "as-applied-to-this-archetype"
versions. The per-job dispatcher and draft agents (see workflow.md
§0 and §4) start from them and tailor down per posting.

### Manual route

If you'd rather create archetypes by hand (or your profile doesn't yet
have a tailoring playbook section), click **New archetype** instead.
Give it a label and key (e.g. `ai`, `cloud`), upload the base DOCX,
fill in matching hints, save. Repeat per archetype.

---

## 7. Paste your first job

From the dashboard, **Paste a job** (top-right). Paste the URL. The
dispatcher fetches the JD, picks your archetype, classifies, and either
auto-progresses to research → draft → HM review → provenance, or asks
you a clarifying question.

Have a list of postings? Flip the modal's **Single / Bulk** toggle to
paste many URLs at once (one per line; `#` comments and blank lines
ignored). A concurrency dropdown caps how many dispatchers run in
parallel — default 2, max 5. The modal returns a summary table linking
to each new job's detail page, and the runs continue in the background.

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
  `<your_workspace>/.state/runs/<runId>.log`.
