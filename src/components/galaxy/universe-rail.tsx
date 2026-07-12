"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

const scrollPositions = new Map<string, number>();

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function UniverseRail({ data, view, focus, onFocus, onPreview, onOpen, onBack, onClear, onMute, onSaveChange }: {
  data: GalaxyPayload;
  view: string | null;
  focus: { story: GalaxyStory; world: string } | null;
  onFocus: (story: GalaxyStory) => void;
  onPreview: (story: GalaxyStory | null) => void;
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
  const scrollKey = view ?? "universe";
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const frameRef = useRef<number | null>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(entries.length, 6), atStart: true, atEnd: entries.length <= 6 });

  const measureRange = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.children) as HTMLLIElement[];
    if (rows.length === 0) {
      setRange({ start: 0, end: 0, atStart: true, atEnd: true });
      return;
    }
    const viewportTop = list.scrollTop + 1;
    const viewportBottom = list.scrollTop + list.clientHeight - 1;
    const first = rows.findIndex((row) => row.offsetTop + row.offsetHeight > viewportTop);
    let last = rows.length - 1;
    for (let index = Math.max(0, first); index < rows.length; index++) {
      if (rows[index].offsetTop >= viewportBottom) {
        last = Math.max(index - 1, first);
        break;
      }
    }
    setRange({
      start: Math.max(0, first),
      end: last + 1,
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
        <button type="button" onClick={onBack} aria-label={view ? "Back to universe" : "Back to briefing"}><BackIcon /></button>
        <div className="universe-rail__heading"><div><h1>{title}</h1><p>{subtitle}</p></div><span className="universe-rail__range" aria-live="polite">{range.end ? `${pad(range.start + 1)}–${pad(range.end)}` : "00–00"} / {pad(entries.length)}</span></div>
        {focus ? <button type="button" onClick={onClear} aria-label="Clear selected story"><CloseIcon /></button> : <span />}
      </header>

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
          <button type="button" className="universe-focus__read" onClick={() => onOpen(focus.story)}>Read story</button>
          <button type="button" onClick={() => onMute(focus.story)}>Mute source</button>
        </div>
        {selectedIndex >= 0 ? <div className="universe-focus__step"><button type="button" disabled={selectedIndex === 0} onClick={() => onFocus(entries[selectedIndex - 1])}>Previous</button><span>{selectedIndex + 1} / {entries.length}</span><button type="button" disabled={selectedIndex === entries.length - 1} onClick={() => onFocus(entries[selectedIndex + 1])}>Next</button></div> : null}
      </section> : null}

      <div className="universe-story-scroll" data-at-start={range.atStart} data-at-end={range.atEnd}>
        <ol ref={listRef} className="universe-story-list" onScroll={scheduleMeasure}>
          {entries.map((story, index) => <li key={story.id} ref={(node) => { if (node) rowRefs.current.set(story.id, node); else rowRefs.current.delete(story.id); }} data-selected={story.id === selectedId} data-read={story.read}>
            <button type="button"
              onPointerEnter={() => onPreview(story)}
              onPointerLeave={() => onPreview(null)}
              onFocus={() => onPreview(story)}
              onBlur={() => onPreview(null)}
              onClick={() => { onPreview(null); onFocus(story); }}
              aria-current={story.id === selectedId ? "true" : undefined}>
              <span className="universe-story-list__index">{pad(index + 1)}</span>
              <span className="universe-story-list__main"><strong>{story.title}</strong><small>{story.sourceName} · {timeAgo(story.publishedAt)} ago{story.readingMinutes ? ` · ${story.readingMinutes} min` : ""}</small></span>
              <span className="universe-story-list__dot" style={{ background: visual?.css ?? "#8ba2ff" }} aria-hidden />
            </button>
          </li>)}
        </ol>
      </div>
      <footer className="universe-legend">Brightness = new · ring = saved · diamond = story</footer>
    </aside>
  );
}
