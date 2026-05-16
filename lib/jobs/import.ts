import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { APPS_DIR } from "../paths";
import { createJob, deriveJobId, readJob } from "./store";
import type { Job, JobStatus } from "./types";

export type ImportFinding = {
  id: string;
  company: string;
  role: string;
  folderPath: string;
  status: "created" | "already_exists" | "skipped" | "error";
  reason?: string;
  suggestion?: JobStatus | null;
  sourceUrl?: string | null;
};

/**
 * Walk <workspace>/apps/<Company>/<Role>/ and create a Job for each one
 * that doesn't already have a state file. Imported jobs start with
 * status="imported"; the Job detail page prompts the user to
 * reclassify. Idempotent — re-running on the same workspace is safe.
 *
 * Note: do NOT parse README.md to guess status. The status dropdown on
 * the Job detail page is the user's confirmation step.
 */
export async function importAppsFolders(): Promise<ImportFinding[]> {
  const findings: ImportFinding[] = [];

  let companies: string[] = [];
  try {
    companies = (await fs.readdir(APPS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  for (const company of companies) {
    const companyDir = path.join(APPS_DIR, company);
    let roles: string[];
    try {
      roles = (await fs.readdir(companyDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const role of roles) {
      const folderPath = path.join(companyDir, role);
      const finding = await importOne(company, role, folderPath);
      findings.push(finding);
    }
  }
  return findings;
}

async function importOne(
  company: string,
  role: string,
  folderPath: string,
): Promise<ImportFinding> {
  const id = deriveJobId(company, role);

  // Idempotent: bail if the state file already exists.
  const existing = await readJob(id);
  if (existing) {
    return {
      id,
      company,
      role,
      folderPath,
      status: "already_exists",
    };
  }

  let sourceUrl: string | null = null;
  let discoveredAt: string | undefined;
  try {
    const jdPath = path.join(folderPath, "job_description.md");
    const stat = await fs.stat(jdPath);
    discoveredAt = stat.mtime.toISOString();
    const head = await readHead(jdPath, 60);
    sourceUrl = extractUrl(head);
  } catch {
    // No JD; that's fine — leave both fields null.
  }

  const suggestion = await reclassifySuggestion(folderPath);

  try {
    const job = await createJob({
      id,
      company,
      role,
      folderPath,
      status: "imported",
      source: "imported",
      sourceUrl,
      discoveredAt,
      reclassifySuggestion: suggestion,
    } satisfies Parameters<typeof createJob>[0]);
    return {
      id,
      company,
      role,
      folderPath,
      status: "created",
      suggestion: job.reclassifySuggestion ?? null,
      sourceUrl: job.sourceUrl,
    };
  } catch (err) {
    return {
      id,
      company,
      role,
      folderPath,
      status: "error",
      reason: String(err),
    };
  }
}

async function readHead(filePath: string, nLines: number): Promise<string> {
  const content = await fs.readFile(filePath, "utf8");
  return content.split(/\r?\n/).slice(0, nLines).join("\n");
}

/** First http(s) URL in a markdown blob. Stripped of trailing punctuation. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)\]<>"']+/);
  if (!m) return null;
  return m[0].replace(/[.,;:]+$/, "");
}

/**
 * Cheap heuristics that suggest a likely real status for an imported
 * folder. The user always confirms — these are suggestions, never
 * authoritative. Returns null when no signal is strong enough.
 */
export async function reclassifySuggestion(
  folderPath: string,
): Promise<JobStatus | null> {
  const has = async (rel: string) =>
    fs
      .stat(path.join(folderPath, rel))
      .then(() => true)
      .catch(() => false);
  const readIfExists = async (rel: string): Promise<string | null> => {
    try {
      return await fs.readFile(path.join(folderPath, rel), "utf8");
    } catch {
      return null;
    }
  };

  let entries: string[] = [];
  try {
    entries = await fs.readdir(folderPath);
  } catch {
    return null;
  }
  // Any .docx at the folder root is the tailored deliverable.
  const hasFinalDocx = entries.some(
    (n) => n.toLowerCase().endsWith(".docx") && !n.startsWith("."),
  );

  // DOCX presence is the strongest signal — the workflow ran past every
  // upstream gate to produce one. Even if a stale dispatcher_question.md
  // is still on disk, the user already answered it some other way.
  if (hasFinalDocx) return "ready_for_user_review";

  const cls = await readIfExists("classification.md");
  if (cls && /RECOMMEND[-\s]?SKIP/i.test(cls)) return "recommended_skip";

  const dq = await readIfExists("dispatcher_question.md");
  if (dq && !/^##\s+Answer/im.test(dq)) return "awaiting_input";

  const rq = await readIfExists("questions.md");
  if (rq && rq.trim().length > 0 && !/^##\s+Answer/im.test(rq)) {
    return "awaiting_input";
  }

  if (await has("feedback.md")) return "hm_review";
  if (await has("research/jd_analysis.md")) return "drafting";
  if (cls) return "researching";

  return null;
}
