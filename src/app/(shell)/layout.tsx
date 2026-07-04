import { sql } from "drizzle-orm";
import { Masthead } from "../../components/masthead";
import { TabBar } from "../../components/tab-bar";
import { getDb } from "../../db";
import { sources } from "../../db/schema";
import { loadTabCounts } from "../../lib/feed-data";

export const dynamic = "force-dynamic";

/**
 * The persistent app shell. Lives in a layout so switching tabs only swaps
 * the pane below — masthead and tab bar never re-render, which is most of
 * what makes this feel like an app instead of a document.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const [counts, [sync]] = await Promise.all([
    loadTabCounts(),
    db.select({ latest: sql<string | null>`max(${sources.lastFetchedAt})` }).from(sources),
  ]);

  return (
    <>
      <header className="sticky top-0 z-20 bg-paper">
        <Masthead updatedAt={sync?.latest ?? null} />
        <TabBar counts={counts} />
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </>
  );
}
