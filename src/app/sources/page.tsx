import Link from "next/link";
import { redirect } from "next/navigation";
import { SourceRow } from "../../components/source-row";
import { loadSources } from "../../lib/feed-data";
import { getProfile } from "../../lib/profile";
import type { SourceClass } from "../../db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources — InFlow" };

const SECTION_ORDER: { cls: SourceClass; label: string; blurb: string }[] = [
  { cls: "longform", label: "Longform", blurb: "Independent writers and newsletters" },
  { cls: "news", label: "News", blurb: "Edited, verified reporting" },
  { cls: "social", label: "Real-time", blurb: "Breaking news and discourse" },
];

export default async function SourcesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/welcome");

  const sources = await loadSources(profile);

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
          <span className="w-3 h-3 bg-[#6b8cff] inline-block" aria-hidden />
          <span className="font-display font-black text-[17px] tracking-[-0.02em]">INFLOW</span>
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-24">
        <div className="pt-9 pb-4 border-b-2 border-white/20">
          <h1 className="font-display font-black text-[24px] tracking-[-0.02em] uppercase">Sources</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/55 max-w-[64ch]">
            Every source InFlow reads, curated for reliability. Muting removes a source from your
            galaxy entirely; the ranking also learns quieter preferences from what you read and skip.
          </p>
        </div>

        {SECTION_ORDER.map(({ cls, label, blurb }) => {
          const group = sources.filter((s) => s.sourceClass === cls);
          if (group.length === 0) return null;
          return (
            <section key={cls} className="mt-8">
              <div className="pb-2 border-b border-white/25 flex items-baseline gap-3">
                <h2 className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-white/80">{label}</h2>
                <span className="font-mono text-[0.6rem] tracking-[0.1em] uppercase text-white/30">{blurb}</span>
              </div>
              <ul>
                {group.map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </div>
  );
}
