"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Area, Button, Field } from "@/components/ui";
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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
