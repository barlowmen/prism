import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { INTERVIEWS_DIR } from "../paths";
import { startRun, getRunSnapshot } from "../runs/broker";
import type { RunMetadata } from "../runs/types";
import {
  appendMessage,
  createThread,
  readThread,
  setClaudeSessionId,
  updateMessage,
} from "../assistant/store";
import type { ChatMessage } from "../assistant/types";
import { getSection, type SectionKey } from "./sections";
import { parseProfile } from "./parser";
import { loadProfile } from "./merge";
import { readSectionState, upsertSectionState } from "./store";

const TIMEOUT_MS = 10 * 60 * 1000;

const PROMPTS_BASE = path.join(process.cwd(), "prompts", "profile");

const cachedPrompts = new Map<string, string>();
async function readPrompt(name: string): Promise<string> {
  if (cachedPrompts.has(name)) return cachedPrompts.get(name)!;
  const text = await fs.readFile(path.join(PROMPTS_BASE, name), "utf8");
  cachedPrompts.set(name, text);
  return text;
}

/**
 * Compose the per-section system prompt: shared interviewer preamble +
 * section-specific brief + the current priors block.
 */
async function composeSystemPrompt(key: SectionKey): Promise<string> {
  const def = getSection(key);
  const [shared, sectionBrief] = await Promise.all([
    readPrompt("_shared.md"),
    readPrompt(`${key}.md`),
  ]);

  // Priors: the current corresponding H2 section in about_user.md, if any.
  const parsed = await loadProfile();
  let priorsBlock = "";
  if (!parsed) {
    priorsBlock = `# Priors\n\nNo existing profile file. This is a fresh intake.`;
  } else {
    const section = parsed.sections.find((s) => s.key === key);
    if (section?.present) {
      priorsBlock = `# Priors\n\nCurrent content for this section in about_user.md:\n\n---\n${section.content.trim()}\n---\n\nYour job is to refresh or fill gaps — do NOT re-ask things this already answers.`;
    } else {
      priorsBlock = `# Priors\n\nThis section is NOT YET in about_user.md. Build it from scratch via the interview.`;
    }
  }

  return [
    shared.trim(),
    "",
    "---",
    "",
    `# Section brief`,
    "",
    sectionBrief.trim(),
    "",
    "---",
    "",
    priorsBlock,
  ].join("\n");
}

/** Parse the last `<draft>...</draft>` from an assistant message. */
export function parseDraftFromText(text: string): string | null {
  // Match the LAST draft block.
  const matches = [...text.matchAll(/<draft>([\s\S]*?)<\/draft>/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].trim();
}

export type SendSectionMessageInput = {
  key: SectionKey;
  message: string;
};

export type SendSectionMessageResult = {
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  runId: string;
  meta: RunMetadata;
};

/**
 * Send a user message in a section's interview. If no thread exists yet,
 * one is created and the system prompt + priors are composed fresh. On
 * the second-and-later turn we use `--resume` to continue the same
 * conversation.
 */
export async function sendSectionMessage(
  input: SendSectionMessageInput,
): Promise<SendSectionMessageResult> {
  const state = await readSectionState(input.key);
  let thread = state?.threadId ? await readThread(state.threadId) : null;
  if (!thread) {
    thread = await createThread(`Profile interview — ${input.key}`);
    await upsertSectionState(input.key, {
      threadId: thread.id,
      status: "in_progress",
    });
  }

  const userMessageId = randomUUID();
  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    text: input.message,
    at: new Date().toISOString(),
  };
  await appendMessage(thread.id, userMessage);

  const assistantMessageId = randomUUID();
  await appendMessage(thread.id, {
    id: assistantMessageId,
    role: "assistant",
    text: "",
    at: new Date().toISOString(),
    status: "running",
  });

  // Compose the system prompt fresh every turn — priors are cheap and
  // ensure the agent sees the latest about_user.md state in case a
  // previous section's commit landed between turns.
  const systemPrompt = await composeSystemPrompt(input.key);

  const { runId, meta, done } = startRun({
    jobId: null,
    phase: "assistant",
    prompt: input.message,
    cwd: INTERVIEWS_DIR,
    timeoutMs: TIMEOUT_MS,
    resumeSessionId: thread.claudeSessionId ?? undefined,
    appendSystemPrompt: systemPrompt,
  });

  await updateMessage(thread.id, assistantMessageId, { runId });

  done
    .then(async (r) => {
      if (r.claudeSessionId) {
        await setClaudeSessionId(thread!.id, r.claudeSessionId);
      }
      const finalText = r.finalText ?? "";
      await updateMessage(thread!.id, assistantMessageId, {
        text: finalText,
        status: r.exitCode === 0 ? "completed" : "failed",
      });
      const draft = parseDraftFromText(finalText);
      if (draft) {
        await upsertSectionState(input.key, {
          status: "drafted",
          draft,
          draftAt: new Date().toISOString(),
        });
      }
    })
    .catch(async (err) => {
      await updateMessage(thread!.id, assistantMessageId, {
        text: `[interview error: ${String(err?.message ?? err)}]`,
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

/** Read the system prompt the orchestrator would compose, useful for the UI's preview. */
export async function previewSystemPrompt(key: SectionKey): Promise<string> {
  return composeSystemPrompt(key);
}
