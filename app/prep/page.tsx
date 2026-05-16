import fs from "node:fs/promises";
import path from "node:path";
import { INTERVIEWS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

type PrepCompany = {
  company: string;
  absPath: string;
  fileCount: number;
  lastModified: number | null;
};

async function readPrepDir(): Promise<PrepCompany[]> {
  const dir = path.join(INTERVIEWS_DIR, "prep");
  let companies: string[] = [];
  try {
    companies = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const out: PrepCompany[] = [];
  for (const c of companies) {
    const absPath = path.join(dir, c);
    let fileCount = 0;
    let lastModified: number | null = null;
    try {
      const walk = async (p: string) => {
        const entries = await fs.readdir(p, { withFileTypes: true });
        for (const e of entries) {
          const ep = path.join(p, e.name);
          if (e.isDirectory()) await walk(ep);
          else {
            fileCount++;
            const stat = await fs.stat(ep);
            if (lastModified == null || stat.mtimeMs > lastModified) {
              lastModified = stat.mtimeMs;
            }
          }
        }
      };
      await walk(absPath);
    } catch {}
    out.push({ company: c, absPath, fileCount, lastModified });
  }
  out.sort((a, b) => (a.lastModified ?? 0) > (b.lastModified ?? 0) ? -1 : 1);
  return out;
}

export default async function PrepPage() {
  const companies = await readPrepDir();
  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Interview prep</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-muted)" }}>
          The post-application <code className="text-xs">prep/</code> directory
          inside your workspace. Out of scope for full UI integration — this
          page lists companies and last-modified dates so you can find your
          notes fast.
        </p>
      </header>

      {companies.length === 0 ? (
        <div
          className="rounded-md border p-8 text-center text-sm"
          style={{ background: "var(--color-surface-1)", color: "var(--color-fg-muted)" }}
        >
          No prep folders yet.
        </div>
      ) : (
        <ul className="rounded-md border divide-y" style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}>
          {companies.map((c) => (
            <li key={c.company} className="px-4 py-3 flex items-center justify-between text-sm" style={{ borderColor: "var(--color-border)" }}>
              <div>
                <div className="font-medium">{c.company}</div>
                <div className="text-xs font-mono" style={{ color: "var(--color-fg-muted)" }}>
                  {c.absPath.replace(/^\/Users\/[^/]+/, "~")}
                </div>
              </div>
              <div className="text-xs text-right" style={{ color: "var(--color-fg-muted)" }}>
                <div>{c.fileCount} file{c.fileCount === 1 ? "" : "s"}</div>
                <div className="font-mono">
                  {c.lastModified ? new Date(c.lastModified).toLocaleDateString() : "—"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
