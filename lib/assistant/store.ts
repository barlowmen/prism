import "server-only";
/**
 * Disk persistence for ⌘J assistant threads. One JSON per thread under
 * <workspace>/.state/assistant/<threadId>.json. Writes go through a
 * per-thread in-process queue + atomic temp-and-rename, same pattern as
 * lib/jobs/store.ts.
 *
 * `claudeSessionId` lives on the thread record so the launcher can use
 * `--resume <session>` to continue a Claude Code conversation across
 * messages — without it every message would start a fresh session.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { STATE_DIR } from "../paths";
import type { ChatMessage, ChatThread } from "./types";

const ASSISTANT_DIR = path.join(STATE_DIR, "assistant");

const queues = new Map<string, Promise<unknown>>();

async function withThreadLock<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = (queues.get(threadId) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  queues.set(threadId, next);
  try {
    return (await next) as T;
  } finally {
    if (queues.get(threadId) === next) queues.delete(threadId);
  }
}

function threadPath(id: string): string {
  return path.join(ASSISTANT_DIR, `${id}.json`);
}

async function atomicWriteJSON(absPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.${randomUUID()}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
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

export async function readThread(id: string): Promise<ChatThread | null> {
  try {
    const raw = await fs.readFile(threadPath(id), "utf8");
    return JSON.parse(raw) as ChatThread;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function listThreads(): Promise<ChatThread[]> {
  try {
    const entries = await fs.readdir(ASSISTANT_DIR);
    const out: ChatThread[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      try {
        const raw = await fs.readFile(path.join(ASSISTANT_DIR, name), "utf8");
        out.push(JSON.parse(raw) as ChatThread);
      } catch {}
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function createThread(title?: string): Promise<ChatThread> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id,
    claudeSessionId: null,
    title: title ?? "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await withThreadLock(id, async () => {
    await atomicWriteJSON(threadPath(id), thread);
  });
  return thread;
}

export async function appendMessage(
  threadId: string,
  msg: ChatMessage,
): Promise<ChatThread> {
  return withThreadLock(threadId, async () => {
    const thread = await readThread(threadId);
    if (!thread) throw new Error(`thread_not_found:${threadId}`);
    thread.messages.push(msg);
    thread.updatedAt = new Date().toISOString();
    // Auto-title from the first user message.
    if (thread.title === "New chat" && msg.role === "user") {
      thread.title = msg.text.slice(0, 60).replace(/\s+/g, " ").trim() || "New chat";
    }
    await atomicWriteJSON(threadPath(threadId), thread);
    return thread;
  });
}

export async function updateMessage(
  threadId: string,
  messageId: string,
  patch: Partial<ChatMessage>,
): Promise<ChatThread> {
  return withThreadLock(threadId, async () => {
    const thread = await readThread(threadId);
    if (!thread) throw new Error(`thread_not_found:${threadId}`);
    const idx = thread.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) throw new Error(`message_not_found:${messageId}`);
    thread.messages[idx] = { ...thread.messages[idx], ...patch };
    thread.updatedAt = new Date().toISOString();
    await atomicWriteJSON(threadPath(threadId), thread);
    return thread;
  });
}

export async function setClaudeSessionId(
  threadId: string,
  sessionId: string,
): Promise<void> {
  await withThreadLock(threadId, async () => {
    const thread = await readThread(threadId);
    if (!thread) return;
    if (thread.claudeSessionId === sessionId) return;
    thread.claudeSessionId = sessionId;
    thread.updatedAt = new Date().toISOString();
    await atomicWriteJSON(threadPath(threadId), thread);
  });
}
