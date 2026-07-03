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
      <header className="border-b border-rule">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-baseline justify-between">
          <Link
            href="/"
            className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-soft hover:text-accent transition-colors"
          >
            ← Feed
          </Link>
          <Link href="/" className="font-serif italic font-semibold text-lg leading-none">
            InFlow<span className="text-accent not-italic">.</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-5 pt-10 pb-24">
          {profile ? <ReadTracker itemId={itemId} /> : null}

          <div className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">
            {item.topics.map(topicLabel).join(" · ")}
          </div>
          <h1 className="mt-3 font-serif font-semibold text-[2rem] sm:text-[2.4rem] leading-[1.1] tracking-[-0.015em]">
            {item.title}
          </h1>
          <div className="mt-4 pb-6 border-b border-rule flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
              <span className="text-ink-soft">{source.name}</span>
              {item.author ? <> · {item.author}</> : null}
              <> · {fullDate(item.publishedAt.toISOString())}</>
            </div>
            <div className="flex items-baseline gap-4">
              {profile ? <EntryActions itemId={itemId} saved={saved} compact /> : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint hover:text-accent transition-colors"
              >
                Original ↗
              </a>
            </div>
          </div>

          {item.contentHtml ? (
            <div className="reader-body mt-8" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
          ) : (
            <div className="mt-10 text-center">
              {item.excerpt ? (
                <p className="font-serif text-lg leading-relaxed text-ink-soft text-left">{item.excerpt}</p>
              ) : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-10 inline-block rounded-full bg-accent text-paper font-medium text-[0.9rem] px-7 py-2.5 hover:opacity-90 transition-opacity"
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
