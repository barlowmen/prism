"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "./ui";

export function PasteJobModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [dispatchImmediately, setDispatchImmediately] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        postingUrl: url,
        jdText: jdText || null,
        dispatchImmediately,
      };
      if (overrideOpen && (company || role)) {
        body.company = company;
        body.role = role;
      }
      const r = await fetch("/api/jobs/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.push(`/jobs/${encodeURIComponent(data.job.id)}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const overridePartial: boolean =
    overrideOpen && Boolean(company) !== Boolean(role);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{ background: "var(--color-scrim)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-md border p-6"
        style={{ background: "var(--color-surface-1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Paste a job</h2>
        <p className="text-xs mb-4" style={{ color: "var(--color-fg-muted)" }}>
          Paste the posting URL — the dispatcher fetches it, picks the
          company / role names, creates the folder, and classifies the
          posting. ~30–60s.
        </p>

        <div className="space-y-3 text-sm">
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Posting URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              placeholder="https://job-boards.greenhouse.io/..."
              className="w-full px-2 py-1.5 rounded-md border text-sm"
              style={{
                background: "var(--color-surface-2)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Raw JD text (optional — use only if the URL is dead or paywalled)
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md border text-sm"
              style={{
                background: "var(--color-surface-2)",
                fontFamily: "var(--font-mono)",
                minHeight: 100,
              }}
              spellCheck={false}
            />
          </div>

          <details
            className="rounded-md"
            onToggle={(e) => setOverrideOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary
              className="cursor-pointer text-xs select-none"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Override company / role names
            </summary>
            <div
              className="mt-2 space-y-2 rounded-md border p-3"
              style={{ background: "var(--color-surface-2)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--color-fg-muted)" }}>
                Skip these and the dispatcher will pick names from the JD.
                Override only if you want a specific folder name (both fields
                required if you do).
              </p>
              <Field
                label="Company"
                value={company}
                onChange={setCompany}
                placeholder="Anthropic"
              />
              <Field
                label="Role"
                value={role}
                onChange={setRole}
                placeholder="AppliedAIArchMgr_EntTechCyber"
                mono
              />
            </div>
          </details>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={dispatchImmediately}
              onChange={(e) => setDispatchImmediately(e.target.checked)}
            />
            Spin up dispatcher immediately
          </label>
        </div>

        {err && (
          <div className="mt-3 text-xs" style={{ color: "var(--color-err)" }}>
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || !url || overridePartial}
            title={
              overridePartial
                ? "Override needs both company and role filled, or leave both empty"
                : undefined
            }
          >
            {busy ? "Working…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
