"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChat } from "./ChatContext";

const TOP_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/applications", label: "Applications" },
  { href: "/prep", label: "Prep" },
  { href: "/settings/truth-base", label: "Truth Base" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/archetypes", label: "Archetypes" },
  { href: "/settings/runs", label: "Runs" },
  { href: "/settings/health", label: "Health" },
];

export function TopNav() {
  const pathname = usePathname();
  const { open, setOpen } = useChat();
  return (
    <nav
      className="border-b sticky top-0 z-10"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6">
        <Link
          href="/"
          className="text-sm font-medium tracking-tight"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          prism
        </Link>
        <div className="flex items-center gap-1 flex-1">
          {TOP_LINKS.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
                  background: active ? "var(--color-surface-1)" : "transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => setOpen(!open)}
          title="Assistant (⌘J)"
          className="px-3 py-1.5 rounded-md text-sm transition-colors border"
          style={{
            color: open ? "var(--color-bg)" : "var(--color-fg)",
            background: open ? "var(--color-accent)" : "var(--color-surface-1)",
            borderColor: open ? "var(--color-accent)" : "var(--color-border)",
          }}
        >
          Assistant ⌘J
        </button>
      </div>
    </nav>
  );
}
