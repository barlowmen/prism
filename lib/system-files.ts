import "server-only";
/**
 * Seed prism-managed system files into the workspace on first need.
 *
 * Two groups of files get seeded:
 *
 *   Under <workspace>/_meta/ — agent-facing reference docs:
 *     - workflow.md                  — pipeline spec (NOT user-editable)
 *     - resume_style_guide_2026.md   — style/ATS/voice rules (user-editable)
 *     - build_resume_template.js     — DOCX builder template (NOT user-editable)
 *     - read_docx.js                 — zero-dep DOCX→text reader the review
 *                                       agents run via `node` (pre-approved)
 *
 *   Under <workspace>/.claude/ — Claude Code project settings:
 *     - settings.json                — pre-approves `node` so the first
 *                                       base-resume / per-job draft run
 *                                       doesn't hit the cold permission
 *                                       gate (headless mode has no UI to
 *                                       approve, so the prompt times out
 *                                       and the build script never runs).
 *
 * The canonical defaults ship with the prism repo at <repo>/defaults/.
 * On the first agent invocation in a workspace, ensureSystemFiles() copies
 * any missing default into the workspace. Existing files are left alone —
 * users who've customized their copy keep it.
 *
 * Hook point: lib/runs/broker.ts:startRun() calls this before spawning the
 * Claude Code subprocess. The cost is one stat per file per run; negligible.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { META_DIR, WORKSPACE_DIR } from "./paths";

type SystemFile = {
  /** Absolute path the file should land at on disk. */
  targetAbsPath: string;
  /** Filename under <repo>/defaults/. */
  defaultName: string;
  /** Friendly label for log lines. */
  label: string;
};

const DEFAULTS_DIR = path.join(process.cwd(), "defaults");

const SYSTEM_FILES: SystemFile[] = [
  {
    targetAbsPath: path.join(META_DIR, "workflow.md"),
    defaultName: "workflow.md",
    label: "_meta/workflow.md",
  },
  {
    targetAbsPath: path.join(META_DIR, "resume_style_guide_2026.md"),
    defaultName: "resume_style_guide_2026.md",
    label: "_meta/resume_style_guide_2026.md",
  },
  {
    targetAbsPath: path.join(META_DIR, "build_resume_template.js"),
    defaultName: "build_resume_template.js",
    label: "_meta/build_resume_template.js",
  },
  {
    // Zero-dep DOCX→text reader the review agents shell out to via
    // `node _meta/read_docx.js <docx>`. Pre-approved by Bash(node:*),
    // so it sidesteps the headless permission gate that was denying the
    // agents' unzip/python attempts and stalling jobs in hm_review.
    targetAbsPath: path.join(META_DIR, "read_docx.js"),
    defaultName: "read_docx.js",
    label: "_meta/read_docx.js",
  },
  {
    targetAbsPath: path.join(WORKSPACE_DIR, ".claude", "settings.json"),
    defaultName: "claude-workspace-settings.json",
    label: ".claude/settings.json",
  },
];

let cachedRun: Promise<void> | null = null;

/**
 * Idempotent: safe to call on every agent run. Resolved promise is cached
 * so concurrent run starts share a single fs walk.
 */
export function ensureSystemFiles(): Promise<void> {
  if (!cachedRun) {
    cachedRun = seedMissing().catch((err) => {
      // Reset the cache on failure so the next call retries.
      cachedRun = null;
      throw err;
    });
  }
  return cachedRun;
}

async function seedMissing(): Promise<void> {
  for (const f of SYSTEM_FILES) {
    let exists = false;
    try {
      await fs.stat(f.targetAbsPath);
      exists = true;
    } catch {}
    if (exists) continue;
    try {
      const content = await fs.readFile(path.join(DEFAULTS_DIR, f.defaultName), "utf8");
      await fs.mkdir(path.dirname(f.targetAbsPath), { recursive: true });
      await fs.writeFile(f.targetAbsPath, content, "utf8");
    } catch (err: any) {
      // Don't fail the run if a default is missing from the repo — log
      // and continue. Worst case: the agent reads an empty/missing file
      // and the user sees a useful error, which is recoverable.
      console.warn(
        `[system-files] failed to seed ${f.label} from ${f.defaultName}:`,
        String(err?.message ?? err),
      );
    }
  }
}
