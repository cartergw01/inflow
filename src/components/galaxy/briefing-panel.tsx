"use client";

import { useMemo, useState } from "react";
import type { BriefingPayload, GalaxyStoryDTO } from "../../lib/feed-data";
import { categoryForTopics } from "../../lib/categories";
import { timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { VISUALS_BY_SLUG, WORLD_VISUALS } from "../../galaxy/worlds";

const INTRO_KEY = "inflow-briefing-intro-seen";

function SaveIcon({ saved }: { saved: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <path d="M5 3.5h10v13l-5-3.2-5 3.2z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function trustLabel(story: GalaxyStoryDTO) {
  if (story.status === "retracted") return "Retracted at source";
  if (story.status === "corrected") return "Corrected at source";
  if (story.status === "updated") return "Updated at source";
  if (story.verificationStatus === "corroborated") return `Corroborated by ${story.alsoCoveredBy.length + 1} sources`;
  if (story.verificationStatus === "unconfirmed") return "Unconfirmed social report";
  return `${story.credibilityTier} source`;
}

function BriefingStoryRow({ story, index, featured, onOpen, onSaveChange }: {
  story: GalaxyStoryDTO;
  index: number;
  featured?: boolean;
  onOpen: () => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(story.saved);
  const category = categoryForTopics(story.topics);
  const visual = category ? VISUALS_BY_SLUG.get(category.slug) : undefined;

  return (
    <article className="briefing-story" data-read={story.read} data-featured={featured}>
      <span className="briefing-story__index" aria-hidden>{index}</span>
      <span className="briefing-story__signal" style={{ background: visual?.css ?? "#8ba2ff" }} aria-hidden />
      <button type="button" className="briefing-story__main" onClick={onOpen}>
        <h3>{story.title}</h3>
        {featured && story.excerpt ? <p>{story.excerpt}</p> : null}
        <span className="briefing-story__meta">
          <span>{story.sourceName}</span>
          <span>{timeAgo(story.publishedAt)} ago</span>
          {story.readingMinutes ? <span>{story.readingMinutes} min</span> : null}
          <span>{category?.label ?? (story.topics[0] ? topicLabel(story.topics[0]) : "News")}</span>
        </span>
        <span className="briefing-story__trust" data-status={story.status} data-verification={story.verificationStatus}>{trustLabel(story)}</span>
      </button>
      <button type="button" className="briefing-story__save" aria-label={saved ? `Remove ${story.title} from saved` : `Save ${story.title}`} aria-pressed={saved} onClick={() => {
        sendSignal({ itemId: story.id, type: saved ? "unsave" : "save" });
        setSaved(!saved);
        onSaveChange(!saved);
      }}><SaveIcon saved={saved} /></button>
    </article>
  );
}

function BriefingIntro({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const choose = (slug: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });
  const finish = async (save: boolean) => {
    setBusy(true);
    if (save && selected.size > 0) {
      const interests = WORLD_VISUALS.filter((world) => selected.has(world.slug)).flatMap((world) => {
        if (world.slug === "politics") return ["us-politics"];
        if (world.slug === "tech") return ["tech", "ai", "vc"];
        return [world.slug];
      });
      await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interests }) }).catch(() => undefined);
    }
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* optional persistence */ }
    setBusy(false);
    onDone();
  };

  return (
    <section className="briefing-intro" aria-labelledby="briefing-intro-title">
      <div><h2 id="briefing-intro-title">Make this briefing yours.</h2><p>Choose a few worlds, or skip—InFlow learns from what you read.</p></div>
      <div className="briefing-intro__worlds">
        {WORLD_VISUALS.filter((world) => world.slug !== "today").map((world) => <button key={world.slug} type="button" aria-pressed={selected.has(world.slug)} onClick={() => choose(world.slug)}><span style={{ background: world.css }} aria-hidden />{world.label}</button>)}
      </div>
      <div className="briefing-intro__actions"><button type="button" onClick={() => finish(false)}>Skip</button><button type="button" disabled={busy || selected.size === 0} onClick={() => finish(true)}>{busy ? "Saving…" : "Use these worlds"}</button></div>
    </section>
  );
}

export function BriefingPanel({ payload, onOpen, onOpenUniverse, onSelectWorld, onSaveChange }: {
  payload: BriefingPayload;
  onOpen: (story: GalaxyStoryDTO) => void;
  onOpenUniverse: () => void;
  onSelectWorld: (slug: string) => void;
  onSaveChange: (storyId: number, saved: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem(INTRO_KEY) !== "1"; } catch { return false; }
  });
  const essentials = useMemo(() => payload.essentialIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const more = useMemo(() => payload.moreIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const readCount = essentials.filter((story) => story.read).length;
  const progress = essentials.length ? readCount / essentials.length : 0;

  return (
    <aside className="briefing-panel" aria-label="Your briefing">
      <div className="briefing-panel__scroll">
        {showIntro ? <BriefingIntro onDone={() => setShowIntro(false)} /> : null}
        <header className="briefing-panel__header">
          <h1>Your briefing</h1>
          <p>{essentials.length} essentials selected from {payload.newCount} new {payload.newCount === 1 ? "story" : "stories"}</p>
          <div className="briefing-progress" aria-label={`${readCount} of ${essentials.length} essentials read`}><span><i style={{ transform: `scaleX(${progress})` }} /></span><b>{readCount} of {essentials.length} read</b></div>
        </header>

        <section className="briefing-section" aria-labelledby="need-to-know">
          <h2 id="need-to-know">Need to know</h2>
          {essentials.slice(0, 3).map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + 1} featured onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}
        </section>
        <section className="briefing-section" aria-labelledby="worth-your-time">
          <h2 id="worth-your-time">Worth your time</h2>
          {essentials.slice(3).map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + 4} onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}
        </section>

        {readCount === essentials.length && essentials.length > 0 ? <div className="briefing-caught-up"><strong>You’re caught up on the essentials.</strong><span>Explore more from your worlds.</span></div> : null}

        <section className="briefing-section briefing-more" aria-labelledby="more-from-worlds">
          <button type="button" className="briefing-more__toggle" aria-expanded={showMore} onClick={() => setShowMore((open) => !open)}><span id="more-from-worlds">More from your worlds</span><ArrowIcon /></button>
          {showMore ? <div>{more.map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + essentials.length + 1} onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}</div> : null}
        </section>

        <section className="briefing-worlds" aria-label="Explore your worlds">
          {payload.worlds.map((world) => <button type="button" key={world.slug} onClick={() => onSelectWorld(world.slug)}><span style={{ background: VISUALS_BY_SLUG.get(world.slug)?.css ?? "#8ba2ff" }} aria-hidden /><strong>{world.label}</strong><small>{world.breaking ? "Breaking" : `${world.newCount} new`}</small></button>)}
          <button type="button" className="briefing-worlds__all" onClick={onOpenUniverse}>Open universe <ArrowIcon /></button>
        </section>
      </div>
    </aside>
  );
}

export function BriefingSkeleton() {
  return <aside className="briefing-panel briefing-panel--loading" aria-label="Loading your briefing" aria-busy="true"><div className="briefing-panel__scroll"><div className="briefing-skeleton__title" /><div className="briefing-skeleton__sub" />{Array.from({ length: 6 }, (_, index) => <div className="briefing-skeleton__row" key={index}><span /><i /><i /></div>)}</div></aside>;
}
