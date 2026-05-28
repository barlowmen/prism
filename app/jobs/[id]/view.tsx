"use client";

/**
 * Job-detail page client view. Two-tier tab navigation:
 *   - Primary groups: Resume / Posting / Research / Audit / Notes / Debug
 *   - Sub-tabs inside a group when it holds more than one file.
 *
 * The four orchestration outputs (HM feedback / feedback_history /
 * provenance / etc.) live under Audit; the interview-feedback editor
 * lives under Notes; meta and the all-files listing live under Debug.
 *
 * Markdown panes use server-rendered HTML from the page route; the
 * DocxPane fetches mammoth-rendered HTML lazily via /docx; the
 * InterviewFeedbackPane is a full inline editor with a synthesize-
 * lessons agent shortcut at the bottom.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  CodeArea,
  Row,
  StatusBadge,
  StatusDot,
  SubTab,
  SubTabStrip,
  Tab,
  TabStrip,
} from "@/components/ui";
import type { Job } from "@/lib/jobs/types";
import type { FileEntry, PerAppFiles } from "@/lib/jobs/per-app-files";

type Props = {
  job: Job;
  files: PerAppFiles;
  renderedMarkdown: Record<string, string>;
};

const FEEDBACK_KEY = "interview_feedback";

type GroupId = "resume" | "posting" | "research" | "audit" | "notes" | "debug";

const GROUP_LABELS: Record<GroupId, string> = {
  resume: "Resume",
  posting: "Posting",
  research: "Research",
  audit: "Audit",
  notes: "Notes",
  debug: "Debug",
};

/** File keys that belong to each group, in display order. */
const GROUP_KEYS: Record<Exclude<GroupId, "resume" | "notes" | "debug">, string[]> = {
  posting: ["job_description", "classification", "dispatcher_question", "questions"],
  research: ["jd_analysis", "company_research", "resume_examples"],
  audit: ["feedback", "feedback_history", "provenance"],
};

