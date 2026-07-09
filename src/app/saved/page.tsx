import Link from "next/link";
import { redirect } from "next/navigation";
import { EntryActions } from "../../components/entry-actions";
import { loadSaved } from "../../lib/feed-data";
import { timeAgo, topicLabel } from "../../lib/format";
import { getProfile } from "../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };

/** Constellation log: everything you've pinned, outside the 3D scene. */
export default async function SavedPage() {
  const profile = await getProfile();
  if (!profile) redirect("/welcome");

  const saved = await loadSaved(profile);

  return (
    <div className="space-shell min-h-screen bg-[#04040a] text-white dark">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/[0.18] backdrop-blur-md">
        <Link
          href="/"
          className="font-mono text-[0.65rem] tracking-[0.16em] uppercase text-white/55 hover:text-white transition-colors"
        >
          ← Back to space
        </Link>
        <Link href="/" className="flex items-center gap-2">
          <span className="w-3 h-3 bg-[#ffd66b] inline-block" aria-hidden />
          <span className="font-display font-black text-[17px] tracking-[-0.02em]">INFLOW</span>
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-24">
        <div className="pt-9 pb-4 border-b-2 border-white/20 flex items-baseline justify-between">
          <h1 className="font-display font-black text-[24px] tracking-[-0.02em] uppercase">Saved</h1>
          <span className="font-mono text-[0.65rem] tracking-[0.14em] uppercase text-white/35">
            {saved.length} {saved.length === 1 ? "item" : "items"}
          </span>
        </div>

        {saved.length === 0 ? (
          <div className="py-24 text-center">
            <span className="inline-block w-3 h-3 border-2 border-[#ffd66b] mb-4" aria-hidden />
            <p className="font-display font-extrabold text-xl tracking-[-0.02em]">Nothing pinned yet.</p>
            <p className="mt-2 font-mono text-[0.65rem] tracking-[0.16em] uppercase text-white/35">
              Save any story from a world and it lands here
            </p>
          </div>
        ) : (
          <ul>
            {saved.map((entry) => (
              <li key={entry.id} className="py-4 border-b border-white/10">
                <div className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[#ffd66b] mb-1">
                  {entry.topics[0] ? topicLabel(entry.topics[0]) : entry.sourceName}
                </div>
                <h3 className="font-display font-extrabold text-[17px] leading-[1.2] tracking-[-0.015em]">
                  {entry.hasBody ? (
                    <Link href={`/item/${entry.id}`} className="hover:text-[#ffd66b] transition-colors">
                      {entry.title}
                    </Link>
                  ) : (
                    <a href={entry.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#ffd66b] transition-colors">
                      {entry.title}
                    </a>
                  )}
                </h3>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-white/35">
                    <span className="text-white/60">{entry.sourceName}</span>
                    {entry.author ? <> — {entry.author}</> : null}
                    <> — {timeAgo(entry.publishedAt)}</>
                  </span>
                  <EntryActions itemId={entry.id} saved compact />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
