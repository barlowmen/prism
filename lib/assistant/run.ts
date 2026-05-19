import "server-only";
/**
 * Orchestrator for the ⌘J assistant. Owns the lifecycle of one message
 * round-trip: append the user message to the thread, build a prompt
 * that includes the page-context snapshot, spawn a Claude Code run via
 * the broker, and on completion persist the assistant's reply into the
 * thread.
 *
 * Resumes the prior Claude Code session via `--resume` when the thread
 * has a stored claudeSessionId — that's how the assistant maintains
 * continuity across messages without paying re-prompt cost every turn.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { INTERVIEWS_DIR } from "../paths";
import { startRun } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import {
  appendMessage,
  createThread,
  readThread,
  setClaudeSessionId,
  updateMessage,
} from "./store";
import type { ChatContextSnapshot, ChatMessage } from "./types";

const ASSISTANT_TIMEOUT_MS = 10 * 60 * 1000;

let cachedSystemPrompt: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const p = path.join(process.cwd(), "prompts", "assistant-system.md");
  cachedSystemPrompt = await fs.readFile(p, "utf8");
  return cachedSystemPrompt;
}

function formatContext(ctx: ChatContextSnapshot | null | undefined): string {
  if (!ctx) return "";
  const lines: string[] = ["<context>"];
  lines.push(`path: ${ctx.pathname}`);
  if (ctx.jobId) lines.push(`job_id: ${ctx.jobId}`);
  if (ctx.extras) {
    for (const [k, v] of Object.entries(ctx.extras)) {
      if (v == null || v === "") continue;
      lines.push(`${k}: ${v}`);
    }
  }
  if (ctx.summary && ctx.summary.trim()) {
    lines.push("summary: |");
    for (const line of ctx.summary.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  lines.push("</context>");
  return lines.join("\n");
}

export type SendMessageInput = {
  /** Existing thread id, or null to create a new thread. */
  threadId: string | null;
  message: string;
  context?: ChatContextSnapshot | null;
};

export type SendMessageResult = {
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  runId: string;
  meta: RunMetadata;
};

/**
 * Send a user message to the assistant. Spawns a Claude Code run with
 * `--resume` if the thread has a captured session id; otherwise fresh.
 * The persona / instructions in `prompts/assistant-system.md` are passed
 * via `--append-system-prompt` so they don't burn tokens repeatedly.
 *
 * The run is fire-and-forget; the UI watches it via SSE and the assistant
 * message is updated on disk when the run completes.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  // Resolve thread.
  let thread = input.threadId ? await readThread(input.threadId) : null;
  if (!thread) {
    thread = await createThread();
  }

  // Build prompt: context block + user message.
  const ctxBlock = formatContext(input.context ?? null);
  const prompt = ctxBlock
    ? `${ctxBlock}\n\n${input.message}`
    : input.message;

  // Persist the user message immediately.
  const userMessageId = randomUUID();
  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    text: input.message,
    at: new Date().toISOString(),
    context: input.context ?? null,
  };
  await appendMessage(thread.id, userMessage);

  // Reserve an assistant message slot; we'll fill it in once the run completes.
  const assistantMessageId = randomUUID();
  const assistantPlaceholder: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    text: "",
    at: new Date().toISOString(),
    status: "running",
  };
  await appendMessage(thread.id, assistantPlaceholder);

  const systemPrompt = await getSystemPrompt();

  const { runId, meta, done } = await startRun({
    jobId: null,
    phase: "assistant",
    prompt,
    cwd: INTERVIEWS_DIR,
    timeoutMs: ASSISTANT_TIMEOUT_MS,
    resumeSessionId: thread.claudeSessionId ?? undefined,
    appendSystemPrompt: systemPrompt,
  });

  // Patch the placeholder with the runId for SSE wiring.
  await updateMessage(thread.id, assistantMessageId, { runId });

  done
    .then(async (r) => {
      if (r.claudeSessionId) {
        await setClaudeSessionId(thread!.id, r.claudeSessionId);
      }
      const status =
        r.exitCode === 0 ? "completed" : r.timedOut ? "failed" : "failed";
      await updateMessage(thread!.id, assistantMessageId, {
        text: r.finalText ?? "",
        status,
      });
    })
    .catch(async (err) => {
      await updateMessage(thread!.id, assistantMessageId, {
        text: `[assistant error: ${String(err?.message ?? err)}]`,
        status: "failed",
      });
    });

  return {
    threadId: thread.id,
    userMessageId,
    assistantMessageId,
    runId,
    meta,
  };
}
