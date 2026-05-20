import "server-only";
/**
 * Three orchestrated agent phases that run after the dispatcher
 * decides GO:
 *
 *   1. startResearch    — three parallel research subagents (JD analysis,
 *                         company research, resume examples) writing
 *                         into <folder>/research/. Auto-progresses to
 *                         draft when done.
 *   2. startDraft       — drafting agent: writes a tailored Node script
 *                         that uses the docx library to build the final
 *                         resume DOCX, runs it, leaves the DOCX in the
 *                         per-app folder root. Optional feedback is
 *                         baked in (HM-review loop, user-requested
 *                         changes, provenance fix).
 *   3. startHmReview    — hiring-manager review agent: roleplays as the
 *                         actual hiring manager. Writes feedback.md
 *                         (overwrite) + appends to feedback_history.md.
 *                         Loops with redraftWithFeedback() until the
 *                         agent says "ready to submit" or the user
 *                         intervenes.
 *
 * Each phase updates the job's status + statusHistory through updateJob.
 * Status transitions are documented in workflow.md.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { INTERVIEWS_DIR } from "../paths";
import { readJob, updateJob } from "../jobs/store";
import type { Job, JobStatus } from "../jobs/types";
import { loadPrompt } from "../prompt-template";
import { startRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import { readPerAppFiles } from "../jobs/per-app-files";

const RESEARCH_TIMEOUT_MS = 12 * 60 * 1000;
const DRAFT_TIMEOUT_MS = 12 * 60 * 1000;
const HM_REVIEW_TIMEOUT_MS = 6 * 60 * 1000;

const HM_LOOP_STALL_THRESHOLD = 3;

/* ------------------------- helpers ------------------------- */

