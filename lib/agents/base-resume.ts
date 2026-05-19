import "server-only";
/**
 * Base-resume orchestrator. Drives the per-archetype generate ↔ HM-review
 * loop until the reviewer says "ready to submit" (or the stall cap fires).
 *
 * Phases:
 *   1. startBaseGeneration — spawns prompts/generate-base.md against the
 *      archetype's playbook subsection + style guide + about_user. Agent
 *      writes a Node script under _resumes/_build_<key>_base.js, runs it,
 *      produces _resumes/<key>_base.docx. On done → routeAfterBaseGeneration.
 *   2. startBaseReview — spawns prompts/base-review.md. Reviewer roleplays
 *      as median HM for the archetype's role family and emits a verdict
 *      (`ready_to_submit` / `needs_revision`). Feedback lands at
 *      `_resumes/.<key>_base_feedback.md` (overwrite) +
 *      `_resumes/.<key>_base_feedback_history.md` (append). On done →
 *      routeAfterBaseReview.
 *   3. routeAfterBaseReview decides:
 *        - ready_to_submit → set baseStatus='ready', baseResumePath, baseGeneratedAt.
 *        - needs_revision + pass < cap → redraft (back to step 1, with feedback).
 *        - needs_revision + pass >= cap → baseStatus='stalled'. User must
 *          intervene via acceptBaseAnyway() or resetBaseGeneration().
 *
 * State lives on the archetype JSON (baseStatus, baseReviewPass,
 * baseLatestRunId, baseLastFeedback, baseGeneratedAt) — no side table.
 *
 * Concurrency: this module is single-archetype. Generate-all parallelism
 * is enforced at the bulk endpoint via a worker pool (see
 * lib/jobs/bulk-paste.ts for the pattern this mirrors).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { INTERVIEWS_DIR, absWorkspace } from "../paths";
import {
  readArchetype,
  tryClaimBaseGeneration,
  updateArchetypeBaseState,
} from "../archetypes/store";
import { readArchetypePlaybookBody } from "../archetypes/scaffold";
import { loadPrompt } from "../prompt-template";
import { startRun, getRunSnapshot } from "../runs/broker";
import type { RunMetadata } from "../runs/types";

const GENERATION_TIMEOUT_MS = 12 * 60 * 1000;
const REVIEW_TIMEOUT_MS = 8 * 60 * 1000;

/** Maximum review passes before the loop is parked in `stalled` and the
 *  user has to decide Accept-anyway vs. Restart. Five was the agreed
 *  default — high enough to let the model genuinely converge on a hard
 *  archetype, low enough to avoid burning tokens forever. */
export const STALL_THRESHOLD = 5;

/* ------------------------- helpers ------------------------- */

async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function baseDocxRel(archetypeKey: string): string {
  return path.posix.join("_resumes", `${archetypeKey}_base.docx`);
}

function feedbackPath(archetypeKey: string): string {
  return absWorkspace(path.posix.join("_resumes", `.${archetypeKey}_base_feedback.md`));
}

function feedbackHistoryPath(archetypeKey: string): string {
  return absWorkspace(
    path.posix.join("_resumes", `.${archetypeKey}_base_feedback_history.md`),
  );
}

/* ------------------------- generation ------------------------- */

export type StartBaseGenerationInput = {
  archetypeKey: string;
  /** When kicking off a redraft after HM feedback, pass it through. */
  feedback?: string;
};

export type StartResult = { runId: string; meta: RunMetadata };

/**
 * Public entry — the one API routes and the bulk worker call. Performs
 * an atomic claim against the archetype's baseStatus; if a loop is
 * already running on this archetype, throws
 * `base_loop_already_running:<key>:<status>` so the caller can return a
 * sensible 409 to the UI. Used to be a single function with no guard,
 * which let two concurrent generate-all-bases invocations spawn
 * parallel loops on the same archetype (timed-out review runs then
 * clobbered the legitimate "ready" status).
 */
export async function startBaseGeneration(
  input: StartBaseGenerationInput,
): Promise<StartResult> {
  const previous = await tryClaimBaseGeneration(input.archetypeKey);
  if (previous === null) {
    const a = await readArchetype(input.archetypeKey);
    throw new Error(
      `base_loop_already_running:${input.archetypeKey}:${a?.baseStatus ?? "transient"}`,
    );
  }
  return spawnBaseGenerationRun(input);
}

