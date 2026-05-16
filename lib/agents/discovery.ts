import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { INTERVIEWS_DIR, STATE_DIR } from "../paths";
import { loadPrompt } from "../prompt-template";
import { startRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import { createJob, deriveJobId, readJob } from "../jobs/store";

const DISCOVERY_TIMEOUT_MS = 20 * 60 * 1000;

const DISCOVERY_DIR = path.join(STATE_DIR, "discovery");

export type DiscoveryCandidate = {
  company: string;
  role: string;
  url: string;
  source: string;
  location?: string | null;
  compStated?: string | null;
  scoreBreakdown?: Record<string, number>;
  scoreTotal: number;
  whyMatched?: string;
  jdSnippet?: string;
};

export type DiscoveryFile = {
  runId: string;
  generatedAt: string;
  candidates: DiscoveryCandidate[];
  filteredHardCount?: number;
  sourceCounts?: Record<string, number>;
};

export async function startDiscovery(): Promise<{
  runId: string;
  meta: RunMetadata;
}> {
  await fs.mkdir(DISCOVERY_DIR, { recursive: true });

  // Pre-allocate the runId by letting startRun pick one then patching the
  // prompt isn't possible — the prompt template needs RUN_ID upfront. So:
  // create the runId ourselves by minting one and passing it through, but
  // the broker will use its own. Use a placeholder marker that the agent
  // can replace with the actual runId by reading the {{RUN_ID}} variable
  // we substitute now.
  const runIdMarker = `disc-${Date.now()}`;
  const prompt = await loadPrompt("discovery.md", {
    RUN_ID: runIdMarker,
  });

  const { runId, meta, done } = startRun({
    jobId: null,
    phase: "discovery",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: DISCOVERY_TIMEOUT_MS,
  });

  done
    .then(async () => {
      await routeAfterDiscovery(runIdMarker);
    })
    .catch(() => {
      // Failures show up in /settings/runs.
    });

  return { runId, meta };
}

/**
 * After discovery completes, read the candidates JSON the agent wrote and
 * create a Job record with status="discovered" for each candidate. Skips
 * ones whose company/role already maps to an existing job.
 */
async function routeAfterDiscovery(discoveryMarker: string): Promise<void> {
  const discFile = path.join(DISCOVERY_DIR, `${discoveryMarker}.json`);
  let parsed: DiscoveryFile;
  try {
    parsed = JSON.parse(await fs.readFile(discFile, "utf8")) as DiscoveryFile;
  } catch {
    return;
  }
  for (const c of parsed.candidates ?? []) {
    const id = deriveJobId(c.company, c.role);
    const existing = await readJob(id);
    if (existing) continue;
    try {
      await createJob({
        id,
        company: c.company,
        role: c.role,
        folderPath: null,
        status: "discovered",
        source: "discovered",
        sourceUrl: c.url,
      });
    } catch {
      // Ignore duplicates / races.
    }
  }
}

export async function readDiscoveryFile(runIdOrMarker: string): Promise<DiscoveryFile | null> {
  try {
    const raw = await fs.readFile(path.join(DISCOVERY_DIR, `${runIdOrMarker}.json`), "utf8");
    return JSON.parse(raw) as DiscoveryFile;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function listDiscoveryFiles(): Promise<string[]> {
  try {
    return (await fs.readdir(DISCOVERY_DIR))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .reverse();
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}
