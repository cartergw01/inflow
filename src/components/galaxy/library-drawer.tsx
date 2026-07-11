"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FeedItemDTO, SourceWithState } from "../../lib/feed-data";
import { timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

export type LibraryTab = "saved" | "sources";
interface LibraryPayload { saved: FeedItemDTO[]; sources: SourceWithState[] }

export function LibraryDrawer({ initialTab, onTabChange, onClose, onOpenStory }: {
  initialTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onClose?: () => void;
  onOpenStory: (story: FeedItemDTO) => void;
  standalone?: boolean;
}) {
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [savedFilter, setSavedFilter] = useState<"all" | "unread">("all");
  const [savedTopic, setSavedTopic] = useState("all");

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
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const savedTopics = useMemo(() => [...new Set((payload?.saved ?? []).flatMap((story) => story.topics))].sort(), [payload?.saved]);
  const filteredSaved = useMemo(() => (payload?.saved ?? []).filter((story) => {
    if (savedFilter === "unread" && story.read) return false;
    return savedTopic === "all" || story.topics.includes(savedTopic);
  }), [payload?.saved, savedFilter, savedTopic]);

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
    <div className={onClose ? "galaxy-drawer-scrim" : "library-page-surface"} onClick={onClose}>
      <main className={onClose ? "galaxy-drawer library-drawer" : "galaxy-drawer library-drawer library-drawer--standalone"} onClick={(event) => event.stopPropagation()} aria-label="Library">
        <header className="galaxy-drawer__header">
          <div><span className="galaxy-drawer__eyebrow">Observatory library</span><h2>Library</h2></div>
          {onClose ? <button type="button" onClick={onClose} aria-label="Close library" title="Close library">×</button> : <Link href="/" aria-label="Back to briefing">Back to briefing</Link>}
        </header>
        <div className="library-tabs" role="tablist" aria-label="Library sections">
          {(["saved", "sources"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={initialTab === tab} onClick={() => onTabChange(tab)}>
            {tab === "saved" ? `Saved${payload ? ` · ${payload.saved.length}` : ""}` : `Sources${payload ? ` · ${payload.sources.length}` : ""}`}
          </button>)}
        </div>
        {error ? <div className="galaxy-drawer__state">Library unavailable. Close and try again.</div> : null}
        {!payload && !error ? <div className="library-skeleton" aria-label="Loading library" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div> : null}
        {payload && initialTab === "saved" ? <div className="library-list">
          {payload.saved.length > 0 ? <div className="library-filters"><button type="button" aria-pressed={savedFilter === "all"} onClick={() => setSavedFilter("all")}>All</button><button type="button" aria-pressed={savedFilter === "unread"} onClick={() => setSavedFilter("unread")}>Unread</button><label><span className="sr-only">Filter saved stories by topic</span><select value={savedTopic} onChange={(event) => setSavedTopic(event.target.value)}><option value="all">Every topic</option>{savedTopics.map((topic) => <option key={topic} value={topic}>{topicLabel(topic)}</option>)}</select></label></div> : null}
          {payload.saved.length === 0 ? <div className="library-empty"><strong>Your saved reading list is ready.</strong><p>Save a story from the briefing or universe and it will stay here.</p><Link href="/">Find something worth reading</Link></div> : null}
          {payload.saved.length > 0 && filteredSaved.length === 0 ? <div className="galaxy-drawer__state">No saved stories match these filters.</div> : null}
          {filteredSaved.map((story) => <article key={story.id} className="library-story" data-read={story.read}>
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
            <div><strong>{source.name}</strong><span>
              {source.credibilityTier} · every {source.pollIntervalMinutes}m
              {source.lastSuccessfulFetchAt ? ` · checked ${timeAgo(source.lastSuccessfulFetchAt)} ago` : " · awaiting first check"}
              {source.lastStatus?.startsWith("error") ? " · delayed" : ""}
            </span><span>{source.sourceClass} · {source.topicHints.slice(0, 2).map(topicLabel).join(", ") || source.kind}</span></div>
            <button type="button" onClick={() => toggleSource(source)}>{source.muted ? "Unmute" : "Mute"}</button>
          </div>)}
        </div> : null}
      </main>
    </div>
  );
}
