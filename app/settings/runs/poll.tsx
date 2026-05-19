"use client";
/**
 * Tiny client wrapper that polls router.refresh() every 5s while any
 * run on the page is still in-flight. Lets the server component
 * (page.tsx) stay simple while the row data stays fresh.
 *
 * Pairs with the broker's debounced upsertRunIndex (every ~3s on
 * `usage` events) so live token totals + "running for Xm" durations
 * actually update in the table without the user mashing reload.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RunsLivePoll({ hasActive }: { hasActive: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [hasActive, router]);
  return null;
}