/**
 * Internal spawn — used by the public entry above (after claim) and by
 * the orchestrator's needs_revision redraft path (where the archetype
 * is already in `reviewing` and we're deliberately transitioning to
 * `generating`). Skips the idle check on purpose.
 */
async function spawnBaseGenerationRun(
  input: StartBaseGenerationInput,
): Promise<StartResult> {
  const archetype = await readArchetype(input.archetypeKey);
  if (!archetype) throw new Error(`archetype_not_found:${input.archetypeKey}`);

  const playbookBody = (await readArchetypePlaybookBody(input.archetypeKey)) ?? "";

  const prompt = await loadPrompt("generate-base.md", {
    ARCHETYPE_KEY: archetype.key,
    ARCHETYPE_LABEL: archetype.label,
    ARCHETYPE_DESCRIPTION: archetype.description,
    ARCHETYPE_PLAYBOOK_BODY: playbookBody,
    ARCHETYPE_TAILORING_RULES: archetype.tailoringRules,
    FEEDBACK: input.feedback ?? "",
  });

  const { runId, meta, done } = await startRun({
    jobId: null,
    phase: "base_generation",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });

  await updateArchetypeBaseState(input.archetypeKey, {
    baseStatus: "generating",
    baseLatestRunId: runId,
  });

  done
    .then(async () => {
      await routeAfterBaseGeneration(input.archetypeKey, runId);
    })
    .catch(async (err) => {
      await updateArchetypeBaseState(input.archetypeKey, {
        baseStatus: "errored",
        baseLastFeedback: `generation exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterBaseGeneration(
  archetypeKey: string,
  runId: string,
): Promise<void> {
  // Verify the DOCX landed before kicking review. If the agent failed to
  // produce one we shouldn't waste a review pass on nothing.
  const docxRel = baseDocxRel(archetypeKey);
  const docxAbs = absWorkspace(docxRel);
  if (!(await fileExists(docxAbs))) {
    await updateArchetypeBaseState(archetypeKey, {
      baseStatus: "errored",
      baseLastFeedback: `base generation completed but ${docxRel} not on disk (runId ${runId})`,
    });
    return;
  }
  await startBaseReview(archetypeKey);
}

/* ------------------------- review ------------------------- */

export async function startBaseReview(archetypeKey: string): Promise<StartResult> {
  const archetype = await readArchetype(archetypeKey);
  if (!archetype) throw new Error(`archetype_not_found:${archetypeKey}`);

  const docxRel = baseDocxRel(archetypeKey);
  if (!(await fileExists(absWorkspace(docxRel)))) {
    throw new Error(`no_base_docx_to_review:${archetypeKey}`);
  }

  const playbookBody = (await readArchetypePlaybookBody(archetypeKey)) ?? "";
  const feedbackHistory = (await safeRead(feedbackHistoryPath(archetypeKey))) ?? "";

  const passNumber = (archetype.baseReviewPass || 0) + 1;

  const prompt = await loadPrompt("base-review.md", {
    ARCHETYPE_KEY: archetype.key,
    ARCHETYPE_LABEL: archetype.label,
    ARCHETYPE_DESCRIPTION: archetype.description,
    ARCHETYPE_PLAYBOOK_BODY: playbookBody,
    ARCHETYPE_TAILORING_RULES: archetype.tailoringRules,
    DOCX_REL_PATH: docxRel,
    PASS_NUMBER: String(passNumber),
    FEEDBACK_HISTORY: feedbackHistory,
    ISO_TIMESTAMP: new Date().toISOString(),
  });

  const { runId, meta, done } = await startRun({
    jobId: null,
    phase: "base_review",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: REVIEW_TIMEOUT_MS,
  });

  await updateArchetypeBaseState(archetypeKey, {
    baseStatus: "reviewing",
    baseReviewPass: passNumber,
    baseLatestRunId: runId,
  });

  done
    .then(async () => {
      await routeAfterBaseReview(archetypeKey, runId);
    })
    .catch(async (err) => {
      await updateArchetypeBaseState(archetypeKey, {
        baseStatus: "errored",
        baseLastFeedback: `review exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterBaseReview(
  archetypeKey: string,
  runId: string,
): Promise<void> {
  // Extract verdict from broker's structured payload first; fall back to
  // parsing the feedback file for the explicit verdict line.
  let verdict: "ready_to_submit" | "needs_revision" | null = null;

  const snap = getRunSnapshot(runId);
  const payload: any = snap?.meta.structuredPayload;
  if (payload?.verdict === "ready_to_submit" || payload?.verdict === "needs_revision") {
    verdict = payload.verdict;
  }

  const feedback = (await safeRead(feedbackPath(archetypeKey))) ?? "";
  if (!verdict && feedback) {
    // Strip markdown emphasis (*, _) before matching so the regex
    // tolerates `**Verdict:** ready to submit`, `_Verdict_: …`, etc.
    // The naive `\s*` between `:` and the value used to miss the
    // bold-form, which made stalled passes that didn't emit clean
    // structured JSON look "errored" even when the markdown was clear.
    const cleaned = feedback.replace(/[*_]+/g, "");
    if (/verdict\s*:\s*ready to submit/i.test(cleaned)) verdict = "ready_to_submit";
    else if (/verdict\s*:\s*needs revision/i.test(cleaned)) verdict = "needs_revision";
  }

  if (!verdict) {
    await updateArchetypeBaseState(archetypeKey, {
      baseStatus: "errored",
      baseLastFeedback:
        feedback || "review completed without a parseable verdict",
    });
    return;
  }

  if (verdict === "ready_to_submit") {
    await updateArchetypeBaseState(archetypeKey, {
      baseStatus: "ready",
      baseResumePath: baseDocxRel(archetypeKey),
      baseGeneratedAt: new Date().toISOString(),
      baseLastFeedback: feedback,
    });
    return;
  }

  // needs_revision — check stall cap, then either loop or park.
  const archetype = await readArchetype(archetypeKey);
  const passCount = archetype?.baseReviewPass ?? 0;

  if (passCount >= STALL_THRESHOLD) {
    await updateArchetypeBaseState(archetypeKey, {
      baseStatus: "stalled",
      baseLastFeedback: feedback,
    });
    return;
  }

  await updateArchetypeBaseState(archetypeKey, {
    baseLastFeedback: feedback,
  });

  // Loop: redraft with the latest feedback. Bypass the public idle
  // guard — we're deliberately transitioning from `reviewing` to
  // `generating` as part of the orchestrator's own state machine.
  await spawnBaseGenerationRun({ archetypeKey, feedback });
}

/* ------------------------- public manual overrides ------------------------- */

/**
 * User reviewed a stalled run's feedback and decided the resume is good
 * enough. Promote to ready without another generation pass. The last
 * HM feedback stays attached for the record.
 */
export async function acceptBaseAnyway(archetypeKey: string): Promise<void> {
  const archetype = await readArchetype(archetypeKey);
  if (!archetype) throw new Error(`archetype_not_found:${archetypeKey}`);

  const docxRel = baseDocxRel(archetypeKey);
  if (!(await fileExists(absWorkspace(docxRel)))) {
    throw new Error(`no_base_docx_to_accept:${archetypeKey}`);
  }

  await updateArchetypeBaseState(archetypeKey, {
    baseStatus: "ready",
    baseResumePath: docxRel,
    baseGeneratedAt: new Date().toISOString(),
  });
}

/**
 * Reset the loop state so the user can re-trigger generation cleanly.
 * Does NOT delete the DOCX on disk (preserved in case it's still useful
 * as a fallback) — only clears the loop pointers + status. The next
 * startBaseGeneration call will overwrite the DOCX anyway.
 */
export async function resetBaseGeneration(archetypeKey: string): Promise<void> {
  const archetype = await readArchetype(archetypeKey);
  if (!archetype) throw new Error(`archetype_not_found:${archetypeKey}`);
  await updateArchetypeBaseState(archetypeKey, {
    baseStatus: "none",
    baseReviewPass: 0,
    baseLatestRunId: null,
    baseLastFeedback: "",
  });
}
