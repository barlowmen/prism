"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentRunPane } from "./AgentRunPane";
import { type Job, type JobStatus } from "@/lib/jobs/types";

type Props = {
  job: Job;
  /** True if dispatcher_question.md exists and lacks an "## Answer" heading. */
  hasOpenDispatcherQuestion: boolean;
  /** True if status=awaiting_input + provenance.md has VERIFY/unchecked items. */
  provenanceFlagged: boolean;
};

const RECLASSIFY_OPTIONS: JobStatus[] = [
  "discovered",
  "held",
  "skipped",
  "recommended_skip",
  "awaiting_input",
  "researching",
  "drafting",
  "hm_review",
  "ready_for_user_review",
  "ready_to_apply",
  "applied",
  "rejected",
];

export function JobActions({ job, hasOpenDispatcherQuestion, provenanceFlagged }: Props) {
  const router = useRouter();
  // Auto-mount the latest run if there is one so the user lands on a live
  // stream when navigating to a mid-flight job.
  const [runId, setRunId] = useState<string | null>(job.latestRunId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reclassify state
  const [newStatus, setNewStatus] = useState<JobStatus>(
    job.reclassifySuggestion ?? "discovered",
  );

  // Answer state
  const [answer, setAnswer] = useState("");

  // Request-changes modal state
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");

  const dispatch = async () => {
    setBusy("dispatch");
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setRunId(data.runId);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const submitAnswer = async () => {
    setBusy("answer");
    setErr(null);
    try {
      const r = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/answer-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer, target: "dispatcher" }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setAnswer("");
      if (data.runId) setRunId(data.runId);
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const reclassify = async () => {
    setBusy("reclassify");
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          statusNote: "user reclassified from imported",
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: JobStatus, note: string) => {
    setBusy(`status:${status}`);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, statusNote: note }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const runPhaseAction = async (
    endpoint: string,
    label: string,
    body?: unknown,
  ) => {
    setBusy(label);
    setErr(null);
    try {
      const r = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      if (data.runId) setRunId(data.runId);
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const canDispatch =
    !!job.sourceUrl &&
    (job.status === "discovered" ||
      job.status === "imported" ||
      job.status === "recommended_skip" ||
      job.status === "errored");

  return (
    <div className="space-y-4">
      {runId && (
        <AgentRunPane
          runId={runId}
          onCompleted={() => {
            // Status was routed by the orchestrator; refresh the page.
            router.refresh();
          }}
        />
      )}

      {err && (
        <div
          className="text-xs rounded border p-2"
          style={{ background: "var(--color-surface-1)", color: "var(--color-err)" }}
        >
          {err}
        </div>
      )}

      {/* Reclassify panel for imported jobs */}
      {job.status === "imported" && (
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-accent)",
          }}
        >
          <div className="text-sm font-medium mb-2">Reclassify this imported job</div>
          <p className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
            Imported from <code className="text-xs">apps/</code>. Pick the real
            status. Suggestion is based on cheap file-presence heuristics —
            confirm before saving.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as JobStatus)}
              className="px-2 py-1.5 rounded border text-sm"
              style={{
                background: "var(--color-surface-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {RECLASSIFY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                  {s === job.reclassifySuggestion ? "  (suggested)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={reclassify}
              disabled={busy === "reclassify"}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-50"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                borderColor: "var(--color-accent)",
              }}
            >
              {busy === "reclassify" ? "Saving…" : "Save status"}
            </button>
          </div>
        </div>
      )}

      {/* Provenance honesty-flag panel — takes precedence over dispatcher question */}
      {provenanceFlagged && (
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-err)",
          }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: "var(--color-err)" }}>
            Provenance audit flagged honesty issues
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
            See the <strong>Provenance report</strong> tab for the specific
            <code className="text-xs"> VERIFY:</code> notes or unchecked
            boundaries. Either re-draft with the flags as context, or
            accept the gap and proceed to user review with the warning
            visible.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => runPhaseAction("fix-from-provenance", "fix-prov")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                borderColor: "var(--color-accent)",
              }}
            >
              {busy === "fix-prov" ? "Spawning…" : "Fix and re-draft"}
            </button>
            <button
              onClick={() => runPhaseAction("accept-gap", "accept-gap")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              Accept the gap → user review
            </button>
          </div>
        </div>
      )}

      {/* Dispatcher question answer textarea */}
      {job.status === "awaiting_input" && hasOpenDispatcherQuestion && !provenanceFlagged && (
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-accent)",
          }}
        >
          <div className="text-sm font-medium mb-2">Answer the dispatcher question</div>
          <p className="text-xs mb-2" style={{ color: "var(--color-fg-muted)" }}>
            Your answer is appended to <code>dispatcher_question.md</code> under
            a timestamped <code>## Answer</code> heading, then the dispatcher
            re-runs with the new context.
          </p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{
              background: "var(--color-surface-2)",
              fontFamily: "var(--font-mono)",
              minHeight: 120,
            }}
            spellCheck={false}
            placeholder="Your answer…"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={submitAnswer}
              disabled={busy === "answer" || !answer.trim()}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-50"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                borderColor: "var(--color-accent)",
              }}
            >
              {busy === "answer" ? "Submitting…" : "Submit + re-dispatch"}
            </button>
          </div>
        </div>
      )}

      {/* Request-changes panel for ready_for_user_review */}
      {requestChangesOpen && (
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-accent)",
          }}
        >
          <div className="text-sm font-medium mb-1">Request changes</div>
          <p className="text-xs mb-2" style={{ color: "var(--color-fg-muted)" }}>
            Your notes are appended to <code>user_request.md</code> and the
            draft agent re-runs with them as feedback.
          </p>
          <textarea
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{
              background: "var(--color-surface-2)",
              fontFamily: "var(--font-mono)",
              minHeight: 100,
            }}
            spellCheck={false}
            placeholder="What needs to change?"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setRequestChangesOpen(false);
                setRequestNotes("");
              }}
              disabled={busy === "request-changes"}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await runPhaseAction("request-changes", "request-changes", { notes: requestNotes });
                setRequestChangesOpen(false);
                setRequestNotes("");
              }}
              disabled={busy === "request-changes" || !requestNotes.trim()}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-50"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                borderColor: "var(--color-accent)",
              }}
            >
              {busy === "request-changes" ? "Submitting…" : "Submit + re-draft"}
            </button>
          </div>
        </div>
      )}

      {/* Dispatcher actions */}
      <div
        className="rounded-md border p-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--color-surface-1)" }}
      >
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          Quick actions
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canDispatch && (
            <button
              onClick={dispatch}
              disabled={busy === "dispatch"}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-50"
              style={{ background: "var(--color-surface-2)" }}
            >
              {busy === "dispatch" ? "Spawning…" : "Run dispatcher"}
            </button>
          )}
          {job.status === "recommended_skip" && (
            <>
              <button
                onClick={() => setStatus("researching", "user override: proceed despite skip recommendation")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ background: "var(--color-surface-2)" }}
              >
                Override → researching
              </button>
              <button
                onClick={() => setStatus("rejected", "user accepted skip recommendation")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ background: "var(--color-surface-2)" }}
              >
                Accept skip → rejected
              </button>
            </>
          )}
          {(job.status === "researching" || job.status === "errored") && (
            <button
              onClick={() => runPhaseAction("research", "research")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              {busy === "research" ? "Spawning…" : "Run research"}
            </button>
          )}
          {(job.status === "drafting" || job.status === "errored") && (
            <button
              onClick={() => runPhaseAction("draft", "draft")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              {busy === "draft" ? "Spawning…" : "Run draft"}
            </button>
          )}
          {(job.status === "hm_review" || job.status === "errored") && (
            <button
              onClick={() => runPhaseAction("review", "review")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              {busy === "review" ? "Spawning…" : "Run HM review"}
            </button>
          )}
          {(job.status === "provenance" || job.status === "errored") && (
            <button
              onClick={() => runPhaseAction("provenance", "provenance")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{ background: "var(--color-surface-2)" }}
            >
              {busy === "provenance" ? "Spawning…" : "Run provenance"}
            </button>
          )}
          {job.status === "hm_review" && (
            <>
              <button
                onClick={() => runPhaseAction("redraft", "redraft")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                  borderColor: "var(--color-accent)",
                }}
              >
                {busy === "redraft" ? "Spawning…" : "Re-draft w/ feedback"}
              </button>
              <button
                onClick={() => runPhaseAction("send-anyway", "send-anyway")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ background: "var(--color-surface-2)" }}
              >
                Send anyway → user review
              </button>
            </>
          )}
          {job.status === "ready_to_apply" && (
            <button
              onClick={() => setStatus("applied", "user marked applied")}
              disabled={!!busy}
              className="px-3 py-1.5 text-xs rounded border"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                borderColor: "var(--color-accent)",
              }}
            >
              Mark applied
            </button>
          )}
          {job.status === "ready_for_user_review" && (
            <>
              <button
                onClick={() => setStatus("ready_to_apply", "user approved final draft")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                  borderColor: "var(--color-accent)",
                }}
              >
                Approve → ready to apply
              </button>
              <button
                onClick={() => setRequestChangesOpen(true)}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ background: "var(--color-surface-2)" }}
              >
                Request changes
              </button>
              <button
                onClick={() => setStatus("rejected", "user rejected at final review")}
                disabled={!!busy}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ background: "var(--color-surface-2)" }}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
