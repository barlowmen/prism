"use client";

/**
 * Live-status pane for a single Claude Code run. Subscribes to the SSE
 * stream at /api/agent-runs/<runId>/stream, shows a pulsing status dot,
 * an elapsed-time counter, and a tail of recent events. Collapses to a
 * single status line on completion.
 *
 * Used by JobActions and (indirectly) by the prep-builder action — any
 * place that spawns a Claude Code run and wants to show "what's
 * happening right now" without navigating to /settings/runs.
 */

import { useEffect, useRef, useState } from "react";

type RunMeta = {
  runId: string;
  phase: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed" | "cancelled" | "timed_out";
  exitCode: number | null;
  apiKeySource: string | null;
  tokenTotals: { input: number; output: number; cacheRead: number; cacheCreation: number };
  finalText: string | null;
  structuredPayload: unknown;
};

type LiveEvent = {
  seq: number;
  at: string;
  type: string;
  [k: string]: unknown;
};

export function AgentRunPane({
  runId,
  onCompleted,
}: {
  runId: string;
  onCompleted?: (meta: RunMeta) => void;
}) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    const es = new EventSource(`/api/agent-runs/${encodeURIComponent(runId)}/stream`);
    const onMeta = (ev: MessageEvent) => {
      const m = JSON.parse(ev.data) as RunMeta;
      setMeta(m);
    };
    const onEnd = () => {
      es.close();
    };
    const onAnyEvent = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as LiveEvent;
        setEvents((es) => {
          // Dedup by seq.
          if (es.length && es[es.length - 1].seq >= parsed.seq) return es;
          return [...es, parsed];
        });
        if (parsed.type === "completed" && !finishedRef.current) {
          finishedRef.current = true;
          // Re-fetch meta to grab final tokens, finalText, structuredPayload.
          fetch(`/api/agent-runs/${encodeURIComponent(runId)}/snapshot`)
            .then((r) => (r.ok ? r.json() : null))
            .then((m) => {
              if (m?.meta) {
                setMeta(m.meta);
                onCompleted?.(m.meta);
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("meta", onMeta as any);
    es.addEventListener("end", onEnd as any);
    // All other event types are recorded events.
    for (const t of [
      "status",
      "stdout",
      "stderr",
      "tool_use",
      "tool_result",
      "assistant_text",
      "usage",
      "rate_limit",
      "unknown_event",
      "completed",
    ]) {
      es.addEventListener(t, onAnyEvent as any);
    }

    return () => {
      es.close();
    };
  }, [runId, onCompleted]);

  useEffect(() => {
    if (meta?.completedAt) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [meta?.completedAt]);

  const cancel = async () => {
    await fetch(`/api/agent-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    }).catch(() => {});
  };

  const elapsedMs =
    meta?.completedAt
      ? new Date(meta.completedAt).getTime() - new Date(meta.startedAt).getTime()
      : meta
        ? tickNow - new Date(meta.startedAt).getTime()
        : 0;

  const tokensTotal =
    (meta?.tokenTotals.input ?? 0) + (meta?.tokenTotals.output ?? 0);

  const isLive = meta && !meta.completedAt;
  const lastInterestingEvent = pickLastInteresting(events);

  return (
    <div
      className="rounded-md border"
      style={{ background: "var(--color-surface-1)" }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={meta?.status} live={isLive ?? false} />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {meta?.phase ?? "agent run"} · {meta?.status ?? "starting…"}
            </div>
            <div className="text-[11px] truncate" style={{ color: "var(--color-fg-muted)" }}>
              {lastInterestingEvent ?? `runId: ${runId.slice(0, 8)}…`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span style={{ color: "var(--color-fg-muted)" }}>
            {formatDuration(elapsedMs)} · {tokensTotal} tok
          </span>
          {isLive && (
            <button
              onClick={cancel}
              className="px-2 py-1 rounded border text-xs"
              style={{ background: "var(--color-surface-2)" }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="px-2 py-1 rounded border text-xs"
            style={{ background: "var(--color-surface-2)" }}
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="p-3">
          {meta?.finalText && (
            <div className="mb-3">
              <div className="text-[10px] mb-1" style={{ color: "var(--color-fg-muted)" }}>
                Final assistant text
              </div>
              <pre
                className="text-xs rounded p-2 overflow-x-auto"
                style={{
                  background: "var(--color-surface-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {meta.finalText}
              </pre>
            </div>
          )}
          <div className="text-[10px] mb-1" style={{ color: "var(--color-fg-muted)" }}>
            Stream events ({events.length})
          </div>
          <div
            className="text-xs overflow-y-auto"
            style={{
              maxHeight: 280,
              background: "var(--color-surface-2)",
              borderRadius: 4,
              padding: 8,
              fontFamily: "var(--font-mono)",
            }}
          >
            {events.map((e) => (
              <EventLine key={e.seq} e={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({
  status,
  live,
}: {
  status?: RunMeta["status"];
  live: boolean;
}) {
  const color =
    status === "completed"
      ? "var(--color-ok)"
      : status === "failed" || status === "timed_out"
        ? "var(--color-err)"
        : status === "cancelled"
          ? "var(--color-fg-muted)"
          : "var(--color-accent)";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{
        background: color,
        animation: live ? "pulse 1.6s ease-in-out infinite" : undefined,
      }}
    />
  );
}

function EventLine({ e }: { e: LiveEvent }) {
  let summary = "";
  switch (e.type) {
    case "tool_use":
      summary = `${e.tool ?? "?"} ${(e as any).toolUseId?.slice(0, 8) ?? ""}`;
      break;
    case "tool_result":
      summary = `result ${String((e as any).toolUseId).slice(0, 8)}${(e as any).isError ? " [error]" : ""}`;
      break;
    case "assistant_text":
      summary = String((e as any).text ?? "").slice(0, 200);
      break;
    case "usage": {
      const u = e as any;
      summary = `+${u.inputTokens}in/${u.outputTokens}out${u.cacheReadTokens ? ` ${u.cacheReadTokens}cache` : ""}`;
      break;
    }
    case "stderr":
      summary = String((e as any).text ?? "").slice(0, 200);
      break;
    case "status":
      summary = String((e as any).phase ?? "");
      break;
    case "rate_limit":
      summary = JSON.stringify((e as any).info).slice(0, 120);
      break;
    case "completed":
      summary = `exit ${(e as any).exitCode}`;
      break;
    default:
      summary = "";
  }
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span style={{ color: "var(--color-fg-muted)", fontSize: "10px" }}>
        {String(e.seq).padStart(3, " ")}
      </span>
      <span
        className="font-medium"
        style={{
          color:
            e.type === "tool_use"
              ? "var(--color-accent)"
              : e.type === "stderr"
                ? "var(--color-err)"
                : e.type === "completed"
                  ? "var(--color-ok)"
                  : "var(--color-fg)",
          minWidth: 90,
          fontSize: 11,
        }}
      >
        {e.type}
      </span>
      <span
        className="truncate"
        style={{ color: "var(--color-fg-muted)", fontSize: 11 }}
        title={summary}
      >
        {summary}
      </span>
    </div>
  );
}

function pickLastInteresting(events: LiveEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "tool_use") {
      return `using ${(e as any).tool ?? "tool"}…`;
    }
    if (e.type === "assistant_text") {
      const t = String((e as any).text ?? "");
      if (t.trim().length > 0) return t.slice(0, 100);
    }
  }
  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}
