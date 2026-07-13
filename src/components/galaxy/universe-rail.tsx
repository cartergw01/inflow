"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GalaxyPayload, GalaxyStory, GalaxyWorldData } from "../../galaxy/engine";
import { timeAgo } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";

function CloseIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function BackIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m12.5 4-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><circle cx="4" cy="10" r="1.25" fill="currentColor" /><circle cx="10" cy="10" r="1.25" fill="currentColor" /><circle cx="16" cy="10" r="1.25" fill="currentColor" /></svg>;
}

function connectedWorlds(story: GalaxyStory, worlds: GalaxyWorldData[]) {
  return worlds
    .filter((world) => world.entries.some((entry) => entry.id === story.id) || story.topics.includes(world.slug))
    .map((world) => world.label);
}

function verification(story: GalaxyStory) {
  if (story.status !== "active") return `${story.status[0].toUpperCase()}${story.status.slice(1)} at source`;
  if (story.verificationStatus === "corroborated") return `Corroborated by ${story.alsoCoveredBy.length + 1} sources`;
  if (story.verificationStatus === "unconfirmed") return "Unconfirmed social report";
  return `${story.credibilityTier} source`;
}

const scrollPositions = new Map<string, number>();
const EMPTY_STORIES: GalaxyStory[] = [];

