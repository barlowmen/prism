"use client";

/**
 * Per-company prep workspace UI. Two-tier tab navigation that maps
 * onto the standard prep-pack shape (overview → 4 rounds → appendix
 * → notes → other); the second tier appears only when a group has
 * more than one file (e.g. CareFirst's 02-round-2/q*.md subdirectory).
 *
 * Each pane supports inline edit — Read shows server-rendered HTML;
 * clicking Edit fetches the raw markdown and swaps in a textarea
 * gated by the sandboxed /api/prep/<Company>/files PUT endpoint.
 * Bootstrap + "Build with assistant" actions live in the top action
 * row; both fire idempotent server-side operations.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Save, Sparkles } from "lucide-react";
import {
  Button,
  Callout,
  CodeArea,
  EmptyState,
  SubTab,
  SubTabStrip,
  Tab,
  TabStrip,
} from "@/components/ui";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  type PrepFile,
  type PrepGroup,
} from "@/lib/prep/types";

type Props = {
  company: string;
  folderExists: boolean;
  hasApps: boolean;
  files: PrepFile[];
  rendered: Record<string, string>;
};

export function PrepCompanyView({
  company,
  folderExists,
  hasApps,
  files: initialFiles,
  rendered: initialRendered,
}: Props) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [rendered] = useState(initialRendered);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);

  const filesByGroup = useMemo(() => {
    const m = new Map<PrepGroup, PrepFile[]>();
    for (const f of files) {
      if (!m.has(f.group)) m.set(f.group, []);
      m.get(f.group)!.push(f);
    }
    return m;
  }, [files]);

  const presentGroups = GROUP_ORDER.filter((g) => filesByGroup.has(g));
  const initialGroup: PrepGroup = presentGroups[0] ?? "overview";
  const [group, setGroup] = useState<PrepGroup>(initialGroup);
  const groupFiles = filesByGroup.get(group) ?? [];
  const [activeRelPath, setActiveRelPath] = useState<string | null>(
    groupFiles[0]?.relPath ?? null,
  );

  const onGroup = (g: PrepGroup) => {
    setGroup(g);
    const list = filesByGroup.get(g) ?? [];
    setActiveRelPath(list[0]?.relPath ?? null);
  };

  const bootstrap = async () => {
    setBootstrapping(true);
    setBootstrapMsg(null);
    try {
      const r = await fetch(
        `/api/prep/${encodeURIComponent(company)}/bootstrap`,
        { method: "POST" },
      );
      const data = await r.json();
      if (!r.ok) {
        setBootstrapMsg(`error: ${data.error ?? r.status}`);
        return;
      }
      const created = (data.findings as Array<{ status: string }>).filter(
        (f) => f.status === "created",
      ).length;
      const existed = data.findings.length - created;
      setBootstrapMsg(
        `wrote ${created} new file${created === 1 ? "" : "s"}` +
          (existed > 0 ? ` · ${existed} already existed` : ""),
      );
      router.refresh();
    } catch (e) {
      setBootstrapMsg(`error: ${String(e)}`);
    } finally {
      setBootstrapping(false);
    }
  };

  const build = async () => {
    setBuilding(true);
    setBuildMsg(null);
    try {
      const r = await fetch(
        `/api/prep/${encodeURIComponent(company)}/build`,
        { method: "POST" },
      );
      const data = await r.json();
      if (!r.ok) {
        setBuildMsg(`error: ${data.error ?? r.status}`);
        return;
      }
      setBuildMsg(
        data.message ??
          `spawned prep-builder agent (runId ${data.runId?.slice(0, 8) ?? "?"})`,
      );
      router.refresh();
    } catch (e) {
      setBuildMsg(`error: ${String(e)}`);
    } finally {
      setBuilding(false);
    }
  };

  // Empty / not-bootstrapped state.
  if (!folderExists || files.length === 0) {
    return (
      <>
        {!hasApps && (
          <div className="mb-4">
            <Callout tone="warn" title="No matching application folder">
              No <code>apps/{company}/</code> exists. The prep workspace will
              still bootstrap, but research and JD analysis won&apos;t be
              available to seed it. Consider pasting the job first.
            </Callout>
          </div>
        )}
        <EmptyState
          title="No prep files yet"
          action={
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={bootstrap}
                disabled={bootstrapping}
                icon={<FilePlus className="w-3 h-3" />}
              >
                {bootstrapping ? "Writing templates…" : "Bootstrap prep pack"}
              </Button>
              {hasApps && (
                <Button
                  onClick={build}
                  disabled={building}
                  icon={<Sparkles className="w-3 h-3" />}
                >
                  {building ? "Spawning…" : "Build with assistant"}
                </Button>
              )}
            </div>
          }
        >
          The bootstrap action templates an overview + per-round files +
          appendix + notes template, and inlines the dispatcher&apos;s
          company_research.md if it exists.
          {bootstrapMsg && <div className="mt-2">{bootstrapMsg}</div>}
          {buildMsg && <div className="mt-2">{buildMsg}</div>}
        </EmptyState>
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <Button
          onClick={bootstrap}
          disabled={bootstrapping}
          icon={<FilePlus className="w-3 h-3" />}
          title="Idempotent — writes any missing standard template files"
        >
          {bootstrapping ? "…" : "Fill missing templates"}
        </Button>
        {hasApps && (
          <Button
            variant="primary"
            onClick={build}
            disabled={building}
            icon={<Sparkles className="w-3 h-3" />}
            title="Spawn an agent that drafts round-specific content from research/* + about_user.md"
          >
            {building ? "Spawning…" : "Build with assistant"}
          </Button>
        )}
      </div>

      {(bootstrapMsg || buildMsg) && (
        <div
          className="text-xs mb-3"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {bootstrapMsg || buildMsg}
        </div>
      )}

      <TabStrip>
        {presentGroups.map((g) => (
          <Tab key={g} active={group === g} onClick={() => onGroup(g)}>
            {GROUP_LABELS[g]}
          </Tab>
        ))}
      </TabStrip>

      {groupFiles.length > 1 && (
        <SubTabStrip className="mt-2 mb-4">
          {groupFiles.map((f) => (
            <SubTab
              key={f.relPath}
              active={activeRelPath === f.relPath}
              onClick={() => setActiveRelPath(f.relPath)}
              mono
            >
              {f.relPath}
            </SubTab>
          ))}
        </SubTabStrip>
      )}

      <div className="mt-4">
        {activeRelPath &&
          (() => {
            const f = files.find((x) => x.relPath === activeRelPath);
            if (!f) return null;
            if (f.binary) {
              return (
                <div
                  className="text-xs rounded-md border p-4"
                  style={{
                    background: "var(--color-surface-1)",
                    color: "var(--color-fg-muted)",
                  }}
                >
                  <code className="text-xs">{f.relPath}</code> is binary
                  ({fmtBytes(f.size)}). Open it in Finder.
                </div>
              );
            }
            return (
              <FilePane
                company={company}
                file={f}
                html={rendered[f.relPath] ?? ""}
                onSaved={(stat) => {
                  setFiles((prev) =>
                    prev.map((x) =>
                      x.relPath === f.relPath
                        ? { ...x, size: stat.size, mtimeMs: stat.mtimeMs }
                        : x,
                    ),
                  );
                }}
              />
            );
          })()}
      </div>
    </div>
  );
}

function FilePane({
  company,
  file,
  html,
  onSaved,
}: {
  company: string;
  file: PrepFile;
  html: string;
  onSaved: (stat: { size: number; mtimeMs: number }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState(html);

  const startEdit = async () => {
    setEditing(true);
    setErr(null);
    if (content != null) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/prep/${encodeURIComponent(company)}/files?path=${encodeURIComponent(file.relPath)}`,
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setContent(data.content);
      setSavedContent(data.content);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (content == null) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/prep/${encodeURIComponent(company)}/files`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: file.relPath, content }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setSavedContent(content);
      onSaved({ size: data.size, mtimeMs: data.mtimeMs });
      // Re-render preview locally — fetch the rendered markdown via a
      // dedicated endpoint would be cleaner, but client-side preview is
      // fine; the next page nav re-renders server-side anyway.
      setRenderedHtml(
        `<pre style="white-space: pre-wrap;">${escapeHtml(content)}</pre>`,
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const dirty = content != null && content !== savedContent;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          <code className="text-xs">{file.relPath}</code> · {fmtBytes(file.size)}{" "}
          · {new Date(file.mtimeMs).toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <Button onClick={startEdit}>Edit</Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setEditing(false);
                  setContent(savedContent);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant={dirty ? "primary" : "secondary"}
                onClick={save}
                disabled={!dirty || saving}
                icon={<Save className="w-3 h-3" />}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {err && (
        <div className="text-xs mb-2" style={{ color: "var(--color-err)" }}>
          {err}
        </div>
      )}

      {editing ? (
        <>
          {loading ? (
            <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              loading…
            </div>
          ) : (
            <CodeArea
              value={content ?? ""}
              onChange={(e) => setContent(e.target.value)}
              className="p-4"
              minHeight="60vh"
            />
          )}
        </>
      ) : (
        <article
          className="md-prose rounded-md border p-6"
          style={{ background: "var(--color-surface-1)" }}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      )}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
