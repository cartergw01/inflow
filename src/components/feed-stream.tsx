"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedItemDTO } from "../lib/feed-data";
import { timeAgo, topicLabel } from "../lib/format";
import { queueSignal, sendSignal } from "../lib/signals-client";
import { EntryActions } from "./entry-actions";

/** An item must be half-visible for a second before it counts as seen. */
const IMPRESSION_DWELL_MS = 1000;

/* ── impression tracking ────────────────────────────────────────────── */

function useImpressions(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const seen = new Set<number>();
    const timers = new Map<number, ReturnType<typeof setTimeout>>();

    const observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          const id = Number((r.target as HTMLElement).dataset.impressId);
          if (!id || seen.has(id)) continue;
          if (r.isIntersecting) {
            timers.set(
              id,
              setTimeout(() => {
                seen.add(id);
                queueSignal({ itemId: id, type: "impression" });
              }, IMPRESSION_DWELL_MS),
            );
          } else {
            const t = timers.get(id);
            if (t) clearTimeout(t);
            timers.delete(id);
          }
        }
      },
      { threshold: 0.5 },
    );

    el.querySelectorAll<HTMLElement>("[data-impress-id]").forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ── shared bits ────────────────────────────────────────────────────── */

function recordOpen(itemId: number) {
  sendSignal({ itemId, type: "open" });
}

/** Title link: in-app reader when we hold the full text, else the original. */
function TitleLink({ entry, className, children }: { entry: FeedItemDTO; className?: string; children: React.ReactNode }) {
  if (entry.hasBody) {
    return (
      <Link href={`/item/${entry.id}`} className={className} onClick={() => recordOpen(entry.id)}>
        {children}
      </Link>
    );
  }
  return (
    <a href={entry.url} target="_blank" rel="noopener noreferrer" className={className} onClick={() => recordOpen(entry.id)}>
      {children}
    </a>
  );
}

function MetaRow({ entry, onHideSource, showAuthor = true }: { entry: FeedItemDTO; onHideSource: () => void; showAuthor?: boolean }) {
  return (
    <div className="mt-3 flex items-baseline justify-between gap-4">
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint min-w-0">
        <span className="text-ink-soft">{entry.sourceName}</span>
        {showAuthor && entry.author ? <> · {entry.author}</> : null}
        <> · {timeAgo(entry.publishedAt)}</>
        {entry.readingMinutes ? <> · {entry.readingMinutes} min</> : null}
      </span>
      <EntryActions itemId={entry.id} saved={entry.saved} onHideSource={onHideSource} />
    </div>
  );
}

function AlsoCoveredBy({ entry }: { entry: FeedItemDTO }) {
  if (entry.alsoCoveredBy.length === 0) return null;
  return (
    <div className="mt-2 font-mono text-[0.65rem] tracking-[0.04em] text-ink-faint">
      also at{" "}
      {entry.alsoCoveredBy.map((c, i) => (
        <span key={c.url}>
          {i > 0 ? ", " : ""}
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline decoration-rule-strong underline-offset-2 hover:text-accent">
            {c.sourceName}
          </a>
        </span>
      ))}
    </div>
  );
}

function ExploringTag() {
  return (
    <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-accent border border-accent/40 rounded-full px-2 py-[1px]">
      exploring
    </span>
  );
}

function TopicTag({ topic }: { topic: string }) {
  return (
    <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">{topicLabel(topic)}</span>
  );
}

/* ── entry treatments ───────────────────────────────────────────────── */

function LeadEntry({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <article className="group pt-9 pb-9 border-b border-rule" data-impress-id={entry.id}>
      <div className="flex items-center gap-3">
        {entry.topics[0] ? <TopicTag topic={entry.topics[0]} /> : null}
        {entry.exploration ? <ExploringTag /> : null}
      </div>
      <h1 className="mt-2.5 font-serif font-semibold text-[2.1rem] sm:text-[2.45rem] leading-[1.07] tracking-[-0.015em]">
        <TitleLink entry={entry} className="hover:text-accent transition-colors">
          {entry.title}
        </TitleLink>
      </h1>
      {entry.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.imageUrl} alt="" className="mt-5 w-full aspect-[2/1] object-cover rounded-[2px]" loading="lazy" />
      ) : null}
      {entry.excerpt ? (
        <p className="mt-4 font-serif text-[1.1rem] leading-[1.55] text-ink-soft line-clamp-4">{entry.excerpt}</p>
      ) : null}
      <MetaRow entry={entry} onHideSource={onHideSource} />
      <AlsoCoveredBy entry={entry} />
    </article>
  );
}

