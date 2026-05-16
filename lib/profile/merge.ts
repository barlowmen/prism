import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { absWorkspace, TRUTH_BASE_FILES } from "../paths";
import { getSection, SECTIONS, type SectionKey } from "./sections";
import { parseProfile } from "./parser";

const PROFILE_PATH = absWorkspace(TRUTH_BASE_FILES.about_user.relPath);
const BACKUPS_DIR = path.join(path.dirname(PROFILE_PATH), ".prism-backups");

export type MergeResult = {
  /** Where the resulting about_user.md was written. */
  path: string;
  /** Path to the backup that was saved before the write. */
  backupPath: string | null;
  /** True if a new about_user.md was created (no prior file existed). */
  createdNew: boolean;
  /** True if an existing section was replaced; false if appended. */
  replaced: boolean;
};

export type ProfileSnapshot = {
  exists: boolean;
  source: string;
};

async function readProfileSource(): Promise<ProfileSnapshot> {
  try {
    const source = await fs.readFile(PROFILE_PATH, "utf8");
    return { exists: true, source };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { exists: false, source: "" };
    throw err;
  }
}

async function backupCurrent(): Promise<string | null> {
  try {
    const source = await fs.readFile(PROFILE_PATH, "utf8");
    await fs.mkdir(BACKUPS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUPS_DIR, `about_user.${stamp}.md`);
    await fs.writeFile(backupPath, source, "utf8");
    return backupPath;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function atomicWrite(absPath: string, content: string): Promise<void> {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.${randomUUID()}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(content, "utf8");
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
 * Normalize a section draft: ensure it starts with the canonical H2 heading
 * for that section. If the draft already has the correct heading, leave it.
 * If it has a different H2, replace with canonical. If no H2, prepend.
 */
function normalizeDraft(key: SectionKey, draft: string): string {
  const def = getSection(key);
  const canonicalLine = `## ${def.canonicalHeading}`;
  const trimmed = draft.trimStart();
  if (trimmed.startsWith("## ")) {
    // Replace whatever H2 the draft has with canonical, preserving the body.
    const firstNl = trimmed.indexOf("\n");
    const body = firstNl >= 0 ? trimmed.slice(firstNl) : "";
    return canonicalLine + body;
  }
  return canonicalLine + "\n\n" + trimmed;
}

/** Build a fresh about_user.md from scratch using committed section drafts.
 *  Used when no prior file exists. */
export function renderFresh(
  drafts: Partial<Record<SectionKey, string>>,
  title: string,
): string {
  const out: string[] = [`# ${title}\n`];
  for (const def of SECTIONS) {
    const d = drafts[def.key];
    if (!d || !d.trim()) continue;
    out.push(normalizeDraft(def.key, d));
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export type CommitInput = {
  key: SectionKey;
  /** The agent's <draft> content (markdown body, with or without H2). */
  draft: string;
  /** Used when creating a fresh file. Defaults to a sensible placeholder. */
  newFileTitle?: string;
};

/**
 * Commit one section's draft into about_user.md atomically. Backs up the
 * existing file under `_meta/.prism-backups/about_user.<iso>.md` first.
 */
export async function commitSection(input: CommitInput): Promise<MergeResult> {
  const def = getSection(input.key);
  const normalized = normalizeDraft(input.key, input.draft).trimEnd() + "\n";

  const snap = await readProfileSource();
  const backupPath = snap.exists ? await backupCurrent() : null;

  if (!snap.exists) {
    // Fresh file. Render with just this section; future commits will fill
    // in the rest.
    const title = input.newFileTitle ?? "About User — Resume Tailoring Profile";
    const content = renderFresh({ [input.key]: input.draft }, title);
    await atomicWrite(PROFILE_PATH, content);
    return {
      path: PROFILE_PATH,
      backupPath: null,
      createdNew: true,
      replaced: false,
    };
  }

  const parsed = parseProfile(snap.source);
  const existing = parsed.sections.find((s) => s.key === input.key);

  let nextSource: string;
  let replaced = false;
  if (existing && existing.present) {
    // Replace the existing section text between [startOffset, endOffset).
    const before = snap.source.slice(0, existing.startOffset);
    const after = snap.source.slice(existing.endOffset);
    // Preserve any whitespace separation between sections.
    nextSource =
      before.replace(/\n+$/, "\n\n") +
      normalized +
      (after.startsWith("\n") ? "" : "\n") +
      after.replace(/^\n+/, "");
    replaced = true;
  } else {
    // Append before the first unknown trailing block or at end-of-file.
    // For simplicity, append at the end with a separator.
    nextSource =
      snap.source.trimEnd() +
      "\n\n" +
      normalized +
      (normalized.endsWith("\n") ? "" : "\n");
  }

  // Normalize trailing whitespace.
  nextSource = nextSource.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

  await atomicWrite(PROFILE_PATH, nextSource);

  return {
    path: PROFILE_PATH,
    backupPath,
    createdNew: false,
    replaced,
  };
}

/** Read the profile source + parse. Returns null on missing. */
export async function loadProfile() {
  const snap = await readProfileSource();
  if (!snap.exists) return null;
  return parseProfile(snap.source);
}

export { PROFILE_PATH, BACKUPS_DIR };
