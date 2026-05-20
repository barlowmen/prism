"use client";

/**
 * Multi-file markdown editor for the user's Truth Base — `about_user.md`
 * and `resume_style_guide_2026.md` today. These two files are the
 * source of truth every agent reads on cold-start, so the editor sits
 * one click off the Settings nav.
 *
 * Tab-per-file with dirty-state tracking. A draft per slug lives in
 * client state until the user clicks Save, at which point the PATCH
 * fires against /api/truth-base/<slug>. Reload reverts the draft.
 *
 * The allowlist of editable slugs lives in lib/paths.ts:TRUTH_BASE_FILES.
 * Adding a file to that map auto-surfaces it here as a new tab —
 * everything else is keyed off TruthBaseSlug.
 */
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, CodeArea, Tab, TabStrip } from "@/components/ui";
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
      <TabStrip className="mb-4">
        {tabs.map((slug) => {
          const f = files[slug];
          const tabDirty = drafts[slug] !== f.content;
          return (
            <Tab key={slug} active={slug === active} onClick={() => setActive(slug)}>
              {f.title}
              {tabDirty && (
                <span
                  className="ml-1.5"
                  style={{ color: "var(--color-warn)" }}
                  aria-label="unsaved changes"
                >
                  •
                </span>
              )}
            </Tab>
          );
        })}
      </TabStrip>

      <div className="mb-3 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
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
          <Button onClick={reload} icon={<RefreshCw className="w-3 h-3" />}>
            Reload from disk
          </Button>
          <Button
            variant={dirty ? "primary" : "secondary"}
            onClick={save}
            disabled={!dirty || state.kind === "saving"}
          >
            Save
          </Button>
        </div>
      </div>

      <CodeArea
        value={draft}
        onChange={(e) =>
          setDrafts((d) => ({ ...d, [active]: e.target.value }))
        }
        minHeight="70vh"
        className="p-4"
      />

      <div className="mt-2 flex justify-between text-xs" style={{ color: "var(--color-fg-muted)" }}>
        <span>
          {draft.length.toLocaleString()} chars · {draft.split(/\r?\n/).length.toLocaleString()} lines
        </span>
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
