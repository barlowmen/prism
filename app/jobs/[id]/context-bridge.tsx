"use client";

import { usePageContext } from "@/components/ChatContext";

export function JobContextBridge({
  jobId,
  summary,
  extras,
}: {
  jobId: string;
  summary: string;
  extras?: Record<string, string | number | null>;
}) {
  usePageContext({ jobId, summary, extras });
  return null;
}
