"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job } from "@/lib/jobs/types";
import type { FileEntry, PerAppFiles } from "@/lib/jobs/per-app-files";

type Props = {
  job: Job;
  files: PerAppFiles;
  renderedMarkdown: Record<string, string>;
};

const TAB_ORDER = [
  "job_description",
  "classification",
  "dispatcher_question",
  "questions",
  "jd_analysis",
  "company_research",
  "resume_examples",
  "feedback",
  "feedback_history",
  "provenance",
  "interview_feedback",
];

const FEEDBACK_KEY = "interview_feedback";

export function JobDetailView({ job, files, renderedMarkdown }: Props) {
  // Read-only markdown tabs (the agent-written outputs). interview_feedback
  // is editable, so it gets its own pane and is excluded from this list.
  const presentText = useMemo(
    () =>
      [...files.known, ...files.other]
        .filter(
          (f) =>
            f.exists &&
            f.relPath.toLowerCase().endsWith(".md") &&
            f.key !== FEEDBACK_KEY,
        )
        .sort((a, b) => TAB_ORDER.indexOf(a.key) - TAB_ORDER.indexOf(b.key)),
    [files],
  );

  // Interview feedback tab is ALWAYS shown — user fills it in over time.
  const feedbackEntry =
    files.known.find((f) => f.key === FEEDBACK_KEY) ?? null;

  const hasDocx = files.finalDocx.length > 0;

  type TabId = string;
  const initialTab: TabId = hasDocx ? "docx" : presentText[0]?.key ?? "meta";
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <>
      <Header job={job} files={files} />

      <div className="mt-6 mb-4 border-b flex items-center flex-wrap gap-1">
        {hasDocx && <TabButton id="docx" tab={tab} setTab={setTab} label="Resume preview" accent />}
        {presentText.map((f) => (
          <TabButton key={f.key} id={f.key} tab={tab} setTab={setTab} label={f.label} />
        ))}
        <TabButton
          id={FEEDBACK_KEY}
          tab={tab}
          setTab={setTab}
          label={feedbackEntry?.exists ? "Interview feedback ●" : "Interview feedback"}
        />
        <TabButton id="meta" tab={tab} setTab={setTab} label="State + history" />
        <TabButton id="files" tab={tab} setTab={setTab} label="All files" />
      </div>

      <div>
        {tab === "docx" && hasDocx && <DocxPane job={job} docx={files.finalDocx[0]} />}
        {presentText.map((f) =>
          tab === f.key ? (
            <MarkdownPane key={f.key} file={f} html={renderedMarkdown[f.key] ?? ""} />
          ) : null,
        )}
        {tab === FEEDBACK_KEY && <InterviewFeedbackPane job={job} />}
        {tab === "meta" && <MetaPane job={job} files={files} />}
        {tab === "files" && <AllFilesPane files={files} />}
      </div>
    </>
  );
}

