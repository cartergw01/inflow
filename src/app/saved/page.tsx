import Link from "next/link";
import { redirect } from "next/navigation";
import { EntryActions } from "../../components/entry-actions";
import { Masthead } from "../../components/masthead";
import { loadSaved } from "../../lib/feed-data";
import { timeAgo } from "../../lib/format";
import { getProfile } from "../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };

export default async function SavedPage() {
  const profile = await getProfile();
  if (!profile) redirect("/");

  const saved = await loadSaved(profile);

  return (
    <>
      <Masthead />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 pb-24">
          <h1 className="pt-9 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-accent">Saved</h1>

          {saved.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-serif italic text-xl text-ink-soft">Nothing saved yet.</p>
              <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
                Save anything from the feed to read it later.
              </p>
              <Link
                href="/"
                className="mt-8 inline-block font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent hover:underline underline-offset-4"
              >
                ← Back to the feed
              </Link>
            </div>
          ) : (
            <ul className="mt-2">
              {saved.map((entry) => (
                <li key={entry.id} className="group py-5 border-b border-rule">
                  <h3 className="font-serif font-medium text-[1.2rem] leading-snug">
                    {entry.hasBody ? (
                      <Link href={`/item/${entry.id}`} className="hover:text-accent transition-colors">
                        {entry.title}
                      </Link>
                    ) : (
                      <a href={entry.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
                        {entry.title}
                      </a>
                    )}
                  </h3>
                  <div className="mt-2 flex items-baseline justify-between gap-4">
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
                      <span className="text-ink-soft">{entry.sourceName}</span>
                      {entry.author ? <> · {entry.author}</> : null} · {timeAgo(entry.publishedAt)}
                      {entry.readingMinutes ? <> · {entry.readingMinutes} min</> : null}
                    </span>
                    <EntryActions itemId={entry.id} saved compact />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
