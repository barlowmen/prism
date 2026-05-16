"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import type { Job } from "@/lib/jobs/types";

export function ShortlistView({ initial }: { initial: Job[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<{ jobId: string; reason: string } | null>(null);

  const setStatus = async (jobId: string, status: string, note: string) => {
    setBusy(jobId + ":" + status);
    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, statusNote: note }),
      });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } finally {
      setBusy(null);
    }
  };

  const approve = async (j: Job) => {
    if (!j.sourceUrl) return;
    setBusy(j.id + ":approve");
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(j.id)}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        setJobs((prev) => prev.filter((x) => x.id !== j.id));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  if (jobs.length === 0) {
    return (
      <EmptyState title="Shortlist is empty.">
        Run discovery from the Dashboard or paste a job manually.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li
          key={j.id}
          className="rounded-md border p-3"
          style={{ background: "var(--color-surface-1)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                href={`/jobs/${encodeURIComponent(j.id)}`}
                className="hover:underline"
              >
                <div className="text-sm font-medium">{j.company}</div>
                <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                  {j.role}
                </div>
              </Link>
              {j.sourceUrl && (
                <a
                  href={j.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] hover:underline mt-1 inline-flex items-center gap-1 truncate max-w-md"
                  style={{ color: "var(--color-fg-muted)" }}
                  title={j.sourceUrl}
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">{j.sourceUrl}</span>
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="primary"
                onClick={() => approve(j)}
                disabled={!j.sourceUrl || !!busy}
                title={j.sourceUrl ? "Run dispatcher" : "No URL on this candidate — paste a job manually with a URL"}
              >
                {busy === j.id + ":approve" ? "Spawning…" : "Approve"}
              </Button>
              <Button
                onClick={() => setSkipping({ jobId: j.id, reason: "" })}
                disabled={!!busy}
              >
                Skip
              </Button>
              <Button
                onClick={() => setStatus(j.id, "held", "user held from shortlist")}
                disabled={!!busy}
              >
                Hold
              </Button>
            </div>
          </div>
        </li>
      ))}

      {skipping && (
        <SkipModal
          onClose={() => setSkipping(null)}
          onSubmit={async (reason) => {
            await setStatus(skipping.jobId, "skipped", reason || "skipped from shortlist");
            setSkipping(null);
          }}
        />
      )}
    </ul>
  );
}

function SkipModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{ background: "var(--color-scrim)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md border p-5"
        style={{ background: "var(--color-surface-1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-1">Why skip?</div>
        <div className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
          Optional. Used as the status note; later, this can feed a
          skip-patterns list to filter future discovery runs.
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-2 py-1.5 rounded-md border text-sm"
          style={{ background: "var(--color-surface-2)", minHeight: 80 }}
          spellCheck={false}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              setBusy(true);
              await onSubmit(reason);
              setBusy(false);
            }}
            disabled={busy}
          >
            {busy ? "Saving…" : "Skip"}
          </Button>
        </div>
      </div>
    </div>
  );
}
