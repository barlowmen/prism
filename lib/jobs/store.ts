import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { STATE_DIR } from "../paths";
import { isJobStatus, type Job, type JobStatus } from "./types";

const JOBS_DIR = path.join(STATE_DIR, "jobs");

/**
 * In-process write queue, keyed by jobId. Serializes writes for the same
 * job so concurrent status transitions cannot drop updates. Different
 * jobs run in parallel. Spec §8.4.
 *
 * Note: this is per-process. The Next.js dev server has a single Node
 * process for API routes, so this is the right level. If we ever fork
 * workers, swap for a file-lock.
 */
const queues = new Map<string, Promise<unknown>>();

async function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const prev = (queues.get(jobId) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  queues.set(jobId, next);
  try {
    return (await next) as T;
  } finally {
    if (queues.get(jobId) === next) queues.delete(jobId);
  }
}

async function ensureJobsDir() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

function jobFilePath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

/** Derive a stable, filesystem-safe job id from company + role. */
export function deriveJobId(company: string, role: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
  return `${slug(company)}__${slug(role)}`;
}

async function atomicWriteJSON(absPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.${randomUUID()}.tmp`);
  const json = JSON.stringify(value, null, 2) + "\n";
  await fs.mkdir(dir, { recursive: true });
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(json, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function readJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobFilePath(id), "utf8");
    return JSON.parse(raw) as Job;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function listJobs(): Promise<Job[]> {
  await ensureJobsDir();
  const entries = await fs.readdir(JOBS_DIR);
  const jobs: Job[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, name), "utf8");
      const parsed = JSON.parse(raw) as Job;
      jobs.push(parsed);
    } catch {
      // Skip unreadable files rather than crashing the whole list.
    }
  }
  return jobs;
}

export async function writeJob(job: Job): Promise<void> {
  await withJobLock(job.id, async () => {
    await atomicWriteJSON(jobFilePath(job.id), job);
  });
}

/**
 * Rename a Job's id. Used when the dispatcher classifies a bulk-pasted
 * URL: the original record was created with a placeholder id like
 * `pasted_<uuid>` because we didn't know company/role yet. Once the
 * dispatcher picks names from the JD, we migrate the record to the
 * derived id (`Company__Role`) so the import-preview can match it
 * against the folder on disk and we don't end up with shadow records.
 *
 * Writes the new file first, deletes the old one second. If the new
 * id already exists, this is a no-op + returns null — the caller can
 * decide to dedupe by merging or leaving the original alone.
 *
 * Locks both ids during the operation to avoid races.
 */
export async function renameJob(oldId: string, newId: string): Promise<Job | null> {
  if (oldId === newId) return null;
  // Lock the old id first, then the new id, to avoid deadlock with a
  // concurrent reverse rename (which would be a weird situation, but
  // still).
  return withJobLock(oldId, async () => {
    return withJobLock(newId, async () => {
      const current = await readJob(oldId);
      if (!current) return null;
      const collision = await readJob(newId);
      if (collision) return null;
      const renamed: Job = { ...current, id: newId, updatedAt: new Date().toISOString() };
      await atomicWriteJSON(jobFilePath(newId), renamed);
      // Best-effort unlink — if it fails the user just sees a shadow
      // record, which the one-shot dedupe sweep will clean up later.
      try {
        await fs.unlink(jobFilePath(oldId));
      } catch {}
      return renamed;
    });
  });
}

export type CreateJobInput = Omit<
  Job,
  "updatedAt" | "statusHistory" | "discoveredAt"
> & {
  discoveredAt?: string;
};

/** Create a new job file. Fails if one already exists for this id. */
export async function createJob(input: CreateJobInput): Promise<Job> {
  return withJobLock(input.id, async () => {
    const existing = await readJob(input.id);
    if (existing) {
      throw new Error(`job_already_exists:${input.id}`);
    }
    const now = new Date().toISOString();
    const job: Job = {
      ...input,
      discoveredAt: input.discoveredAt ?? now,
      updatedAt: now,
      statusHistory: [{ at: now, from: null, to: input.status }],
    };
    await atomicWriteJSON(jobFilePath(job.id), job);
    return job;
  });
}

export type JobUpdate = {
  status?: JobStatus;
  notes?: string;
  sourceUrl?: string | null;
  outcome?: Job["outcome"] | null;
  reclassifySuggestion?: JobStatus | null;
  folderPath?: string | null;
  latestRunId?: string | null;
  latestRunPhase?: string | null;
  chosenArchetypeKey?: string | null;
  statusNote?: string;
  retryAttempts?: number;
};

/**
 * Update a job. Status transitions append to statusHistory. All updates
 * are serialized per-job via the write queue.
 */
export async function updateJob(id: string, patch: JobUpdate): Promise<Job> {
  return withJobLock(id, async () => {
    const current = await readJob(id);
    if (!current) throw new Error(`job_not_found:${id}`);

    const now = new Date().toISOString();
    const next: Job = { ...current, updatedAt: now };

    if (patch.status && patch.status !== current.status) {
      if (!isJobStatus(patch.status)) {
        throw new Error(`invalid_status:${patch.status}`);
      }
      next.status = patch.status;
      next.statusHistory = [
        ...current.statusHistory,
        {
          at: now,
          from: current.status,
          to: patch.status,
          note: patch.statusNote,
        },
      ];
    }

    if (patch.notes !== undefined) next.notes = patch.notes;
    if (patch.sourceUrl !== undefined) next.sourceUrl = patch.sourceUrl;
    if (patch.outcome !== undefined) {
      if (patch.outcome === null) delete next.outcome;
      else next.outcome = patch.outcome;
    }
    if (patch.reclassifySuggestion !== undefined) {
      next.reclassifySuggestion = patch.reclassifySuggestion;
    }
    if (patch.folderPath !== undefined) next.folderPath = patch.folderPath;
    if (patch.latestRunId !== undefined) next.latestRunId = patch.latestRunId;
    if (patch.latestRunPhase !== undefined) next.latestRunPhase = patch.latestRunPhase;
    if (patch.chosenArchetypeKey !== undefined) {
      if (patch.chosenArchetypeKey === null) delete next.chosenArchetypeKey;
      else next.chosenArchetypeKey = patch.chosenArchetypeKey;
    }
    if (patch.retryAttempts !== undefined) {
      next.retryAttempts = patch.retryAttempts;
    }

    await atomicWriteJSON(jobFilePath(id), next);
    return next;
  });
}

/** Test-only helper: nuke the entire state directory. Not exported via API. */
export async function _resetJobsStore(): Promise<void> {
  await fs.rm(JOBS_DIR, { recursive: true, force: true });
}
