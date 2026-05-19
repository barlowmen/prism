"use client";
/**
 * Client wrapper for the run detail page. Renders AgentRunPane so it
 * can subscribe to SSE for live runs or fall back to disk-replay for
 * completed ones — same behavior the inline panes use.
 *
 * Initial status comes from the server component so we know whether to
 * render in "active" or "historic" affordance, but AgentRunPane manages
 * its own polling loop after mount.
 */
import { AgentRunPane } from "@/components/AgentRunPane";
import type { RunStatus } from "@/lib/runs/types";

export function RunDetailPane({
  runId,
  initialStatus,
}: {
  runId: string;
  initialStatus: RunStatus;
}) {
  return (
    <div className="space-y-3">
      <AgentRunPane runId={runId} />
      {initialStatus !== "running" && (
        <div
          className="text-[11px] font-mono"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Replayed from disk (.state/runs/{runId}.log). Initial status:{" "}
          {initialStatus}.
        </div>
      )}
    </div>
  );
}
