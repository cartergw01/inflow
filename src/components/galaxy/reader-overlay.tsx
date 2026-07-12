"use client";

import { useEffect, useRef, useState } from "react";
import { fullDate, timeAgo, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";
import { readerSwipeDirection } from "./reader-navigation";

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

export interface ReaderNeighbor {
  id: number;
  title: string;
  sourceName: string;
}

type ReaderTheme = "light" | "dark";
type ReaderSize = "small" | "medium" | "large";
type ReaderMeasure = "narrow" | "regular" | "wide";
interface ReaderPreferences { theme: ReaderTheme; size: ReaderSize; measure: ReaderMeasure }
const READER_PREFS_KEY = "inflow-reader-preferences";

function readPreferences(): ReaderPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(READER_PREFS_KEY) ?? "null") as Partial<ReaderPreferences> | null;
    const systemTheme: ReaderTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return {
      theme: stored?.theme === "light" || stored?.theme === "dark" ? stored.theme : systemTheme,
      size: stored?.size === "small" || stored?.size === "large" ? stored.size : "medium",
      measure: stored?.measure === "narrow" || stored?.measure === "wide" ? stored.measure : "regular",
    };
  } catch {
    return { theme: "dark", size: "medium", measure: "regular" };
  }
}

function SettingsIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M4 5h12M4 10h12M4 15h12M7 3v4M13 8v4M8 13v4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

