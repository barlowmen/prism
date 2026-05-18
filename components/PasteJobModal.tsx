"use client";

/**
 * "Paste a job" modal — top-right of the Dashboard. Two-mode flow:
 *
 *   - Single (default): one URL + optional override company/role +
 *     optional raw JD text. Spawns the dispatcher and navigates the
 *     user to the new job's detail page.
 *   - Bulk: paste many URLs at once (one per line). The server creates
 *     a Job record for each, then fans out dispatcher spawns with a
 *     concurrency cap (default 2) so the subscription quota doesn't
 *     get hammered. Modal stays open after submit so the user can see
 *     the summary of what was created vs. dropped.
 *
 * The override section in single mode is a real <details>; closing it
 * clears the company/role overrides from the request body so an
 * accidentally-typed value doesn't override the dispatcher's auto-pick.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CodeArea, Field } from "./ui";

type Mode = "single" | "bulk";

type BulkResult = {
  validCount: number;
  droppedCount: number;
  created: Array<{ url: string; jobId: string; company: string; role: string }>;
  errored: Array<{ url: string; error: string }>;
};

export function PasteJobModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("single");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [dispatchImmediately, setDispatchImmediately] = useState(true);
  const [bulkInput, setBulkInput] = useState("");
  const [concurrency, setConcurrency] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const submitSingle = async () => {
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

  const submitBulk = async () => {
    setErr(null);
    setBulkResult(null);
    setBusy(true);
    try {
      const r = await fetch("/api/jobs/manual/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: bulkInput, concurrency }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setBulkResult(data);
      router.refresh();
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
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold">Paste a job</h2>
          <ModeToggle mode={mode} setMode={setMode} disabled={busy} />
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--color-fg-muted)" }}>
          {mode === "single" ? (
            <>
              Paste the posting URL — the dispatcher fetches it, picks the
              company / role names, creates the folder, and classifies the
              posting. ~30–60s.
            </>
          ) : (
            <>
              Paste many URLs, one per line. Blank lines and{" "}
              <code className="text-xs">#</code> comments are ignored. Each URL
              gets its own dispatcher run, fanned out with a concurrency cap so
              subscription quota stays sane.
            </>
          )}
        </p>

        {mode === "single" ? (
          <SinglePane
            url={url}
            setUrl={setUrl}
            jdText={jdText}
            setJdText={setJdText}
            overrideOpen={overrideOpen}
            setOverrideOpen={setOverrideOpen}
            company={company}
            setCompany={setCompany}
            role={role}
            setRole={setRole}
            dispatchImmediately={dispatchImmediately}
            setDispatchImmediately={setDispatchImmediately}
          />
        ) : (
          <BulkPane
            input={bulkInput}
            setInput={setBulkInput}
            concurrency={concurrency}
            setConcurrency={setConcurrency}
            result={bulkResult}
          />
        )}

        {err && (
          <div className="mt-3 text-xs" style={{ color: "var(--color-err)" }}>
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            {bulkResult ? "Close" : "Cancel"}
          </Button>
          {!bulkResult && (
            <Button
              variant="primary"
              onClick={mode === "single" ? submitSingle : submitBulk}
              disabled={
                busy ||
                (mode === "single"
                  ? !url || overridePartial
                  : bulkInput.trim().length === 0)
              }
              title={
                mode === "single" && overridePartial
                  ? "Override needs both company and role filled, or leave both empty"
                  : undefined
              }
            >
              {busy
                ? mode === "bulk"
                  ? "Queuing…"
                  : "Working…"
                : mode === "bulk"
                  ? "Queue all"
                  : "Submit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  disabled,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex rounded-md border text-xs overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      {(["single", "bulk"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          disabled={disabled}
          className="px-2.5 py-1 disabled:opacity-50"
          style={{
            background:
              mode === m
                ? "var(--color-surface-2)"
                : "transparent",
            color:
              mode === m ? "var(--color-fg)" : "var(--color-fg-muted)",
          }}
        >
          {m === "single" ? "Single" : "Bulk"}
        </button>
      ))}
    </div>
  );
}

function SinglePane(props: {
  url: string;
  setUrl: (s: string) => void;
  jdText: string;
  setJdText: (s: string) => void;
  overrideOpen: boolean;
  setOverrideOpen: (b: boolean) => void;
  company: string;
  setCompany: (s: string) => void;
  role: string;
  setRole: (s: string) => void;
  dispatchImmediately: boolean;
  setDispatchImmediately: (b: boolean) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Posting URL
        </label>
        <input
          value={props.url}
          onChange={(e) => props.setUrl(e.target.value)}
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
        <CodeArea
          value={props.jdText}
          onChange={(e) => props.setJdText(e.target.value)}
          surface="surface-2"
          minHeight={100}
        />
      </div>

      <details
        className="rounded-md"
        onToggle={(e) =>
          props.setOverrideOpen((e.target as HTMLDetailsElement).open)
        }
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
            value={props.company}
            onChange={props.setCompany}
            placeholder="Anthropic"
          />
          <Field
            label="Role"
            value={props.role}
            onChange={props.setRole}
            placeholder="AppliedAIArchMgr_EntTechCyber"
            mono
          />
        </div>
      </details>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={props.dispatchImmediately}
          onChange={(e) => props.setDispatchImmediately(e.target.checked)}
        />
        Spin up dispatcher immediately
      </label>
    </div>
  );
}

function BulkPane(props: {
  input: string;
  setInput: (s: string) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
  result: BulkResult | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      {props.result ? (
        <BulkResultView result={props.result} />
      ) : (
        <>
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-fg-muted)" }}
            >
              URLs (one per line)
            </label>
            <CodeArea
              value={props.input}
              onChange={(e) => props.setInput(e.target.value)}
              autoFocus
              surface="surface-2"
              minHeight={180}
              placeholder={"https://job-boards.greenhouse.io/...\nhttps://jobs.lever.co/...\n# this is a comment\nhttps://..."}
            />
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2">
              Concurrency
              <select
                value={props.concurrency}
                onChange={(e) => props.setConcurrency(Number(e.target.value))}
                className="px-2 py-0.5 rounded-md border text-xs"
                style={{
                  background: "var(--color-surface-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ color: "var(--color-fg-muted)" }}>
              How many dispatchers run in parallel. Lower = gentler on quota.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function BulkResultView({ result }: { result: BulkResult }) {
  return (
    <div className="space-y-3">
      <div
        className="text-xs"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Created <strong style={{ color: "var(--color-ok)" }}>
          {result.created.length}
        </strong>{" "}
        job{result.created.length === 1 ? "" : "s"}
        {result.droppedCount > 0 && (
          <>
            {" · "}
            <span style={{ color: "var(--color-warn)" }}>
              dropped {result.droppedCount}
            </span>{" "}
            (duplicates / malformed / comments)
          </>
        )}
        {result.errored.length > 0 && (
          <>
            {" · "}
            <span style={{ color: "var(--color-err)" }}>
              {result.errored.length} errored on create
            </span>
          </>
        )}
        . Dispatchers are running in the background — watch{" "}
        <a href="/settings/runs" className="underline">/settings/runs</a> or
        click through from the dashboard.
      </div>

      {result.created.length > 0 && (
        <div
          className="rounded-md border overflow-hidden"
          style={{ background: "var(--color-surface-2)" }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--color-fg-muted)" }}>
                <th className="text-left font-normal py-1.5 px-2">Job</th>
                <th className="text-left font-normal py-1.5 px-2">URL</th>
              </tr>
            </thead>
            <tbody>
              {result.created.map((c) => (
                <tr
                  key={c.jobId}
                  className="border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <td className="py-1 px-2 font-mono">
                    <a
                      href={`/jobs/${encodeURIComponent(c.jobId)}`}
                      className="hover:underline"
                    >
                      {c.jobId}
                    </a>
                  </td>
                  <td
                    className="py-1 px-2 truncate max-w-xs"
                    style={{ color: "var(--color-fg-muted)" }}
                    title={c.url}
                  >
                    {c.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.errored.length > 0 && (
        <div
          className="rounded-md border p-2 text-xs"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-err)",
          }}
        >
          {result.errored.map((e) => (
            <div key={e.url} className="truncate">
              <code className="text-xs">{e.url}</code>: {e.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
