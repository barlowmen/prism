"use client";

import { useState } from "react";
import type { HealthReport } from "@/lib/health";

type Tone = "ok" | "warn" | "err" | "muted";

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

  const authBanner = !report.auth.ok ? (
    <Banner tone="err">
      <strong>Claude Code auth probe failed.</strong> {report.auth.error}. Run{" "}
      <code>claude logout</code> then <code>claude login</code> and sign in
      with your Pro/Max subscription.
    </Banner>
  ) : !report.auth.isSubscription ? (
    <Banner tone="warn">
      <strong>Claude Code is using <code>apiKeySource = {report.auth.apiKeySource}</code>.</strong>{" "}
      This means API-key billing, not subscription. Unset{" "}
      <code>ANTHROPIC_API_KEY</code> in your shell, then{" "}
      <code>claude logout</code> and <code>claude login</code> with your
      Pro/Max account.
    </Banner>
  ) : null;

  return (
    <div>
      {authBanner}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
          checked {new Date(report.checkedAt).toLocaleString()}
        </div>
        <button
          onClick={recheck}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-md border disabled:opacity-50"
          style={{ background: "var(--color-surface-1)" }}
        >
          {busy ? "Re-checking…" : "Re-check"}
        </button>
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
          {report.auth.ok ? (
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

        <Card title="Server binding">
          <Row label="Host" value="127.0.0.1 (localhost-only)" mono tone="ok" />
          <Row label="Port" value="3737" mono />
        </Card>

        <Card title="Connectivity test">
          <p className="text-xs mb-3" style={{ color: "var(--color-fg-muted)" }}>
            One-shot Claude Code roundtrip. Spawns a subprocess that reads
            <code className="text-xs"> _meta/about_user.md</code> and extracts a
            couple of facts. Verifies auth + stream-json parsing without
            touching any job state.
          </p>
          <button
            onClick={runConnectivityTest}
            disabled={testing}
            className="px-3 py-1.5 text-xs rounded-md border disabled:opacity-50"
            style={{ background: "var(--color-surface-2)" }}
          >
            {testing ? "Running…" : "Test Claude Code"}
          </button>
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
                    className="text-xs rounded p-2 overflow-x-auto"
                    style={{
                      background: "var(--color-surface-2)",
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

function Row({
  label,
  value,
  mono,
  tone,
  sublabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: Tone;
  sublabel?: string;
}) {
  const color =
    tone === "ok"
      ? "var(--color-ok)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "err"
          ? "var(--color-err)"
          : tone === "muted"
            ? "var(--color-fg-muted)"
            : undefined;
  return (
    <div className="flex items-start justify-between text-xs py-1 gap-3">
      <div className="min-w-0">
        <div style={{ color: "var(--color-fg-muted)" }}>{label}</div>
        {sublabel && (
          <div
            className="font-mono"
            style={{ color: "var(--color-fg-muted)", fontSize: "10px" }}
          >
            {sublabel}
          </div>
        )}
      </div>
      <div
        className="text-right truncate max-w-[60%]"
        style={{ color, fontFamily: mono ? "var(--font-mono)" : undefined }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const color =
    tone === "err"
      ? "var(--color-err)"
      : tone === "warn"
        ? "var(--color-warn)"
        : "var(--color-fg)";
  return (
    <div
      className="mb-4 rounded-md border p-3 text-xs"
      style={{
        borderColor: color,
        background: "var(--color-surface-1)",
        color: "var(--color-fg)",
      }}
    >
      <span style={{ color }}>● </span>
      {children}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
