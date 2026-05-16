"use client";

import Link from "next/link";
import { useState } from "react";
import type { Job, JobOutcome } from "@/lib/jobs/types";

const OUTCOMES: { value: JobOutcome | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "awaiting_response", label: "awaiting response" },
  { value: "phone_screen", label: "phone screen" },
  { value: "interview", label: "interview" },
  { value: "offer", label: "offer" },
  { value: "rejected", label: "rejected" },
  { value: "ghosted", label: "ghosted" },
];

export function ApplicationsView({ jobs }: { jobs: Job[] }) {
  const [rows, setRows] = useState<Job[]>(() =>
    [...jobs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const setOutcome = async (job: Job, outcome: JobOutcome | "") => {
    setSavingId(job.id);
    try {
      const body =
        outcome === ""
          ? { outcome: null }
          : { outcome };
      const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const updated = (await r.json()) as Job;
        setRows((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      }
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border p-8 text-center text-sm"
        style={{ background: "var(--color-surface-1)", color: "var(--color-fg-muted)" }}
      >
        Nothing here yet. Jobs land here once they're approved for submission.
      </div>
    );
  }

  return (
    <div className="rounded-md border" style={{ background: "var(--color-surface-1)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--color-fg-muted)" }}>
            <th className="font-normal py-2 px-3">Company / Role</th>
            <th className="font-normal py-2 px-3">Status</th>
            <th className="font-normal py-2 px-3">Last update</th>
            <th className="font-normal py-2 px-3">Outcome</th>
            <th className="font-normal py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2 px-3">
                <Link
                  href={`/jobs/${encodeURIComponent(j.id)}`}
                  className="hover:underline"
                >
                  <div className="text-sm">{j.company}</div>
                  <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                    {j.role}
                  </div>
                </Link>
              </td>
              <td className="py-2 px-3 text-xs font-mono">{j.status}</td>
              <td className="py-2 px-3 text-xs" style={{ color: "var(--color-fg-muted)" }}>
                {new Date(j.updatedAt).toLocaleDateString()}
              </td>
              <td className="py-2 px-3">
                <select
                  value={j.outcome ?? ""}
                  onChange={(e) => setOutcome(j, e.target.value as JobOutcome | "")}
                  disabled={savingId === j.id}
                  className="px-2 py-1 text-xs rounded border"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 px-3 text-right">
                {j.sourceUrl && (
                  <a
                    href={j.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs hover:underline"
                    style={{ color: "var(--color-fg-muted)" }}
                    title={j.sourceUrl}
                  >
                    posting ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
