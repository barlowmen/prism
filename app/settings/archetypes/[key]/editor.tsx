"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { Area, Button, Callout, Field } from "@/components/ui";
import { AgentRunPane } from "@/components/AgentRunPane";
import type { Archetype } from "@/lib/archetypes/types";

export function ArchetypeEditor({
  initial,
  initialBaseInfo,
}: {
  initial: Archetype;
  initialBaseInfo: { exists: boolean; size: number | null; mtimeMs: number | null };
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [description, setDescription] = useState(initial.description);
  const [matchingHints, setMatchingHints] = useState(initial.matchingHints);
  const [tailoringRules, setTailoringRules] = useState(initial.tailoringRules);
  const [baseResumePath, setBaseResumePath] = useState(initial.baseResumePath);
  const [baseInfo, setBaseInfo] = useState(initialBaseInfo);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Track the run we just spawned so AgentRunPane mounts even before
  // the next router.refresh() reflects baseLatestRunId on the server side.
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initial.baseStatus === "generating" || initial.baseStatus === "reviewing"
      ? initial.baseLatestRunId ?? null
      : null,
  );
  // Errored/stalled archetypes don't auto-mount the run pane (the run
  // is already done; showing it would just chew screen space). Opt-in:
  // the panel exposes a Show last run log toggle that flips this flag.
  const [showHistoricRun, setShowHistoricRun] = useState(false);

  const dirty =
    label !== initial.label ||
    description !== initial.description ||
    matchingHints !== initial.matchingHints ||
    tailoringRules !== initial.tailoringRules ||
    baseResumePath !== initial.baseResumePath;

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/archetypes/${encodeURIComponent(initial.key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, description, matchingHints, tailoringRules, baseResumePath }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setMsg("saved");
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const kickGeneration = async (overwrite: boolean) => {
    setGenerating(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/archetypes/${encodeURIComponent(initial.key)}/generate-base`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overwrite }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409 && data?.error === "base_already_exists") {
          if (
            confirm(
              `A base resume already exists at ${data.baseResumePath}. ` +
                `Generating will overwrite it on completion. Continue?`,
            )
          ) {
            await kickGeneration(true);
            return;
          }
          return;
        }
        setErr(data?.error ?? `HTTP ${r.status}`);
        return;
      }
      setActiveRunId(data.runId);
      setMsg("Generation started.");
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const onGenerate = () => kickGeneration(false);

  const onAcceptAnyway = async () => {
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/archetypes/${encodeURIComponent(initial.key)}/accept-base-anyway`,
        { method: "POST" },
      );
      const data = await r.json();
      if (!r.ok) {
        setErr(data?.error ?? `HTTP ${r.status}`);
        return;
      }
      setMsg("Accepted. Base is now ready.");
      setActiveRunId(null);
      router.refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onRestart = async () => {
    if (!confirm("Reset the generation state and start a new run?")) return;
    setErr(null);
    setMsg(null);
    try {
      await fetch(
        `/api/archetypes/${encodeURIComponent(initial.key)}/reset-base`,
        { method: "POST" },
      );
      await kickGeneration(true);
    } catch (e) {
      setErr(String(e));
    }
  };

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/archetypes/${encodeURIComponent(initial.key)}/base`, {
        method: "POST",
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setBaseResumePath(data.archetype.baseResumePath);
      setBaseInfo({
        exists: true,
        size: file.size,
        mtimeMs: Date.now(),
      });
      setMsg(`uploaded ${file.name}`);
      router.refresh();
    } catch (er) {
      setErr(String(er));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!confirm(`Delete archetype "${initial.key}"? The DOCX on disk is preserved.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/archetypes/${encodeURIComponent(initial.key)}`, {
        method: "DELETE",
      });
      if (r.ok) {
        router.push("/settings/archetypes");
      } else {
        const data = await r.json().catch(() => ({}));
        setErr(data.error ?? `HTTP ${r.status}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Field label="Label" value={label} onChange={setLabel} />
      <Area
        label="Description"
        value={description}
        onChange={setDescription}
        rows={3}
      />
      <Area
        label="Matching hints (markdown)"
        value={matchingHints}
        onChange={setMatchingHints}
        rows={8}
        mono
        help="The dispatcher consults this list to decide whether this archetype fits a posting."
      />
      <Area
        label="Tailoring rules (optional, markdown)"
        value={tailoringRules}
        onChange={setTailoringRules}
        rows={5}
        mono
        help="Augments about_user.md's tailoring playbook. The draft agent reads this when generating a resume from this base."
      />

      <BaseGenerationPanel
        archetypeKey={initial.key}
        archetypeLabel={initial.label}
        status={initial.baseStatus}
        pass={initial.baseReviewPass}
        generatedAt={initial.baseGeneratedAt}
        lastFeedback={initial.baseLastFeedback}
        latestRunId={initial.baseLatestRunId}
        hasBase={!!baseResumePath}
        generating={generating}
        showHistoricRun={showHistoricRun}
        onGenerate={onGenerate}
        onAcceptAnyway={onAcceptAnyway}
        onRestart={onRestart}
        onToggleHistoricRun={() => setShowHistoricRun((v) => !v)}
      />

      {activeRunId && (
        <AgentRunPane
          runId={activeRunId}
          onCompleted={() => {
            router.refresh();
          }}
        />
      )}

      {!activeRunId && showHistoricRun && initial.baseLatestRunId && (
        <AgentRunPane runId={initial.baseLatestRunId} />
      )}

      <section
        className="rounded-md border p-4"
        style={{
          background: "var(--color-surface-1)",
          borderColor: baseInfo.exists ? "var(--color-border)" : "var(--color-warn)",
        }}
      >
        <div className="text-sm font-medium mb-2">Base resume DOCX</div>
        <div className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
          The draft agent starts from this file and tailors it per job.
        </div>
        <div className="space-y-2">
          <Field
            label="Path (workspace-relative)"
            value={baseResumePath}
            onChange={setBaseResumePath}
            mono
            help="Usually under _resumes/. Uploading sets this automatically."
          />
          <div
            className="text-xs flex items-center gap-3"
            style={{ color: baseInfo.exists ? "var(--color-ok)" : "var(--color-warn)" }}
          >
            {baseInfo.exists && baseInfo.size != null ? (
              <>
                <span>on disk</span>
                <span className="font-mono">{fmtBytes(baseInfo.size)}</span>
                {baseInfo.mtimeMs && (
                  <span className="font-mono">
                    modified {new Date(baseInfo.mtimeMs).toLocaleString()}
                  </span>
                )}
              </>
            ) : (
              <span>missing on disk</span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              onChange={onFile}
              style={{ display: "none" }}
            />
            <Button onClick={onPick} disabled={uploading}>
              {uploading ? "Uploading…" : baseInfo.exists ? "Replace DOCX" : "Upload DOCX"}
            </Button>
          </div>
        </div>
      </section>

      {(msg || err) && (
        <div
          className="text-xs"
          style={{ color: err ? "var(--color-err)" : "var(--color-ok)" }}
        >
          {err ?? msg}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="danger" onClick={remove} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete archetype"}
        </Button>
        <Button
          variant={dirty ? "primary" : "secondary"}
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function BaseGenerationPanel({
  archetypeKey,
  archetypeLabel,
  status,
  pass,
  generatedAt,
  lastFeedback,
  latestRunId,
  hasBase,
  generating,
  showHistoricRun,
  onGenerate,
  onAcceptAnyway,
  onRestart,
  onToggleHistoricRun,
}: {
  archetypeKey: string;
  archetypeLabel: string;
  status: Archetype["baseStatus"];
  pass: number;
  generatedAt: string | null;
  lastFeedback: string;
  latestRunId: string | null;
  hasBase: boolean;
  generating: boolean;
  showHistoricRun: boolean;
  onGenerate: () => void;
  onAcceptAnyway: () => void;
  onRestart: () => void;
  onToggleHistoricRun: () => void;
}) {
  const transient = status === "generating" || status === "reviewing";

  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--color-surface-1)" }}
    >
      <div className="text-sm font-medium mb-1">Generate base resume</div>
      <div
        className="text-xs mb-3"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Spawns the base-resume agent: reads <code className="text-xs">about_user.md</code>,
        the {archetypeLabel} playbook subsection, and the style guide, then
        produces a DOCX. A second pass acts as a hiring manager for this
        archetype's role family and either approves the resume or sends
        feedback for a re-draft.
      </div>

      {status === "ready" && (
        <Callout
          tone="info"
          title={
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: "var(--color-ok)" }}
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Base resume ready
            </span>
          }
        >
          Generated {generatedAt ? new Date(generatedAt).toLocaleString() : ""}
          {pass > 0 && ` · approved on pass ${pass}`}
        </Callout>
      )}

      {transient && (
        <Callout tone="accent" title={status === "generating" ? `Generating draft (pass ${pass || 1})…` : `HM reviewing (pass ${pass})…`}>
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-flex w-2 h-2">
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: "var(--color-accent)", opacity: 0.6 }}
              />
              <span
                className="relative inline-block w-2 h-2 rounded-full"
                style={{ background: "var(--color-accent)" }}
              />
            </span>
            {status === "generating"
              ? "The base-resume agent is drafting the DOCX."
              : "The HM-review agent is screening the draft against the archetype bar."}
          </span>
        </Callout>
      )}

      {status === "stalled" && (
        <Callout
          tone="warn"
          title={`5 review passes — still needs revision`}
          action={
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={onAcceptAnyway}>
                Accept anyway
              </Button>
              <Button onClick={onRestart} icon={<RotateCcw className="w-3 h-3" />}>
                Restart
              </Button>
            </div>
          }
        >
          The HM-review loop kept returning <em>needs revision</em>. Read the
          feedback below and either accept the latest draft as-is, or restart
          generation (the orchestrator will re-read the playbook and try
          again).
          {lastFeedback && (
            <details className="mt-2">
              <summary
                className="cursor-pointer text-xs select-none"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Show last HM feedback
              </summary>
              <pre
                className="mt-2 p-2 rounded text-[11px] whitespace-pre-wrap"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-fg-muted)",
                  maxHeight: "300px",
                  overflow: "auto",
                }}
              >
                {lastFeedback}
              </pre>
            </details>
          )}
          {latestRunId && (
            <div className="mt-2">
              <button
                type="button"
                onClick={onToggleHistoricRun}
                className="text-[11px] underline cursor-pointer"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {showHistoricRun ? "Hide last run log" : "Show last run log"}
              </button>
            </div>
          )}
        </Callout>
      )}

      {status === "errored" && (
        <Callout
          tone="err"
          title="Base generation errored"
          action={
            <Button onClick={onRestart} icon={<RotateCcw className="w-3 h-3" />}>
              Restart
            </Button>
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {lastFeedback || "Unknown error — check the Runs page."}
          </span>
          {latestRunId && (
            <div className="mt-2">
              <button
                type="button"
                onClick={onToggleHistoricRun}
                className="text-[11px] underline cursor-pointer"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {showHistoricRun
                  ? "Hide last run log"
                  : "Show last run log (the raw event stream often explains why)"}
              </button>
            </div>
          )}
        </Callout>
      )}

      <div className="flex items-center gap-2 mt-3">
        <Button
          variant={hasBase ? "secondary" : "primary"}
          onClick={onGenerate}
          disabled={generating || transient}
          icon={<Sparkles className="w-3 h-3" />}
        >
          {generating
            ? "Starting…"
            : transient
              ? "Running…"
              : hasBase
                ? "Re-generate base"
                : "Generate base resume"}
        </Button>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--color-fg-muted)" }}
        >
          archetype: {archetypeKey}
        </span>
      </div>
    </section>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
