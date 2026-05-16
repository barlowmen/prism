import Link from "next/link";
import { notFound } from "next/navigation";
import { readJob } from "@/lib/jobs/store";
import { readPerAppFiles } from "@/lib/jobs/per-app-files";
import { renderMarkdown } from "@/lib/markdown";
import { JobDetailView } from "./view";
import { JobActions } from "@/components/JobActions";
import { JobContextBridge } from "./context-bridge";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) notFound();

  const files = job.folderPath
    ? await readPerAppFiles(job.folderPath, { loadContent: true })
    : { folderPath: null, exists: false, known: [], finalDocx: [], other: [] };

  // Server-render markdown for any present text file so the client gets
  // ready-to-paint HTML.
  const rendered: Record<string, string> = {};
  for (const f of [...files.known, ...files.other]) {
    if (f.exists && f.content && f.relPath.toLowerCase().endsWith(".md")) {
      rendered[f.key] = await renderMarkdown(f.content);
    }
  }

  const dq = files.known.find((f) => f.key === "dispatcher_question");
  const hasOpenDispatcherQuestion =
    !!dq?.exists &&
    typeof dq.content === "string" &&
    !/^##\s+Answer/im.test(dq.content);

  const prov = files.known.find((f) => f.key === "provenance");
  const provFlagged =
    job.status === "awaiting_input" &&
    !!prov?.exists &&
    typeof prov.content === "string" &&
    (prov.content.includes("VERIFY:") || /\[\s\]/.test(prov.content));

  const presentFiles = [...files.known, ...files.other].filter((f) => f.exists);
  const ctxSummary =
    `Job detail for ${job.company || "(pending)"} / ${job.role || "(pending)"}.\n` +
    `status: ${job.status}\n` +
    (job.sourceUrl ? `sourceUrl: ${job.sourceUrl}\n` : "") +
    (job.folderPath ? `folder: ${job.folderPath}\n` : "") +
    `present files: ${presentFiles.map((f) => f.relPath).join(", ") || "none"}\n` +
    (job.latestRunPhase ? `latest run phase: ${job.latestRunPhase}\n` : "") +
    (hasOpenDispatcherQuestion ? "has open dispatcher_question\n" : "") +
    (provFlagged ? "provenance flagged honesty issues\n" : "") +
    (files.finalDocx[0] ? `final DOCX: ${files.finalDocx[0].relPath}\n` : "");

  return (
    <main className="max-w-5xl mx-auto p-6">
      <JobContextBridge
        jobId={job.id}
        summary={ctxSummary}
        extras={{
          company: job.company,
          role: job.role,
          status: job.status,
        }}
      />
      <Link
        href="/"
        className="text-xs inline-block mb-4 hover:underline"
        style={{ color: "var(--color-fg-muted)" }}
      >
        ← Dashboard
      </Link>
      <JobDetailView job={job} files={files} renderedMarkdown={rendered} />
      <div className="mt-6">
        <JobActions
          job={job}
          hasOpenDispatcherQuestion={hasOpenDispatcherQuestion}
          provenanceFlagged={provFlagged}
        />
      </div>
    </main>
  );
}