function NewsEntry({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <article className="group py-6 border-b border-rule" data-impress-id={entry.id}>
      <div className="flex items-center gap-3">
        {entry.topics[0] ? <TopicTag topic={entry.topics[0]} /> : null}
        {entry.exploration ? <ExploringTag /> : null}
      </div>
      <h3 className="mt-1.5 font-serif font-medium text-[1.35rem] leading-[1.25] tracking-[-0.005em]">
        <TitleLink entry={entry} className="hover:text-accent transition-colors">
          {entry.title}
        </TitleLink>
      </h3>
      {entry.excerpt ? (
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft line-clamp-2">{entry.excerpt}</p>
      ) : null}
      <MetaRow entry={entry} onHideSource={onHideSource} />
      <AlsoCoveredBy entry={entry} />
    </article>
  );
}

function LongformEntry({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <article className="group py-7 border-b border-rule" data-impress-id={entry.id}>
      <div className="flex items-center gap-3 font-mono text-[0.65rem] uppercase tracking-[0.16em]">
        <span className="text-accent">{entry.sourceName}</span>
        <span className="text-ink-faint">longform{entry.readingMinutes ? ` · ${entry.readingMinutes} min` : ""}</span>
        {entry.exploration ? <ExploringTag /> : null}
      </div>
      <h3 className="mt-2 font-serif font-semibold text-[1.6rem] leading-[1.18] tracking-[-0.01em]">
        <TitleLink entry={entry} className="hover:text-accent transition-colors">
          {entry.title}
        </TitleLink>
      </h3>
      {entry.excerpt ? (
        <p className="mt-2 font-serif italic text-[1rem] leading-[1.5] text-ink-soft line-clamp-3">{entry.excerpt}</p>
      ) : null}
      <MetaRow entry={entry} onHideSource={onHideSource} showAuthor={true} />
    </article>
  );
}

function SocialEntry({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <article className="group py-5 border-b border-rule" data-impress-id={entry.id}>
      <div className="border-l-2 border-rule-strong pl-4">
        <p className="text-[0.95rem] leading-relaxed">
          <TitleLink entry={entry} className="hover:text-accent transition-colors">
            {entry.title}
          </TitleLink>
        </p>
        {entry.excerpt ? (
          <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-faint line-clamp-2">{entry.excerpt}</p>
        ) : null}
        <MetaRow entry={entry} onHideSource={onHideSource} />
      </div>
    </article>
  );
}

/* ── the stream ─────────────────────────────────────────────────────── */

export function FeedStream({ entries, latest: latestProp }: { entries: FeedItemDTO[]; latest: FeedItemDTO[] }) {
  const [hiddenSources, setHiddenSources] = useState<ReadonlySet<number>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const { lead, latest, rest } = useMemo(() => {
    const visible = entries.filter((e) => !hiddenSources.has(e.sourceId));
    const latest = latestProp.filter((e) => !hiddenSources.has(e.sourceId));
    const latestIds = new Set(latest.map((e) => e.id));
    const lead = visible.find((e) => e.sourceClass !== "social" && e.excerpt) ?? visible[0] ?? null;
    const rest = visible.filter((e) => e !== lead && !latestIds.has(e.id));
    return { lead, latest, rest };
  }, [entries, latestProp, hiddenSources]);

  useImpressions(rootRef, [lead, latest, rest]);

  const hide = (sourceId: number) => {
    setHiddenSources((prev) => new Set([...prev, sourceId]));
  };

  if (!lead && rest.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="font-serif italic text-xl text-ink-soft">The presses are warming up.</p>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
          First stories arrive within a few minutes — refresh shortly.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-2xl px-5 pb-24">
      {lead ? <LeadEntry entry={lead} onHideSource={() => hide(lead.sourceId)} /> : null}

      {latest.length > 0 ? (
        <section className="py-5 border-b border-rule">
          <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-accent">The Latest</h2>
          <ul className="mt-3 space-y-2.5">
            {latest.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3" data-impress-id={e.id}>
                <span className="font-mono text-[0.65rem] text-ink-faint w-8 shrink-0 text-right">
                  {timeAgo(e.publishedAt)}
                </span>
                <span className="text-[0.85rem] leading-snug min-w-0">
                  <TitleLink entry={e} className="hover:text-accent transition-colors">
                    {e.title}
                  </TitleLink>{" "}
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-faint whitespace-nowrap">
                    — {e.sourceName}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rest.map((entry) => {
        const onHideSource = () => hide(entry.sourceId);
        if (entry.sourceClass === "longform") return <LongformEntry key={entry.id} entry={entry} onHideSource={onHideSource} />;
        if (entry.sourceClass === "social") return <SocialEntry key={entry.id} entry={entry} onHideSource={onHideSource} />;
        return <NewsEntry key={entry.id} entry={entry} onHideSource={onHideSource} />;
      })}
    </div>
  );
}
