import "server-only";
import path from "node:path";
import { APPS_DIR, INTERVIEWS_DIR, PREP_DIR } from "../paths";
import { loadPrompt } from "../prompt-template";
import { startRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import { bootstrapPrep } from "./bootstrap";
import { findPrimaryRoleFolder } from "./store";

const PREP_BUILDER_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Spawn the prep-builder agent for one company. Bootstraps the prep
 * folder first if needed so the agent has a scaffold to refine.
 *
 * Returns the runId immediately. The UI subscribes to the run's SSE
 * stream to show live progress.
 */
export async function startPrepBuilder(company: string): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  // Bootstrap is idempotent. Ensures the scaffold exists so the agent
  // edits real files instead of having to create them from scratch.
  await bootstrapPrep(company);

  const primary = await findPrimaryRoleFolder(company);
  if (!primary) {
    throw new Error(
      `no_apps_folder:${company} — paste the job first so research/* is available`,
    );
  }

  const appFolderRel = path.relative(INTERVIEWS_DIR, primary.absPath);
  const prepFolderRel = path.relative(
    INTERVIEWS_DIR,
    path.join(PREP_DIR, company),
  );

  const prompt = await loadPrompt("prep-builder.md", {
    COMPANY: company,
    APP_FOLDER_REL: appFolderRel,
    PREP_FOLDER_REL: prepFolderRel,
  });

  const { runId, meta } = startRun({
    jobId: null,
    phase: "prep_builder",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: PREP_BUILDER_TIMEOUT_MS,
  });

  return { runId, meta };
}

/** Verify the company has at least an apps/ scaffold or a prep/ scaffold. */
export async function companyKnown(company: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  for (const dir of [
    path.join(APPS_DIR, company),
    path.join(PREP_DIR, company),
  ]) {
    try {
      await fs.stat(dir);
      return true;
    } catch {}
  }
  return false;
}
