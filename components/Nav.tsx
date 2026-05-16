"use client";

/**
 * Top-level navigation. Four workflow links (Dashboard / Shortlist /
 * Applications / Prep), a separator, a single "Settings" link that
 * activates whenever the route is under /settings/*, and the ⌘J
 * assistant toggle on the right.
 *
 * Active links carry both a surface-1 background pill and a 2px accent
 * underline; the toggle inverts to primary-accent when the drawer is
 * open so it reads as "this is doing something."
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useChat } from "./ChatContext";
import { Button } from "./ui";

const WORKFLOW_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/applications", label: "Applications" },
  { href: "/prep", label: "Prep" },
];

export function TopNav() {
  const pathname = usePathname();
  const { open, setOpen } = useChat();
  const inSettings = pathname?.startsWith("/settings");
  return (
    <nav
      className="border-b sticky top-0 z-10"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <Link
          href="/"
          className="text-sm font-medium tracking-tight"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          prism
        </Link>
        <div className="flex items-center gap-1 flex-1">
          {WORKFLOW_LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname?.startsWith(l.href);
            return <NavLink key={l.href} href={l.href} label={l.label} active={!!active} />;
          })}
          <span
            className="mx-2 h-4 w-px"
            style={{ background: "var(--color-border)" }}
            aria-hidden="true"
          />
          <NavLink href="/settings/truth-base" label="Settings" active={!!inSettings} />
        </div>
        <Button
          variant={open ? "primary" : "secondary"}
          onClick={() => setOpen(!open)}
          title="Assistant (⌘J)"
          icon={<Sparkles className="w-3.5 h-3.5" />}
        >
          Assistant <kbd className="text-[10px] opacity-70 ml-1">⌘J</kbd>
        </Button>
      </div>
    </nav>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="relative px-3 py-1.5 rounded-md text-sm transition-colors"
      style={{
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        background: active ? "var(--color-surface-1)" : "transparent",
      }}
    >
      {label}
      {active && (
        <span
          className="absolute left-3 right-3 -bottom-3 h-0.5"
          style={{ background: "var(--color-accent)" }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
