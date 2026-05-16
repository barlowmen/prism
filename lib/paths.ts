import path from "node:path";
import os from "node:os";

/**
 * Workspace path resolution.
 *
 * Priority:
 *   1. `PRISM_WORKSPACE` env var (set in `.env.local`)
 *   2. `<repo>/../workspace` if it exists at startup (zero-config dev pattern)
 *   3. `~/prism-workspace`
 *
 * The workspace is the directory that holds `_meta/`, `_resumes/`,
 * `apps/`, `postings/`, and `.state/`. It is intentionally separate
 * from this repo so user data (resumes, JDs, notes) never sits inside
 * the codebase.
 */
function resolveWorkspaceDir(): string {
  const fromEnv = process.env.PRISM_WORKSPACE;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim());
  }
  return path.join(os.homedir(), "prism-workspace");
}

export const WORKSPACE_DIR = resolveWorkspaceDir();

/** Back-compat alias. Code should prefer WORKSPACE_DIR going forward. */
export const INTERVIEWS_DIR = WORKSPACE_DIR;

export const META_DIR = path.join(WORKSPACE_DIR, "_meta");
export const RESUMES_DIR = path.join(WORKSPACE_DIR, "_resumes");
export const APPS_DIR = path.join(WORKSPACE_DIR, "apps");
export const POSTINGS_DIR = path.join(WORKSPACE_DIR, "postings");
export const PREP_DIR = path.join(WORKSPACE_DIR, "prep");
export const STATE_DIR = path.join(WORKSPACE_DIR, ".state");

/**
 * Allowlist of editable Truth Base files. Keyed by short slug used in URLs.
 * Editing any file outside this list is rejected by the API.
 */
export const TRUTH_BASE_FILES = {
  about_user: {
    relPath: "_meta/about_user.md",
    title: "About (you)",
    description: "Source of truth: career objectives, accomplishments, honesty boundaries.",
  },
  style_guide: {
    relPath: "_meta/resume_style_guide_2026.md",
    title: "Resume Style Guide 2026",
    description: "Format, ATS rules, font choices, length-per-archetype.",
  },
  workflow: {
    relPath: "_meta/workflow.md",
    title: "Workflow",
    description: "End-to-end pipeline. Read by every agent on cold-start.",
  },
} as const;

export type TruthBaseSlug = keyof typeof TRUTH_BASE_FILES;

/** Path (workspace-relative) of the canonical about-the-user file. */
export const ABOUT_USER_REL_PATH = TRUTH_BASE_FILES.about_user.relPath;

export function absWorkspace(relPath: string): string {
  return path.join(WORKSPACE_DIR, relPath);
}

/** Back-compat alias. */
export const absInterviews = absWorkspace;
