"use client";

import { useState } from "react";
import type { GalaxyStory } from "../../galaxy/engine";
import { timeAgo } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

/** A stable editorial briefing: one ranked story at a time, with tuning kept secondary. */
export function StoryBriefing({
  story,
  accent,
  worldLabel,
  position,
  total,
  onRead,
  onPrevious,
  onNext,
  onMuteSource,
  onSaveChange,
}: {
  story: GalaxyStory;
  accent: string;
  worldLabel: string;
  position: number;
  total: number;
  onRead: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMuteSource: () => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(story.saved);
  const [tuning, setTuning] = useState(false);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: story.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
  };

  return (
    <aside className="story-briefing" style={{ "--briefing-accent": accent } as React.CSSProperties} aria-label="Current briefing story">
      <div className="story-briefing__queue">
        <span>{worldLabel}</span>
        <span>{String(position + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>

      <div className="story-briefing__source">
        <span>{story.sourceName}</span>
        <span>{timeAgo(story.publishedAt)} ago</span>
      </div>

      <h2>{story.title}</h2>
      {story.excerpt ? <p className="story-briefing__excerpt">{story.excerpt}</p> : null}

      <div className="story-briefing__context">
        <span>{story.read ? "Read" : "Unread"}</span>
        {story.readingMinutes ? <span>{story.readingMinutes} min</span> : null}
        {story.alsoCoveredBy.length ? <span>{story.alsoCoveredBy.length + 1} sources</span> : null}
      </div>

      <div className="story-briefing__actions">
        <button
          type="button"
          className="story-briefing__save"
          aria-pressed={saved}
          onClick={() => {
            sendSignal({ itemId: story.id, type: saved ? "unsave" : "save" });
            setSaved(!saved);
            onSaveChange(!saved);
          }}
        >
          {saved ? "Saved" : "Save"}
        </button>
        <button type="button" className="story-briefing__read" onClick={onRead}>
          Read story
          <span aria-hidden>→</span>
        </button>
      </div>

      <div className="story-briefing__footer">
        <div className="story-briefing__steps" aria-label="Browse stories">
          <button type="button" onClick={onPrevious} aria-label="Previous story" title="Previous story">←</button>
          <button type="button" onClick={onNext} aria-label="Next story" title="Next story">→</button>
        </div>
        <button
          type="button"
          className="story-briefing__tune"
          onClick={() => setTuning((open) => !open)}
          aria-expanded={tuning}
        >
          Tune feed <span aria-hidden>{tuning ? "−" : "+"}</span>
        </button>
      </div>

      {tuning ? (
        <div className="story-briefing__tuning">
          {noted ? (
            <span>{noted === "more" ? "More stories like this" : "Fewer stories like this"}</span>
          ) : (
            <>
              <button type="button" onClick={() => note("more")}>More like this</button>
              <button type="button" onClick={() => note("less")}>Less like this</button>
              <button type="button" onClick={onMuteSource}>Mute {story.sourceName}</button>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}
