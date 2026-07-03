"use client";

import { useState } from "react";
import { sendSignal } from "../lib/signals-client";

interface Props {
  itemId: number;
  saved: boolean;
  /** Called after the hide-source signal fires so the feed can drop rows. */
  onHideSource?: () => void;
  compact?: boolean;
}

/**
 * The quiet feedback row. These are the levers that teach the feed —
 * deliberately text-only and low-key so they never compete with reading.
 */
export function EntryActions({ itemId, saved: initialSaved, onHideSource, compact }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
    setTimeout(() => setNoted(null), 1600);
  };

  const btn =
    "cursor-pointer transition-colors hover:text-accent " +
    (compact ? "" : "px-0.5");

  return (
    <span
      className={`inline-flex items-center gap-3 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint ${
        compact ? "" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
      }`}
    >
      <button
        type="button"
        className={`${btn} ${saved ? "text-accent" : ""}`}
        onClick={() => {
          sendSignal({ itemId, type: saved ? "unsave" : "save" });
          setSaved(!saved);
        }}
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
      {noted ? (
        <span className="text-accent">{noted === "more" ? "More of this ✓" : "Less of this ✓"}</span>
      ) : (
        <>
          <button type="button" className={btn} onClick={() => note("more")} aria-label="More like this">
            More
          </button>
          <button type="button" className={btn} onClick={() => note("less")} aria-label="Less like this">
            Less
          </button>
        </>
      )}
      {onHideSource ? (
        <button
          type="button"
          className={btn}
          onClick={() => {
            sendSignal({ itemId, type: "hide_source" });
            onHideSource();
          }}
          aria-label="Hide this source"
        >
          Mute
        </button>
      ) : null}
    </span>
  );
}
