import Link from "next/link";
import { timeAgo } from "../lib/format";
import { LocalDate } from "./local-date";
import { ThemeToggle } from "./theme-toggle";

/**
 * The Signal masthead: identity block, date/sync line, utility cells.
 * Every cell is rule-separated — the chrome is a grid, not a float.
 */
export function Masthead({ updatedAt }: { updatedAt?: string | null }) {
  const updated = updatedAt ? timeAgo(updatedAt) : null;
  return (
    <div className="flex items-stretch border-b border-rule-strong">
      <Link href="/" className="flex items-center gap-2 px-4 sm:px-5 py-3.5 shrink-0">
        <span className="w-3.5 h-3.5 bg-accent inline-block" aria-hidden />
        <span className="font-display font-black text-[22px] leading-none tracking-[-0.03em]">INFLOW</span>
      </Link>
      <div className="ml-auto hidden md:flex items-center px-5 border-l border-rule-strong font-mono text-[0.65rem] tracking-[0.14em] text-ink-faint uppercase">
        <LocalDate />
        {updated ? <>&nbsp;— updated {updated === "now" ? "just now" : `${updated} ago`}</> : null}
      </div>
      <nav className="flex items-stretch ml-auto md:ml-0">
        <Link
          href="/saved"
          className="flex items-center px-4 sm:px-5 border-l border-rule-strong font-mono text-[0.65rem] tracking-[0.14em] uppercase text-ink hover:bg-accent hover:text-accent-ink transition-colors"
        >
          Saved
        </Link>
        <Link
          href="/sources"
          className="flex items-center px-4 sm:px-5 border-l border-rule-strong font-mono text-[0.65rem] tracking-[0.14em] uppercase text-ink hover:bg-accent hover:text-accent-ink transition-colors"
        >
          Sources
        </Link>
        <span className="flex items-center px-4 border-l border-rule-strong">
          <ThemeToggle />
        </span>
      </nav>
    </div>
  );
}
