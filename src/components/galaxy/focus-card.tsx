"use client";

import { useState } from "react";
import type { GalaxyStory } from "../../galaxy/engine";
import { timeAgo } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

/**
 * The tethered story card — appears beside a focused story object. Carries
 * the full signal vocabulary (save / more / less / mute source) plus the
 * dive into reading. On small screens it docks as a bottom sheet.
 */
export function FocusCard({
  story,
  accent,
  x,
  y,
  isMobile,
  fresh,
  onRead,
  onMuteSource,
  onSaveChange,
}: {
  story: GalaxyStory;
  accent: string;
  x: number;
  y: number;
  isMobile: boolean;
  /** Published within the last hour — computed by the caller (event context). */
  fresh: boolean;
  onRead: () => void;
  onMuteSource: () => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(story.saved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: story.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
    setTimeout(() => setNoted(null), 1500);
  };

  const style: React.CSSProperties = isMobile
    ? { left: 12, right: 12, bottom: 14 }
    : {
        left: Math.min(Math.max(x + 26, 16), innerWidth - 396),
        top: Math.min(Math.max(y - 60, 64), innerHeight - 260),
        width: 380,
      };

  return (
    <div
      className="fixed z-30 border backdrop-blur-md animate-[card-in_180ms_ease-out] pointer-events-auto"
      style={{
        ...style,
        background: "rgba(8,10,16,0.85)",
        borderColor: `${accent}55`,
        borderLeft: `3px solid ${accent}`,
        padding: "16px 18px 14px",
      }}
    >
      <div className="flex justify-between items-baseline font-mono text-[0.6rem] tracking-[0.2em] uppercase" style={{ color: accent }}>
        <span className="truncate">{story.sourceName}</span>
        <span className="shrink-0 ml-3" style={{ color: fresh ? "#ff6b4a" : "rgba(255,255,255,0.4)" }}>
          {fresh ? "● " : ""}
          {timeAgo(story.publishedAt)} ago
        </span>
      </div>
      <h2 className="font-display font-extrabold text-[18px] leading-[1.16] tracking-[-0.02em] text-white mt-2">
        {story.title}
      </h2>
      {story.excerpt ? (
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-white/60 line-clamp-2">{story.excerpt}</p>
      ) : null}
      <div className="mt-2.5 font-mono text-[0.575rem] tracking-[0.14em] uppercase text-white/35">
        {story.alsoCoveredBy.length > 0 ? <>also at {story.alsoCoveredBy.map((c) => c.sourceName).join(", ")} — </> : null}
        {story.read ? "read" : "unread"}
        {story.readingMinutes ? <> — {story.readingMinutes} min</> : null}
        {story.exploration ? " — exploring" : ""}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t font-mono text-[0.625rem] tracking-[0.16em] uppercase" style={{ borderColor: `${accent}22` }}>
        <button
          type="button"
          onClick={() => {
            sendSignal({ itemId: story.id, type: saved ? "unsave" : "save" });
            setSaved(!saved);
            onSaveChange(!saved);
          }}
          className="cursor-pointer transition-colors"
          style={{ color: saved ? "#ffd66b" : "rgba(255,255,255,0.55)" }}
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
        {noted ? (
          <span style={{ color: accent }}>{noted === "more" ? "More ✓" : "Less ✓"}</span>
        ) : (
          <>
            <button type="button" onClick={() => note("more")} className="cursor-pointer text-white/55 hover:text-white transition-colors">
              More
            </button>
            <button type="button" onClick={() => note("less")} className="cursor-pointer text-white/55 hover:text-white transition-colors">
              Less
            </button>
          </>
        )}
        <button type="button" onClick={onMuteSource} className="cursor-pointer text-white/55 hover:text-white transition-colors">
          Mute src
        </button>
        <button
          type="button"
          onClick={onRead}
          className="cursor-pointer ml-auto font-medium px-3.5 py-1.5 text-black transition-opacity hover:opacity-90"
          style={{ background: accent }}
        >
          Read →
        </button>
      </div>
    </div>
  );
}
