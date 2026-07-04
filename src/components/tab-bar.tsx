"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "../lib/categories";

/**
 * Primary navigation. The active tab is a solid accent block — the "you are
 * here" is unmissable. Active state derives from the URL client-side so it
 * flips instantly on navigation while the pane streams in. Counts are
 * new-in-24h per tab, not personal unread (see NOTES.md). Scrolls
 * horizontally on narrow viewports.
 */
export function TabBar({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  const activeSlug = pathname === "/" ? "today" : pathname.startsWith("/c/") ? pathname.slice(3) : null;

  return (
    <nav className="flex overflow-x-auto no-scrollbar border-b-[3px] border-rule-strong" aria-label="Categories">
      {CATEGORIES.map((cat, i) => {
        const isActive = cat.slug === activeSlug;
        const n = counts[cat.slug] ?? 0;
        return (
          <Link
            key={cat.slug}
            href={cat.slug === "today" ? "/" : `/c/${cat.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex-1 min-w-[96px] sm:min-w-0 text-center px-3 py-[11px] font-display font-bold text-[13px] tracking-[0.05em] uppercase whitespace-nowrap transition-colors duration-150 ${
              i > 0 ? "border-l border-rule-strong" : ""
            } ${isActive ? "bg-accent text-accent-ink" : "text-ink hover:bg-accent-soft"}`}
          >
            <span className="sm:hidden">{cat.shortLabel ?? cat.label}</span>
            <span className="hidden sm:inline">{cat.label}</span>
            {n > 0 ? (
              <sup className={`font-mono text-[9px] ml-1 ${isActive ? "text-accent-ink/70" : "text-accent"}`}>{n}</sup>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