export function ReaderOverlay({ item, accent, contextLabel = "Briefing", queueLabel = contextLabel, position, total, previous, next, pending = false, onPrevious, onNext, onExplore, onClose, onSaveChange }: {
  item: ReaderPayload;
  accent: string;
  contextLabel?: string;
  queueLabel?: string;
  position: number;
  total: number;
  previous: ReaderNeighbor | null;
  next: ReaderNeighbor | null;
  pending?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onExplore?: () => void;
  onClose: (readSeconds: number) => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(item.saved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);
  const [progress, setProgress] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<ReaderPreferences>(readPreferences);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const visibleMs = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number; eligible: boolean } | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      previousFocus.current?.focus();
    };
  }, []);

  const updatePreferences = (next: Partial<ReaderPreferences>) => setPreferences((current) => {
    const value = { ...current, ...next };
    try { localStorage.setItem(READER_PREFS_KEY, JSON.stringify(value)); } catch { /* optional persistence */ }
    return value;
  });

  const close = () => {
    if (visibleSince.current !== null) {
      visibleMs.current += Date.now() - visibleSince.current;
      visibleSince.current = null;
    }
    onClose(Math.round(visibleMs.current / 1000));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false); else close();
      }
      if (event.key === "Tab" && scrollRef.current) {
        const focusable = [...scrollRef.current.querySelectorAll<HTMLElement>("button, a[href]")].filter((element) => !element.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

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

  const swipeBlocked = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, summary, table, pre, code, [data-horizontal-scroll]"));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    swipeStart.current = { x: event.clientX, y: event.clientY, eligible: !swipeBlocked(event.target) };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start?.eligible || pending || swipeBlocked(event.target)) return;
    const direction = readerSwipeDirection({ startX: start.x, startY: start.y, endX: event.clientX, endY: event.clientY, viewportWidth: innerWidth });
    if (direction === "next" && next) onNext?.();
    if (direction === "previous" && previous) onPrevious?.();
  };

  return (
    <div ref={scrollRef} onScroll={updateProgress} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeStart.current = null; }} className="reader-surface fixed inset-0 z-[60] overflow-y-auto animate-[reader-in_220ms_ease-out]" role="dialog" aria-modal="true" aria-labelledby={`reader-title-${item.id}`} aria-busy={pending} data-reader-theme={preferences.theme} data-reader-size={preferences.size} data-reader-measure={preferences.measure}>
      <div className="reader-progress" style={{ transform: `scaleX(${progress})`, background: accent }} aria-hidden />
      <div className="reader-toolbar sticky top-0 z-10">
        <div className="reader-toolbar__inner">
          <button ref={backRef} type="button" onClick={close} className="reader-toolbar__back">← {contextLabel}</button>
          <span className="reader-toolbar__source">{item.sourceName}</span>
          <div className="reader-toolbar__actions">
            <div className="reader-toolbar__step"><button type="button" disabled={!previous || pending} onClick={onPrevious}>← Previous</button><span>{position} / {total}</span><button type="button" disabled={!next || pending} onClick={onNext}>Next →</button></div>
            <button type="button" className="reader-toolbar__save" data-saved={saved} onClick={() => {
              sendSignal({ itemId: item.id, type: saved ? "unsave" : "save" });
              setSaved(!saved);
              onSaveChange(!saved);
            }}>{saved ? "Saved" : "Save"}</button>
            <a href={item.url} target="_blank" rel="noopener noreferrer">Original <span aria-hidden>↗</span></a>
            <button type="button" className="reader-toolbar__settings" aria-label="Reader settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><SettingsIcon /></button>
          </div>
        </div>
        {settingsOpen ? <div className="reader-settings" aria-label="Reader settings">
          <fieldset><legend>Text size</legend>{(["small", "medium", "large"] as const).map((size) => <button key={size} type="button" aria-pressed={preferences.size === size} onClick={() => updatePreferences({ size })}>{size}</button>)}</fieldset>
          <fieldset><legend>Measure</legend>{(["narrow", "regular", "wide"] as const).map((measure) => <button key={measure} type="button" aria-pressed={preferences.measure === measure} onClick={() => updatePreferences({ measure })}>{measure}</button>)}</fieldset>
          <fieldset><legend>Theme</legend>{(["light", "dark"] as const).map((theme) => <button key={theme} type="button" aria-pressed={preferences.theme === theme} onClick={() => updatePreferences({ theme })}>{theme}</button>)}</fieldset>
        </div> : null}
        <div className="reader-mobile-step" aria-label="Story navigation">
          <button type="button" disabled={!previous || pending} onClick={onPrevious}>← Previous</button>
          <span>{position} of {total} · {queueLabel}</span>
          <button type="button" disabled={!next || pending} onClick={onNext}>Next →</button>
        </div>
      </div>

      <article className="reader-article">
        {item.status !== "active" || item.verificationStatus === "unconfirmed" ? <div className="reader-trust-banner" data-status={item.status} data-verification={item.verificationStatus}><strong>{item.status === "retracted" ? "Retracted" : item.status === "corrected" ? "Corrected" : item.status === "updated" ? "Updated" : "Unconfirmed"}</strong><span>{item.correctionNote ?? (item.verificationStatus === "unconfirmed" ? "This social-origin claim has not yet been corroborated by an established outlet." : "The source changed this story after publication.")}</span></div> : null}
        <header className="reader-article__header">
          <div className="reader-article__topic" style={{ color: accent }}>{item.topics.map(topicLabel).join(" / ") || item.sourceName}</div>
          <h1 id={`reader-title-${item.id}`}>{item.title}</h1>
          {item.excerpt && item.excerpt.trim().toLowerCase() !== item.title.trim().toLowerCase() ? <p className="reader-article__dek">{item.excerpt}</p> : null}
          <div className="reader-article__byline">
            <div>{item.sourceHomepageUrl ? <a href={item.sourceHomepageUrl} target="_blank" rel="noopener noreferrer"><span>{item.sourceName}</span></a> : <span>{item.sourceName}</span>}{item.author ? <> · {item.author}</> : null}</div>
            <div>{fullDate(item.publishedAt)} · {timeAgo(item.publishedAt)} ago{item.sourceCheckedAt ? <> · Feed checked {timeAgo(item.sourceCheckedAt)} ago</> : null}</div>
            <small>{item.verificationStatus === "corroborated" ? "Corroborated reporting" : item.verificationStatus === "unconfirmed" ? "Unconfirmed social report" : `${item.credibilityTier} source`}</small>
          </div>
        </header>
        {item.contentHtml ? <div className="reader-body reader-body-system" dangerouslySetInnerHTML={{ __html: item.contentHtml }} /> : <div className="reader-article__fallback">{item.excerpt ? <p>{item.excerpt}</p> : <p>This publisher did not make the story text available to InFlow.</p>}<a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => sendSignal({ itemId: item.id, type: "open" })} style={{ background: accent }}>Continue at {item.sourceName} <span aria-hidden>↗</span></a></div>}
        <footer className="reader-feedback">
          {next ? <button type="button" className="reader-next" disabled={pending} onClick={onNext}><span>Next in {queueLabel}</span><strong>{next.title} →</strong></button> : null}
          {onExplore ? <button type="button" className="reader-explore" onClick={onExplore}>Explore this story in the universe</button> : null}
          <p>Should InFlow bring you more stories like this?</p>
          {noted ? <span style={{ color: accent }}>Preference noted</span> : <div><button type="button" onClick={() => note("more")}>More like this</button><button type="button" onClick={() => note("less")}>Less like this</button></div>}
        </footer>
      </article>
    </div>
  );
}
