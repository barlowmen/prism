import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { absInterviews, TRUTH_BASE_FILES, type TruthBaseSlug } from "./paths";

export type TruthBaseRead = {
  slug: TruthBaseSlug;
  relPath: string;
  absPath: string;
  exists: boolean;
  size: number;
  mtimeMs: number | null;
  content: string;
};

/** Reads a Truth Base file by slug. Returns content + metadata. */
export async function readTruthBase(slug: TruthBaseSlug): Promise<TruthBaseRead> {
  const def = TRUTH_BASE_FILES[slug];
  const absPath = absInterviews(def.relPath);
  try {
    const [stat, content] = await Promise.all([
      fs.stat(absPath),
      fs.readFile(absPath, "utf8"),
    ]);
    return {
      slug,
      relPath: def.relPath,
      absPath,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      content,
    };
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return {
        slug,
        relPath: def.relPath,
        absPath,
        exists: false,
        size: 0,
        mtimeMs: null,
        content: "",
      };
    }
    throw err;
  }
}

/**
 * Atomically write a Truth Base file: write to a temp file in the same
 * directory, fsync, then rename over the destination. The existing CLI
 * workflow may be reading these files concurrently and must never see
 * a partially-written file.
 */
export async function writeTruthBase(
  slug: TruthBaseSlug,
  content: string,
): Promise<{ size: number; mtimeMs: number }> {
  const def = TRUTH_BASE_FILES[slug];
  const absPath = absInterviews(def.relPath);
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmpPath = path.join(dir, `.${base}.${randomUUID()}.tmp`);

  await fs.mkdir(dir, { recursive: true });

  const fh = await fs.open(tmpPath, "w");
  try {
    await fh.writeFile(content, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.rename(tmpPath, absPath);
  } catch (err) {
    // Best-effort cleanup if rename failed.
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
  const stat = await fs.stat(absPath);
  return { size: stat.size, mtimeMs: stat.mtimeMs };
}

export function isValidTruthBaseSlug(slug: string): slug is TruthBaseSlug {
  return Object.prototype.hasOwnProperty.call(TRUTH_BASE_FILES, slug);
}
