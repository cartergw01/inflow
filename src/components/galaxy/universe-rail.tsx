"use client";

import { useMemo, useState } from "react";
import type { GalaxyPayload, GalaxyStory, GalaxyWorldData } from "../../galaxy/engine";
import { CATEGORIES } from "../../lib/categories";
import { timeAgo } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";

function CloseIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function BackIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m12.5 4-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function connectedWorlds(story: GalaxyStory) {
  return CATEGORIES.slice(1).filter((category) => category.topics.some((topic) => story.topics.includes(topic))).map((category) => category.label);
}

function verification(story: GalaxyStory) {
  if (story.status !== "active") return `${story.status[0].toUpperCase()}${story.status.slice(1)} at source`;
  if (story.verificationStatus === "corroborated") return `Corroborated by ${story.alsoCoveredBy.length + 1} sources`;
  if (story.verificationStatus === "unconfirmed") return "Unconfirmed social report";
  return `${story.credibilityTier} source`;
}

export function UniverseRail({ data, view, focus, onFocus, onOpen, onBack, onClear, onMute, onSaveChange }: {
  data: GalaxyPayload;
  view: string | null;
  focus: { story: GalaxyStory; world: string } | null;
  onFocus: (story: GalaxyStory) => void;
  onOpen: (story: GalaxyStory) => void;
  onBack: () => void;
  onClear: () => void;
  onMute: (story: GalaxyStory) => void;
  onSaveChange: (storyId: number, saved: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const world: GalaxyWorldData = view === "today" ? data.today : data.worlds.find((candidate) => candidate.slug === view) ?? data.today;
  const entries = view ? world.entries : data.today.entries;
  const visual = VISUALS_BY_SLUG.get(view ?? "today");
  const connections = focus ? connectedWorlds(focus.story) : [];
  const title = view ? world.label : "Universe";
  const subtitle = view ? `${world.newCount} new · ranked for you` : "Your strongest signals across every world";
  const selectedId = focus?.story.id ?? null;
  const selectedIndex = useMemo(() => entries.findIndex((story) => story.id === selectedId), [entries, selectedId]);

  return (
    <aside className="universe-rail" data-collapsed={collapsed} aria-label={`${title} stories`}>
      <button type="button" className="universe-rail__handle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand story list" : "Collapse story list"}><span /></button>
      <header className="universe-rail__header">
        <button type="button" onClick={onBack} aria-label={view ? "Back to universe" : "Back to briefing"}><BackIcon /></button>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        {focus ? <button type="button" onClick={onClear} aria-label="Clear selected story"><CloseIcon /></button> : <span />}
      </header>

      {focus ? <section className="universe-focus" style={{ "--rail-accent": visual?.css ?? "#8ba2ff" } as React.CSSProperties} aria-labelledby={`universe-focus-${focus.story.id}`}>
        <span className="universe-focus__meta">{focus.story.sourceName} · {timeAgo(focus.story.publishedAt)} ago{focus.story.readingMinutes ? ` · ${focus.story.readingMinutes} min` : ""}</span>
        <h2 id={`universe-focus-${focus.story.id}`}>{focus.story.title}</h2>
        {focus.story.excerpt ? <p>{focus.story.excerpt}</p> : null}
        <span className="universe-focus__trust" data-verification={focus.story.verificationStatus} data-status={focus.story.status}>{verification(focus.story)}</span>
        {connections.length > 1 ? <span className="universe-focus__connection">Connects {connections.slice(0, 2).join(" and ")}</span> : null}
        <div className="universe-focus__actions">
          <button type="button" onClick={() => {
            const saved = !focus.story.saved;
            sendSignal({ itemId: focus.story.id, type: saved ? "save" : "unsave" });
            onSaveChange(focus.story.id, saved);
          }}>{focus.story.saved ? "Saved" : "Save"}</button>
          <button type="button" className="universe-focus__read" onClick={() => onOpen(focus.story)}>Read story</button>
          <button type="button" onClick={() => onMute(focus.story)}>Mute source</button>
        </div>
        {selectedIndex >= 0 ? <div className="universe-focus__step"><button type="button" disabled={selectedIndex === 0} onClick={() => onFocus(entries[selectedIndex - 1])}>Previous</button><span>{selectedIndex + 1} / {entries.length}</span><button type="button" disabled={selectedIndex === entries.length - 1} onClick={() => onFocus(entries[selectedIndex + 1])}>Next</button></div> : null}
      </section> : null}

      <ol className="universe-story-list">
        {entries.map((story, index) => <li key={story.id} data-selected={story.id === selectedId} data-read={story.read}>
          <button type="button" onClick={() => onFocus(story)} aria-current={story.id === selectedId ? "true" : undefined}>
            <span className="universe-story-list__index">{String(index + 1).padStart(2, "0")}</span>
            <span className="universe-story-list__main"><strong>{story.title}</strong><small>{story.sourceName} · {timeAgo(story.publishedAt)} ago{story.readingMinutes ? ` · ${story.readingMinutes} min` : ""}</small></span>
            <span className="universe-story-list__dot" style={{ background: visual?.css ?? "#8ba2ff" }} aria-hidden />
          </button>
        </li>)}
      </ol>
      <footer className="universe-legend">Bigger = more relevant · Brighter = newer · Ring = saved</footer>
    </aside>
  );
}
