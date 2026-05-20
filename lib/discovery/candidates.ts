import "server-only";
/**
 * Lookup discovery candidate metadata by URL. Reads the most recent
 * `.state/discovery/disc-*.json` file and indexes its candidates by
 * URL so the Shortlist view can enrich each row with company / role /
 * score / archetype / location without a per-row file read.
 *
 * The discovery agent produces these files; each contains:
 *   { runId, generatedAt, candidates: [{ company, role, url, source,
 *     location, compStated, scoreBreakdown, scoreTotal, whyMatched,
 *     jdSnippet }, ...] }
 *
 * Returns an empty index if no discovery has run yet.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { STATE_DIR } from "../paths";

const DISCOVERY_DIR = path.join(STATE_DIR, "discovery");

export type DiscoveryCandidate = {
  company?: string;
  role?: string;
  url?: string;
  source?: string;
  location?: string;
  compStated?: string | null;
  scoreTotal?: number;
  whyMatched?: string;
};

export async function loadDiscoveryIndex(): Promise<Map<string, DiscoveryCandidate>> {
  const out = new Map<string, DiscoveryCandidate>();
  let entries: string[];
  try {
    entries = await fs.readdir(DISCOVERY_DIR);
  } catch (err: any) {
    if (err?.code === "ENOENT") return out;
    throw err;
  }
  const discFiles = entries
    .filter((n) => n.startsWith("disc-") && n.endsWith(".json"))
    // newest first by sorting on the filename (which embeds a timestamp)
    .sort()
    .reverse();
  // Load all of them — older runs may still have candidates the user
  // hasn't triaged. Newer files win on URL collision.
  for (const name of discFiles) {
    try {
      const raw = await fs.readFile(path.join(DISCOVERY_DIR, name), "utf8");
      const parsed = JSON.parse(raw);
      const candidates: any[] = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      for (const c of candidates) {
        if (typeof c?.url !== "string") continue;
        if (out.has(c.url)) continue; // newest wins
        out.set(c.url, {
          company: typeof c.company === "string" ? c.company : undefined,
          role: typeof c.role === "string" ? c.role : undefined,
          url: c.url,
          source: typeof c.source === "string" ? c.source : undefined,
          location: typeof c.location === "string" ? c.location : undefined,
          compStated: typeof c.compStated === "string" ? c.compStated : null,
          scoreTotal: typeof c.scoreTotal === "number" ? c.scoreTotal : undefined,
          whyMatched: typeof c.whyMatched === "string" ? c.whyMatched : undefined,
        });
      }
    } catch {
      // Skip malformed files rather than crashing the page.
    }
  }
  return out;
}
