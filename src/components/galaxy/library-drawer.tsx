"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedItemDTO, SourceWithState } from "../../lib/feed-data";
import { timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

export type LibraryTab = "saved" | "sources";
interface LibraryPayload { saved: FeedItemDTO[]; sources: SourceWithState[] }

export function LibraryDrawer({ initialTab, onTabChange, onClose, onOpenStory }: {
  initialTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onClose: () => void;
  onOpenStory: (story: FeedItemDTO) => void;
}) {
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/library").then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<LibraryPayload>;
    }).then((data) => { if (!cancelled) setPayload(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sources = payload?.sources ?? [];
    return needle ? sources.filter((source) => source.name.toLowerCase().includes(needle) || source.topicHints.some((topic) => topic.includes(needle))) : sources;
  }, [payload?.sources, query]);

  const toggleSource = async (source: SourceWithState) => {
    const muted = !source.muted;
    setPayload((current) => current ? { ...current, sources: current.sources.map((item) => item.id === source.id ? { ...item, muted } : item) } : current);
    const response = await fetch("/api/mute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId: source.id, muted }) });
    if (!response.ok) setPayload((current) => current ? { ...current, sources: current.sources.map((item) => item.id === source.id ? source : item) } : current);
  };

  return (
    <div className="galaxy-drawer-scrim" onClick={onClose}>
      <aside className="galaxy-drawer library-drawer" onClick={(event) => event.stopPropagation()} aria-label="Library">
        <header className="galaxy-drawer__header">
          <div><span className="galaxy-drawer__eyebrow">Observatory library</span><h2>Library</h2></div>
          <button type="button" onClick={onClose} aria-label="Close library" title="Close library">×</button>
        </header>
        <div className="library-tabs" role="tablist" aria-label="Library sections">
          {(["saved", "sources"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={initialTab === tab} onClick={() => onTabChange(tab)}>
            {tab === "saved" ? `Saved${payload ? ` · ${payload.saved.length}` : ""}` : `Sources${payload ? ` · ${payload.sources.length}` : ""}`}
          </button>)}
        </div>
        {error ? <div className="galaxy-drawer__state">Library unavailable. Close and try again.</div> : null}
        {!payload && !error ? <div className="galaxy-drawer__state">Loading library…</div> : null}
        {payload && initialTab === "saved" ? <div className="library-list">
          {payload.saved.length === 0 ? <div className="galaxy-drawer__state">Stories you save will appear here.</div> : null}
          {payload.saved.map((story) => <article key={story.id} className="library-story">
            <div className="library-story__meta">{story.topics[0] ? topicLabel(story.topics[0]) : story.sourceName} · {timeAgo(story.publishedAt)} ago</div>
            <h3>{story.title}</h3>
            <div className="library-story__actions">
              <span>{story.sourceName}{story.readingMinutes ? ` · ${story.readingMinutes} min` : ""}</span>
              <button type="button" onClick={() => { sendSignal({ itemId: story.id, type: "unsave" }); setPayload((current) => current ? { ...current, saved: current.saved.filter((item) => item.id !== story.id) } : current); }}>Remove</button>
              <button type="button" onClick={() => onOpenStory(story)}>Read →</button>
            </div>
          </article>)}
        </div> : null}
        {payload && initialTab === "sources" ? <div className="library-sources">
          <label className="library-source-search"><span className="sr-only">Filter sources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter sources…" /></label>
          {filteredSources.map((source) => <div key={source.id} className="library-source" data-muted={source.muted}>
            <div><strong>{source.name}</strong><span>{source.sourceClass} · {source.topicHints.slice(0, 2).map(topicLabel).join(", ") || source.kind}</span></div>
            <button type="button" onClick={() => toggleSource(source)}>{source.muted ? "Unmute" : "Mute"}</button>
          </div>)}
        </div> : null}
      </aside>
    </div>
  );
}