export function JobDetailView({ job, files, renderedMarkdown }: Props) {
  const presentText = useMemo(
    () =>
      [...files.known, ...files.other].filter(
        (f) =>
          f.exists && f.relPath.toLowerCase().endsWith(".md") && f.key !== FEEDBACK_KEY,
      ),
    [files],
  );

  const filesByKey = useMemo(() => {
    const m = new Map<string, FileEntry>();
    for (const f of presentText) m.set(f.key, f);
    return m;
  }, [presentText]);

  const hasDocx = files.finalDocx.length > 0;
  const feedbackEntry = files.known.find((f) => f.key === FEEDBACK_KEY) ?? null;

  // Compute group → present sub-keys.
  const visible: Array<{ id: GroupId; keys: string[] }> = useMemo(() => {
    const out: Array<{ id: GroupId; keys: string[] }> = [];
    if (hasDocx) out.push({ id: "resume", keys: ["docx"] });
    for (const gid of ["posting", "research", "audit"] as const) {
      const keys = GROUP_KEYS[gid].filter((k) => filesByKey.has(k));
      if (keys.length) out.push({ id: gid, keys });
    }
    // Surface any "other" markdowns that fell through.
    const extraKeys = presentText
      .filter(
        (f) =>
          !Object.values(GROUP_KEYS)
            .flat()
            .includes(f.key) && f.key !== FEEDBACK_KEY,
      )
      .map((f) => f.key);
    if (extraKeys.length) out.push({ id: "posting", keys: extraKeys });
    out.push({ id: "notes", keys: [FEEDBACK_KEY] });
    out.push({ id: "debug", keys: ["meta", "files"] });
    return out;
  }, [hasDocx, filesByKey, presentText]);

  const initialGroup: GroupId =
    visible[0]?.id ?? "debug";
  const initialSubTab: string = visible[0]?.keys[0] ?? "meta";
  const [group, setGroup] = useState<GroupId>(initialGroup);
  const [subTab, setSubTab] = useState<string>(initialSubTab);

  const onGroup = (g: GroupId) => {
    setGroup(g);
    const v = visible.find((x) => x.id === g);
    if (v) setSubTab(v.keys[0]);
  };

  const activeGroup = visible.find((v) => v.id === group) ?? visible[0];

  return (
    <>
      <Header job={job} files={files} />

      <TabStrip className="mt-6">
        {visible.map((v) => (
          <Tab key={v.id} active={group === v.id} onClick={() => onGroup(v.id)}>
            {GROUP_LABELS[v.id]}
            {v.id === "resume" && <StatusDot tone="ok" className="ml-1.5" />}
            {v.id === "notes" && feedbackEntry?.exists && (
              <StatusDot tone="muted" className="ml-1.5" />
            )}
          </Tab>
        ))}
      </TabStrip>

      {activeGroup && activeGroup.keys.length > 1 && (
        <SubTabStrip className="mt-2 mb-4">
          {activeGroup.keys.map((k) => {
            const label =
              k === "meta"
                ? "State + history"
                : k === "files"
                  ? "All files"
                  : filesByKey.get(k)?.label ?? k;
            return (
              <SubTab
                key={k}
                active={subTab === k}
                onClick={() => setSubTab(k)}
              >
                {label}
              </SubTab>
            );
          })}
        </SubTabStrip>
      )}

      <div className="mt-4">
        {group === "resume" && hasDocx && <DocxPane job={job} docx={files.finalDocx[0]} />}
        {group !== "resume" && group !== "notes" && group !== "debug" &&
          (() => {
            const f = filesByKey.get(subTab);
            if (!f) return null;
            return <MarkdownPane file={f} html={renderedMarkdown[f.key] ?? ""} />;
          })()}
        {group === "notes" && <InterviewFeedbackPane job={job} />}
        {group === "debug" && subTab === "meta" && <MetaPane job={job} files={files} />}
        {group === "debug" && subTab === "files" && <AllFilesPane files={files} />}
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
          <StatusBadge>{job.status}</StatusBadge>
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
            <span
              className="font-mono"
              style={{ color: "var(--color-fg-muted)", fontSize: "10px" }}
            >
              {job.folderPath.replace(/^\/Users\/[^/]+/, "~")}
            </span>
          )}
        </div>
        {job.statusNote && (
          <div
            className="mt-1.5 text-xs"
            style={{ color: "var(--color-fg-muted)" }}
          >
            {job.statusNote}
          </div>
        )}
      </div>
    </div>
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
        <a href={downloadHref}>
          <Button>Download .docx</Button>
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
    const num = (content.match(/^##\s*Round\s+\d+/gim) ?? []).length + 1;
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
          <Button onClick={insertRound}>+ Add round</Button>
          <Button
            variant={dirty ? "primary" : "secondary"}
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <CodeArea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (dirty && !saving) save();
          }
        }}
        placeholder={`Jot whatever's useful — date, interviewer name, topics, what went well/poorly, recruiter notes, weird vibes. Click "+ Add round" to drop a templated section.`}
        className="p-4"
        minHeight="60vh"
      />

      <div
        className="mt-2 flex items-center justify-between text-xs"
        style={{ color: "var(--color-fg-muted)" }}
      >
        <span>
          {content.length.toLocaleString()} chars ·{" "}
          {content.split(/\r?\n/).length.toLocaleString()} lines
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
          <Button
            variant="primary"
            onClick={synthesize}
            disabled={synthesizing || !content.trim() || dirty}
            title={
              dirty
                ? "Save first"
                : !content.trim()
                  ? "Write some feedback first"
                  : undefined
            }
          >
            {synthesizing ? "Spawning agent…" : "Synthesize lessons → about_user.md"}
          </Button>
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
        {job.statusNote && <Row label="latest note" value={job.statusNote} />}
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
        <Row label="path" value={job.folderPath ?? "(none)"} mono />
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

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
