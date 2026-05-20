"use client";

/**
 * Left-side nav rail for every page under /settings. The five
 * sub-areas, in the order they're typically visited from setup
 * through ongoing operation:
 *
 *   - Truth Base       — about_user.md + style guide (raw markdown edit)
 *   - Profile interview — guided builder for about_user.md (chat-driven)
 *   - Archetypes       — base resumes + matching hints per role family
 *   - Runs             — every Claude Code invocation history, for debug
 *   - Health           — installed CLI version, billing source, env state
 *
 * Hidden on mobile (md:block) — the settings views aren't tuned for
 * narrow widths. Mobile users get the rest of the app fine.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/settings/truth-base", label: "Truth Base" },
  { href: "/settings/profile", label: "Profile interview" },
  { href: "/settings/archetypes", label: "Archetypes" },
  { href: "/settings/runs", label: "Runs" },
  { href: "/settings/health", label: "Health" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <aside className="w-48 shrink-0 hidden md:block">
      <div
        className="text-xs font-medium uppercase tracking-wider mb-3"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Settings
      </div>
      <nav className="flex flex-col">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname?.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-md text-sm transition-colors"
              style={{
                color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
                background: active ? "var(--color-surface-1)" : "transparent",
                borderLeft: active ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
