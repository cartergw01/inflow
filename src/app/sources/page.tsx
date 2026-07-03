import { redirect } from "next/navigation";
import { Masthead } from "../../components/masthead";
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
  if (!profile) redirect("/");

  const sources = await loadSources(profile);

  return (
    <>
      <Masthead />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 pb-24">
          <h1 className="pt-9 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-accent">Sources</h1>
          <p className="mt-3 text-[0.85rem] leading-relaxed text-ink-soft max-w-prose">
            Every source InFlow reads, curated for reliability. Muting removes a source from your
            feed entirely; the ranking also learns quieter preferences from what you read and skip.
          </p>

          {SECTION_ORDER.map(({ cls, label, blurb }) => {
            const group = sources.filter((s) => s.sourceClass === cls);
            if (group.length === 0) return null;
            return (
              <section key={cls} className="mt-10">
                <div className="flex items-baseline gap-3 border-b border-rule-strong pb-2">
                  <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink">{label}</h2>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">{blurb}</span>
                </div>
                <ul>
                  {group.map((s) => (
                    <SourceRow key={s.id} source={s} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
