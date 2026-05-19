import "server-only";
/**
 * On-disk store for archetypes — the base-resume + matching-hints
 * config the dispatcher consults when picking which DOCX to start from
 * for a given posting. One JSON file per archetype under
 * <workspace>/_meta/archetypes/<key>.json.
 *
 * Writes go through a per-key in-process queue so concurrent updates
 * don't drop. The on-disk write is atomic temp-and-rename — partial
 * files never appear, even on power loss.
 *
 * Summaries (listSummaries) also stat the referenced base resume DOCX
 * so the UI can show a "missing on disk" indicator without doing a
 * separate fetch.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { META_DIR, absInterviews } from "../paths";
import type { Archetype, ArchetypeSummary, BaseStatus } from "./types";

const ARCHETYPES_DIR = path.join(META_DIR, "archetypes");

/**
 * Per-key in-process write queue. Two concurrent updates for the same
 * archetype get serialized; different archetypes go in parallel. Same
 * pattern as the jobs store.
 */
const queues = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = (queues.get(key) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  queues.set(key, next);
  try {
    return (await next) as T;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

function archetypePath(key: string): string {
  return path.join(ARCHETYPES_DIR, `${key}.json`);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function isValidKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(key);
}

async function atomicWriteJSON(absPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.${randomUUID()}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
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

/**
 * Default missing base-state fields on archetypes written before the
 * base-resume-generation feature shipped. Keeps existing JSON readable
 * without a migration step.
 */
function hydrateBaseState(raw: any): Archetype {
  return {
    ...raw,
    baseStatus: (raw.baseStatus as BaseStatus | undefined) ?? "none",
    baseReviewPass: typeof raw.baseReviewPass === "number" ? raw.baseReviewPass : 0,
    baseLatestRunId: raw.baseLatestRunId ?? null,
    baseLastFeedback: raw.baseLastFeedback ?? "",
    baseGeneratedAt: raw.baseGeneratedAt ?? null,
  } as Archetype;
}

export async function readArchetype(key: string): Promise<Archetype | null> {
  try {
    const raw = await fs.readFile(archetypePath(key), "utf8");
    return hydrateBaseState(JSON.parse(raw));
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function listArchetypes(): Promise<Archetype[]> {
  try {
    const entries = await fs.readdir(ARCHETYPES_DIR);
    const out: Archetype[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      try {
        const raw = await fs.readFile(path.join(ARCHETYPES_DIR, name), "utf8");
        out.push(hydrateBaseState(JSON.parse(raw)));
      } catch {}
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function listSummaries(): Promise<ArchetypeSummary[]> {
  const all = await listArchetypes();
  const out: ArchetypeSummary[] = [];
  for (const a of all) {
    let exists = false;
    let size: number | null = null;
    let mtimeMs: number | null = null;
    if (a.baseResumePath) {
      try {
        const stat = await fs.stat(absInterviews(a.baseResumePath));
        exists = true;
        size = stat.size;
        mtimeMs = stat.mtimeMs;
      } catch {}
    }
    out.push({
      key: a.key,
      label: a.label,
      description: a.description,
      baseResumePath: a.baseResumePath,
      baseResumeExists: exists,
      baseResumeSize: size,
      baseResumeMtimeMs: mtimeMs,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      baseStatus: a.baseStatus,
      baseReviewPass: a.baseReviewPass,
      baseLatestRunId: a.baseLatestRunId,
    });
  }
  return out;
}

export type CreateInput = {
  key: string;
  label: string;
  description?: string;
  matchingHints?: string;
  baseResumePath?: string;
  tailoringRules?: string;
};

export async function createArchetype(input: CreateInput): Promise<Archetype> {
  return withLock(input.key, async () => {
    const existing = await readArchetype(input.key);
    if (existing) throw new Error(`archetype_already_exists:${input.key}`);
    const now = new Date().toISOString();
    const a: Archetype = {
      key: input.key,
      label: input.label,
      description: input.description ?? "",
      matchingHints: input.matchingHints ?? "",
      baseResumePath: input.baseResumePath ?? "",
      tailoringRules: input.tailoringRules ?? "",
      createdAt: now,
      updatedAt: now,
      baseStatus: "none",
      baseReviewPass: 0,
      baseLatestRunId: null,
      baseLastFeedback: "",
      baseGeneratedAt: null,
    };
    await atomicWriteJSON(archetypePath(input.key), a);
    return a;
  });
}

export type UpdateInput = Partial<Omit<Archetype, "key" | "createdAt" | "updatedAt">>;

export async function updateArchetype(
  key: string,
  patch: UpdateInput,
): Promise<Archetype> {
  return withLock(key, async () => {
    const current = await readArchetype(key);
    if (!current) throw new Error(`archetype_not_found:${key}`);
    const next: Archetype = {
      ...current,
      ...patch,
      key, // immutable
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await atomicWriteJSON(archetypePath(key), next);
    return next;
  });
}

export type BaseStatePatch = Partial<{
  baseStatus: BaseStatus;
  baseReviewPass: number;
  baseLatestRunId: string | null;
  baseLastFeedback: string;
  baseGeneratedAt: string | null;
  baseResumePath: string;
}>;

/**
 * Patch only the base-resume state fields on an archetype. Same atomic
 * write + per-key lock as {@link updateArchetype}, but the named-API
 * version that the base-resume orchestrator calls — keeps intent clear
 * at call sites and prevents accidentally clobbering label/description.
 */
export async function updateArchetypeBaseState(
  key: string,
  patch: BaseStatePatch,
): Promise<Archetype> {
  return withLock(key, async () => {
    const current = await readArchetype(key);
    if (!current) throw new Error(`archetype_not_found:${key}`);
    const next: Archetype = {
      ...current,
      ...patch,
      key,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await atomicWriteJSON(archetypePath(key), next);
    return next;
  });
}

/**
 * Atomic claim for the base-resume generation loop. Reads under the
 * per-key lock; if the archetype is already in a transient state
 * (`generating` or `reviewing`), returns null. Otherwise writes
 * `baseStatus = "generating"` and returns the previous status so the
 * caller can decide what to do next.
 *
 * Two concurrent callers always see exactly one win — the second
 * observes the status the first just wrote and bails out. This is the
 * guard that prevents two `generate-all-bases` invocations from
 * spawning parallel loops on the same archetype.
 */
export async function tryClaimBaseGeneration(
  key: string,
): Promise<BaseStatus | null> {
  return withLock(key, async () => {
    const current = await readArchetype(key);
    if (!current) throw new Error(`archetype_not_found:${key}`);
    if (current.baseStatus === "generating" || current.baseStatus === "reviewing") {
      return null;
    }
    const next: Archetype = {
      ...current,
      baseStatus: "generating",
      updatedAt: new Date().toISOString(),
    };
    await atomicWriteJSON(archetypePath(key), next);
    return current.baseStatus;
  });
}

export async function deleteArchetype(key: string): Promise<boolean> {
  return withLock(key, async () => {
    try {
      await fs.unlink(archetypePath(key));
      return true;
    } catch (err: any) {
      if (err?.code === "ENOENT") return false;
      throw err;
    }
  });
}

/** Write a DOCX buffer to disk as the base resume for the given archetype.
 *  Default location is `_resumes/<key>-base.docx`. The archetype is updated
 *  to point at that path. */
export async function uploadBaseResume(
  key: string,
  bytes: Uint8Array,
  fileName?: string,
): Promise<{ archetype: Archetype; absPath: string }> {
  return withLock(`${key}:base`, async () => {
    const archetype = await readArchetype(key);
    if (!archetype) throw new Error(`archetype_not_found:${key}`);
    const safeName =
      fileName?.match(/^[\w.\- ]+\.docx$/i)?.[0] ?? `${key}-base.docx`;
    const relPath = path.posix.join("_resumes", safeName);
    const absPath = absInterviews(relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    // Atomic temp-and-rename for the DOCX too.
    const tmp = absPath + "." + randomUUID() + ".tmp";
    await fs.writeFile(tmp, bytes);
    try {
      await fs.rename(tmp, absPath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
    const updated = await updateArchetype(key, { baseResumePath: relPath });
    return { archetype: updated, absPath };
  });
}

export { ARCHETYPES_DIR };
