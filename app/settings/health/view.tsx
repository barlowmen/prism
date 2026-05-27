"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Row } from "@/components/ui";
import type { HealthReport } from "@/lib/health";

type ConnectivityResult = {
  exitCode: number;
  apiKeySource?: string;
  durationMs: number;
  extracted: unknown;
  tokenTotals: { input: number; output: number; cacheRead: number; cacheCreation: number };
  eventCounts: { total: number; usage: number; unknown: number };
};

export function HealthView({ initial }: { initial: HealthReport }) {
  const [report, setReport] = useState<HealthReport>(initial);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [shutdownError, setShutdownError] = useState<string | null>(null);

  const recheck = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/health");
      const data = (await r.json()) as HealthReport;
      setReport(data);
    } finally {
      setBusy(false);
    }
  };

  // Auto-run the slow Claude Code auth probe once after mount so the
  // page paints fast and the auth card fills in shortly after. StrictMode
  // double-mounts in dev — the ref guards against the duplicate call.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (report.auth.ok !== "pending") return;
    autoRanRef.current = true;
    recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel every in-flight agent run and stop the server. The endpoint
  // takes up to ~17s worst-case (per-run cancel/await is parallelized
  // but bounded by a 15s wait per run, + a 1.5s exit delay). We keep
  // the button in "Stopping…" state for the entire window; the browser
  // loses its connection ~1.5s after the response lands, so we never
  // need to render a "done" state.
  const stopEverything = async () => {
    const ok = confirm(
      "Cancel all running agents and stop the server?\n\n" +
        "Each agent has up to 15s to wrap up cleanly, then the server exits.\n" +
        "You'll need to run ./server.sh start to bring it back.\n\n" +
        "Cancelled Jobs land in 'Ready when you are' → Errored with a Re-dispatch all banner.",
    );
    if (!ok) return;
    setStopping(true);
    setShutdownError(null);
    try {
      const r = await fetch("/api/admin/shutdown", { method: "POST" });
      if (!r.ok) {
        // Server still alive (unlikely path) — surface the error and
        // let the user try again.
        const data = await r.json().catch(() => ({}));
        setShutdownError(data?.error ?? `HTTP ${r.status}`);
        setStopping(false);
      }
      // Success: setStopping stays true. The next.js process exits
      // ~1.5s after the response, the fetch resolves, and the browser
      // immediately can't reach any subsequent endpoint. The user
      // restarts with ./server.sh start.
    } catch {
      // Connection drop after process.exit lands here — expected. Leave
      // the button in "Stopping…" so the user sees the action took.
    }
  };

  const runConnectivityTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const r = await fetch("/api/test", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setTestError(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setTestResult({
        exitCode: data.exitCode,
        apiKeySource: data.apiKeySource,
        durationMs: data.durationMs,
        extracted: data.extracted,
        tokenTotals: data.tokenTotals,
        eventCounts: data.eventCounts,
      });
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const authBanner =
    report.auth.ok === "pending" ? null : !report.auth.ok ? (
      <div className="mb-4">
        <Callout tone="err" title="Claude Code auth probe failed">
          {report.auth.error}. Run <code>claude logout</code> then{" "}
          <code>claude login</code> and sign in with your Pro/Max subscription.
        </Callout>
      </div>
    ) : !report.auth.isSubscription ? (
      <div className="mb-4">
        <Callout
          tone="warn"
          title={
            <>
              Claude Code is using <code>apiKeySource = {report.auth.apiKeySource}</code>
            </>
          }
        >
          This means API-key billing, not subscription. Unset{" "}
          <code>ANTHROPIC_API_KEY</code> in your shell, then{" "}
          <code>claude logout</code> and <code>claude login</code> with your
          Pro/Max account.
        </Callout>
      </div>
    ) : null;

  return (
    <div>
      {authBanner}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          checked {new Date(report.checkedAt).toLocaleString()}
        </div>
        <Button
          onClick={recheck}
          disabled={busy}
          icon={<RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />}
        >
          {busy ? "Re-checking…" : "Re-check"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Claude Code CLI">
          {report.cli.installed ? (
            <>
              <Row label="Status" value="installed" tone="ok" />
              <Row label="Version" value={report.cli.version} mono />
              {report.cli.path && <Row label="Path" value={report.cli.path} mono />}
            </>
          ) : (
            <>
              <Row label="Status" value="not installed" tone="err" />
              <Row label="Error" value={report.cli.error} mono />
            </>
          )}
        </Card>

        <Card title="Subscription auth">
          {report.auth.ok === "pending" ? (
            <Row
              label="Status"
              value={busy ? "probing Claude Code…" : "probe pending"}
              tone="muted"
            />
          ) : report.auth.ok ? (
            <>
              <Row
                label="apiKeySource"
                value={report.auth.apiKeySource}
                mono
                tone={report.auth.isSubscription ? "ok" : "err"}
              />
              <Row
                label="Auth mode"
                value={report.auth.isSubscription ? "subscription (Pro/Max)" : "API key billing"}
                tone={report.auth.isSubscription ? "ok" : "err"}
              />
              <Row
                label="Probe duration"
                value={`${(report.auth.durationMs / 1000).toFixed(2)}s`}
                mono
              />
              <Row
                label="Tokens (in/out/cache_r/cache_c)"
                value={`${report.auth.tokenTotals.input}/${report.auth.tokenTotals.output}/${report.auth.tokenTotals.cacheRead}/${report.auth.tokenTotals.cacheCreation}`}
                mono
              />
            </>
          ) : (
            <>
              <Row label="Status" value="failed" tone="err" />
              <Row label="Error" value={report.auth.error} mono />
            </>
          )}
        </Card>

        <Card title="Truth Base">
          {report.truthBase.map((f) => (
            <Row
              key={f.relPath}
              label={f.title}
              value={
                f.exists
                  ? `${fmtBytes(f.size)} · ${new Date(f.mtimeMs!).toLocaleDateString()}`
                  : "missing"
              }
              tone={f.exists && !f.empty ? "ok" : "err"}
              sublabel={f.relPath}
            />
          ))}
        </Card>

        <Card title="Base resumes">
          {report.baseResumes.map((f) => (
            <Row
              key={f.relPath}
              label={f.relPath.split("/").pop()!}
              value={
                f.exists
                  ? `${fmtBytes(f.size)} · ${new Date(f.mtimeMs!).toLocaleDateString()}`
                  : "missing"
              }
              tone={f.exists ? "ok" : "err"}
              sublabel={f.relPath}
            />
          ))}
        </Card>

        <Card title="Interviews workspace">
          <Row
            label="Path"
            value={report.interviewsDir.absPath}
            mono
            tone={report.interviewsDir.exists ? "ok" : "err"}
          />
          <Row
            label="Exists"
            value={report.interviewsDir.exists ? "yes" : "no"}
            tone={report.interviewsDir.exists ? "ok" : "err"}
          />
        </Card>

        <Card title="Connectivity test">
          <p className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
            One-shot Claude Code roundtrip. Spawns a subprocess that reads
            <code className="text-xs"> _meta/about_user.md</code> and extracts a
            couple of facts. Verifies auth + stream-json parsing without
            touching any job state.
          </p>
          <Button onClick={runConnectivityTest} disabled={testing}>
            {testing ? "Running…" : "Test Claude Code"}
          </Button>
          {testError && (
            <div className="mt-3 text-xs" style={{ color: "var(--color-err)" }}>
              {testError}
            </div>
          )}
          {testResult && (
            <div className="mt-3 space-y-1">
              <Row
                label="Exit code"
                value={String(testResult.exitCode)}
                mono
                tone={testResult.exitCode === 0 ? "ok" : "err"}
              />
              <Row
                label="apiKeySource"
                value={testResult.apiKeySource ?? "(missing)"}
                mono
                tone={testResult.apiKeySource === "none" ? "ok" : "warn"}
              />
              <Row
                label="Duration"
                value={`${(testResult.durationMs / 1000).toFixed(2)}s`}
                mono
              />
              <Row
                label="Tokens (in/out/cache_r/cache_c)"
                value={`${testResult.tokenTotals.input}/${testResult.tokenTotals.output}/${testResult.tokenTotals.cacheRead}/${testResult.tokenTotals.cacheCreation}`}
                mono
              />
              {testResult.extracted != null && (
                <div className="pt-2">
                  <div className="text-[10px] mb-1" style={{ color: "var(--color-fg-muted)" }}>
                    Extracted from your profile
                  </div>
                  <pre
                    className="text-xs rounded-md p-2 overflow-x-auto border"
                    style={{
                      background: "var(--color-surface-2)",
                      borderColor: "var(--color-border)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {JSON.stringify(testResult.extracted, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <Callout
          tone="err"
          title="Stop all agents and shut down server"
          action={
            <Button
              variant="danger"
              onClick={stopEverything}
              disabled={stopping}
            >
              {stopping ? "Stopping agents…" : "Stop everything"}
            </Button>
          }
        >
          Cancels every in-flight agent run, then exits the Next.js process.
          Each agent gets up to <strong>15 seconds</strong> to terminate
          cleanly, so the response can take up to ~17s in the worst case.
          Restart with <code>./server.sh start</code>. Cancelled Jobs land in{" "}
          <strong>Ready when you are → Errored</strong> with a{" "}
          <em>Re-dispatch all</em> banner waiting on the Dashboard.
        </Callout>
        {stopping && (
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Stopping agents… (this can take up to a minute). The browser
            will lose its connection to the server shortly after each agent
            confirms termination.
          </div>
        )}
        {shutdownError && (
          <div className="mt-2 text-xs" style={{ color: "var(--color-err)" }}>
            Shutdown failed: {shutdownError}
          </div>
        )}
      </div>

      <div className="mt-4 text-[11px] font-mono" style={{ color: "var(--color-fg-muted)" }}>
        Bound to 127.0.0.1:3737 (localhost-only)
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-md border p-4"
      style={{ background: "var(--color-surface-1)" }}
    >
      <div className="text-sm font-medium mb-2.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
