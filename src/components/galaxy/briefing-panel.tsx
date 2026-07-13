"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { BriefingPayload, GalaxyStoryDTO } from "../../lib/feed-data";
import { timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import {
  SUBJECT_FAMILIES,
  SUBJECTS,
  subjectById,
  type SubjectId,
} from "../../lib/subjects";
import {
  briefingSelectionReason,
  briefingSummary,
  joinLabels,
} from "./briefing-presentation";

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

function BriefingStoryRow({ story, index, featured, selectedSubjects, onOpen, onSaveChange }: {
  story: GalaxyStoryDTO;
  index: number;
  featured?: boolean;
  selectedSubjects: ReadonlySet<SubjectId>;
  onOpen: () => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(story.saved);
  const storySubjects = story.topics.flatMap((topic) => {
    const subject = subjectById(topic);
    return subject ? [subject] : [];
  });
  const subject = storySubjects.find((candidate) => selectedSubjects.has(candidate.id)) ?? storySubjects[0];
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
          {story.isNew ? <strong>New</strong> : null}
        </span>
        <span className="briefing-story__reason">{briefingSelectionReason(story, selectedSubjects)}</span>
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

function TopicEditor({ selected, onClose }: {
  selected: readonly SubjectId[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SubjectId[]>([...selected]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft.join("|") !== selected.join("|");

  const toggle = (id: SubjectId) => {
    setError(null);
    setDraft((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : current.length < 5 ? [...current, id] : current);
  };

  const save = async () => {
    if (draft.length < 1 || draft.length > 5 || !changed) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests: draft }),
      });
      const result = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not update your topics.");
      location.reload();
    } catch (caught) {
      setSaving(false);
      setError(caught instanceof Error ? caught.message : "Could not update your topics.");
    }
  };

  return (
    <section className="briefing-topic-editor" aria-labelledby="briefing-topic-editor-title">
      <div className="briefing-topic-editor__heading">
        <div>
          <h2 id="briefing-topic-editor-title">Choose your topics</h2>
          <p>Pick one to five. This changes both Today and your universe.</p>
        </div>
        <strong>{draft.length} / 5</strong>
      </div>
      <div className="briefing-topic-editor__families">
        {SUBJECT_FAMILIES.map((family) => (
          <fieldset key={family.id} style={{ "--topic-color": family.accent } as CSSProperties}>
            <legend>{family.label}</legend>
            <div>
              {family.subjectIds.map((id) => {
                const subject = SUBJECTS.find((candidate) => candidate.id === id);
                if (!subject) return null;
                const active = draft.includes(id);
                return (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={active}
                    disabled={!active && draft.length >= 5}
                    onClick={() => toggle(id)}
                  >
                    {subject.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {error ? <p className="briefing-topic-editor__error" role="alert">{error}</p> : null}
      <div className="briefing-topic-editor__actions">
        <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || draft.length < 1 || !changed}>{saving ? "Updating…" : "Update topics"}</button>
      </div>
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
  const [showWhy, setShowWhy] = useState(false);
  const [showTopicEditor, setShowTopicEditor] = useState(false);
  const essentials = useMemo(() => payload.essentialIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const more = useMemo(() => payload.moreIds.flatMap((id) => payload.stories[String(id)] ? [payload.stories[String(id)]] : []), [payload]);
  const readCount = essentials.filter((story) => story.read).length;
  const selectedSubjects = useMemo(() => payload.worlds.flatMap((world) => {
    const subject = subjectById(world.slug);
    return subject ? [subject.id] : [];
  }), [payload.worlds]);
  const selectedSubjectSet = useMemo(() => new Set(selectedSubjects), [selectedSubjects]);
  const worldLabels = payload.worlds.map((world) => world.label);

  return (
    <aside className="briefing-panel" aria-label="Today’s personalized stories">
      <div className="briefing-panel__scroll">
        <header className="briefing-panel__header">
          <span className="briefing-panel__eyebrow">Personalized news</span>
          <h1>Today</h1>
          <p className="briefing-panel__summary">{briefingSummary(payload.newCount)}</p>
          <p className="briefing-panel__topics">Following {joinLabels(worldLabels)}</p>
          <div className="briefing-panel__actions">
            <button type="button" aria-expanded={showWhy} onClick={() => {
              setShowWhy((open) => !open);
              setShowTopicEditor(false);
            }}>Why these stories?</button>
            <button type="button" aria-expanded={showTopicEditor} onClick={() => {
              setShowTopicEditor((open) => !open);
              setShowWhy(false);
            }}>Edit topics</button>
          </div>
        </header>

        {showWhy ? (
          <section className="briefing-explainer" aria-label="How Today is ranked">
            <strong>Today is generated automatically—not handpicked by an editor.</strong>
            <p>Freshness has the biggest influence. Your chosen topics, the sources and authors you engage with, and source quality also shape the order. Similar topics and sources are spread out, and occasional stories broaden your mix.</p>
            <small>Opening, reading, saving, and choosing “more like this” tune future rankings.</small>
          </section>
        ) : null}
        {showTopicEditor ? <TopicEditor selected={selectedSubjects} onClose={() => setShowTopicEditor(false)} /> : null}

        <section className="briefing-section" aria-labelledby="top-stories">
          <h2 id="top-stories">Top stories</h2>
          {essentials.slice(0, 3).map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + 1} featured selectedSubjects={selectedSubjectSet} onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}
        </section>
        <section className="briefing-section" aria-labelledby="more-for-you">
          <h2 id="more-for-you">More for you</h2>
          {essentials.slice(3).map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + 4} selectedSubjects={selectedSubjectSet} onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}
        </section>

        {readCount === essentials.length && essentials.length > 0 ? <div className="briefing-caught-up"><strong>You’re caught up.</strong><span>Explore more stories or enter one of your worlds.</span></div> : null}

        <section className="briefing-section briefing-more" aria-labelledby="keep-exploring">
          <button type="button" className="briefing-more__toggle" aria-expanded={showMore} onClick={() => setShowMore((open) => !open)}><span id="keep-exploring">Keep exploring</span><ArrowIcon /></button>
          {showMore ? <div>{more.map((story, index) => <BriefingStoryRow key={story.id} story={story} index={index + essentials.length + 1} selectedSubjects={selectedSubjectSet} onOpen={() => onOpen(story)} onSaveChange={(saved) => onSaveChange(story.id, saved)} />)}</div> : null}
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
  return <aside className="briefing-panel briefing-panel--loading" aria-label="Loading Today" aria-busy="true"><div className="briefing-panel__scroll"><div className="briefing-skeleton__title" /><div className="briefing-skeleton__sub" />{Array.from({ length: 6 }, (_, index) => <div className="briefing-skeleton__row" key={index}><span /><i /><i /></div>)}</div></aside>;
}
