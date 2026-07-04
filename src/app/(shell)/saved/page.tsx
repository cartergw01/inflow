import Link from "next/link";
import { redirect } from "next/navigation";
import { EntryActions } from "../../../components/entry-actions";
import { loadSaved } from "../../../lib/feed-data";
import { timeAgo, topicLabel } from "../../../lib/format";
import { getProfile } from "../../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };

export default async function SavedPage() {
  const profile = await getProfile();
  if (!profile) redirect("/welcome");

  const saved = await loadSaved(profile);

  return (
    <div className="pane-in flex-1">
      <div className="px-5 sm:px-7 py-5 border-b-[3px] border-rule-strong flex items-baseline justify-between">
        <h1 className="font-display font-black text-[26px] tracking-[-0.03em] uppercase">Saved</h1>
        <span className="font-mono text-[0.65rem] tracking-[0.14em] uppercase text-ink-faint">
          {saved.length} {saved.length === 1 ? "item" : "items"}
        </span>
      </div>

      {saved.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center">
            <span className="inline-block w-3 h-3 border-2 border-accent mb-4" aria-hidden />
            <p className="font-display font-extrabold text-xl tracking-[-0.02em]">Nothing saved yet.</p>
            <p className="mt-2 font-mono text-[0.65rem] tracking-[0.16em] uppercase text-ink-faint">
              Save anything from the feed to keep it here
            </p>
            <Link
              href="/"
              className="mt-8 inline-block bg-accent text-accent-ink font-display font-bold text-[13px] tracking-[0.05em] uppercase px-6 py-2.5 hover:opacity-90 transition-opacity"
            >
              ← Back to Today
            </Link>
          </div>
        </div>
      ) : (
        <ul>
          {saved.map((entry) => (
            <li key={entry.id} className="group px-5 sm:px-7 py-4 border-b border-rule">
              <div className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent mb-1">
                {entry.topics[0] ? topicLabel(entry.topics[0]) : entry.sourceName}
              </div>
              <h3 className="font-display font-extrabold text-[17px] leading-[1.2] tracking-[-0.015em]">
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
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-ink-faint">
                  <span className="text-ink-soft">{entry.sourceName}</span>
                  {entry.author ? <> — {entry.author}</> : null}
                  <> — {timeAgo(entry.publishedAt)}</>
                  {entry.readingMinutes ? <> — {entry.readingMinutes} min read</> : null}
                </span>
                <EntryActions itemId={entry.id} saved compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
