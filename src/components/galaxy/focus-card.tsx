"use client";

import { useState } from "react";
import type { GalaxyStory } from "../../galaxy/engine";
import { timeAgo } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

function storyContext(story: GalaxyStory, worldLabel: string) {
  if (story.excerpt) {
    const clean = story.excerpt.replace(/\s+/g, " ").trim();
    return clean.length <= 150 ? clean : `${clean.slice(0, 147).trimEnd()}…`;
  }
  if (story.alsoCoveredBy.length) return `Covered by ${story.alsoCoveredBy.length + 1} sources.`;
  if (Date.now() - new Date(story.publishedAt).getTime() < 3_600_000) return `Breaking now in ${worldLabel}.`;
  return story.readingMinutes ? `${story.readingMinutes} minute read.` : `Recommended in ${worldLabel}.`;
}

function verificationLabel(story: GalaxyStory): string {
  if (story.status === "retracted") return "Retracted at source";
  if (story.status === "corrected") return "Corrected at source";
  if (story.status === "updated") return "Updated at source";
  if (story.verificationStatus === "unconfirmed") return "Unconfirmed · single-source social report";
  if (story.verificationStatus === "corroborated") return `Corroborated by ${story.alsoCoveredBy.length + 1} sources`;
  return `Reported by ${story.sourceName}`;
}

export function StoryFocus({ story, accent, worldLabel, onRead, onDismiss, onMuteSource, onSaveChange }: {
  story: GalaxyStory;
  accent: string;
  worldLabel: string;
  onRead: () => void;
  onDismiss: () => void;
  onMuteSource: () => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(story.saved);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);
  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: story.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
  };

  return (
    <aside className="story-focus" style={{ "--focus-accent": accent } as React.CSSProperties} aria-label="Selected story">
      <button type="button" className="story-focus__close" onClick={onDismiss} aria-label="Dismiss story" title="Dismiss story">×</button>
      <div className="story-focus__meta">
        <span className="story-focus__source">{story.sourceName}</span>
        <span>{story.credibilityTier} source</span>
        <span>{timeAgo(story.publishedAt)} ago</span>
        {story.sourceCheckedAt ? <span>feed checked {timeAgo(story.sourceCheckedAt)} ago</span> : null}
      </div>
      <h2>{story.title}</h2>
      <p>{storyContext(story, worldLabel)}</p>
      <div className="story-focus__verification" data-verification={story.verificationStatus} data-status={story.status}>
        {verificationLabel(story)}
        {story.author ? <span> · {story.author}</span> : null}
      </div>
      <div className="story-focus__actions">
        <button type="button" className="story-focus__save" aria-pressed={saved} onClick={() => {
          sendSignal({ itemId: story.id, type: saved ? "unsave" : "save" });
          setSaved(!saved);
          onSaveChange(!saved);
        }}>{saved ? "Saved" : "Save"}</button>
        <button type="button" className="story-focus__read" onClick={onRead}>Read <span aria-hidden>→</span></button>
        <button type="button" className="story-focus__more" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Tune this recommendation" title="Tune this recommendation">···</button>
      </div>
      {menuOpen ? <div className="story-focus__menu">
        {noted ? <span>{noted === "more" ? "More like this" : "Less like this"} noted</span> : <>
          <button type="button" onClick={() => note("more")}>More like this</button>
          <button type="button" onClick={() => note("less")}>Less like this</button>
          <button type="button" onClick={onMuteSource}>Mute {story.sourceName}</button>
        </>}
      </div> : null}
    </aside>
  );
}