async function patchLatestRun(jobId: string, runId: string, phase: string): Promise<void> {
  await updateJob(jobId, { latestRunId: runId, latestRunPhase: phase });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

function relFolder(folderAbs: string): string {
  return path.relative(INTERVIEWS_DIR, folderAbs);
}

/** "ResearchProgramManager_ResearchInfra" → "ResearchProgramManager". Used in DOCX filename. */
function roleShort(role: string): string {
  const base = role.replace(/_\d+$/, "");
  return base.slice(0, 60);
}

/* ------------------------- research ------------------------- */

export type StartResearchInput = {
  jobId: string;
};

export async function startResearch(input: StartResearchInput): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(input.jobId);
  if (!job?.folderPath) {
    throw new Error("job_not_found_or_no_folder");
  }

  const prompt = await loadPrompt("research.md", {
    FOLDER_REL: relFolder(job.folderPath),
    COMPANY: job.company,
    ROLE: job.role,
  });

  await updateJob(input.jobId, {
    status: "researching",
    statusNote: "research agent spawned",
  });

  const { runId, meta, done } = await startRun({
    jobId: input.jobId,
    phase: "research",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: RESEARCH_TIMEOUT_MS,
  });
  await patchLatestRun(input.jobId, runId, "research");

  done
    .then(async () => {
      await routeAfterResearch(input.jobId);
    })
    .catch(async (err) => {
      await updateJob(input.jobId, {
        status: "errored",
        statusNote: `research exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterResearch(jobId: string): Promise<JobStatus> {
  const job = await readJob(jobId);
  if (!job?.folderPath) {
    throw new Error("job_disappeared");
  }
  const questionsPath = path.join(job.folderPath, "questions.md");
  if (await fileExists(questionsPath)) {
    const txt = (await safeRead(questionsPath)) ?? "";
    // Open question = file has content AND no substantive answer
    // section yet. Uses the shared question-state helper so empty
    // "## Answer" placeholders the agent writes don't count as
    // already-answered.
    const { hasOpenQuestion } = await import("../jobs/question-state");
    if (hasOpenQuestion(txt)) {
      await updateJob(jobId, {
        status: "awaiting_input",
        statusNote: "research surfaced honesty/gap questions",
      });
      return "awaiting_input";
    }
  }
  // No open questions — auto-kick the draft phase.
  await startDraft({ jobId });
  return "drafting";
}

/* ------------------------- draft ------------------------- */

export type StartDraftInput = {
  jobId: string;
  /** When kicking off a redraft after HM feedback, pass the feedback so the
   *  prompt can include it. */
  feedback?: string;
};

export async function startDraft(input: StartDraftInput): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(input.jobId);
  if (!job?.folderPath) {
    throw new Error("job_not_found_or_no_folder");
  }

  // Resolve archetype → base resume path + tailoring rules. Falls back
  // gracefully if no archetype was set (e.g. legacy dispatch runs).
  const { readArchetype } = await import("../archetypes/store");
  const archetypeKey = job.chosenArchetypeKey;
  let baseResumePath = "_resumes/ (unset — set up archetypes in Settings)";
  let archetypeLabel = "";
  let archetypeTailoringRules = "";
  if (archetypeKey) {
    const a = await readArchetype(archetypeKey);
    if (a) {
      baseResumePath = a.baseResumePath || baseResumePath;
      archetypeLabel = a.label;
      archetypeTailoringRules = a.tailoringRules;
    }
  }

  const prompt = await loadPrompt("draft.md", {
    FOLDER_REL: relFolder(job.folderPath),
    COMPANY: job.company,
    ROLE_SHORT: roleShort(job.role),
    FEEDBACK: input.feedback ?? "",
    BASE_RESUME_PATH: baseResumePath,
    ARCHETYPE_LABEL: archetypeLabel,
    ARCHETYPE_TAILORING_RULES: archetypeTailoringRules,
  });

  await updateJob(input.jobId, {
    status: "drafting",
    statusNote: input.feedback ? "draft re-run with HM feedback" : "draft agent spawned",
  });

  const { runId, meta, done } = await startRun({
    jobId: input.jobId,
    phase: "draft",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: DRAFT_TIMEOUT_MS,
  });
  await patchLatestRun(input.jobId, runId, "draft");

  done
    .then(async () => {
      await routeAfterDraft(input.jobId);
    })
    .catch(async (err) => {
      await updateJob(input.jobId, {
        status: "errored",
        statusNote: `draft exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterDraft(jobId: string): Promise<JobStatus> {
  const job = await readJob(jobId);
  if (!job?.folderPath) throw new Error("job_disappeared");

  const files = await readPerAppFiles(job.folderPath);
  if (files.finalDocx.length === 0) {
    await updateJob(jobId, {
      status: "errored",
      statusNote: "draft completed but no DOCX was produced",
    });
    return "errored";
  }
  // Auto-kick HM review.
  await startHmReview({ jobId });
  return "hm_review";
}

/* ------------------------- hm review ------------------------- */

export type StartHmReviewInput = {
  jobId: string;
};

export async function startHmReview(input: StartHmReviewInput): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(input.jobId);
  if (!job?.folderPath) {
    throw new Error("job_not_found_or_no_folder");
  }
  const files = await readPerAppFiles(job.folderPath);
  if (files.finalDocx.length === 0) {
    throw new Error("no_docx_to_review");
  }
  const docxName = files.finalDocx[0].relPath;

  const prompt = await loadPrompt("hm-review.md", {
    FOLDER_REL: relFolder(job.folderPath),
    DOCX_NAME: docxName,
    ISO_TIMESTAMP: new Date().toISOString(),
  });

  await updateJob(input.jobId, {
    status: "hm_review",
    statusNote: "HM review agent spawned",
  });

  const { runId, meta, done } = await startRun({
    jobId: input.jobId,
    phase: "hm_review",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: HM_REVIEW_TIMEOUT_MS,
  });
  await patchLatestRun(input.jobId, runId, "hm_review");

  done
    .then(async () => {
      await routeAfterHmReview(input.jobId, runId);
    })
    .catch(async (err) => {
      await updateJob(input.jobId, {
        status: "errored",
        statusNote: `HM review exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterHmReview(jobId: string, runId: string): Promise<JobStatus> {
  const job = await readJob(jobId);
  if (!job?.folderPath) throw new Error("job_disappeared");
  // Re-read the run snapshot to extract the verdict from structuredPayload.
  // Falls back to parsing feedback.md if the agent didn't emit clean JSON.
  let verdict: "ready_to_submit" | "needs_revision" | null = null;
  let passNumber: number | null = null;

  // Try the broker for structured payload.
  try {
    const { getRunSnapshot } = await import("../runs/broker");
    const snap = getRunSnapshot(runId);
    const payload: any = snap?.meta.structuredPayload;
    if (payload?.verdict === "ready_to_submit" || payload?.verdict === "needs_revision") {
      verdict = payload.verdict;
      if (typeof payload.passNumber === "number") passNumber = payload.passNumber;
    }
  } catch {}

  // Fallback: scan feedback.md for the verdict line.
  if (!verdict) {
    const fb = await safeRead(path.join(job.folderPath, "feedback.md"));
    if (fb) {
      if (/verdict\s*:\s*ready to submit/i.test(fb)) verdict = "ready_to_submit";
      else if (/verdict\s*:\s*needs revision/i.test(fb)) verdict = "needs_revision";
    }
  }

  if (!verdict) {
    await updateJob(jobId, {
      status: "errored",
      statusNote: "HM review completed without a parseable verdict",
    });
    return "errored";
  }

  if (verdict === "ready_to_submit") {
    // Auto-kick the provenance audit per spec §7.4.
    const { startProvenance } = await import("./provenance");
    startProvenance(jobId).catch(async (err) => {
      await updateJob(jobId, {
        status: "errored",
        statusNote: `failed to auto-kick provenance: ${String(err)}`,
      });
    });
    await updateJob(jobId, {
      status: "provenance",
      statusNote: `HM review verdict: ready to submit (pass ${passNumber ?? "?"}) — provenance spawning`,
    });
    return "provenance";
  }

  // needs_revision — stay in hm_review and let the user decide (Re-draft
  // or Send anyway). Detect stall: count "## Pass N" entries in
  // feedback_history.md; if we're at the threshold, append a stall note
  // (the UI surfaces the banner based on this status).
  const history = (await safeRead(path.join(job.folderPath, "feedback_history.md"))) ?? "";
  const passCount = (history.match(/^##\s+Pass\s+\d+/gim) ?? []).length;
  const stalled = passCount >= HM_LOOP_STALL_THRESHOLD;

  await updateJob(jobId, {
    status: "hm_review",
    statusNote: stalled
      ? `HM verdict: needs revision (pass ${passNumber ?? passCount}) — loop appears stalled`
      : `HM verdict: needs revision (pass ${passNumber ?? passCount})`,
  });
  return "hm_review";
}

/* ------------------------- public re-draft helpers ------------------------- */

/** User chose "Re-draft" after seeing HM feedback. */
export async function redraftWithFeedback(jobId: string): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(jobId);
  if (!job?.folderPath) throw new Error("job_not_found_or_no_folder");
  const feedback = (await safeRead(path.join(job.folderPath, "feedback.md"))) ?? "";
  return startDraft({ jobId, feedback });
}

/** User chose "Send anyway" — skip HM feedback loop, but per spec §7.3
 *  the provenance audit still runs because honesty is independent of the
 *  HM perspective. */
export async function bypassHmToProvenance(jobId: string): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const { startProvenance } = await import("./provenance");
  await updateJob(jobId, {
    statusNote: "user bypassed HM feedback (send anyway) — provenance spawning",
  });
  return startProvenance(jobId);
}
