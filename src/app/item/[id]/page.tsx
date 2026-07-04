import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryActions } from "../../../components/entry-actions";
import { ReadTracker } from "../../../components/read-tracker";
import { ThemeToggle } from "../../../components/theme-toggle";
import { loadItem } from "../../../lib/feed-data";
import { fullDate, topicLabel } from "../../../lib/format";
import { getProfile } from "../../../lib/profile";
import { getDb } from "../../../db";
import { saves } from "../../../db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadItem(Number(id));
  return { title: row ? `${row.item.title} — InFlow` : "InFlow" };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const row = await loadItem(itemId);
  if (!row) notFound();
  const { item, source } = row;

  const profile = await getProfile();
  let saved = false;
  if (profile) {
    const db = getDb();
    const rows = await db
      .select({ itemId: saves.itemId })
      .from(saves)
      .where(and(eq(saves.profileId, profile.id), eq(saves.itemId, itemId)))
      .limit(1);
    saved = rows.length > 0;
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-paper flex items-stretch border-b border-rule-strong">
        <Link
          href="/"
          className="flex items-center px-4 sm:px-5 py-3.5 font-mono text-[0.65rem] tracking-[0.14em] uppercase text-ink hover:bg-accent hover:text-accent-ink transition-colors"
        >
          ← Feed
        </Link>
        <Link href="/" className="ml-auto flex items-center gap-2 px-4">
          <span className="w-3 h-3 bg-accent inline-block" aria-hidden />
          <span className="font-display font-black text-[17px] leading-none tracking-[-0.03em]">INFLOW</span>
        </Link>
        <span className="flex items-center px-4 border-l border-rule-strong">
          <ThemeToggle />
        </span>
      </header>

      <main className="flex-1 pane-in">
        <article className="mx-auto max-w-[720px] px-5 sm:px-7 pt-9 pb-24">
          {profile ? <ReadTracker itemId={itemId} /> : null}

          <div className="flex items-center gap-2.5 font-mono text-[0.65rem] tracking-[0.2em] uppercase text-accent">
            <span>{item.topics.map(topicLabel).join(" / ") || source.name}</span>
            <span className="flex-1 h-[2px] bg-accent" aria-hidden />
          </div>
          <h1 className="mt-4 font-display font-black text-[30px] sm:text-[40px] leading-[1.02] tracking-[-0.03em]">
            {item.title}
          </h1>
          <div className="mt-5 pb-5 border-b-[3px] border-rule-strong flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-ink-faint">
              <span className="text-ink-soft">{source.name}</span>
              {item.author ? <> — {item.author}</> : null}
              <> — {fullDate(item.publishedAt.toISOString())}</>
            </div>
            <div className="flex items-baseline gap-4">
              {profile ? <EntryActions itemId={itemId} saved={saved} compact /> : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-ink-faint hover:text-accent transition-colors"
              >
                Original ↗
              </a>
            </div>
          </div>

          {item.contentHtml ? (
            <div className="reader-body mt-8" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
          ) : (
            <div className="mt-10">
              {item.excerpt ? (
                <p className="text-[17px] leading-[1.6] text-ink-soft max-w-[60ch]">{item.excerpt}</p>
              ) : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-10 inline-block bg-ink text-paper font-display font-black text-[14px] tracking-[0.05em] uppercase px-7 py-3 hover:bg-accent hover:text-accent-ink transition-colors"
              >
                Read at {source.name} ↗
              </a>
            </div>
          )}
        </article>
      </main>
    </>
  );
}
