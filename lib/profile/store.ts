import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { STATE_DIR } from "../paths";
import type { SectionKey } from "./sections";

const PROFILE_DIR = path.join(STATE_DIR, "profile");
const SECTIONS_DIR = path.join(PROFILE_DIR, "sections");

export type SectionState = {
  key: SectionKey;
  /** "untouched": no work yet. "in_progress": interview thread exists with user
   *  messages but no draft. "drafted": an interview produced a <draft> the user
   *  hasn't committed yet. "committed": draft was merged into about_user.md.
   *  After commit, the agent can be re-run to refresh — state goes back to
   *  in_progress. */
  status: "untouched" | "in_progress" | "drafted" | "committed";
  /** Assistant thread id for this section's interview. */
  threadId: string | null;
  /** Latest draft markdown (the agent's most recent <draft>...</draft>). */
  draft: string | null;
  /** When the latest draft was produced. */
  draftAt: string | null;
  /** When the last commit happened. */
  committedAt: string | null;
  updatedAt: string;
};

const queues = new Map<SectionKey, Promise<unknown>>();

async function withSectionLock<T>(key: SectionKey, fn: () => Promise<T>): Promise<T> {
  const prev = (queues.get(key) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  queues.set(key, next);
  try {
    return (await next) as T;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

function statePath(key: SectionKey): string {
  return path.join(SECTIONS_DIR, `${key}.json`);
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

export async function readSectionState(key: SectionKey): Promise<SectionState | null> {
  try {
    const raw = await fs.readFile(statePath(key), "utf8");
    return JSON.parse(raw) as SectionState;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function readAllSectionStates(): Promise<Record<SectionKey, SectionState | null>> {
  const { SECTION_KEYS } = await import("./sections");
  const out: Record<string, SectionState | null> = {};
  for (const k of SECTION_KEYS) {
    out[k] = await readSectionState(k);
  }
  return out as Record<SectionKey, SectionState | null>;
}

export async function upsertSectionState(
  key: SectionKey,
  patch: Partial<SectionState>,
): Promise<SectionState> {
  return withSectionLock(key, async () => {
    const current = (await readSectionState(key)) ?? {
      key,
      status: "untouched" as const,
      threadId: null,
      draft: null,
      draftAt: null,
      committedAt: null,
      updatedAt: new Date().toISOString(),
    };
    const next: SectionState = {
      ...current,
      ...patch,
      key,
      updatedAt: new Date().toISOString(),
    };
    await atomicWriteJSON(statePath(key), next);
    return next;
  });
}

export async function clearSectionState(key: SectionKey): Promise<void> {
  await withSectionLock(key, async () => {
    try {
      await fs.unlink(statePath(key));
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  });
}
