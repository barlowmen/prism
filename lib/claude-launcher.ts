/**
 * Claude Code subprocess launcher — the single point of contact with
 * the `claude` CLI. Spawns it with `--print --output-format=stream-json
 * --verbose --permission-mode acceptEdits`, parses the stream-json
 * events into typed AgentStreamEvents, aggregates token usage, and
 * surfaces apiKeySource so the Runs / Health pages can flag any flip
 * away from subscription billing.
 *
 * Why `--permission-mode acceptEdits`: without it, Claude Code stops at
 * every tool-use that would write to disk and asks for permission —
 * which never resolves in headless mode and the run hangs.
 *
 * Why we delete ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN: if the user
 * has those set in their shell, the CLI prefers them over the saved
 * subscription session and bills per-token. Scrubbing them here forces
 * subscription auth every time; the canary value `apiKeySource: "none"`
 * confirms it on each run.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type AgentPhase =
  | "discovery"
  | "dispatch"
  | "research"
  | "draft"
  | "hm_review"
  | "provenance"
  | "assistant"
  | "prep_builder"
  | "probe";

export type AgentStreamEvent =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "status"; phase: string }
  | { type: "tool_use"; tool: string; args: unknown; toolUseId?: string; parentToolUseId?: string | null }
  | { type: "tool_result"; toolUseId: string; isError?: boolean; content?: unknown }
  | { type: "assistant_text"; text: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
    }
  | { type: "rate_limit"; info: unknown }
  | { type: "unknown_event"; raw: unknown }
  | {
      type: "completed";
      exitCode: number;
      structuredResult?: unknown;
      apiKeySource?: string;
      durationMs?: number;
    };

export type LaunchInput = {
  prompt: string;
  cwd: string;
  timeoutMs: number;
  phase: AgentPhase;
  jobId?: string;
  /** Continue an existing Claude Code conversation. */
  resumeSessionId?: string;
  /** Appended to the default system prompt (per-run persona / instructions). */
  appendSystemPrompt?: string;
  onStreamEvent: (e: AgentStreamEvent) => void;
};

export type LaunchResult = {
  runId: string;
  exitCode: number;
  apiKeySource?: string;
  /** Claude Code session id captured from system:init. Used for --resume. */
  claudeSessionId?: string;
  finalText?: string;
  structuredResult?: unknown;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  durationMs: number;
  timedOut: boolean;
};

/**
 * Spawns Claude Code CLI as a subprocess. The ONLY place in this app
 * that runs `claude`. Always unsets ANTHROPIC_API_KEY to force
 * subscription auth (§1.5, §14 of the spec).
 */
export function launchClaude(input: LaunchInput): {
  runId: string;
  done: Promise<LaunchResult>;
  cancel: () => void;
} {
  const runId = randomUUID();
  const start = Date.now();

  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  const args: string[] = [
    "--print",
    "--output-format=stream-json",
    "--verbose",
    // Non-interactive runs have no human to approve edits. Without this
    // flag, `default` mode auto-denies Edit/Write tool use, which breaks
    // every workflow agent that needs to write classification.md /
    // research/*.md / feedback.md / etc.
    "--permission-mode",
    "acceptEdits",
  ];
  if (input.resumeSessionId) {
    args.push("--resume", input.resumeSessionId);
  }
  if (input.appendSystemPrompt) {
    args.push("--append-system-prompt", input.appendSystemPrompt);
  }
  args.push(input.prompt);

  const child = spawn("claude", args, {
    cwd: input.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let apiKeySource: string | undefined;
  let claudeSessionId: string | undefined;
  let finalText: string | undefined;
  let structuredResult: unknown;
  let timedOut = false;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let evt: any;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      input.onStreamEvent({ type: "stdout", text: line });
      return;
    }
    try {
      handleEvent(evt);
    } catch (err) {
      input.onStreamEvent({
        type: "stderr",
        text: `launcher: failed to handle event: ${String(err)}`,
      });
    }
  };

  const handleEvent = (evt: any) => {
    if (!evt || typeof evt !== "object" || typeof evt.type !== "string") {
      input.onStreamEvent({ type: "unknown_event", raw: evt });
      return;
    }
    switch (evt.type) {
      case "system":
        if (evt.subtype === "init") {
          if (typeof evt.apiKeySource === "string") apiKeySource = evt.apiKeySource;
          if (typeof evt.session_id === "string") claudeSessionId = evt.session_id;
        }
        input.onStreamEvent({ type: "status", phase: `system:${evt.subtype ?? "?"}` });
        return;
      case "rate_limit_event":
        input.onStreamEvent({ type: "rate_limit", info: evt.rate_limit_info });
        return;
      case "assistant": {
        const msg = evt.message;
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block?.type === "text" && typeof block.text === "string") {
              input.onStreamEvent({ type: "assistant_text", text: block.text });
            } else if (block?.type === "tool_use") {
              input.onStreamEvent({
                type: "tool_use",
                tool: block.name ?? "?",
                args: block.input,
                toolUseId: block.id,
                parentToolUseId: evt.parent_tool_use_id ?? null,
              });
            }
          }
        }
        const usage = msg?.usage;
        if (usage) {
          const i = usage.input_tokens ?? 0;
          const o = usage.output_tokens ?? 0;
          const cr = usage.cache_read_input_tokens ?? 0;
          const cc = usage.cache_creation_input_tokens ?? 0;
          totalInputTokens += i;
          totalOutputTokens += o;
          totalCacheReadTokens += cr;
          totalCacheCreationTokens += cc;
          input.onStreamEvent({
            type: "usage",
            inputTokens: i,
            outputTokens: o,
            cacheReadTokens: cr,
            cacheCreationTokens: cc,
          });
        }
        return;
      }
      case "user": {
        const msg = evt.message;
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block?.type === "tool_result") {
              input.onStreamEvent({
                type: "tool_result",
                toolUseId: block.tool_use_id,
                isError: block.is_error,
                content: block.content,
              });
            }
          }
        }
        return;
      }
      case "result":
        if (typeof evt.result === "string") finalText = evt.result;
        structuredResult = evt;
        input.onStreamEvent({ type: "status", phase: "result" });
        return;
      default:
        input.onStreamEvent({ type: "unknown_event", raw: evt });
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf8");
    let idx: number;
    while ((idx = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      handleLine(line);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderrBuf += text;
    input.onStreamEvent({ type: "stderr", text });
  });

  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 5000);
  }, input.timeoutMs);

  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    try {
      child.kill("SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 3000);
  };

  const done: Promise<LaunchResult> = new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      // Flush any trailing partial line.
      if (stdoutBuf.trim().length > 0) handleLine(stdoutBuf);
      const durationMs = Date.now() - start;
      input.onStreamEvent({
        type: "completed",
        exitCode: code ?? -1,
        structuredResult,
        apiKeySource,
        durationMs,
      });
      resolve({
        runId,
        exitCode: code ?? -1,
        apiKeySource,
        claudeSessionId,
        finalText,
        structuredResult,
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheCreationTokens,
        durationMs,
        timedOut,
      });
    });
    child.on("error", (err) => {
      input.onStreamEvent({
        type: "stderr",
        text: `launcher: spawn error: ${String(err)}`,
      });
    });
  });

  return { runId, done, cancel };
}

export { INTERVIEWS_DIR } from "./paths";
