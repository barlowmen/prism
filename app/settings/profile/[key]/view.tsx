"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { ChatMessage, ChatThread } from "@/lib/assistant/types";
import type { SectionKey } from "@/lib/profile/sections";
import type { SectionState } from "@/lib/profile/store";

type StreamingState = {
  runId: string;
  messageId: string;
  text: string;
  toolUses: Array<{ tool: string; toolUseId: string }>;
  completed: boolean;
};

function extractLastDraft(text: string): string | null {
  const matches = [...text.matchAll(/<draft>([\s\S]*?)<\/draft>/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].trim();
}

function stripDraftBlocks(text: string): string {
  // Hide the (often long) draft from the chat bubble; the user sees it in
  // the draft pane instead.
  return text
    .replace(/<draft>[\s\S]*?<\/draft>/g, "[draft updated — see panel →]")
    .trim();
}

export function SectionInterviewView({
  sectionKey,
  sectionLabel,
  canonicalHeading,
  existingContent,
  initialThread,
  initialState,
}: {
  sectionKey: SectionKey;
  sectionLabel: string;
  canonicalHeading: string;
  existingContent: string | null;
  initialThread: ChatThread | null;
  initialState: SectionState | null;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ChatThread | null>(initialThread);
  const [sectionState, setSectionState] = useState<SectionState | null>(initialState);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const refreshThread = useCallback(async (threadId: string) => {
    const r = await fetch(`/api/assistant/threads/${encodeURIComponent(threadId)}`);
    if (r.ok) setThread((await r.json()) as ChatThread);
  }, []);

  const refreshState = useCallback(async () => {
    const r = await fetch(`/api/profile/state`);
    if (!r.ok) return;
    const data = await r.json();
    const my = data.sections.find((s: any) => s.key === sectionKey);
    if (!my) return;
    // Pull the full state record for our section.
    setSectionState((prev) => ({
      key: sectionKey,
      status: my.interviewStatus,
      threadId: my.threadId,
      draft: prev?.draft ?? null,
      draftAt: my.draftAt,
      committedAt: my.committedAt,
      updatedAt: my.updatedAt ?? new Date().toISOString(),
    }));
  }, [sectionKey]);

  // SSE for the streaming run.
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
    const onDone = async () => {
      setStreaming((s) => (s ? { ...s, completed: true } : s));
      if (thread) await refreshThread(thread.id);
      await refreshState();
      // The store update lags by an event-loop tick; another refresh.
      setTimeout(async () => {
        if (thread) await refreshThread(thread.id);
        await refreshState();
      }, 400);
      es.close();
    };
    es.addEventListener("assistant_text", onText as any);
    es.addEventListener("tool_use", onTool as any);
    es.addEventListener("completed", onDone as any);
    es.addEventListener("end", onDone as any);
    return () => es.close();
  }, [streaming?.runId, streaming?.completed, thread, refreshThread, refreshState]);

  // Pull the latest draft from the most recent assistant message.
  const liveDraft = (() => {
    if (streaming && !streaming.completed) {
      const d = extractLastDraft(streaming.text);
      if (d) return d;
    }
    if (thread) {
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        const m = thread.messages[i];
        if (m.role !== "assistant") continue;
        const d = extractLastDraft(m.text);
        if (d) return d;
      }
    }
    return sectionState?.draft ?? null;
  })();

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [thread?.messages.length, streaming?.text]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/profile/sections/${encodeURIComponent(sectionKey)}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setInput("");
      setStreaming({
        runId: data.runId,
        messageId: data.assistantMessageId,
        text: "",
        toolUses: [],
        completed: false,
      });
      await refreshThread(data.threadId);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSending(false);
    }
  }, [input, sectionKey, refreshThread]);

  const commit = async () => {
    if (!liveDraft) return;
    setCommitting(true);
    setCommitMsg(null);
    try {
      const r = await fetch(
        `/api/profile/sections/${encodeURIComponent(sectionKey)}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: liveDraft }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setCommitMsg(`error: ${data.error ?? r.status}`);
        return;
      }
      setCommitMsg(
        data.createdNew
          ? "created new about_user.md"
          : data.replaced
            ? `replaced section in about_user.md (backup: ${data.backupPath?.split("/").pop()})`
            : `appended section to about_user.md (backup: ${data.backupPath?.split("/").pop()})`,
      );
      await refreshState();
      router.refresh();
    } finally {
      setCommitting(false);
    }
  };

  const discard = async () => {
    if (!confirm("Discard the interview thread for this section? The chat history will be deleted.")) {
      return;
    }
    await fetch(
      `/api/profile/sections/${encodeURIComponent(sectionKey)}/discard`,
      { method: "POST" },
    );
    setThread(null);
    setSectionState(null);
    setStreaming(null);
    setCommitMsg(null);
    router.refresh();
  };

  const messages = thread?.messages ?? [];
  const hasDraft = !!liveDraft;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
      {/* LEFT: chat panel */}
      <section
        className="rounded-md border flex flex-col"
        style={{
          background: "var(--color-surface-1)",
          minHeight: 520,
          maxHeight: "calc(100vh - 220px)",
        }}
      >
        <header
          className="px-4 py-2 border-b text-xs flex items-center justify-between"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span style={{ color: "var(--color-fg-muted)" }}>
            interview · {messages.length} messages
          </span>
          {thread && (
            <button
              onClick={discard}
              className="text-[11px] hover:underline inline-flex items-center gap-1"
              style={{ color: "var(--color-fg-muted)" }}
              aria-label="Discard thread"
            >
              <Trash2 className="w-3 h-3" />
              Discard thread
            </button>
          )}
        </header>
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && !streaming && (
            <div
              className="text-xs rounded border p-3"
              style={{
                background: "var(--color-surface-2)",
                color: "var(--color-fg-muted)",
              }}
            >
              No messages yet. Say hi or jump straight in (&quot;ready when you
              are&quot;). The agent has the section brief and the current{" "}
              <code className="text-xs">about_user.md</code> as priors — it will
              ask only what&apos;s missing.
            </div>
          )}
          {messages.map((m) => {
            if (m.role === "system") return null;
            const isUser = m.role === "user";
            const streamingThis =
              streaming && streaming.messageId === m.id && !streaming.completed;
            const display = streamingThis
              ? stripDraftBlocks(streaming.text) || "(thinking…)"
              : stripDraftBlocks(m.text);
            const tools = streamingThis ? streaming.toolUses : [];
            return (
              <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                <div
                  className="max-w-[92%] rounded-md border px-3 py-2 text-sm whitespace-pre-wrap"
                  style={{
                    background: isUser
                      ? "var(--color-accent-bg)"
                      : "var(--color-bg)",
                    borderColor: streamingThis
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                  }}
                >
                  {tools.length > 0 && (
                    <div
                      className="mb-1.5 flex flex-wrap gap-1 text-[10px]"
                      style={{ color: "var(--color-fg-muted)" }}
                    >
                      {tools.map((t, i) => (
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
                  {display}
                  {streamingThis && (
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
            placeholder={
              messages.length === 0
                ? "Say 'ready' to begin, or jump in with the first thing you want to capture…"
                : "Reply (⌘↵ to send)"
            }
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{
              background: "var(--color-surface-2)",
              fontFamily: "var(--font-mono)",
              minHeight: 60,
            }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={send}
              disabled={sending || !input.trim()}
              title="⌘↵ to send"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </section>

      {/* RIGHT: draft + diff */}
      <section className="space-y-4">
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: hasDraft ? "var(--color-accent)" : "var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Draft</div>
            <div className="flex items-center gap-2">
              {hasDraft && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={commit}
                  disabled={committing}
                >
                  {committing ? "Committing…" : `Commit to about_user.md`}
                </Button>
              )}
            </div>
          </div>
          {commitMsg && (
            <div
              className="text-xs mb-2"
              style={{ color: commitMsg.startsWith("error") ? "var(--color-err)" : "var(--color-ok)" }}
            >
              {commitMsg}
            </div>
          )}
          {!hasDraft && (
            <div
              className="text-xs"
              style={{ color: "var(--color-fg-muted)" }}
            >
              No draft yet. When the agent emits a{" "}
              <code className="text-xs">&lt;draft&gt;…&lt;/draft&gt;</code>{" "}
              block, the latest version shows here.
            </div>
          )}
          {hasDraft && (
            <pre
              className="text-xs overflow-x-auto rounded p-3"
              style={{
                background: "var(--color-surface-2)",
                fontFamily: "var(--font-mono)",
                maxHeight: 520,
                whiteSpace: "pre-wrap",
              }}
            >
              {liveDraft}
            </pre>
          )}
        </div>

        <details
          className="rounded-md border p-3"
          style={{ background: "var(--color-surface-1)" }}
        >
          <summary
            className="text-xs cursor-pointer"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Current content in about_user.md ({existingContent ? "present" : "missing"})
          </summary>
          {existingContent ? (
            <pre
              className="mt-3 text-xs overflow-x-auto rounded p-3"
              style={{
                background: "var(--color-surface-2)",
                fontFamily: "var(--font-mono)",
                maxHeight: 420,
                whiteSpace: "pre-wrap",
              }}
            >
              {existingContent}
            </pre>
          ) : (
            <div
              className="mt-3 text-xs"
              style={{ color: "var(--color-fg-muted)" }}
            >
              This section does not yet exist in about_user.md. Committing the
              draft will append it under the canonical heading{" "}
              <code className="text-xs">## {canonicalHeading}</code>.
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
