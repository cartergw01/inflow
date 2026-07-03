"use client";

import { useState } from "react";
import type { SourceWithState } from "../lib/feed-data";
import { topicLabel } from "../lib/format";

const KIND_LABELS: Record<string, string> = {
  substack: "Substack",
  rss: "RSS",
  hn: "Hacker News",
  bluesky: "Bluesky",
  x: "X",
};

export function SourceRow({ source }: { source: SourceWithState }) {
  const [muted, setMuted] = useState(source.muted);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await fetch("/api/mute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, muted: !muted }),
      });
      setMuted(!muted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`py-3.5 border-b border-rule flex items-baseline justify-between gap-4 ${muted ? "opacity-45" : ""}`}>
      <div className="min-w-0">
        <span className="font-serif font-medium text-[1.05rem]">
          {source.homepageUrl ? (
            <a href={source.homepageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </span>
        <span className="ml-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          {KIND_LABELS[source.kind] ?? source.kind}
          {source.topicHints.length ? <> · {source.topicHints.map(topicLabel).join(", ")}</> : null}
        </span>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`cursor-pointer font-mono text-[0.65rem] uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
          muted ? "text-accent hover:text-ink-soft" : "text-ink-faint hover:text-accent"
        }`}
      >
        {muted ? "Unmute" : "Mute"}
      </button>
    </li>
  );
}
