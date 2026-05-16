"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { useChat } from "./ChatContext";
import { Button } from "./ui";
import type { ChatMessage, ChatThread } from "@/lib/assistant/types";

type StreamingState = {
  runId: string;
  messageId: string;
  /** Accumulated text from assistant_text events. */
  text: string;
  /** Tool uses observed so far (for inline rendering). */
  toolUses: Array<{ tool: string; toolUseId: string }>;
  completed: boolean;
};

export function ChatDrawer() {
  const { open, setOpen, context } = useChat();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Load thread on demand.
  const refreshThread = useCallback(async (id: string) => {
    const r = await fetch(`/api/assistant/threads/${encodeURIComponent(id)}`);
    if (r.ok) {
      const t = (await r.json()) as ChatThread;
      setThread(t);
    }
  }, []);

  useEffect(() => {
    if (threadId) refreshThread(threadId);
  }, [threadId, refreshThread]);

  // Auto-scroll when content grows.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [thread?.messages.length, streaming?.text]);

  // Subscribe to SSE for the active streaming run.
  useEffect(() => {
    if (!streaming || streaming.completed) return;
    const es = new EventSource(
      `/api/agent-runs/${encodeURIComponent(streaming.runId)}/stream`,
    );
    const onText = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { text?: string };
        if (typeof data.text === "string") {
          setStreaming((s) =>
            s && !s.completed ? { ...s, text: s.text + data.text } : s,
          );
        }
      } catch {}
    };
    const onTool = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { tool?: string; toolUseId?: string };
        if (data.tool && data.toolUseId) {
          setStreaming((s) =>
            s && !s.completed
              ? { ...s, toolUses: [...s.toolUses, { tool: data.tool!, toolUseId: data.toolUseId! }] }
              : s,
          );
        }
      } catch {}
    };
    const onCompleted = () => {
      setStreaming((s) => (s ? { ...s, completed: true } : s));
      // The store has the final assistant text now — refresh.
      if (threadId) refreshThread(threadId);
      es.close();
    };
    const onEnd = () => {
      // SSE replay-only / completed-on-connect.
      setStreaming((s) => (s ? { ...s, completed: true } : s));
      if (threadId) refreshThread(threadId);
      es.close();
    };
    es.addEventListener("assistant_text", onText as any);
    es.addEventListener("tool_use", onTool as any);
    es.addEventListener("completed", onCompleted as any);
    es.addEventListener("end", onEnd as any);
    return () => {
      es.close();
    };
  }, [streaming?.runId, streaming?.completed, threadId, refreshThread]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          message: text,
          context: {
            pathname: context.pathname,
            jobId: context.jobId ?? null,
            summary: context.summary ?? null,
            extras: context.extras ?? null,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setThreadId(data.threadId);
      setInput("");
      setStreaming({
        runId: data.runId,
        messageId: data.assistantMessageId,
        text: "",
        toolUses: [],
        completed: false,
      });
      // Optimistically push the user message into thread so it shows
      // immediately even before refreshThread returns.
      setThread((prev) =>
        prev && prev.id === data.threadId
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: data.userMessageId,
                  role: "user",
                  text,
                  at: new Date().toISOString(),
                } as ChatMessage,
              ],
            }
          : prev,
      );
      // Pull fresh state (with both messages persisted).
      refreshThread(data.threadId);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSending(false);
    }
  }, [input, threadId, context, refreshThread]);

  const cancel = async () => {
    if (!threadId) return;
    await fetch(`/api/assistant/threads/${encodeURIComponent(threadId)}/cancel`, {
      method: "POST",
    }).catch(() => {});
  };

  const newThread = () => {
    setThreadId(null);
    setThread(null);
    setStreaming(null);
    setInput("");
  };

  if (!open) return null;

  const messages = thread?.messages ?? [];

  return (
    <aside
      className="fixed top-0 right-0 bottom-0 z-40 border-l flex flex-col"
      style={{
        width: 420,
        background: "var(--color-bg)",
        borderColor: "var(--color-border)",
        animation: "drawer-slide-in 180ms ease-out",
      }}
    >
      <header
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="text-sm font-medium">Assistant</div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={newThread} icon={<Plus className="w-3 h-3" />} title="New chat">
            New
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="Close drawer"
            title="Close (esc)"
            className="!px-1.5"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
      >
        {messages.length === 0 && !streaming && (
          <div
            className="rounded-md border p-3 text-xs"
            style={{
              background: "var(--color-surface-1)",
              color: "var(--color-fg-muted)",
            }}
          >
            Ask anything about the workflow, or for help with the job
            you&apos;re viewing. I&apos;ll ask before spending tokens.
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "assistant" && streaming && streaming.messageId === m.id) {
            return (
              <Bubble
                key={m.id}
                role="assistant"
                text={streaming.text || "(thinking…)"}
                toolUses={streaming.toolUses}
                live={!streaming.completed}
              />
            );
          }
          return <Bubble key={m.id} role={m.role} text={m.text} status={m.status} />;
        })}
      </div>

      <div
        className="border-t p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        {err && (
          <div className="text-xs mb-2" style={{ color: "var(--color-err)" }}>
            {err}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sending}
          placeholder="Ask anything… (⌘↵ to send)"
          className="w-full px-2 py-1.5 rounded-md border text-sm"
          style={{
            background: "var(--color-surface-1)",
            fontFamily: "var(--font-mono)",
            minHeight: 60,
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-[10px] truncate" style={{ color: "var(--color-fg-muted)" }}>
            ctx: {context.pathname}
            {context.jobId ? ` · ${context.jobId.slice(0, 24)}` : ""}
          </div>
          <div className="flex gap-1">
            {streaming && !streaming.completed && (
              <Button size="sm" onClick={cancel}>
                Stop
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={send}
              disabled={sending || !input.trim()}
              title="⌘↵ to send"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Bubble({
  role,
  text,
  toolUses,
  live,
  status,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  toolUses?: Array<{ tool: string; toolUseId: string }>;
  live?: boolean;
  status?: ChatMessage["status"];
}) {
  if (role === "system") return null;
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[92%] rounded-md border px-3 py-2 text-sm whitespace-pre-wrap"
        style={{
          background: isUser ? "var(--color-accent-bg)" : "var(--color-surface-1)",
          borderColor: live ? "var(--color-accent)" : "var(--color-border)",
        }}
      >
        {toolUses && toolUses.length > 0 && (
          <div
            className="mb-1.5 flex flex-wrap gap-1 text-[10px]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            {toolUses.map((t, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded"
                style={{ background: "var(--color-surface-2)" }}
              >
                {t.tool}
              </span>
            ))}
          </div>
        )}
        <div>{text}</div>
        {status === "failed" && (
          <div className="mt-1 text-[10px]" style={{ color: "var(--color-err)" }}>
            failed
          </div>
        )}
        {live && (
          <span
            className="inline-block w-2 h-2 rounded-full ml-1.5 align-middle"
            style={{
              background: "var(--color-accent)",
              animation: "pulse 1.6s ease-in-out infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}
