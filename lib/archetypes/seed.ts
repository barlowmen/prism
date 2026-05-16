import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { RESUMES_DIR } from "../paths";
import { createArchetype, readArchetype, slugify } from "./store";

/**
 * Scan `_resumes/` for `.docx` files and create one Archetype per file,
 * with placeholder label/description/matching-hints the user fills in.
 *
 * Idempotent: skips archetypes whose key already exists. Designed for
 * users migrating an existing workspace that already has one or more
 * base resume DOCXes laid down.
 *
 * For a brand-new install with an empty `_resumes/`, this is a no-op —
 * the user creates archetypes via the **New archetype** flow.
 */
export async function seedDefaults(): Promise<{
  created: string[];
  skipped: string[];
  missing: string[];
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  let docxFiles: string[];
  try {
    docxFiles = (await fs.readdir(RESUMES_DIR))
      .filter((n) => n.toLowerCase().endsWith(".docx") && !n.startsWith("."))
      .sort();
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      missing.push("_resumes/ directory");
      return { created, skipped, missing };
    }
    throw err;
  }

  if (docxFiles.length === 0) {
    missing.push("no .docx files in _resumes/");
    return { created, skipped, missing };
  }

  for (const fileName of docxFiles) {
    // Derive a key from the filename. We strip common version suffixes
    // (_v5, _AI, _Cloud) and use whatever's left as the archetype key.
    const base = fileName.replace(/\.docx$/i, "");
    const key = slugify(deriveKeyFromFilename(base));
    if (!key) continue;

    const existing = await readArchetype(key);
    if (existing) {
      skipped.push(key);
      continue;
    }

    await createArchetype({
      key,
      label: humanLabel(key),
      description:
        "(placeholder — edit this archetype to describe what kinds of roles it targets)",
      matchingHints:
        "(placeholder — list the JD signals that should route a posting to this archetype)",
      baseResumePath: path.posix.join("_resumes", fileName),
      tailoringRules: "",
    });
    created.push(key);
  }

  return { created, skipped, missing };
}

/**
 * "Foo_resume_2026_v5_AI" → "ai"
 * "Foo_Resume_Cloud"      → "cloud"
 * "base_ai"               → "ai"
 * "Resume"                → "resume"
 *
 * Strategy: look for a trailing suffix that looks like an archetype
 * identifier (AI / Cloud / PM / etc.); fall back to the whole stem.
 */
function deriveKeyFromFilename(stem: string): string {
  const tokens = stem
    .split(/[\s_\-.]+/)
    .filter((t) => t.length > 0 && !/^v?\d+/.test(t) && !/^\d{4}$/.test(t));
  if (tokens.length === 0) return stem;
  const last = tokens[tokens.length - 1].toLowerCase();
  // Common archetype-ish trailing tokens. If the last token is one of
  // these we use it as the key. Otherwise fall back to the whole
  // filename slug.
  const known = new Set([
    "ai",
    "cloud",
    "platform",
    "pm",
    "product",
    "infra",
    "infrastructure",
    "research",
    "engineering",
    "sre",
    "security",
    "data",
    "ml",
    "lead",
    "exec",
  ]);
  if (known.has(last)) return last;
  return tokens.join("_").toLowerCase();
}

function humanLabel(key: string): string {
  // Title-case a slug, e.g. "ai" → "AI", "cloud" → "Cloud", "research_infra" → "Research Infra".
  if (key.length <= 4) return key.toUpperCase();
  return key
    .split(/[_-]+/)
    .map((s) => (s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
}
