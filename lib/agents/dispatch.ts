import "server-only";
/**
 * Dispatcher agent — the routing brain. Fetches a JD, classifies the
 * posting against the candidate's profile filters, picks an archetype
 * (the base resume to start from), and decides one of three outcomes:
 * GO (auto-progress to research), NEEDS-DISCUSSION (write a question
 * file and wait for the user), or RECOMMEND-SKIP (write a skip
 * rationale and stop). Spec is documented in workflow.md §0.
 *
 * Also handles the "URL only" manual paste path: when the user pastes
 * a URL without company/role, the dispatcher itself picks names from
 * the JD and creates the apps/<Company>/<Role>/ folder. The
 * orchestrator (routeAfterDispatch) patches the job record with the
 * dispatcher's discovered company / role / chosen archetype.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { APPS_DIR, INTERVIEWS_DIR } from "../paths";
import { deriveJobId, readJob, updateJob, createJob } from "../jobs/store";
import type { Job, JobStatus } from "../jobs/types";
import { loadPrompt } from "../prompt-template";
import { startRun, getRunSnapshot } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import { startResearch } from "./research-draft-review";
import { listArchetypes } from "../archetypes/store";
import type { Archetype } from "../archetypes/types";

const DISPATCH_TIMEOUT_MS = 5 * 60 * 1000;

/** Format the list of available archetypes for the dispatcher prompt. */
function renderArchetypesIndex(archetypes: Archetype[]): string {
  if (archetypes.length === 0) return "";
  const out: string[] = [];
  for (const a of archetypes) {
    out.push(`### \`${a.key}\` — ${a.label}`);
    out.push("");
    if (a.description) {
      out.push(a.description.trim());
      out.push("");
    }
    if (a.matchingHints && a.matchingHints.trim()) {
      out.push("**Matching hints:**");
      out.push(a.matchingHints.trim());
      out.push("");
    }
    out.push(`**Base resume:** \`${a.baseResumePath || "(not yet uploaded)"}\``);
    out.push("");
  }
  return out.join("\n");
}

export type DispatchInput = {
  /** Existing job to dispatch (or re-dispatch). */
  jobId: string;
  /** Required: posting URL. */
  postingUrl: string;
  /** Optional: raw JD text (used when URL is dead/paywalled). */
  jdText?: string | null;
  /** Optional: override company/role label for folder naming. */
  company?: string;
  role?: string;
};

/**
 * Spawn the dispatcher for a job and return the runId immediately.
 * Status routing happens after the run completes (see routeAfterDispatch).
 */
