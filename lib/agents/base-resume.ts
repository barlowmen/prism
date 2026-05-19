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
import { startRun, getRunSnapshot, cancelRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";

const GENERATION_TIMEOUT_MS = 12 * 60 * 1000;
// Matches GENERATION_TIMEOUT_MS. Reviews legitimately run 5-8 min on
// dense archetypes (median HM reads the DOCX bytes + about_user +
// playbook subsection + style guide before scoring); the previous 8 min
// cap was tight enough that pass 3 of IC architect ran 7m53s and pass 4
// timed out at exactly 8m00s, then the orchestrator's verdict-parse
// fallback misread the prior pass's bold "**Verdict:** ready to submit"
// and clobbered the legitimate `ready` status as `errored`. Giving
// reviews the same headroom as drafts removes the false-timeout risk.
const REVIEW_TIMEOUT_MS = 12 * 60 * 1000;

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
  // If the user cancelled or restarted before this run finished, the
  // archetype's baseLatestRunId no longer points at this run. Skip the
  // routing so we don't clobber the state the cancel/reset endpoint
  // just wrote.
  if (await runStale(archetypeKey, runId)) return;
  // Verify the DOCX landed before kicking review. If the agent failed to
  // produce one we shouldn't waste a review pass on nothing.
  const docxRel = baseDocxRel(archetypeKey);
  const docxAbs = absWorkspace(docxRel);
  if (!(await fileExists(docxAbs))) {
    // Before falling through to the generic "not on disk" error, see if
    // Claude Code told us a tool was denied. The single biggest cause of
    // "completed but no DOCX" was the cold-permission gate on
    // `Bash(node:*)` — surface that as an actionable message instead of
    // making the user dig through .state/runs/<runId>.log.
    const snap = getRunSnapshot(runId);
    const denials = snap?.meta.permissionDenials ?? [];
    const message = denials.length
      ? formatDenialMessage(denials, docxRel, runId)
      : `base generation completed but ${docxRel} not on disk (runId ${runId})`;
    await updateArchetypeBaseState(archetypeKey, {
      baseStatus: "errored",
      baseLastFeedback: message,
    });
    return;
  }
  await startBaseReview(archetypeKey);
}

function formatDenialMessage(
  denials: Array<{ toolName: string; command?: string }>,
  docxRel: string,
  runId: string,
): string {
  const tools = Array.from(new Set(denials.map((d) => d.toolName)));
  const example = denials.find((d) => d.command)?.command;
  const exampleTail = example ? ` (e.g. \`${example.slice(0, 100)}\`)` : "";
  return (
    `Base generation couldn't produce ${docxRel} because the agent was ` +
    `denied ${denials.length} tool call${denials.length === 1 ? "" : "s"} ` +
    `(${tools.join(", ")})${exampleTail}. ` +
    `Check \`<workspace>/.claude/settings.json\` — prism seeds it with ` +
    `\`Bash(node:*)\`, \`WebSearch\`, and \`WebFetch\` by default. If the ` +
    `file was hand-edited, the missing allow rule explains this failure. ` +
    `Restart the server to re-seed defaults, then click Restart on this ` +
    `archetype. Full run log: \`.state/runs/${runId}.log\`.`
  );
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
  // Same staleness guard as routeAfterBaseGeneration — if the user
  // cancelled or restarted before this review finished, don't overwrite
  // their decision.
  if (await runStale(archetypeKey, runId)) return;
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

/**
 * True if the archetype's latest run pointer has moved on since this
 * `runId` was spawned — meaning the user cancelled, restarted, or
 * otherwise advanced state. Used by the routeAfter handlers to avoid
 * clobbering whatever state the cancel/reset endpoint just wrote.
 */
async function runStale(archetypeKey: string, runId: string): Promise<boolean> {
  const a = await readArchetype(archetypeKey);
  if (!a) return true;
  if (!a.baseLatestRunId) return true;
  return a.baseLatestRunId !== runId;
}

/* ------------------------- public manual overrides ------------------------- */

/**
 * User clicked Cancel on a transient (generating / reviewing)
 * archetype. Kill the underlying Claude Code subprocess via the broker,
 * then write archetype state back to `none` with a note. The
 * orchestrator's done-handlers will fire on the killed subprocess but
 * `runStale` will see baseLatestRunId has been cleared and skip the
 * routing — so the cancel decision sticks.
 */
export async function cancelBaseGeneration(archetypeKey: string): Promise<void> {
  const archetype = await readArchetype(archetypeKey);
  if (!archetype) throw new Error(`archetype_not_found:${archetypeKey}`);
  const runId = archetype.baseLatestRunId;
  if (!runId) {
    // Nothing in flight — quietly normalize state.
    await updateArchetypeBaseState(archetypeKey, { baseStatus: "none" });
    return;
  }
  await cancelRun(runId).catch(() => {});
  await updateArchetypeBaseState(archetypeKey, {
    baseStatus: "none",
    baseLatestRunId: null,
    baseReviewPass: 0,
    baseLastFeedback: `cancelled by user (runId ${runId.slice(0, 8)})`,
  });
}

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
