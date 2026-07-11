"use client";

import { useEffect, useRef, useState } from "react";
import { fullDate, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

export interface ReaderPayload {
  id: number;
  title: string;
  author: string | null;
  sourceName: string;
  publishedAt: string;
  topics: string[];
  contentHtml: string | null;
  excerpt: string | null;
  url: string;
  saved: boolean;
}

/**
 * The reading view. 2D and typographic on purpose — the 3D space is for
 * discovery, this is for consumption. It floats over the still-live scene
 * (dimmed and blurred behind), so closing it returns you to space instead
 * of cutting to a different app.
 */
export function ReaderOverlay({
  item,
  accent,
  onClose,
  onSaveChange,
}: {
  item: ReaderPayload;
  accent: string;
  onClose: (readSeconds: number) => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(item.saved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleMs = useRef(0);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    visibleSince.current = document.visibilityState === "visible" ? Date.now() : null;
    const onVis = () => {
      if (document.visibilityState === "visible") visibleSince.current ??= Date.now();
      else if (visibleSince.current !== null) {
        visibleMs.current += Date.now() - visibleSince.current;
        visibleSince.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const close = () => {
    if (visibleSince.current !== null) {
      visibleMs.current += Date.now() - visibleSince.current;
      visibleSince.current = null;
    }
    onClose(Math.round(visibleMs.current / 1000));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: item.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
    setTimeout(() => setNoted(null), 1500);
  };

  const updateProgress = () => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    setProgress(scrollable > 0 ? Math.min(1, el.scrollTop / scrollable) : 1);
  };

  return (
    <div
      ref={scrollRef}
      onScroll={updateProgress}
      className="reader-surface fixed inset-0 z-40 overflow-y-auto bg-[#090a0d] animate-[reader-in_220ms_ease-out]"
    >
      <div className="reader-progress" style={{ transform: `scaleX(${progress})`, background: accent }} aria-hidden />
      <div className="reader-toolbar sticky top-0 z-10">
        <div className="reader-toolbar__inner">
          <button
            type="button"
            onClick={close}
            className="reader-toolbar__back"
          >
            ← Briefing
          </button>
          <span className="reader-toolbar__source">{item.sourceName}</span>
          <div className="reader-toolbar__actions">
            <button
              type="button"
              onClick={() => {
                sendSignal({ itemId: item.id, type: saved ? "unsave" : "save" });
                setSaved(!saved);
                onSaveChange(!saved);
              }}
              className="cursor-pointer transition-colors"
              style={{ color: saved ? "#ffd66b" : "rgba(255,255,255,0.6)" }}
            >
              {saved ? "Saved" : "Save"}
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              Original <span aria-hidden>↗</span>
            </a>
          </div>
        </div>
      </div>

      <article className="reader-article">
        <header className="reader-article__header">
          <div className="reader-article__topic" style={{ color: accent }}>
            {item.topics.map(topicLabel).join(" / ") || item.sourceName}
          </div>
          <h1>
            {item.title}
          </h1>
          <div className="reader-article__byline">
            <span className="text-white/70">{item.sourceName}</span>
            {item.author ? <> — {item.author}</> : null}
            <> — {fullDate(item.publishedAt)}</>
          </div>
        </header>

        {item.contentHtml ? (
          <div className="reader-body reader-body-dark" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
        ) : (
          <div className="reader-article__fallback">
            {item.excerpt ? <p>{item.excerpt}</p> : null}
            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => sendSignal({ itemId: item.id, type: "open" })} style={{ background: accent }}>
              Read at {item.sourceName} <span aria-hidden>↗</span>
            </a>
          </div>
        )}

        <footer className="reader-feedback">
          <p>Should InFlow bring you more stories like this?</p>
          {noted ? (
            <span style={{ color: accent }}>Preference noted</span>
          ) : (
            <div>
              <button type="button" onClick={() => note("more")}>More like this</button>
              <button type="button" onClick={() => note("less")}>Less like this</button>
            </div>
          )}
        </footer>
      </article>
    </div>
  );
}