export async function startDispatcher(input: DispatchInput): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(input.jobId);
  if (!job) throw new Error(`job_not_found:${input.jobId}`);

  // URL-only paste path: company/role are placeholders (empty string), and
  // we have no folderPath yet. Let the dispatcher pick names and create
  // the folder itself; the orchestrator patches the job afterward.
  const pending = !job.company || job.company === "" || !job.folderPath;

  const company = input.company ?? job.company;
  const role = input.role ?? job.role;
  let folderAbs: string | null = null;
  let folderRel = "";
  if (!pending) {
    folderAbs = job.folderPath ?? path.join(APPS_DIR, company, role);
    folderRel = path.relative(INTERVIEWS_DIR, folderAbs);
    await fs.mkdir(folderAbs, { recursive: true });
  }

  const archetypes = await listArchetypes();
  const archetypesIndex = renderArchetypesIndex(archetypes);

  const prompt = await loadPrompt("dispatch.md", {
    POSTING_URL: input.postingUrl,
    COMPANY: pending ? "" : company,
    ROLE: pending ? "" : role,
    FOLDER_REL: folderRel,
    JD_TEXT: input.jdText ?? "",
    ARCHETYPES_INDEX: archetypesIndex,
  });

  await updateJob(input.jobId, {
    status: "dispatching",
    sourceUrl: input.postingUrl,
    folderPath: folderAbs ?? job.folderPath ?? null,
    statusNote: pending
      ? "dispatcher spawned (will pick company/role from JD)"
      : "dispatcher spawned",
  });

  const { runId, meta, done } = await startRun({
    jobId: input.jobId,
    phase: "dispatch",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: DISPATCH_TIMEOUT_MS,
  });
  await updateJob(input.jobId, { latestRunId: runId, latestRunPhase: "dispatch" });

  done
    .then(async () => {
      await routeAfterDispatch(input.jobId, runId, folderAbs);
    })
    .catch(async (err) => {
      await updateJob(input.jobId, {
        status: "errored",
        statusNote: `dispatcher exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

/**
 * After a dispatcher run finishes, read classification.md and route the
 * job's status accordingly. Per workflow.md §0:
 *  - GO                  → researching (auto-kicks-off step 6 later)
 *  - NEEDS-DISCUSSION    → awaiting_input
 *  - RECOMMEND-SKIP      → recommended_skip
 */
export async function routeAfterDispatch(
  initialJobId: string,
  runId: string,
  folderAbsHint: string | null,
): Promise<JobStatus | null> {
  // jobId can change mid-routing — see the rename block below. Use the
  // local `jobId` variable for everything downstream.
  let jobId = initialJobId;
  // For URL-only pastes the orchestrator didn't know the folder up front;
  // the dispatcher reports it in the result JSON.
  let folderAbs: string | null = folderAbsHint;
  let companyFromResult: string | null = null;
  let roleFromResult: string | null = null;
  let archetypeKeyFromResult: string | null = null;
  try {
    const snap = getRunSnapshot(runId);
    const payload: any = snap?.meta.structuredPayload;
    if (payload && typeof payload === "object") {
      if (typeof payload.folderRel === "string" && payload.folderRel.trim()) {
        folderAbs = path.isAbsolute(payload.folderRel)
          ? payload.folderRel
          : path.join(INTERVIEWS_DIR, payload.folderRel);
      }
      if (typeof payload.company === "string" && payload.company.trim()) {
        companyFromResult = payload.company.trim();
      }
      if (typeof payload.role === "string" && payload.role.trim()) {
        roleFromResult = payload.role.trim();
      }
      // Prefer the new `archetypeKey` field; fall back to legacy
      // `recommendedBase` ("AI" → "ai", "Cloud" → "cloud") for transitional
      // dispatcher runs that haven't been updated yet.
      if (typeof payload.archetypeKey === "string" && payload.archetypeKey.trim()) {
        archetypeKeyFromResult = payload.archetypeKey.trim();
      } else if (typeof payload.recommendedBase === "string") {
        const b = payload.recommendedBase.trim().toLowerCase();
        if (b === "ai" || b === "cloud") archetypeKeyFromResult = b;
      }
    }
  } catch {}

  if (!folderAbs) {
    const job = await readJob(jobId);
    folderAbs = job?.folderPath ?? null;
  }

  if (folderAbs) {
    // Patch the job with discovered company/role/folder.
    const job = await readJob(jobId);
    if (job) {
      const patch: any = {};
      if (folderAbs !== job.folderPath) patch.folderPath = folderAbs;
      if (archetypeKeyFromResult && archetypeKeyFromResult !== job.chosenArchetypeKey) {
        patch.chosenArchetypeKey = archetypeKeyFromResult;
      }
      if (Object.keys(patch).length > 0) {
        await updateJob(jobId, patch);
      }
      // Update non-JobUpdate fields (company/role) via direct write.
      if (
        (companyFromResult && companyFromResult !== job.company) ||
        (roleFromResult && roleFromResult !== job.role)
      ) {
        const { writeJob } = await import("../jobs/store");
        const fresh = await readJob(jobId);
        if (fresh) {
          await writeJob({
            ...fresh,
            company: companyFromResult ?? fresh.company,
            role: roleFromResult ?? fresh.role,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // If this Job was created from a bulk-paste (id like
      // `pasted_<uuid>`) and the dispatcher just discovered the real
      // company/role, migrate the record id to the derived shape.
      // Without this, the import-preview later sees the apps/ folder
      // and creates a SECOND Job record for the same role — leaving
      // a shadow `pasted_*` record behind.
      const finalCompany = companyFromResult ?? job.company;
      const finalRole = roleFromResult ?? job.role;
      if (
        jobId.startsWith("pasted_") &&
        finalCompany &&
        finalRole
      ) {
        const { renameJob, deriveJobId } = await import("../jobs/store");
        const newId = deriveJobId(finalCompany, finalRole);
        const renamed = await renameJob(jobId, newId);
        if (renamed) {
          jobId = newId;
        }
        // If renameJob returned null because newId already exists
        // (collision with an imported record, say), we leave the
        // shadow alone — the dedupe sweep will catch it.
      }
    }
  }

  const classification = folderAbs
    ? await safeRead(path.join(folderAbs, "classification.md"))
    : null;
  const hasDispatcherQuestion = folderAbs
    ? await fileExists(path.join(folderAbs, "dispatcher_question.md"))
    : false;
  let decision = parseDecision(classification ?? "");
  if (!decision && hasDispatcherQuestion) decision = "NEEDS-DISCUSSION";

  // Before falling through to "no decision → errored", check whether
  // the run actually hit Anthropic's rate limiter. That's a transient
  // failure that should auto-retry, not get clobbered as a permanent
  // error. Pattern detected at broker level via meta.rateLimited.
  if (!decision) {
    const snap = getRunSnapshot(runId);
    if (snap?.meta.rateLimited) {
      const job = await readJob(jobId);
      const attempt = job?.retryAttempts ?? 0;
      const { scheduleRetry, MAX_RETRY_ATTEMPTS } = await import("../runs/retry");
      const result = scheduleRetry(attempt, async () => {
        // Re-spawn dispatcher with the same inputs. The retry runs in
        // the background; the user sees the job re-enter dispatching.
        const postingUrl = job?.sourceUrl;
        if (!postingUrl) return;
        await startDispatcher({ jobId, postingUrl });
      });
      if (result.scheduled) {
        await updateJob(jobId, {
          status: "dispatching",
          statusNote:
            `Anthropic API rate-limited (server-side load shedding — not your subscription quota). ` +
            `Retrying in ${result.humanDelay} (attempt ${result.nextAttempt}/${MAX_RETRY_ATTEMPTS}).`,
          retryAttempts: result.nextAttempt,
        });
        return "dispatching";
      }
      // Max retries reached — give up and surface the permanent error.
      await updateJob(jobId, {
        status: "errored",
        statusNote: `Anthropic rate-limited after ${MAX_RETRY_ATTEMPTS} retry attempts. Re-dispatch manually when traffic clears.`,
      });
      return "errored";
    }
  }

  let next: JobStatus;
  let note: string;
  let autoKickResearch = false;
  switch (decision) {
    case "GO":
      next = "researching";
      note = "dispatcher decision: GO";
      autoKickResearch = true;
      break;
    case "NEEDS-DISCUSSION":
      next = "awaiting_input";
      note = "dispatcher decision: NEEDS-DISCUSSION";
      break;
    case "RECOMMEND-SKIP":
      next = "recommended_skip";
      note = "dispatcher decision: RECOMMEND-SKIP";
      break;
    default:
      next = "errored";
      note = "dispatcher completed without parseable decision";
  }
  // Successful decision — clear retry counter since we're moving forward.
  await updateJob(jobId, {
    status: next,
    statusNote: note,
    retryAttempts: 0,
  } as any);
  if (autoKickResearch) {
    // Fire-and-forget. Auto-progression per spec §6.
    startResearch({ jobId }).catch(async (err) => {
      await updateJob(jobId, {
        status: "errored",
        statusNote: `failed to auto-kick research: ${String(err)}`,
      });
    });
  }
  return next;
}

function parseDecision(classification: string): "GO" | "NEEDS-DISCUSSION" | "RECOMMEND-SKIP" | null {
  const m = classification.match(/Decision\s*:\s*(GO|NEEDS-DISCUSSION|RECOMMEND-SKIP)/i);
  if (m) return m[1].toUpperCase() as any;
  // Fallback: look for the strings anywhere in the doc.
  if (/RECOMMEND[-\s]?SKIP/i.test(classification)) return "RECOMMEND-SKIP";
  if (/NEEDS[-\s]?DISCUSSION/i.test(classification)) return "NEEDS-DISCUSSION";
  if (/\bGO\b/.test(classification)) return "GO";
  return null;
}

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

export type ManualPasteInput = {
  /** Optional — if missing, the dispatcher picks names from the JD. */
  company?: string | null;
  role?: string | null;
  postingUrl: string;
  jdText?: string | null;
  /** If true, spin up the dispatcher immediately. */
  dispatchImmediately: boolean;
};

/**
 * Create a new manual job and (optionally) spin up the dispatcher.
 *
 * Two modes:
 *  - Company + role supplied → create job with derived id `<co>__<role>`,
 *    pre-create folder, dispatch as usual.
 *  - URL only → create job with a UUID-based placeholder id, no folder
 *    yet. The dispatcher picks company/role from the JD and creates the
 *    folder; the orchestrator patches the job afterward.
 */
export async function pasteJob(input: ManualPasteInput): Promise<{
  job: Job;
  runId?: string;
}> {
  const haveNames =
    typeof input.company === "string" &&
    input.company.trim().length > 0 &&
    typeof input.role === "string" &&
    input.role.trim().length > 0;

  if (haveNames) {
    const id = deriveJobId(input.company!, input.role!);
    const existing = await readJob(id);
    if (existing) {
      if (input.dispatchImmediately) {
        const { runId } = await startDispatcher({
          jobId: id,
          postingUrl: input.postingUrl,
          jdText: input.jdText,
        });
        return { job: existing, runId };
      }
      return { job: existing };
    }
    const folderPath = path.join(APPS_DIR, input.company!, input.role!);
    const job = await createJob({
      id,
      company: input.company!,
      role: input.role!,
      folderPath,
      // User-pasted jobs go to `queued`, not `discovered`. Keeps them
      // out of the Shortlist (which is for discovery-agent candidates
      // awaiting user triage). Manual pastes are "user already
      // approved by pasting" — they belong in the dispatcher queue.
      status: "queued",
      source: "manual",
      sourceUrl: input.postingUrl,
    });
    if (input.dispatchImmediately) {
      const { runId } = await startDispatcher({
        jobId: id,
        postingUrl: input.postingUrl,
        jdText: input.jdText,
      });
      return { job, runId };
    }
    return { job };
  }

  // URL-only path. Synthesize a placeholder id.
  const id = `pasted_${randomUUID().slice(0, 8)}`;
  const job = await createJob({
    id,
    company: "",
    role: "",
    folderPath: null,
    // Same reasoning as the named-paste path: user-pasted = queued,
    // not discovered. Bypasses Shortlist.
    status: "queued",
    source: "manual",
    sourceUrl: input.postingUrl,
  });
  if (input.dispatchImmediately) {
    const { runId } = await startDispatcher({
      jobId: id,
      postingUrl: input.postingUrl,
      jdText: input.jdText,
    });
    return { job, runId };
  }
  return { job };
}
