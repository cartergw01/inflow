"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import { subjectById } from "../../lib/subjects";
import type { FeedItemDTO } from "../../lib/feed-data";

export interface WarpTarget {
  kind: "world" | "story";
  id: number | string;
  title: string;
  sub: string;
  color: string;
  saved?: boolean;
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><circle cx="8.5" cy="8.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

export function WarpBar({ stories, worlds, onWarp, onClose }: {
  stories: { id: number; title: string; world: string; sourceName: string }[];
  worlds: Array<{ slug: string; label: string }>;
  onWarp: (target: WarpTarget) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteStories, setRemoteStories] = useState<FeedItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ stories: FeedItemDTO[] }> : { stories: [] })
        .then((payload) => setRemoteStories(payload.stories))
        .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteStories([]); })
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const worldResults = useMemo<WarpTarget[]>(() => {
    const needle = query.trim().toLowerCase();
    return [{ slug: "today", label: "Today" }, ...worlds]
      .filter((world) => !needle || world.label.toLowerCase().includes(needle) || world.slug.includes(needle))
      .map((world) => ({ kind: "world", id: world.slug, title: world.label, sub: "WORLD", color: VISUALS_BY_SLUG.get(world.slug)?.css ?? "#8ba2ff" }));
  }, [query, worlds]);

  const storyResults = useMemo<WarpTarget[]>(() => {
    if (query.trim().length >= 2) return remoteStories.map((story) => {
      const matchedWorld = worlds.find((world) => story.topics.includes(world.slug));
      const subject = matchedWorld ? subjectById(matchedWorld.slug) : story.topics.map(subjectById).find(Boolean);
      const slug = matchedWorld?.slug ?? subject?.id;
      return { kind: "story", id: story.id, title: story.title, sub: `${story.sourceName} · ${matchedWorld?.label ?? subject?.label ?? "NEWS"}`, color: slug ? VISUALS_BY_SLUG.get(slug)?.css ?? "#8ba2ff" : "#8ba2ff", saved: story.saved };
    });
    return stories.slice(0, 6).map((story) => ({ kind: "story", id: story.id, title: story.title, sub: `${story.sourceName} · RECENT`, color: VISUALS_BY_SLUG.get(story.world)?.css ?? "#8ba2ff" }));
  }, [query, remoteStories, stories, worlds]);
  const savedResults = storyResults.filter((result) => result.saved);
  const regularResults = storyResults.filter((result) => !result.saved);
  const results = [...worldResults, ...savedResults, ...regularResults];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(value + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); }
    if (event.key === "Enter" && results[cursor]) { event.preventDefault(); onWarp(results[cursor]); }
    if (event.key === "Tab" && dialogRef.current) {
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, a[href]")].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  const renderGroup = (label: string, group: WarpTarget[], offset: number) => group.length ? <section className="search-results-group" aria-labelledby={`search-${label.toLowerCase()}`}><h3 id={`search-${label.toLowerCase()}`}>{label}</h3><ul>{group.map((result, index) => {
    const globalIndex = offset + index;
    return <li key={`${result.kind}-${result.id}`}><button type="button" onClick={() => onWarp(result)} onMouseEnter={() => setCursor(globalIndex)} className={globalIndex === cursor ? "is-active" : ""}><span className="search-result__dot" style={{ background: result.color }} aria-hidden /><span><strong>{result.title}</strong><small>{result.sub}</small></span></button></li>;
  })}</ul></section> : null;

  return (
    <div className="galaxy-drawer-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside ref={dialogRef} className="galaxy-drawer search-drawer" role="dialog" aria-modal="true" aria-labelledby="search-title" onKeyDown={onKeyDown}>
        <header className="galaxy-drawer__header"><div><span className="galaxy-drawer__eyebrow">Find your next signal</span><h2 id="search-title">Search</h2></div><button type="button" onClick={onClose} aria-label="Close search"><CloseIcon /></button></header>
        <label className="search-drawer__input"><SearchIcon /><span className="sr-only">Search stories, sources, authors, topics, and worlds</span><input ref={inputRef} value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setCursor(0); if (value.trim().length < 2) { setRemoteStories([]); setLoading(false); } }} placeholder="Stories, sources, authors, topics…" /></label>
        <div className="search-drawer__results" aria-busy={loading}>
          {renderGroup("Worlds", worldResults, 0)}
          {renderGroup("Saved", savedResults, worldResults.length)}
          {renderGroup("Stories", regularResults, worldResults.length + savedResults.length)}
          {loading ? <div className="search-loading" role="status">Searching current stories…</div> : null}
          {!loading && query.trim().length >= 2 && results.length === 0 ? <div className="galaxy-drawer__state">No current stories match that search.</div> : null}
        </div>
      </aside>
    </div>
  );
}
