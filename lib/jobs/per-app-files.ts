import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export type FileEntry = {
  /** Short key the UI uses for tab/section identity. */
  key: string;
  /** Human label for the tab. */
  label: string;
  /** Path relative to the per-app folder. */
  relPath: string;
  exists: boolean;
  size: number;
  mtimeMs: number | null;
  /** UTF-8 content; only set for text files when exists=true. */
  content?: string;
  /** Set when the file is binary (e.g. .docx). */
  binary?: boolean;
};

export type PerAppFiles = {
  folderPath: string | null;
  exists: boolean;
  /** All known/expected files surfaced by the UI, present or not. */
  known: FileEntry[];
  /** The tailored DOCX(s), if any. There should be exactly one but we
   *  tolerate multiples (legacy). */
  finalDocx: FileEntry[];
  /** Any other markdown files at the folder root we don't have a known
   *  slot for — surfaced as "other" tabs so nothing hides. */
  other: FileEntry[];
};

const KNOWN_TEXT_FILES: Array<{ key: string; label: string; relPath: string }> = [
  { key: "job_description", label: "Job description", relPath: "job_description.md" },
  { key: "classification", label: "Classification", relPath: "classification.md" },
  { key: "dispatcher_question", label: "Dispatcher question", relPath: "dispatcher_question.md" },
  { key: "questions", label: "Research questions", relPath: "questions.md" },
  { key: "jd_analysis", label: "JD analysis", relPath: "research/jd_analysis.md" },
  { key: "company_research", label: "Company research", relPath: "research/company_research.md" },
  { key: "resume_examples", label: "Resume examples", relPath: "research/resume_examples.md" },
  { key: "feedback", label: "HM feedback (latest)", relPath: "feedback.md" },
  { key: "feedback_history", label: "HM feedback history", relPath: "feedback_history.md" },
  { key: "provenance", label: "Provenance report", relPath: "provenance.md" },
  { key: "interview_feedback", label: "Interview feedback", relPath: "interview_feedback.md" },
];

/** Slug used by the editable interview-feedback tab. Single source of truth. */
export const INTERVIEW_FEEDBACK_KEY = "interview_feedback";
export const INTERVIEW_FEEDBACK_REL_PATH = "interview_feedback.md";

const TEXT_EXT = new Set([".md", ".txt"]);

async function readEntry(
  folderPath: string,
  rel: string,
  key: string,
  label: string,
  loadContent: boolean,
): Promise<FileEntry> {
  const abs = path.join(folderPath, rel);
  try {
    const stat = await fs.stat(abs);
    const ext = path.extname(rel).toLowerCase();
    const isBinary = !TEXT_EXT.has(ext);
    const entry: FileEntry = {
      key,
      label,
      relPath: rel,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      binary: isBinary,
    };
    if (loadContent && !isBinary && stat.size <= 2_000_000) {
      entry.content = await fs.readFile(abs, "utf8");
    }
    return entry;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { key, label, relPath: rel, exists: false, size: 0, mtimeMs: null };
    }
    throw err;
  }
}

/**
 * Enumerate the per-app folder. Returns metadata + (optionally) inline
 * text content for known files. Binary files (DOCX) are stat-only;
 * callers fetch them via a dedicated endpoint.
 */
export async function readPerAppFiles(
  folderPath: string,
  opts: { loadContent?: boolean } = {},
): Promise<PerAppFiles> {
  const loadContent = opts.loadContent ?? false;

  let folderExists = true;
  try {
    await fs.stat(folderPath);
  } catch {
    folderExists = false;
  }

  if (!folderExists) {
    return { folderPath, exists: false, known: [], finalDocx: [], other: [] };
  }

  const known = await Promise.all(
    KNOWN_TEXT_FILES.map((d) => readEntry(folderPath, d.relPath, d.key, d.label, loadContent)),
  );

  // DOCXes at the folder root (the tailored deliverable).
  let docxEntries: FileEntry[] = [];
  let otherEntries: FileEntry[] = [];
  try {
    const names = await fs.readdir(folderPath);
    const knownRels = new Set(KNOWN_TEXT_FILES.map((d) => d.relPath));
    const knownTopRels = new Set(
      Array.from(knownRels).filter((p) => !p.includes("/")),
    );
    for (const name of names) {
      if (name.startsWith(".")) continue;
      if (name === "research") continue;
      const ext = path.extname(name).toLowerCase();
      if (ext === ".docx") {
        docxEntries.push(
          await readEntry(folderPath, name, `docx:${name}`, name, false),
        );
      } else if (TEXT_EXT.has(ext) && !knownTopRels.has(name)) {
        otherEntries.push(
          await readEntry(folderPath, name, `other:${name}`, name, loadContent),
        );
      }
    }
  } catch {
    // Folder is gone mid-read; treat as empty.
  }

  // Show final DOCX first, with the most-recently-modified preferred.
  docxEntries.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));

  return {
    folderPath,
    exists: true,
    known,
    finalDocx: docxEntries,
    other: otherEntries,
  };
}
