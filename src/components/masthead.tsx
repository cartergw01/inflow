import Link from "next/link";
import { mastheadDate, timeAgo } from "../lib/format";
import { ThemeToggle } from "./theme-toggle";

/**
 * The daily masthead. Wordmark left, today's date center, quiet nav right —
 * a newspaper head, not an app chrome bar.
 */
export function Masthead({ updatedAt }: { updatedAt?: string | null }) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-2xl px-5 py-5 flex items-baseline justify-between gap-4">
        <Link href="/" className="shrink-0">
          <span className="font-serif italic font-semibold text-[1.7rem] leading-none tracking-tight">
            InFlow<span className="text-accent not-italic">.</span>
          </span>
        </Link>
        <div className="hidden sm:block font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint text-center">
          {mastheadDate()}
          {updatedAt ? (
            <span className="text-ink-faint/70">
              {" · "}
              {timeAgo(updatedAt) === "now" ? "updated just now" : `updated ${timeAgo(updatedAt)} ago`}
            </span>
          ) : null}
        </div>
        <nav className="flex items-baseline gap-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em]">
          <Link href="/saved" className="text-ink-soft hover:text-accent transition-colors">
            Saved
          </Link>
          <Link href="/sources" className="text-ink-soft hover:text-accent transition-colors">
            Sources
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
