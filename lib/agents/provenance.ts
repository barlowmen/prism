import "server-only";
/**
 * Provenance audit agent. Reads the final tailored DOCX (via mammoth
 * → text) and cross-checks every concrete claim against
 * _meta/about_user.md. Surfaces fabricated numbers, claims that cross
 * stated honesty red lines, and anything that needs verification.
 *
 * Writes provenance.md into the per-app folder; if it contains any
 * VERIFY: notes or unchecked checkbox items, the job's status moves
 * to awaiting_input so JobActions can surface the flagged panel.
 *
 * acceptProvenanceGap() is the explicit user override — flags stay on
 * disk as a paper trail, status advances anyway.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { INTERVIEWS_DIR } from "../paths";
import { readJob, updateJob } from "../jobs/store";
import type { JobStatus } from "../jobs/types";
import { loadPrompt } from "../prompt-template";
import { startRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import { readPerAppFiles } from "../jobs/per-app-files";

const PROVENANCE_TIMEOUT_MS = 8 * 60 * 1000;

async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function startProvenance(jobId: string): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  const job = await readJob(jobId);
  if (!job?.folderPath) throw new Error("job_not_found_or_no_folder");
  const files = await readPerAppFiles(job.folderPath);
  if (files.finalDocx.length === 0) {
    throw new Error("no_docx_for_provenance");
  }
  const docxName = files.finalDocx[0].relPath;

  const prompt = await loadPrompt("provenance.md", {
    FOLDER_REL: path.relative(INTERVIEWS_DIR, job.folderPath),
    COMPANY: job.company,
    ROLE: job.role,
    DOCX_NAME: docxName,
  });

  await updateJob(jobId, {
    status: "provenance",
    statusNote: "provenance audit spawned",
  });

  const { runId, meta, done } = startRun({
    jobId,
    phase: "provenance",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: PROVENANCE_TIMEOUT_MS,
  });
  await updateJob(jobId, { latestRunId: runId, latestRunPhase: "provenance" });

  done
    .then(async () => {
      await routeAfterProvenance(jobId, runId);
    })
    .catch(async (err) => {
      await updateJob(jobId, {
        status: "errored",
        statusNote: `provenance exception: ${String(err)}`,
      });
    });

  return { runId, meta };
}

async function routeAfterProvenance(jobId: string, runId: string): Promise<JobStatus> {
  const job = await readJob(jobId);
  if (!job?.folderPath) throw new Error("job_disappeared");

  let verdict: "clean" | "flagged" | null = null;
  let flagsCount: number | null = null;

  try {
    const { getRunSnapshot } = await import("../runs/broker");
    const snap = getRunSnapshot(runId);
    const payload: any = snap?.meta.structuredPayload;
    if (payload?.verdict === "clean" || payload?.verdict === "flagged") {
      verdict = payload.verdict;
      if (typeof payload.flagsCount === "number") flagsCount = payload.flagsCount;
    }
  } catch {}

  if (!verdict) {
    // Fallback: scan provenance.md for VERIFY tokens.
    const prov = await safeRead(path.join(job.folderPath, "provenance.md"));
    if (prov) {
      const verifyCount = (prov.match(/VERIFY:/g) ?? []).length;
      const unchecked = /\[\s\]/.test(prov);
      if (verifyCount > 0 || unchecked) {
        verdict = "flagged";
        flagsCount = verifyCount;
      } else {
        verdict = "clean";
        flagsCount = 0;
      }
    }
  }

  if (!verdict) {
    await updateJob(jobId, {
      status: "errored",
      statusNote: "provenance completed without parseable verdict",
    });
    return "errored";
  }

  if (verdict === "clean") {
    await updateJob(jobId, {
      status: "ready_for_user_review",
      statusNote: `provenance verdict: clean`,
    });
    return "ready_for_user_review";
  }

  // Flagged: user must either fix-and-redraft or accept-the-gap.
  await updateJob(jobId, {
    status: "awaiting_input",
    statusNote: `provenance flagged ${flagsCount ?? "?"} item(s)`,
  });
  return "awaiting_input";
}

/** User chose "Accept the gap" after provenance flagged. Proceeds to
 *  user review with a note recorded in status history. */
export async function acceptProvenanceGap(jobId: string): Promise<void> {
  await updateJob(jobId, {
    status: "ready_for_user_review",
    statusNote: "user accepted provenance flag — gap acknowledged",
  });
}
