import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs inline-flex items-center gap-1 mb-4 hover:underline"
      style={{ color: "var(--color-fg-muted)" }}
    >
      <ChevronLeft className="w-3 h-3" />
      {label}
    </Link>
  );
}
