"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Area, BackLink, Button, Field, PageHeader } from "@/components/ui";

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
    <div className="max-w-2xl">
      <BackLink href="/settings/archetypes" label="Archetypes" />
      <PageHeader
        title="New archetype"
        description="You can upload the base resume DOCX on the next screen."
      />

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
          rows={3}
          placeholder="What this archetype is for — who it serves, what kinds of roles."
        />
        <Area
          label="Matching hints"
          value={matchingHints}
          onChange={setMatchingHints}
          rows={7}
          mono
          placeholder="Markdown. The dispatcher reads this when picking an archetype."
        />

        {err && (
          <div className="text-xs" style={{ color: "var(--color-err)" }}>
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link href="/settings/archetypes">
            <Button>Cancel</Button>
          </Link>
          <Button variant="primary" onClick={submit} disabled={busy || !label.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