export function UniverseRail({ data, view, focus, onSelectWorld, onFocus, onPreview, onOpen, onBack, onClear, onMute, onSaveChange }: {
  data: GalaxyPayload;
  view: string | null;
  focus: { story: GalaxyStory; world: string } | null;
  onSelectWorld: (slug: string | null) => void;
  onFocus: (story: GalaxyStory) => void;
  onPreview: (story: GalaxyStory | null) => void;
  onOpen: (story: GalaxyStory, restoreFocus: boolean) => void;
  onBack: () => void;
  onClear: () => void;
  onMute: (story: GalaxyStory) => void;
  onSaveChange: (storyId: number, saved: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [focusMenuStoryId, setFocusMenuStoryId] = useState<number | null>(null);
  const world: GalaxyWorldData | null = view === "today" ? data.today : data.worlds.find((candidate) => candidate.slug === view) ?? null;
  const entries = world?.entries ?? EMPTY_STORIES;
  const visual = VISUALS_BY_SLUG.get(view ?? "today");
  const connections = focus ? connectedWorlds(focus.story, data.worlds) : [];
  const title = world?.label ?? "Universe";
  const subtitle = world
    ? `${world.newCount} new · ${world.entries.length} stories`
    : `${data.worlds.length} worlds · choose one to browse`;
  const selectedId = focus?.story.id ?? null;
  const scrollKey = view ?? "universe";
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const frameRef = useRef<number | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ atStart: true, atEnd: entries.length <= 6 });
  const worldItems = useMemo(() => data.worlds.map((worldData) => ({
    slug: worldData.slug,
    label: worldData.label,
    newCount: worldData.newCount,
    storyCount: worldData.entries.length,
    color: VISUALS_BY_SLUG.get(worldData.slug)?.css ?? "#8ba2ff",
  })), [data.worlds]);

  const measureRange = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.children) as HTMLLIElement[];
    if (rows.length === 0) {
      setScrollEdges({ atStart: true, atEnd: true });
      return;
    }
    setScrollEdges({
      atStart: list.scrollTop <= 2,
      atEnd: list.scrollTop + list.clientHeight >= list.scrollHeight - 2,
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    const list = listRef.current;
    if (list) scrollPositions.set(scrollKey, list.scrollTop);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      measureRange();
    });
  }, [measureRange, scrollKey]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = scrollPositions.get(scrollKey) ?? 0;
    const frame = requestAnimationFrame(measureRange);
    return () => {
      scrollPositions.set(scrollKey, list.scrollTop);
      cancelAnimationFrame(frame);
    };
  }, [entries.length, measureRange, scrollKey]);

  useEffect(() => {
    if (selectedId === null) return;
    const row = rowRefs.current.get(selectedId);
    if (!row) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    const frame = requestAnimationFrame(measureRange);
    return () => cancelAnimationFrame(frame);
  }, [measureRange, selectedId]);

  useEffect(() => () => {
    onPreview(null);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, [onPreview]);

  const toggleCollapsed = () => {
    onPreview(null);
    setCollapsed((value) => !value);
  };

  return (
    <aside className="universe-rail" data-collapsed={collapsed} style={{ "--rail-accent": visual?.css ?? "#8ba2ff" } as React.CSSProperties} aria-label={`${title} stories`}>
      <button type="button" className="universe-rail__handle" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? "Expand story list" : "Collapse story list"}><span /></button>
      <header className="universe-rail__header">
        {view ? <button type="button" className="universe-rail__back" onClick={onBack} aria-label="Back to all worlds" title="All worlds"><BackIcon /></button> : <span className="universe-rail__back-spacer" />}
        <div className="universe-rail__heading"><h1>{title}</h1><p>{subtitle}</p></div>
        {focus ? <button type="button" onClick={onClear} aria-label="Clear selected story"><CloseIcon /></button> : <span />}
      </header>

      {view ? <label className="universe-world-picker"><span>Switch world</span><select value={view} onChange={(event) => onSelectWorld(event.target.value || null)}><option value="">All worlds</option>{worldItems.map((item) => <option key={item.slug} value={item.slug}>{item.label} · {item.newCount} new</option>)}</select></label> : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{focus ? `Selected story: ${focus.story.title}` : `${title} stories`}</p>

      {!view ? <section className="universe-world-directory" aria-label="Choose a world">
        <div className="universe-world-directory__list">
          {worldItems.map((item) => <button key={item.slug} type="button" style={{ "--world-color": item.color } as React.CSSProperties} onClick={() => onSelectWorld(item.slug)}>
            <span className="universe-world-directory__signal" aria-hidden />
            <span className="universe-world-directory__main"><strong>{item.label}</strong><small>{item.newCount} new · {item.storyCount} stories</small></span>
            <ArrowIcon />
          </button>)}
        </div>
      </section> : null}

      {focus ? <section className="universe-focus" aria-labelledby={`universe-focus-${focus.story.id}`}>
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
          <button type="button" className="universe-focus__read" onClick={() => onOpen(focus.story, true)}>Read story</button>
          <div className="universe-focus__menu-wrap">
            <button type="button" className="universe-focus__menu-trigger" aria-label="Story options" title="Story options" aria-haspopup="menu" aria-expanded={focusMenuStoryId === focus.story.id} onClick={() => setFocusMenuStoryId((current) => current === focus.story.id ? null : focus.story.id)}><MoreIcon /></button>
            {focusMenuStoryId === focus.story.id ? <div className="universe-focus__menu" role="menu"><button type="button" role="menuitem" onClick={() => { setFocusMenuStoryId(null); onMute(focus.story); }}>Mute {focus.story.sourceName}</button></div> : null}
          </div>
        </div>
      </section> : null}

      {view ? <div className="universe-story-scroll" data-at-start={scrollEdges.atStart} data-at-end={scrollEdges.atEnd}>
        <ol ref={listRef} className="universe-story-list" onScroll={scheduleMeasure}>
          {entries.map((story) => <li key={story.id} ref={(node) => { if (node) rowRefs.current.set(story.id, node); else rowRefs.current.delete(story.id); }} data-selected={story.id === selectedId} data-read={story.read}>
            <button type="button" className="universe-story-list__headline"
              onPointerEnter={() => onPreview(story)}
              onPointerLeave={() => onPreview(null)}
              onFocus={() => onPreview(story)}
              onBlur={() => onPreview(null)}
              onClick={() => { onPreview(null); onFocus(story); }}
              aria-label={`Select ${story.title}`}
              aria-current={story.id === selectedId ? "true" : undefined}>
              <span className="universe-story-list__signal" style={{ background: visual?.css ?? "#8ba2ff" }} aria-hidden />
              <span className="universe-story-list__main"><strong>{story.title}</strong><small>{story.sourceName} · {timeAgo(story.publishedAt)} ago{story.readingMinutes ? ` · ${story.readingMinutes} min` : ""}</small></span>
            </button>
          </li>)}
        </ol>
      </div> : null}
    </aside>
  );
}
