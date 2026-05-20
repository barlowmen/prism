"use client";

/**
 * Right column of the job-detail page. State-machine view: shows
 * contextual panels (reclassify, dispatcher question, request changes,
 * provenance flagged) plus an action row whose buttons are derived
 * from the job's current status.
 *
 * The action row renders 1-2 primary actions plus a "More" overflow
 * details/summary popover for the rest — keeps the row from wrapping
 * to two lines on hm_review and ready_for_user_review jobs.
 *
 * When a job's outcome crosses into phone_screen / interview / offer,
 * a separate accent-bordered callout surfaces the "Open prep
 * workspace" shortcut.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, NotebookText } from "lucide-react";
import { Button, Callout, CodeArea } from "./ui";
import { AgentRunPane } from "./AgentRunPane";
import { type Job, type JobStatus } from "@/lib/jobs/types";

type Props = {
  job: Job;
  /** True if dispatcher_question.md exists and lacks an "## Answer" heading. */
  hasOpenDispatcherQuestion: boolean;
  /** True if questions.md exists and lacks an "## Answer" heading —
   *  the research agent surfaced honesty/tailoring questions that
   *  need the user to resolve before drafting. */
  hasOpenResearchQuestions?: boolean;
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

export function JobActions({
  job,
  hasOpenDispatcherQuestion,
  hasOpenResearchQuestions,
  provenanceFlagged,
}: Props) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(job.latestRunId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<JobStatus>(
    job.reclassifySuggestion ?? "discovered",
  );
  const [answer, setAnswer] = useState("");
  const [researchAnswer, setResearchAnswer] = useState("");
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

  const submitResearchAnswer = async () => {
    setBusy("research-answer");
    setErr(null);
    try {
      const r = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/answer-question`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: researchAnswer, target: "research" }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setResearchAnswer("");
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

  // Build the action list for the current status. Primary actions render
  // first as buttons; the rest collapse into a "More" overflow.
  const canDispatch =
    !!job.sourceUrl &&
    (job.status === "discovered" ||
      job.status === "imported" ||
      job.status === "recommended_skip" ||
      job.status === "errored");

  type Action = {
    key: string;
    label: ReactNode;
    onClick: () => void;
    variant: "primary" | "secondary" | "danger";
    primary: boolean;
  };
  const actions: Action[] = [];

  if (canDispatch) {
    actions.push({
      key: "dispatch",
      label: busy === "dispatch" ? "Spawning…" : "Run dispatcher",
      onClick: dispatch,
      variant: job.status === "discovered" || job.status === "imported" ? "primary" : "secondary",
      primary: job.status === "discovered" || job.status === "imported",
    });
  }
  if (job.status === "recommended_skip") {
    actions.push({
      key: "accept-skip",
      label: "Accept skip → rejected",
      onClick: () => setStatus("rejected", "user accepted skip recommendation"),
      variant: "primary",
      primary: true,
    });
    actions.push({
      key: "override-skip",
      label: "Override → researching",
      onClick: () => setStatus("researching", "user override: proceed despite skip recommendation"),
      variant: "secondary",
      primary: false,
    });
  }
  if (job.status === "researching" || job.status === "errored") {
    actions.push({
      key: "research",
      label: busy === "research" ? "Spawning…" : "Run research",
      onClick: () => runPhaseAction("research", "research"),
      variant: job.status === "researching" ? "primary" : "secondary",
      primary: job.status === "researching",
    });
  }
  if (job.status === "drafting" || job.status === "errored") {
    actions.push({
      key: "draft",
      label: busy === "draft" ? "Spawning…" : "Run draft",
      onClick: () => runPhaseAction("draft", "draft"),
      variant: job.status === "drafting" ? "primary" : "secondary",
      primary: job.status === "drafting",
    });
  }
  if (job.status === "hm_review") {
    actions.push({
      key: "redraft",
      label: busy === "redraft" ? "Spawning…" : "Re-draft w/ feedback",
      onClick: () => runPhaseAction("redraft", "redraft"),
      variant: "primary",
      primary: true,
    });
    actions.push({
      key: "review",
      label: busy === "review" ? "Spawning…" : "Run HM review again",
      onClick: () => runPhaseAction("review", "review"),
      variant: "secondary",
      primary: false,
    });
    actions.push({
      key: "send-anyway",
      label: "Send anyway → user review",
      onClick: () => runPhaseAction("send-anyway", "send-anyway"),
      variant: "secondary",
      primary: false,
    });
  } else if (job.status === "errored") {
    actions.push({
      key: "review",
      label: busy === "review" ? "Spawning…" : "Run HM review",
      onClick: () => runPhaseAction("review", "review"),
      variant: "secondary",
      primary: false,
    });
  }
  if (job.status === "provenance" || job.status === "errored") {
    actions.push({
      key: "provenance",
      label: busy === "provenance" ? "Spawning…" : "Run provenance",
      onClick: () => runPhaseAction("provenance", "provenance"),
      variant: job.status === "provenance" ? "primary" : "secondary",
      primary: job.status === "provenance",
    });
  }
  if (job.status === "ready_to_apply") {
    actions.push({
      key: "mark-applied",
      label: "Mark applied",
      onClick: () => setStatus("applied", "user marked applied"),
      variant: "primary",
      primary: true,
    });
  }
  if (job.status === "ready_for_user_review") {
    actions.push({
      key: "approve",
      label: "Approve → ready to apply",
      onClick: () => setStatus("ready_to_apply", "user approved final draft"),
      variant: "primary",
      primary: true,
    });
    actions.push({
      key: "request-changes",
      label: "Request changes",
      onClick: () => setRequestChangesOpen(true),
      variant: "secondary",
      primary: true,
    });
    actions.push({
      key: "reject",
      label: "Reject",
      onClick: () => setStatus("rejected", "user rejected at final review"),
      variant: "danger",
      primary: false,
    });
  }

  const primaryActions = actions.filter((a) => a.primary);
  const overflowActions = actions.filter((a) => !a.primary);

  const showPrepLink =
    job.outcome === "phone_screen" ||
    job.outcome === "interview" ||
    job.outcome === "offer";

  return (
    <div className="space-y-4">
      {runId && (
        <AgentRunPane
          runId={runId}
          onCompleted={() => {
            router.refresh();
          }}
        />
      )}

      {err && (
        <div
          className="text-xs rounded-md border p-2"
          style={{ background: "var(--color-surface-1)", color: "var(--color-err)" }}
        >
          {err}
        </div>
      )}

      {/* Reclassify panel for imported jobs. Info tone — this is state
          triage ("pick the right status"), not a urgent CTA. */}
      {job.status === "imported" && (
        <Callout title="Reclassify this imported job" tone="info">
          <p className="mb-3">
            Imported from <code className="text-xs">apps/</code>. Pick the real
            status. Suggestion is based on cheap file-presence heuristics —
            confirm before saving.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as JobStatus)}
              className="px-2 py-1.5 rounded-md border text-sm"
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
            <Button
              variant="primary"
              onClick={reclassify}
              disabled={busy === "reclassify"}
            >
              {busy === "reclassify" ? "Saving…" : "Save status"}
            </Button>
          </div>
        </Callout>
      )}

      {/* Provenance honesty-flag panel — takes precedence over dispatcher question */}
      {provenanceFlagged && (
        <Callout title="Provenance audit flagged honesty issues" tone="err">
          <p className="mb-3">
            See the <strong>Provenance report</strong> tab for the specific{" "}
            <code className="text-xs">VERIFY:</code> notes or unchecked
            boundaries. Either re-draft with the flags as context, or accept
            the gap and proceed to user review with the warning visible.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={() => runPhaseAction("fix-from-provenance", "fix-prov")}
              disabled={!!busy}
            >
              {busy === "fix-prov" ? "Spawning…" : "Fix and re-draft"}
            </Button>
            <Button
              onClick={() => runPhaseAction("accept-gap", "accept-gap")}
              disabled={!!busy}
            >
              Accept the gap → user review
            </Button>
          </div>
        </Callout>
      )}

      {/* Dispatcher question answer textarea — accent tone (real CTA).
          id="answer-question" gives the Dashboard's "Blocked on you"
          rows a hash anchor to deep-link to. */}
      {job.status === "awaiting_input" &&
        hasOpenDispatcherQuestion &&
        !provenanceFlagged && (
          <div id="answer-question">
            <Callout title="Answer the dispatcher question" tone="accent">
              <p className="mb-2">
                Your answer is appended to <code>dispatcher_question.md</code>{" "}
                under a timestamped <code>## Answer</code> heading, then the
                dispatcher re-runs with the new context.
              </p>
              <CodeArea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                surface="surface-2"
                minHeight={120}
                placeholder="Your answer…"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="primary"
                  onClick={submitAnswer}
                  disabled={busy === "answer" || !answer.trim()}
                >
                  {busy === "answer" ? "Submitting…" : "Submit + re-dispatch"}
                </Button>
              </div>
            </Callout>
          </div>
        )}

      {/* Research questions answer textarea — same shape, different
          file + different next phase. The research outputs already
          exist on disk; the answer just resolves open questions, so
          submitting kicks the draft agent directly. */}
      {job.status === "awaiting_input" &&
        hasOpenResearchQuestions &&
        !provenanceFlagged && (
          <div id="answer-question">
            <Callout title="Answer the research questions" tone="accent">
              <p className="mb-2">
                The research agent surfaced honesty/tailoring questions in{" "}
                <code>questions.md</code> (see the Research questions tab
                below). Your answer is appended under a timestamped{" "}
                <code>## Answer</code> heading; the draft agent then runs
                with the new context — research outputs are already on
                disk so we skip re-running them.
              </p>
              <CodeArea
                value={researchAnswer}
                onChange={(e) => setResearchAnswer(e.target.value)}
                surface="surface-2"
                minHeight={140}
                placeholder="Answer the numbered questions inline (e.g. '1. ~15 engagements. 2. Quarterly. 3. ...'). Free-form is fine — the draft agent reads it as context."
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="primary"
                  onClick={submitResearchAnswer}
                  disabled={busy === "research-answer" || !researchAnswer.trim()}
                >
                  {busy === "research-answer" ? "Submitting…" : "Submit + kick draft"}
                </Button>
              </div>
            </Callout>
          </div>
        )}

      {/* Request-changes panel for ready_for_user_review */}
      {requestChangesOpen && (
        <Callout title="Request changes" tone="accent">
          <p className="mb-2">
            Your notes are appended to <code>user_request.md</code> and the
            draft agent re-runs with them as feedback.
          </p>
          <CodeArea
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
            surface="surface-2"
            minHeight={100}
            placeholder="What needs to change?"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              onClick={() => {
                setRequestChangesOpen(false);
                setRequestNotes("");
              }}
              disabled={busy === "request-changes"}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await runPhaseAction("request-changes", "request-changes", { notes: requestNotes });
                setRequestChangesOpen(false);
                setRequestNotes("");
              }}
              disabled={busy === "request-changes" || !requestNotes.trim()}
            >
              {busy === "request-changes" ? "Submitting…" : "Submit + re-draft"}
            </Button>
          </div>
        </Callout>
      )}

      {/* Prep-workspace shortcut for jobs that have crossed into interview stages. */}
      {showPrepLink && job.company && (
        <Callout
          tone="accent"
          action={
            <Link href={`/prep/${encodeURIComponent(job.company)}`}>
              <Button
                variant="primary"
                icon={<NotebookText className="w-3 h-3" />}
              >
                Open prep workspace
              </Button>
            </Link>
          }
        >
          <strong style={{ color: "var(--color-fg)" }}>
            Outcome: {job.outcome}
          </strong>{" "}
          — open the interview prep workspace for {job.company}.
        </Callout>
      )}

      {/* Action row — primary buttons + More overflow */}
      {actions.length > 0 && (
        <div
          className="rounded-md border p-3 flex items-center gap-2 flex-wrap"
          style={{ background: "var(--color-surface-1)" }}
        >
          {primaryActions.map((a) => (
            <Button
              key={a.key}
              variant={a.variant}
              onClick={a.onClick}
              disabled={!!busy}
            >
              {a.label}
            </Button>
          ))}
          {overflowActions.length > 0 && (
            <details className="relative">
              <summary
                className="list-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border select-none"
                style={{
                  background: "var(--color-surface-1)",
                  color: "var(--color-fg)",
                  borderColor: "var(--color-border)",
                }}
              >
                <MoreHorizontal className="w-3 h-3" /> More
              </summary>
              <div
                className="absolute right-0 mt-1 z-20 rounded-md border p-1 flex flex-col gap-1 min-w-[220px]"
                style={{
                  background: "var(--color-surface-1)",
                  borderColor: "var(--color-border-strong)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                }}
              >
                {overflowActions.map((a) => (
                  <Button
                    key={a.key}
                    variant={a.variant === "primary" ? "secondary" : a.variant}
                    onClick={a.onClick}
                    disabled={!!busy}
                    className="!justify-start"
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
