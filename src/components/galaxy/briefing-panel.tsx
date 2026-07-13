"use client";

import { useMemo, useState } from "react";
import type { BriefingPayload, GalaxyStoryDTO } from "../../lib/feed-data";
import { timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import { subjectById } from "../../lib/subjects";

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
  const subject = story.topics.map(subjectById).find(Boolean);
  const visual = subject ? VISUALS_BY_SLUG.get(subject.id) : undefined;

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
          <span>{subject?.label ?? (story.topics[0] ? topicLabel(story.topics[0]) : "News")}</span>
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

export function BriefingPanel({ payload, onOpen, onOpenUniverse, onSelectWorld, onSaveChange }: {
  payload: BriefingPayload;
  onOpen: (story: GalaxyStoryDTO) => void;
  onOpenUniverse: () => void;
  onSelectWorld: (slug: string) => void;
  onSaveChange: (storyId: number, saved: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const essentials = useMemo(() => payload.essentialIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const more = useMemo(() => payload.moreIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const readCount = essentials.filter((story) => story.read).length;
  const progress = essentials.length ? readCount / essentials.length : 0;

  return (
    <aside className="briefing-panel" aria-label="Your briefing">
      <div className="briefing-panel__scroll">
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
