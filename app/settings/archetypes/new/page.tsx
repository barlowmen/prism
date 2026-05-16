"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewArchetypePage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [matchingHints, setMatchingHints] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/archetypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          key: key || undefined,
          description,
          matchingHints,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.push(`/settings/archetypes/${encodeURIComponent(data.key)}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link
        href="/settings/archetypes"
        className="text-xs inline-block mb-3 hover:underline"
        style={{ color: "var(--color-fg-muted)" }}
      >
        ← Archetypes
      </Link>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">New archetype</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          You can upload the base resume DOCX on the next screen.
        </p>
      </header>

      <div className="space-y-4">
        <Field
          label="Label"
          value={label}
          onChange={setLabel}
          placeholder="AI / Frontier"
          help="Human-readable. Shown in dispatcher output and the UI."
        />
        <Field
          label="Key (optional)"
          value={key}
          onChange={setKey}
          placeholder="ai"
          help="Filesystem-safe slug, lowercase. Auto-derived from label if empty."
          mono
        />
        <Area
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="What this archetype is for — who it serves, what kinds of roles."
          minHeight={80}
        />
        <Area
          label="Matching hints"
          value={matchingHints}
          onChange={setMatchingHints}
          placeholder="Markdown. The dispatcher reads this when picking an archetype."
          minHeight={140}
          mono
        />

        {err && (
          <div className="text-xs" style={{ color: "var(--color-err)" }}>
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/settings/archetypes"
            className="px-3 py-1.5 text-xs rounded border"
            style={{ background: "var(--color-surface-2)" }}
          >
            Cancel
          </Link>
          <button
            onClick={submit}
            disabled={busy || !label.trim()}
            className="px-3 py-1.5 text-xs rounded border disabled:opacity-50"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              borderColor: "var(--color-accent)",
            }}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  help,
  mono,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  help?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--color-fg-muted)" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded border text-sm"
        style={{
          background: "var(--color-surface-1)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      />
      {help && (
        <div className="text-[10px] mt-1" style={{ color: "var(--color-fg-muted)" }}>
          {help}
        </div>
      )}
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  minHeight,
  mono,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  minHeight?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--color-fg-muted)" }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded border text-sm"
        style={{
          background: "var(--color-surface-1)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          minHeight: minHeight ?? 100,
        }}
        spellCheck={false}
      />
    </div>
  );
}
