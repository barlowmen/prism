import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import {
  absWorkspace,
  TRUTH_BASE_FILES,
  WORKSPACE_DIR,
  type TruthBaseSlug,
} from "./paths";
import { launchClaude } from "./claude-launcher";
import { listSummaries as listArchetypeSummaries } from "./archetypes/store";

const execFileP = promisify(execFile);

export type CliInfo =
  | { installed: true; version: string; path?: string }
  | { installed: false; error: string };

export type AuthProbe =
  | {
      ok: true;
      apiKeySource: string;
      isSubscription: boolean;
      durationMs: number;
      tokenTotals: { input: number; output: number; cacheRead: number; cacheCreation: number };
    }
  | { ok: false; error: string; durationMs: number }
  | { ok: "pending" };

export type FileCheck = {
  relPath: string;
  exists: boolean;
  size: number;
  mtimeMs: number | null;
  empty: boolean;
};

export type HealthReport = {
  checkedAt: string;
  cli: CliInfo;
  auth: AuthProbe;
  truthBase: Array<FileCheck & { slug: TruthBaseSlug; title: string }>;
  baseResumes: FileCheck[];
  interviewsDir: { absPath: string; exists: boolean };
};

async function statCheck(absPath: string, relPath: string): Promise<FileCheck> {
  try {
    const s = await fs.stat(absPath);
    return {
      relPath,
      exists: true,
      size: s.size,
      mtimeMs: s.mtimeMs,
      empty: s.size === 0,
    };
  } catch {
    return { relPath, exists: false, size: 0, mtimeMs: null, empty: true };
  }
}

async function getCliInfo(): Promise<CliInfo> {
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const { stdout } = await execFileP("claude", ["--version"], { env, timeout: 5000 });
    const version = stdout.trim();
    let cliPath: string | undefined;
    try {
      const { stdout: which } = await execFileP("which", ["claude"], { env, timeout: 2000 });
      cliPath = which.trim();
    } catch {}
    return { installed: true, version, path: cliPath };
  } catch (err: any) {
    return { installed: false, error: String(err?.message ?? err) };
  }
}

async function probeAuth(): Promise<AuthProbe> {
  const start = Date.now();
  try {
    const { done } = launchClaude({
      prompt: "Reply with exactly: HEALTH_OK",
      cwd: WORKSPACE_DIR,
      timeoutMs: 60_000,
      phase: "probe",
      onStreamEvent: () => {},
    });
    const r = await done;
    const durationMs = Date.now() - start;
    if (!r.apiKeySource) {
      return {
        ok: false,
        error: `No apiKeySource observed (exit=${r.exitCode}, timedOut=${r.timedOut})`,
        durationMs,
      };
    }
    return {
      ok: true,
      apiKeySource: r.apiKeySource,
      isSubscription: r.apiKeySource === "none",
      durationMs,
      tokenTotals: {
        input: r.totalInputTokens,
        output: r.totalOutputTokens,
        cacheRead: r.totalCacheReadTokens,
        cacheCreation: r.totalCacheCreationTokens,
      },
    };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), durationMs: Date.now() - start };
  }
}

/**
 * Build a full health report.
 *
 * The auth probe spawns a real Claude Code subprocess and takes ~3s. The
 * default skips it so the server-rendered page paints fast; the client
 * fires a fetch right after mount to run the probe via /api/health.
 */
export async function getHealth(
  opts: { skipAuthProbe?: boolean } = {},
): Promise<HealthReport> {
  const truthBaseSlugs = Object.keys(TRUTH_BASE_FILES) as TruthBaseSlug[];

  const [cli, auth, workspaceExists, truthBase, archetypes] = await Promise.all([
    getCliInfo(),
    opts.skipAuthProbe
      ? Promise.resolve<AuthProbe>({ ok: "pending" })
      : probeAuth(),
    fs
      .stat(WORKSPACE_DIR)
      .then(() => true)
      .catch(() => false),
    Promise.all(
      truthBaseSlugs.map(async (slug) => {
        const def = TRUTH_BASE_FILES[slug];
        const check = await statCheck(absWorkspace(def.relPath), def.relPath);
        return { slug, title: def.title, ...check };
      }),
    ),
    listArchetypeSummaries().catch(() => []),
  ]);

  // Surface each archetype's base resume as a file check so the health
  // card shows missing-on-disk warnings instead of the old hardcoded list.
  const baseResumes: FileCheck[] = archetypes.map((a) => ({
    relPath: a.baseResumePath || `(${a.key}: no base set)`,
    exists: a.baseResumeExists,
    size: a.baseResumeSize ?? 0,
    mtimeMs: a.baseResumeMtimeMs ?? null,
    empty: !a.baseResumeExists || (a.baseResumeSize ?? 0) === 0,
  }));

  return {
    checkedAt: new Date().toISOString(),
    cli,
    auth,
    truthBase,
    baseResumes,
    interviewsDir: { absPath: WORKSPACE_DIR, exists: workspaceExists },
  };
}
