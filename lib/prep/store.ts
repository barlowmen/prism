import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { APPS_DIR, PREP_DIR } from "../paths";
import {
  classifyGroup,
  GROUP_ORDER,
  type PrepFile,
  type PrepGroup,
} from "./types";

export type { PrepFile, PrepGroup } from "./types";
export {
  GROUP_LABELS,
  GROUP_ORDER,
  classifyGroup,
  isValidCompanySlug,
} from "./types";

export type PrepCompany = {
  /** Folder name under prep/ */
  company: string;
  absPath: string;
  fileCount: number;
  lastModifiedMs: number | null;
  /** True if 00-overview.md exists — heuristic for "bootstrapped". */
  bootstrapped: boolean;
};

const TEXT_EXT = new Set([".md", ".txt"]);

/**
 * List every company that has a folder under workspace/prep/. Returns the
 * file count and most-recent mtime as a quick-glance summary.
 */
export async function listPrepCompanies(): Promise<PrepCompany[]> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(PREP_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  const out: PrepCompany[] = [];
  for (const company of entries) {
    const absPath = path.join(PREP_DIR, company);
    const summary = await summarizeFolder(absPath);
    out.push({ company, absPath, ...summary });
  }
  out.sort((a, b) => (b.lastModifiedMs ?? 0) - (a.lastModifiedMs ?? 0));
  return out;
}

async function summarizeFolder(
  abs: string,
): Promise<Omit<PrepCompany, "company" | "absPath">> {
  let fileCount = 0;
  let lastModifiedMs: number | null = null;
  let bootstrapped = false;

  const walk = async (p: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const ep = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(ep);
      } else {
        fileCount++;
        try {
          const stat = await fs.stat(ep);
          if (lastModifiedMs == null || stat.mtimeMs > lastModifiedMs) {
            lastModifiedMs = stat.mtimeMs;
          }
        } catch {}
        if (p === abs && /^00-overview\.md$/i.test(e.name)) {
          bootstrapped = true;
        }
      }
    }
  };
  await walk(abs);
  return { fileCount, lastModifiedMs, bootstrapped };
}

/**
 * Recursively enumerate markdown/text files under prep/<Company>/. Returns
 * file metadata sorted by group then by filename. Binary files are
 * included with `binary: true` so the UI can decide what to do.
 */
export async function readPrepFiles(company: string): Promise<{
  exists: boolean;
  files: PrepFile[];
}> {
  const root = path.join(PREP_DIR, company);
  try {
    await fs.stat(root);
  } catch {
    return { exists: false, files: [] };
  }

  const files: PrepFile[] = [];
  const walk = async (p: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const ep = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(ep);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      const isText = TEXT_EXT.has(ext);
      try {
        const stat = await fs.stat(ep);
        const relPath = path.relative(root, ep).split(path.sep).join("/");
        files.push({
          relPath,
          name: e.name,
          group: classifyGroup(relPath),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          binary: !isText,
        });
      } catch {}
    }
  };
  await walk(root);

  files.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.relPath.localeCompare(b.relPath);
  });
  return { exists: true, files };
}

/** Atomic file write — temp-and-rename so half-written files don't appear. */
export async function writePrepFile(
  company: string,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = path.join(PREP_DIR, company, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, abs);
}

export async function readPrepFile(
  company: string,
  relPath: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path.join(PREP_DIR, company, relPath), "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Look up the per-application research/ folder for a company. Returns the
 * absolute path if exactly one role exists; null otherwise. Used by the
 * prep-builder agent so it can include company_research.md as context.
 */
export async function findPrimaryRoleFolder(
  company: string,
): Promise<{ role: string; absPath: string } | null> {
  const companyDir = path.join(APPS_DIR, company);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(companyDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  // Pick the most recently modified role folder; that's almost always the
  // active application.
  let bestRole = entries[0];
  let bestMtime = 0;
  for (const role of entries) {
    try {
      const stat = await fs.stat(path.join(companyDir, role));
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs;
        bestRole = role;
      }
    } catch {}
  }
  return { role: bestRole, absPath: path.join(companyDir, bestRole) };
}

