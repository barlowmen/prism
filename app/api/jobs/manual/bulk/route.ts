/**
 * POST /api/jobs/manual/bulk
 *
 * Bulk paste — accept many posting URLs in one shot. Body:
 *   { rawInput?: string, urls?: string[], concurrency?: number }
 *
 * Either form is accepted. `rawInput` is the user's textarea contents
 * (one URL per line, blank lines and # comments ignored). `urls` is a
 * pre-parsed array. If both are given, `urls` wins.
 *
 * Returns immediately after creating the Job records. Dispatcher
 * spawns continue in the background, capped at `concurrency` runs
 * (default 2, max 5).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  bulkCreateJobs,
  bulkDispatchInBackground,
  parseBulkUrls,
} from "@/lib/jobs/bulk-paste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let urls: string[] = [];
  let droppedCount = 0;
  if (Array.isArray(body.urls)) {
    const seen = new Set<string>();
    for (const item of body.urls) {
      if (typeof item !== "string") {
        droppedCount++;
        continue;
      }
      const trimmed = item.trim();
      if (!/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) {
        droppedCount++;
        continue;
      }
      seen.add(trimmed);
      urls.push(trimmed);
    }
  } else if (typeof body.rawInput === "string") {
    const parsed = parseBulkUrls(body.rawInput);
    urls = parsed.urls;
    droppedCount = parsed.droppedCount;
  } else {
    return NextResponse.json(
      { error: "expected_urls_or_rawInput" },
      { status: 400 },
    );
  }

  if (urls.length === 0) {
    return NextResponse.json(
      { error: "no_valid_urls", droppedCount },
      { status: 400 },
    );
  }

  const concurrency =
    typeof body.concurrency === "number" ? body.concurrency : 2;

  const result = await bulkCreateJobs({ urls });
  result.droppedCount = droppedCount;

  // Fire-and-forget dispatcher fan-out. The response goes back
  // immediately; runs continue in the background.
  if (result.created.length > 0) {
    void bulkDispatchInBackground(
      result.created.map((c) => ({ jobId: c.jobId, url: c.url })),
      concurrency,
    );
  }

  return NextResponse.json(result);
}
