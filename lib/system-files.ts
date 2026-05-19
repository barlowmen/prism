import "server-only";
/**
 * Seed prism-managed system files into the workspace on first need.
 *
 * Three files agents depend on every run live under <workspace>/_meta/:
 *   - workflow.md                  — pipeline spec, agent contract (NOT user-editable)
 *   - resume_style_guide_2026.md   — style/ATS/voice rules (user-editable)
 *   - build_resume_template.js     — DOCX builder template (NOT user-editable)
 *
 * The canonical defaults ship with the prism repo at <repo>/defaults/.
 * On the first agent invocation in a workspace, ensureSystemFiles() copies
 * any missing default into <workspace>/_meta/. Existing files are left
 * alone — users who've customized their copy keep it.
 *
 * Hook point: lib/runs/broker.ts:startRun() calls this before spawning the
 * Claude Code subprocess. The cost is one stat per file per run; negligible.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { META_DIR } from "./paths";

type SystemFile = {
  /** Relative path under META_DIR. */
  relPath: string;
  /** Filename under <repo>/defaults/. */
  defaultName: string;
};

const SYSTEM_FILES: SystemFile[] = [
  { relPath: "workflow.md", defaultName: "workflow.md" },
  { relPath: "resume_style_guide_2026.md", defaultName: "resume_style_guide_2026.md" },
  { relPath: "build_resume_template.js", defaultName: "build_resume_template.js" },
];

const DEFAULTS_DIR = path.join(process.cwd(), "defaults");

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
  await fs.mkdir(META_DIR, { recursive: true });
  for (const f of SYSTEM_FILES) {
    const targetPath = path.join(META_DIR, f.relPath);
    const sourcePath = path.join(DEFAULTS_DIR, f.defaultName);
    let exists = false;
    try {
      await fs.stat(targetPath);
      exists = true;
    } catch {}
    if (exists) continue;
    try {
      const content = await fs.readFile(sourcePath, "utf8");
      await fs.writeFile(targetPath, content, "utf8");
    } catch (err: any) {
      // Don't fail the run if a default is missing from the repo — log
      // and continue. Worst case: the agent reads an empty/missing file
      // and the user sees a useful error, which is recoverable.
      console.warn(
        `[system-files] failed to seed ${f.relPath} from ${f.defaultName}:`,
        String(err?.message ?? err),
      );
    }
  }
}