function Header({ job, files }: { job: Job; files: PerAppFiles }) {
  const pending = !job.company || !job.role;
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          {job.company || (pending ? "(awaiting dispatcher)" : "")}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">
          {job.role || (pending ? "Pasted URL — dispatcher will name this" : "")}
        </h1>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
          <StatusBadge status={job.status} />
          {job.reclassifySuggestion && job.status === "imported" && (
            <span style={{ color: "var(--color-fg-muted)" }}>
              suggested status:{" "}
              <span style={{ color: "var(--color-accent)" }}>
                {job.reclassifySuggestion}
              </span>
            </span>
          )}
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:underline truncate max-w-md"
              style={{ color: "var(--color-fg-muted)" }}
            >
              {job.sourceUrl}
            </a>
          )}
          {files.exists && job.folderPath && (
            <span className="font-mono" style={{ color: "var(--color-fg-muted)", fontSize: "10px" }}>
              {job.folderPath.replace(/^\/Users\/[^/]+/, "~")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Job["status"] }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs"
      style={{ background: "var(--color-surface-2)", fontFamily: "var(--font-mono)" }}
    >
      {status}
    </span>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  label,
  accent,
}: {
  id: string;
  tab: string;
  setTab: (s: string) => void;
  label: string;
  accent?: boolean;
}) {
  const active = id === tab;
  return (
    <button
      onClick={() => setTab(id)}
      className="px-3 py-2 text-xs transition-colors -mb-px border-b-2"
      style={{
        color: active
          ? "var(--color-fg)"
          : accent
            ? "var(--color-accent)"
            : "var(--color-fg-muted)",
        borderBottomColor: active ? "var(--color-accent)" : "transparent",
        background: active ? "var(--color-surface-1)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

function MarkdownPane({ file, html }: { file: FileEntry; html: string }) {
  return (
    <div>
      <FileMeta file={file} />
      <article
        className="md-prose rounded-md border p-6 mt-3"
        style={{ background: "var(--color-surface-1)" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function DocxPane({ job, docx }: { job: Job; docx: FileEntry }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(
      `/api/jobs/${encodeURIComponent(job.id)}/docx?name=${encodeURIComponent(docx.relPath)}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setHtml(d.html);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, docx.relPath]);

  const downloadHref = `/api/jobs/${encodeURIComponent(job.id)}/docx/download?name=${encodeURIComponent(docx.relPath)}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <FileMeta file={docx} />
        <a
          href={downloadHref}
          className="px-3 py-1.5 text-xs rounded-md border"
          style={{ background: "var(--color-surface-1)" }}
        >
          Download .docx
        </a>
      </div>
      {loading && (
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          rendering preview…
        </div>
      )}
      {err && (
        <div className="text-xs" style={{ color: "var(--color-err)" }}>
          {err}
        </div>
      )}
      {html !== null && (
        <article
          className="docx-prose rounded-md border p-8"
          style={{ background: "var(--color-surface-1)" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function InterviewFeedbackPane({ job }: { job: Job }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [exists, setExists] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthMsg, setSynthMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-save on Ctrl/Cmd+S — feels right for a notes editor.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/jobs/${encodeURIComponent(job.id)}/interview-feedback`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setContent(d.content ?? "");
        setSavedContent(d.content ?? "");
        setExists(!!d.exists);
        setSavedAt(d.mtimeMs ?? null);
      })
      .catch((e) => !cancelled && setSaveErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const dirty = content !== savedContent;

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const r = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/interview-feedback`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        setSaveErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setSavedContent(content);
      setSavedAt(data.mtimeMs ?? Date.now());
      setExists(true);
      setSaveMsg("saved");
    } catch (e) {
      setSaveErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const insertRound = () => {
    const num =
      (content.match(/^##\s*Round\s+\d+/gim) ?? []).length + 1;
    const today = new Date().toISOString().slice(0, 10);
    const template = `\n\n## Round ${num} — ${today}\n\n**Format:** \n**Interviewer(s):** \n\n**Topics:**\n- \n\n**What went well:**\n- \n\n**What didn't:**\n- \n\n**Feedback received:** \n`;
    setContent((c) => c.trimEnd() + template);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const synthesize = async () => {
    if (dirty) {
      setSynthMsg("save your changes first");
      return;
    }
    setSynthesizing(true);
    setSynthMsg(null);
    try {
      const r = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/synthesize-lessons`,
        { method: "POST" },
      );
      const data = await r.json();
      if (!r.ok) {
        setSynthMsg(`error: ${data.error ?? r.status}`);
        return;
      }
      router.push(data.redirectTo ?? "/settings/profile/lessons");
    } catch (e) {
      setSynthMsg(`error: ${String(e)}`);
    } finally {
      setSynthesizing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
        loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          <code className="text-xs">interview_feedback.md</code>
          {exists && savedAt ? (
            <> · saved {new Date(savedAt).toLocaleString()}</>
          ) : exists ? null : (
            <> · not yet on disk</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={insertRound}
            className="px-3 py-1.5 text-xs rounded-md border"
            style={{ background: "var(--color-surface-2)" }}
          >
            + Add round
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-xs rounded-md border disabled:opacity-50"
            style={{
              background: dirty ? "var(--color-accent)" : "var(--color-surface-2)",
              color: dirty ? "var(--color-bg)" : "var(--color-fg)",
              borderColor: dirty ? "var(--color-accent)" : "var(--color-border)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (dirty && !saving) save();
          }
        }}
        spellCheck={false}
        placeholder={`Jot whatever's useful — date, interviewer name, topics, what went well/poorly, recruiter notes, weird vibes. Click "+ Add round" to drop a templated section.`}
        className="w-full p-4 rounded-md border text-sm leading-relaxed"
        style={{
          background: "var(--color-surface-1)",
          fontFamily: "var(--font-mono)",
          minHeight: "60vh",
          resize: "vertical",
          tabSize: 2,
        }}
      />

      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--color-fg-muted)" }}>
        <span>
          {content.length.toLocaleString()} chars · {content.split(/\r?\n/).length.toLocaleString()} lines
        </span>
        {dirty ? (
          <span style={{ color: "var(--color-accent)" }}>unsaved (⌘S to save)</span>
        ) : saveMsg ? (
          <span style={{ color: "var(--color-ok)" }}>{saveMsg}</span>
        ) : null}
        {saveErr && <span style={{ color: "var(--color-err)" }}>{saveErr}</span>}
      </div>

      <div
        className="mt-5 rounded-md border p-4"
        style={{ background: "var(--color-surface-1)" }}
      >
        <div className="text-sm font-medium mb-1">Synthesize lessons</div>
        <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          Run a focused agent that reads these notes plus your current{" "}
          <em>Lessons from past interviews</em> section in{" "}
          <code className="text-xs">about_user.md</code>, then produces a
          refreshed draft of that section. You land on{" "}
          <code className="text-xs">/settings/profile/lessons</code> with the
          draft ready to review and commit. Best run once the application has
          reached a terminal outcome.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={synthesize}
            disabled={synthesizing || !content.trim() || dirty}
            title={
              dirty
                ? "Save first"
                : !content.trim()
                  ? "Write some feedback first"
                  : undefined
            }
            className="px-3 py-1.5 text-xs rounded-md border disabled:opacity-50"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              borderColor: "var(--color-accent)",
            }}
          >
            {synthesizing ? "Spawning agent…" : "Synthesize lessons → about_user.md"}
          </button>
          {synthMsg && (
            <span className="text-xs" style={{ color: "var(--color-err)" }}>
              {synthMsg}
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            outcome: {job.outcome ?? "(not set)"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetaPane({ job, files }: { job: Job; files: PerAppFiles }) {
  return (
    <div className="space-y-6">
      <Section title="State">
        <Row label="id" value={job.id} mono />
        <Row label="status" value={job.status} mono />
        <Row label="source" value={job.source} mono />
        {job.reclassifySuggestion && (
          <Row label="reclassify suggestion" value={job.reclassifySuggestion} mono />
        )}
        <Row label="discoveredAt" value={new Date(job.discoveredAt).toLocaleString()} />
        <Row label="updatedAt" value={new Date(job.updatedAt).toLocaleString()} />
        {job.outcome && <Row label="outcome" value={job.outcome} />}
      </Section>
      <Section title="Status history">
        <table className="w-full text-xs">
          <thead style={{ color: "var(--color-fg-muted)" }}>
            <tr>
              <th className="text-left font-normal py-1">when</th>
              <th className="text-left font-normal py-1">from → to</th>
              <th className="text-left font-normal py-1">note</th>
            </tr>
          </thead>
          <tbody>
            {job.statusHistory.map((h, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1 pr-3 font-mono">{new Date(h.at).toLocaleString()}</td>
                <td className="py-1 pr-3 font-mono">
                  {(h.from ?? "—") + " → " + h.to}
                </td>
                <td className="py-1 pr-3" style={{ color: "var(--color-fg-muted)" }}>
                  {h.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Folder">
        <Row
          label="path"
          value={job.folderPath ?? "(none)"}
          mono
        />
        <Row label="folder exists on disk" value={String(files.exists)} mono />
      </Section>
    </div>
  );
}

function AllFilesPane({ files }: { files: PerAppFiles }) {
  const all = [...files.known, ...files.other, ...files.finalDocx];
  return (
    <Section title="Files in folder">
      <table className="w-full text-xs">
        <thead style={{ color: "var(--color-fg-muted)" }}>
          <tr>
            <th className="text-left font-normal py-1">file</th>
            <th className="text-left font-normal py-1">label</th>
            <th className="text-right font-normal py-1">size</th>
            <th className="text-right font-normal py-1">modified</th>
          </tr>
        </thead>
        <tbody>
          {all.map((f) => (
            <tr
              key={f.key}
              className="border-t"
              style={{
                borderColor: "var(--color-border)",
                color: f.exists ? undefined : "var(--color-fg-muted)",
              }}
            >
              <td className="py-1 pr-3 font-mono">{f.relPath}</td>
              <td className="py-1 pr-3">{f.label}</td>
              <td className="py-1 pr-3 text-right font-mono">
                {f.exists ? fmtBytes(f.size) : "—"}
              </td>
              <td className="py-1 pr-3 text-right font-mono">
                {f.mtimeMs ? new Date(f.mtimeMs).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function FileMeta({ file }: { file: FileEntry }) {
  return (
    <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
      <code className="text-xs">{file.relPath}</code> · {fmtBytes(file.size)}
      {file.mtimeMs && <> · {new Date(file.mtimeMs).toLocaleString()}</>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--color-surface-1)" }}
    >
      <div className="text-xs font-medium mb-2.5">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs py-1 border-b last:border-b-0">
      <span style={{ color: "var(--color-fg-muted)" }}>{label}</span>
      <span
        className="truncate max-w-[60%] text-right"
        style={{ fontFamily: mono ? "var(--font-mono)" : undefined }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
