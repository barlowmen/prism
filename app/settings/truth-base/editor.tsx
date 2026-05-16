"use client";

import { useMemo, useState } from "react";
import type { TruthBaseSlug } from "@/lib/paths";

type FileEntry = {
  slug: TruthBaseSlug;
  title: string;
  description: string;
  relPath: string;
  absPath: string;
  exists: boolean;
  size: number;
  mtimeMs: number | null;
  content: string;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export function TruthBaseEditor({ initial }: { initial: FileEntry[] }) {
  const [files, setFiles] = useState<Record<TruthBaseSlug, FileEntry>>(() =>
    Object.fromEntries(initial.map((f) => [f.slug, f])) as Record<TruthBaseSlug, FileEntry>,
  );
  const [drafts, setDrafts] = useState<Record<TruthBaseSlug, string>>(() =>
    Object.fromEntries(initial.map((f) => [f.slug, f.content])) as Record<TruthBaseSlug, string>,
  );
  const [active, setActive] = useState<TruthBaseSlug>(initial[0].slug);
  const [saveState, setSaveState] = useState<Record<TruthBaseSlug, SaveState>>(() =>
    Object.fromEntries(initial.map((f) => [f.slug, { kind: "idle" }])) as Record<
      TruthBaseSlug,
      SaveState
    >,
  );

  const tabs = initial.map((f) => f.slug);
  const activeFile = files[active];
  const draft = drafts[active];
  const dirty = useMemo(() => draft !== activeFile.content, [draft, activeFile.content]);
  const state = saveState[active];

  const save = async () => {
    setSaveState((s) => ({ ...s, [active]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/truth-base/${active}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setSaveState((s) => ({
          ...s,
          [active]: { kind: "error", message: data.error ?? `HTTP ${r.status}` },
        }));
        return;
      }
      setFiles((f) => ({
        ...f,
        [active]: {
          ...f[active],
          content: draft,
          size: data.size,
          mtimeMs: data.mtimeMs,
          exists: true,
        },
      }));
      setSaveState((s) => ({ ...s, [active]: { kind: "saved", at: Date.now() } }));
    } catch (err) {
      setSaveState((s) => ({
        ...s,
        [active]: { kind: "error", message: String(err) },
      }));
    }
  };

  const reload = async () => {
    const r = await fetch(`/api/truth-base/${active}`);
    const data = (await r.json()) as FileEntry;
    setFiles((f) => ({ ...f, [active]: { ...f[active], ...data } }));
    setDrafts((d) => ({ ...d, [active]: data.content }));
    setSaveState((s) => ({ ...s, [active]: { kind: "idle" } }));
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 border-b">
        {tabs.map((slug) => {
          const f = files[slug];
          const tabDirty = drafts[slug] !== f.content;
          const isActive = slug === active;
          return (
            <button
              key={slug}
              onClick={() => setActive(slug)}
              className="px-3 py-2 text-sm transition-colors -mb-px border-b-2"
              style={{
                color: isActive ? "var(--color-fg)" : "var(--color-fg-muted)",
                borderBottomColor: isActive ? "var(--color-accent)" : "transparent",
                background: isActive ? "var(--color-surface-1)" : "transparent",
              }}
            >
              {f.title}
              {tabDirty && (
                <span
                  className="ml-1.5"
                  style={{ color: "var(--color-accent)" }}
                  aria-label="unsaved changes"
                >
                  •
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            <code className="text-xs">{activeFile.relPath}</code>
            {" · "}
            {activeFile.exists ? (
              <>
                {fmtBytes(activeFile.size)} · last modified {fmtTime(activeFile.mtimeMs)}
              </>
            ) : (
              <span style={{ color: "var(--color-err)" }}>file not found</span>
            )}
          </div>
          <div
            className="text-xs mt-1 max-w-2xl"
            style={{ color: "var(--color-fg-muted)" }}
          >
            {activeFile.description}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {state.kind === "saving" && (
            <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              saving…
            </span>
          )}
          {state.kind === "saved" && (
            <span className="text-xs" style={{ color: "var(--color-ok)" }}>
              saved {fmtTime(state.at)}
            </span>
          )}
          {state.kind === "error" && (
            <span className="text-xs" style={{ color: "var(--color-err)" }}>
              {state.message}
            </span>
          )}
          <button
            onClick={reload}
            className="px-3 py-1.5 text-xs rounded-md border"
            style={{ background: "var(--color-surface-1)" }}
          >
            Reload from disk
          </button>
          <button
            onClick={save}
            disabled={!dirty || state.kind === "saving"}
            className="px-3 py-1.5 text-xs rounded-md border disabled:opacity-40"
            style={{
              background: dirty ? "var(--color-accent)" : "var(--color-surface-1)",
              color: dirty ? "var(--color-bg)" : "var(--color-fg)",
              borderColor: dirty ? "var(--color-accent)" : "var(--color-border)",
            }}
          >
            Save
          </button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) =>
          setDrafts((d) => ({ ...d, [active]: e.target.value }))
        }
        spellCheck={false}
        className="w-full p-4 rounded-md border text-sm leading-relaxed"
        style={{
          background: "var(--color-surface-1)",
          fontFamily: "var(--font-mono)",
          minHeight: "70vh",
          resize: "vertical",
          tabSize: 2,
        }}
      />

      <div className="mt-2 flex justify-between text-xs" style={{ color: "var(--color-fg-muted)" }}>
        <span>
          {draft.length.toLocaleString()} chars · {draft.split(/\r?\n/).length.toLocaleString()} lines
        </span>
        {dirty && <span style={{ color: "var(--color-accent)" }}>unsaved changes</span>}
      </div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}
