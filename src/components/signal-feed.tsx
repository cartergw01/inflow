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

/** Read/unread marker: filled accent square vs hollow grey — Swiss checkbox. */
function ReadMark({ read }: { read: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-2 h-2 shrink-0 ${read ? "border border-ink-faint" : "bg-accent"}`}
    />
  );
}

function CatLine({ entry }: { entry: FeedItemDTO }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent">
      <ReadMark read={entry.read} />
      <span>{entry.topics[0] ? topicLabel(entry.topics[0]) : entry.sourceName}</span>
      {entry.sourceClass === "social" ? <span className="text-ink-faint">— {entry.sourceName}</span> : null}
      {entry.exploration ? (
        <span className="text-ink-faint border border-ink-faint px-1.5 py-px tracking-[0.14em]">Exploring</span>
      ) : null}
    </div>
  );
}

function MetaLine({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-ink-faint">
        <span className="text-ink-soft">{entry.sourceName}</span>
        {entry.author ? <> — {entry.author}</> : null}
        <> — {timeAgo(entry.publishedAt)}</>
        {entry.readingMinutes ? <> — {entry.readingMinutes} min read</> : null}
      </span>
      <EntryActions itemId={entry.id} saved={entry.saved} onHideSource={onHideSource} />
    </div>
  );
}

function AlsoCoveredBy({ entry }: { entry: FeedItemDTO }) {
  if (entry.alsoCoveredBy.length === 0) return null;
  return (
    <div className="mt-1.5 font-mono text-[0.625rem] tracking-[0.06em] uppercase text-ink-faint">
      also at{" "}
      {entry.alsoCoveredBy.map((c, i) => (
        <span key={c.url}>
          {i > 0 ? ", " : ""}
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2 hover:text-accent">
            {c.sourceName}
          </a>
        </span>
      ))}
    </div>
  );
}

const ix = (n: number) => String(n).padStart(2, "0");

/* ── zones ──────────────────────────────────────────────────────────── */

function LeadZone({ entry, onHideSource }: { entry: FeedItemDTO; onHideSource: () => void }) {
  return (
    <section className="group px-5 sm:px-7 py-6 lg:border-r-[3px] lg:border-rule-strong" data-impress-id={entry.id}>
      <div className="flex items-center gap-2.5 font-mono text-[0.65rem] tracking-[0.2em] uppercase text-accent mb-4">
        <span>01 — top story{entry.topics[0] ? ` / ${topicLabel(entry.topics[0])}` : ""}</span>
        <span className="flex-1 h-[2px] bg-accent" aria-hidden />
      </div>
      <h1
        className={`font-display font-black leading-[0.99] tracking-[-0.035em] ${
          entry.imageUrl ? "text-[34px] sm:text-[44px]" : "text-[38px] sm:text-[54px]"
        }`}
      >
        <TitleLink entry={entry} className="hover:text-accent transition-colors">
          {entry.title}
        </TitleLink>
      </h1>
      {entry.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.imageUrl}
          alt=""
          className="mt-5 w-full aspect-[5/2] object-cover"
          loading="lazy"
          // A broken/blocked image must not leave a reserved blank box.
          onError={(e) => e.currentTarget.remove()}
        />
      ) : null}
      {entry.excerpt ? (
        <p className="mt-4 text-[15.5px] leading-[1.45] font-medium text-ink-soft max-w-[56ch] line-clamp-3">{entry.excerpt}</p>
      ) : null}
      <MetaLine entry={entry} onHideSource={onHideSource} />
      <AlsoCoveredBy entry={entry} />
    </section>
  );
}

function LatestBlock({ entries }: { entries: FeedItemDTO[] }) {
  return (
    <aside className="bg-ink text-paper px-5 py-5">
      <h2 className="flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.24em] uppercase mb-2.5">
        <span className="w-2 h-2 bg-accent inline-block" aria-hidden />
        Latest
      </h2>
      <ul>
        {entries.map((e) => (
          <li key={e.id} className="py-2.5 border-t border-paper/25" data-impress-id={e.id}>
            <div className="font-mono text-[0.625rem] text-paper/50 mb-0.5">
              {timeAgo(e.publishedAt)} — {e.sourceName}
            </div>
            <p className={`text-[13px] leading-[1.35] tracking-[-0.01em] ${e.read ? "font-medium text-paper/60" : "font-semibold"}`}>
              <TitleLink entry={e} className="hover:text-accent transition-colors">
                {e.title}
              </TitleLink>
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function StoryCell({ entry, index, onHideSource }: { entry: FeedItemDTO; index: number; onHideSource: () => void }) {
  return (
    <article
      className="group px-5 sm:px-7 py-5 border-b border-rule grid grid-cols-[44px_1fr] gap-4"
      data-impress-id={entry.id}
    >
      <div className={`font-display font-black text-[26px] leading-none tracking-[-0.04em] ${entry.read ? "text-ink-faint/50" : ""}`}>
        {ix(index)}
      </div>
      <div className="min-w-0">
        <CatLine entry={entry} />
        <h3
          className={`mt-1.5 font-display text-[18px] leading-[1.15] tracking-[-0.02em] ${
            entry.read ? "font-bold text-ink-soft" : "font-extrabold"
          }`}
        >
          <TitleLink entry={entry} className="hover:text-accent transition-colors">
            {entry.title}
          </TitleLink>
        </h3>
        {entry.excerpt ? (
          <p className="mt-1.5 text-[13px] leading-[1.4] text-ink-soft line-clamp-2">{entry.excerpt}</p>
        ) : null}
        <MetaLine entry={entry} onHideSource={onHideSource} />
        <AlsoCoveredBy entry={entry} />
      </div>
    </article>
  );
}

/* ── the feed ───────────────────────────────────────────────────────── */

export function SignalFeed({ entries, latest: latestProp }: { entries: FeedItemDTO[]; latest: FeedItemDTO[] }) {
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

  const hide = (sourceId: number) => setHiddenSources((prev) => new Set([...prev, sourceId]));

  if (!lead && rest.length === 0) {
    return (
      <div className="pane-in flex-1 flex items-center justify-center py-24">
        <div className="text-center">
          <span className="inline-block w-3 h-3 bg-accent mb-4" aria-hidden />
          <p className="font-display font-extrabold text-xl tracking-[-0.02em]">Nothing here yet.</p>
          <p className="mt-2 font-mono text-[0.65rem] tracking-[0.16em] uppercase text-ink-faint">
            First stories land within minutes — check back shortly
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pane-in flex-1">
      <div className={`grid ${latest.length > 0 ? "lg:grid-cols-[2fr_1fr]" : ""} border-b-[3px] border-rule-strong`}>
        {lead ? <LeadZone entry={lead} onHideSource={() => hide(lead.sourceId)} /> : null}
        {latest.length > 0 ? <LatestBlock entries={latest} /> : null}
      </div>
      <div className="grid sm:grid-cols-2 sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-child(odd)]:border-rule">
        {rest.map((entry, i) => (
          <StoryCell key={entry.id} entry={entry} index={i + 2} onHideSource={() => hide(entry.sourceId)} />
        ))}
      </div>
    </div>
  );
}
