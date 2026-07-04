import { redirect } from "next/navigation";
import { SourceRow } from "../../../components/source-row";
import { loadSources } from "../../../lib/feed-data";
import { getProfile } from "../../../lib/profile";
import type { SourceClass } from "../../../db/schema";

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
    <div className="pane-in flex-1">
      <div className="px-5 sm:px-7 py-5 border-b-[3px] border-rule-strong">
        <h1 className="font-display font-black text-[26px] tracking-[-0.03em] uppercase">Sources</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft max-w-[64ch]">
          Every source InFlow reads, curated for reliability. Muting removes a source from your feed
          entirely; the ranking also learns quieter preferences from what you read and skip.
        </p>
      </div>

      {SECTION_ORDER.map(({ cls, label, blurb }) => {
        const group = sources.filter((s) => s.sourceClass === cls);
        if (group.length === 0) return null;
        return (
          <section key={cls}>
            <div className="px-5 sm:px-7 py-2.5 border-b-2 border-rule-strong bg-paper-raised flex items-baseline gap-3">
              <h2 className="font-mono text-[0.65rem] tracking-[0.2em] uppercase font-medium">{label}</h2>
              <span className="font-mono text-[0.6rem] tracking-[0.1em] uppercase text-ink-faint">{blurb}</span>
            </div>
            <ul className="px-5 sm:px-7">
              {group.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
