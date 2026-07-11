"use client";

import { useEffect, useRef, useState } from "react";
import { fullDate, timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

export interface ReaderPayload {
  id: number;
  title: string;
  author: string | null;
  sourceName: string;
  sourceHomepageUrl: string | null;
  credibilityTier: "major" | "independent" | "social";
  sourceCheckedAt: string | null;
  publishedAt: string;
  updatedAt: string;
  status: "active" | "updated" | "corrected" | "retracted";
  verificationStatus: "reported" | "corroborated" | "unconfirmed";
  correctionNote: string | null;
  topics: string[];
  contentHtml: string | null;
  excerpt: string | null;
  url: string;
  saved: boolean;
}

export function ReaderOverlay({ item, accent, onClose, onSaveChange }: {
  item: ReaderPayload;
  accent: string;
  onClose: (readSeconds: number) => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(item.saved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const visibleMs = useRef(0);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    backRef.current?.focus();
    scrollRef.current?.querySelectorAll("img").forEach((image) => {
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
    });
    visibleSince.current = document.visibilityState === "visible" ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === "visible") visibleSince.current ??= Date.now();
      else if (visibleSince.current !== null) {
        visibleMs.current += Date.now() - visibleSince.current;
        visibleSince.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const close = () => {
    if (visibleSince.current !== null) {
      visibleMs.current += Date.now() - visibleSince.current;
      visibleSince.current = null;
    }
    onClose(Math.round(visibleMs.current / 1000));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: item.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
  };

  const updateProgress = () => {
    const element = scrollRef.current;
    if (!element) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    setProgress(scrollable > 0 ? Math.min(1, element.scrollTop / scrollable) : 1);
  };

  return (
    <div ref={scrollRef} onScroll={updateProgress} className="reader-surface fixed inset-0 z-[60] overflow-y-auto animate-[reader-in_220ms_ease-out]" role="dialog" aria-modal="true" aria-labelledby={`reader-title-${item.id}`}>
      <div className="reader-progress" style={{ transform: `scaleX(${progress})`, background: accent }} aria-hidden />
      <div className="reader-toolbar sticky top-0 z-10">
        <div className="reader-toolbar__inner">
          <button ref={backRef} type="button" onClick={close} className="reader-toolbar__back">← Briefing</button>
          <span className="reader-toolbar__source">{item.sourceName}</span>
          <div className="reader-toolbar__actions">
            <button type="button" className="reader-toolbar__save cursor-pointer" data-saved={saved} onClick={() => {
              sendSignal({ itemId: item.id, type: saved ? "unsave" : "save" });
              setSaved(!saved);
              onSaveChange(!saved);
            }}>{saved ? "Saved" : "Save"}</button>
            <a href={item.url} target="_blank" rel="noopener noreferrer">Original <span aria-hidden>↗</span></a>
          </div>
        </div>
      </div>

      <article className="reader-article">
        {item.status !== "active" || item.verificationStatus === "unconfirmed" ? (
          <div className="reader-trust-banner" data-status={item.status} data-verification={item.verificationStatus}>
            <strong>{item.status === "retracted" ? "Retracted" : item.status === "corrected" ? "Corrected" : item.status === "updated" ? "Updated" : "Unconfirmed"}</strong>
            <span>{item.correctionNote ?? (item.verificationStatus === "unconfirmed" ? "This social-origin claim has not yet been corroborated by an established outlet." : "The source changed this story after publication.")}</span>
          </div>
        ) : null}
        <header className="reader-article__header">
          <div className="reader-article__topic" style={{ color: accent }}>{item.topics.map(topicLabel).join(" / ") || item.sourceName}</div>
          <h1 id={`reader-title-${item.id}`}>{item.title}</h1>
          <div className="reader-article__byline">
            {item.sourceHomepageUrl ? <a href={item.sourceHomepageUrl} target="_blank" rel="noopener noreferrer"><span>{item.sourceName}</span></a> : <span>{item.sourceName}</span>}
            {item.author ? <> — {item.author}</> : null}
            <> — {fullDate(item.publishedAt)} · {timeAgo(item.publishedAt)} ago</>
            {item.sourceCheckedAt ? <> · feed checked {timeAgo(item.sourceCheckedAt)} ago</> : null}
            <small>{item.verificationStatus === "corroborated" ? "Corroborated reporting" : item.verificationStatus === "unconfirmed" ? "Unconfirmed social report" : `${item.credibilityTier} source`}</small>
          </div>
        </header>
        {item.contentHtml ? <div className="reader-body reader-body-system" dangerouslySetInnerHTML={{ __html: item.contentHtml }} /> : <div className="reader-article__fallback">
          {item.excerpt ? <p>{item.excerpt}</p> : null}
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => sendSignal({ itemId: item.id, type: "open" })} style={{ background: accent }}>Read at {item.sourceName} <span aria-hidden>↗</span></a>
        </div>}
        <footer className="reader-feedback"><p>Should InFlow bring you more stories like this?</p>
          {noted ? <span style={{ color: accent }}>Preference noted</span> : <div><button type="button" onClick={() => note("more")}>More like this</button><button type="button" onClick={() => note("less")}>Less like this</button></div>}
        </footer>
      </article>
    </div>
  );
}
