"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CameraState, GalaxyEngine, GalaxyPayload, GalaxyStory, GalaxyWirePayload, HudLabel } from "../../galaxy/engine";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import type { BriefingPayload, FeedItemDTO, GalaxyStoryDTO } from "../../lib/feed-data";
import { timeAgo } from "../../lib/format";
import { queueSignal, sendSignal } from "../../lib/signals-client";
import { BriefingPanel, BriefingSkeleton } from "./briefing-panel";
import type { ReaderPayload } from "./reader-overlay";
import { UniverseRail } from "./universe-rail";
import type { WarpTarget } from "./warp-bar";

const STATE_KEY = "inflow-galaxy-state-v2";
const CONTROLS_SEEN_KEY = "inflow-controls-seen";
const ReaderOverlay = dynamic(() => import("./reader-overlay").then((mod) => mod.ReaderOverlay));
const WarpBar = dynamic(() => import("./warp-bar").then((mod) => mod.WarpBar));

type AppMode = "today" | "universe";
interface FocusState { story: GalaxyStory; world: string }

function SearchIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><circle cx="8.5" cy="8.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function UniverseIcon() {
  return <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><ellipse cx="10" cy="10" rx="8" ry="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(-24 10 10)" /></svg>;
}

function BriefingIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M4 4h12v12H4zM7 7h6M7 10h6M7 13h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

function SavedIcon() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M5 3.5h10v13l-5-3.2-5 3.2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

export function GalaxyApp({
  initialWorld,
  initialMode = initialWorld ? "universe" : "today",
  initialItemId = null,
}: {
  initialWorld: string | null;
  initialMode?: AppMode;
  initialItemId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const impressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressed = useRef(new Set<number>());
  const readerCache = useRef(new Map<number, Promise<ReaderPayload | null>>());
  const readerReturnPath = useRef(initialWorld ? `/g/${initialWorld}` : initialMode === "universe" ? "/universe" : "/");

  const [mode, setMode] = useState<AppMode>(initialMode);
  const [briefingStatus, setBriefingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [universeStatus, setUniverseStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<GalaxyPayload | null>(null);
  const [view, setView] = useState<string | null>(initialWorld);
  const [labels, setLabels] = useState<HudLabel[]>([]);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [reading, setReading] = useState<ReaderPayload | null>(null);
  const [diving, setDiving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState<{ id: number; title: string; world: string; sourceName: string }[]>([]);
  const [worldTransition, setWorldTransition] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const fetchReader = useCallback((itemId: number) => {
    const existing = readerCache.current.get(itemId);
    if (existing) return existing;
    const request = fetch(`/api/item/${itemId}`)
      .then((response) => response.ok ? response.json() as Promise<ReaderPayload> : null)
      .catch(() => null);
    readerCache.current.set(itemId, request);
    return request;
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try { localStorage.setItem(CONTROLS_SEEN_KEY, "1"); } catch { /* storage may be unavailable */ }
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const pathForContext = useCallback(() => view ? `/g/${view}` : mode === "universe" ? "/universe" : "/", [mode, view]);

  const openToday = useCallback(() => {
    setSearchOpen(false);
    setMode("today");
    document.title = "Your briefing — InFlow";
    if (location.pathname !== "/") history.pushState({ mode: "today" }, "", "/");
  }, []);

  const openUniverse = useCallback((world?: string | null) => {
    setSearchOpen(false);
    setMode("universe");
    if (world) engineRef.current?.enterWorld(world);
    else if (view) engineRef.current?.exitToGalaxy();
    const path = world ? `/g/${world}` : "/universe";
    if (location.pathname !== path) history.pushState({ mode: "universe", world: world ?? null }, "", path);
    try {
      if (localStorage.getItem(CONTROLS_SEEN_KEY) !== "1") {
        setShowHint(true);
        hintTimer.current = setTimeout(dismissHint, 9000);
      }
    } catch { /* hint is optional */ }
  }, [dismissHint, view]);

  useEffect(() => {
    let cancelled = false;
    const loadUniverse = async () => {
      try {
        const [response, engineModule] = await Promise.all([fetch("/api/galaxy"), import("../../galaxy/engine")]);
        if (!response.ok) throw new Error(`galaxy ${response.status}`);
        const payload = engineModule.hydrateGalaxyPayload(await response.json() as GalaxyWirePayload);
        if (cancelled || !canvasRef.current) return;
        setData(payload);

        let saved: CameraState | null = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null"); } catch { saved = null; }
        const isMobile = innerWidth < 900 || "ontouchstart" in window;
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const initial: CameraState | null = initialWorld
          ? { world: initialWorld, theta: saved?.theta ?? 0.4, phi: saved?.phi ?? 1.25, radius: isMobile ? 19 : 14 }
          : saved;
        const engine = new engineModule.GalaxyEngine(canvasRef.current, payload, {
          onFocus: (story, world) => {
            if (!story || !world) {
              setFocus(null);
              if (impressionTimer.current) clearTimeout(impressionTimer.current);
              return;
            }
            setFocus({ story, world });
            if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
            prefetchTimer.current = setTimeout(() => { void fetchReader(story.id); }, 150);
            if (!impressed.current.has(story.id)) {
              if (impressionTimer.current) clearTimeout(impressionTimer.current);
              impressionTimer.current = setTimeout(() => {
                impressed.current.add(story.id);
                queueSignal({ itemId: story.id, type: "impression" });
              }, 1000);
            }
          },
          onLabels: setLabels,
          onView: (world) => {
            setView(world);
            if (world) {
              setWorldTransition(VISUALS_BY_SLUG.get(world)?.label ?? world);
              if (transitionTimer.current) clearTimeout(transitionTimer.current);
              transitionTimer.current = setTimeout(() => setWorldTransition(null), reducedMotion ? 0 : 900);
            }
            if (location.pathname.startsWith("/item/")) return;
            const path = world ? `/g/${world}` : "/universe";
            document.title = world ? `${VISUALS_BY_SLUG.get(world)?.label ?? world} — InFlow` : "Universe — InFlow";
            if (location.pathname !== path && mode === "universe") history.replaceState({ mode: "universe", world }, "", path);
          },
        }, { isMobile, initial, reducedMotion });
        engineRef.current = engine;
        engine.setPaused(Boolean(reading || searchOpen || mode === "today"));
        (window as unknown as { __inflow?: unknown }).__inflow = engine;
        setSearchIndex(engine.getSearchIndex());
        setUniverseStatus("ready");
        if (initialItemId) {
          const item = await fetchReader(initialItemId);
          if (!cancelled && item) setReading(item);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setUniverseStatus("error");
      }
    };

    (async () => {
      try {
        const response = await fetch("/api/briefing");
        if (!response.ok) throw new Error(`briefing ${response.status}`);
        if (!cancelled) {
          setBriefing(await response.json() as BriefingPayload);
          setBriefingStatus("ready");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setBriefingStatus("error");
      }
      if (!cancelled) void loadUniverse();
    })();

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
    // Engine boot is intentionally one-shot; callbacks own later navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.setPaused(Boolean(searchOpen || reading || mode === "today")); }, [mode, reading, searchOpen]);

  const markStoryRead = useCallback((storyId: number) => {
    engineRef.current?.markRead(storyId);
    setBriefing((current) => current ? {
      ...current,
      newCount: current.stories[String(storyId)]?.isNew ? Math.max(0, current.newCount - 1) : current.newCount,
      stories: current.stories[String(storyId)] ? { ...current.stories, [String(storyId)]: { ...current.stories[String(storyId)], read: true, isNew: false } } : current.stories,
    } : current);
    setData((current) => current ? {
      ...current,
      newCount: current.catchUp.some((story) => story.id === storyId) ? Math.max(0, current.newCount - 1) : current.newCount,
      catchUp: current.catchUp.filter((story) => story.id !== storyId),
    } : current);
  }, []);

  const setStorySaved = useCallback((storyId: number, saved: boolean) => {
    engineRef.current?.setSaved(storyId, saved);
    setBriefing((current) => current?.stories[String(storyId)] ? {
      ...current,
      stories: { ...current.stories, [String(storyId)]: { ...current.stories[String(storyId)], saved } },
    } : current);
    setData((current) => {
      if (!current) return current;
      const update = (story: GalaxyStory) => story.id === storyId ? { ...story, saved } : story;
      return { ...current, today: { ...current.today, entries: current.today.entries.map(update) }, worlds: current.worlds.map((world) => ({ ...world, entries: world.entries.map(update) })), catchUp: current.catchUp.map(update) };
    });
  }, []);

  const finishReaderClose = useCallback((readSeconds: number) => {
    if (reading && readSeconds >= 5) sendSignal({ itemId: reading.id, type: "read_time", value: readSeconds });
    const itemId = reading?.id;
    setReading(null);
    setDiving(false);
    if (history.state?.inflowReader) history.back();
    if (itemId && mode === "universe") setTimeout(() => engineRef.current?.focusStory(itemId), 0);
  }, [mode, reading]);

  const openReaderById = useCallback(async (storyId: number, storyUrl?: string, replaceHistory = false) => {
    sendSignal({ itemId: storyId, type: "open" });
    setDiving(Boolean(engineRef.current && mode === "universe"));
    const [item] = await Promise.all([
      fetchReader(storyId),
      mode === "universe" ? engineRef.current?.diveIntoStory(storyId) : Promise.resolve(),
    ]);
    markStoryRead(storyId);
    setDiving(false);
    if (item) {
      setReading(item);
      const returnPath = readerReturnPath.current = pathForContext();
      const state = { inflowReader: true, itemId: storyId, returnPath };
      if (replaceHistory) history.replaceState(state, "", `/item/${storyId}`);
      else if (!location.pathname.startsWith("/item/")) history.pushState(state, "", `/item/${storyId}`);
    } else if (storyUrl) open(storyUrl, "_blank", "noopener");
  }, [fetchReader, markStoryRead, mode, pathForContext]);

  const openReader = useCallback((story: GalaxyStory | GalaxyStoryDTO | FeedItemDTO) => {
    void openReaderById(story.id, story.url);
  }, [openReaderById]);

  useEffect(() => {
    const persist = () => {
      const camera = engineRef.current?.getCameraState();
      if (camera) localStorage.setItem(STATE_KEY, JSON.stringify(camera));
    };
    const onPop = async () => {
      const itemMatch = location.pathname.match(/^\/item\/(\d+)/);
      if (itemMatch && history.state?.inflowReader) {
        const item = await fetchReader(Number(itemMatch[1]));
        if (item) setReading(item);
        return;
      }
      setReading(null);
      setSearchOpen(false);
      if (location.pathname === "/") {
        setMode("today");
        return;
      }
      setMode("universe");
      const match = location.pathname.match(/^\/g\/([a-z-]+)/);
      if (match) engineRef.current?.enterWorld(match[1], true);
      else engineRef.current?.exitToGalaxy();
    };
    const interval = setInterval(persist, 4000);
    addEventListener("pagehide", persist);
    addEventListener("popstate", onPop);
    return () => {
      clearInterval(interval);
      removeEventListener("pagehide", persist);
      removeEventListener("popstate", onPop);
    };
  }, [fetchReader]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (reading || searchOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "Escape" && mode === "universe") {
        if (focus) engineRef.current?.clearFocus();
        else if (view) engineRef.current?.exitToGalaxy();
        else openToday();
      } else if (mode === "universe" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (view) engineRef.current?.stepWorld(direction); else engineRef.current?.rotateOverview(direction);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [focus, mode, openToday, reading, searchOpen, view]);

  const muteSource = useCallback((story: GalaxyStory) => {
    sendSignal({ itemId: story.id, type: "hide_source" });
    engineRef.current?.clearFocus();
    setToast(`${story.sourceName} muted`);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const readerQueue = useMemo(() => {
    if (mode === "today" && briefing) return [...briefing.essentialIds, ...briefing.moreIds];
    if (!data) return [];
    const world = view === "today" ? data.today : data.worlds.find((candidate) => candidate.slug === view);
    return (world ?? data.today).entries.map((story) => story.id);
  }, [briefing, data, mode, view]);
  const readerIndex = reading ? readerQueue.indexOf(reading.id) : -1;
  const accent = view ? VISUALS_BY_SLUG.get(view)?.css ?? "#8ba2ff" : "#8ba2ff";
  const visibleLabels = labels.filter((label) => label.kind === "world" || (focus && label.kind === "story" && label.text === focus.story.title));
  const freshness = briefing?.freshness ?? data?.freshness;

  return (
    <div className="observatory-shell fixed inset-0 bg-[#04040a] text-white overflow-hidden" data-mode={mode}>
      <canvas ref={canvasRef} onPointerDown={() => { if (showHint) dismissHint(); }} className="galaxy-canvas absolute inset-0 touch-none" aria-hidden="true" tabIndex={-1} />
      <div className="galaxy-label-layer absolute inset-0 pointer-events-none select-none" aria-hidden>
        {visibleLabels.map((label) => <div key={label.key} className="galaxy-label" style={{ left: label.x, top: label.y, opacity: label.opacity }}><strong>{label.text}</strong>{label.sub ? <span style={{ color: label.color }}>{label.sub}</span> : null}</div>)}
      </div>

      <header className="inflow-shell-header">
        <button type="button" className="galaxy-brand" onClick={openToday}><span style={{ background: accent }} aria-hidden /><strong>INFLOW</strong></button>
        <nav className="inflow-primary-nav" aria-label="Primary navigation">
          <button type="button" aria-current={mode === "today" ? "page" : undefined} onClick={openToday}>Today</button>
          <button type="button" aria-current={mode === "universe" ? "page" : undefined} onClick={() => openUniverse(null)}>Universe</button>
          <Link href="/saved">Library</Link>
          <button type="button" onClick={() => setSearchOpen(true)}>Search</button>
        </nav>
        <div className="inflow-shell-status" role="status">{freshness?.staleSourceCount ? `${freshness.staleSourceCount} sources delayed` : freshness?.latestCheckedAt ? `Checked ${timeAgo(freshness.latestCheckedAt)} ago` : "Checking sources…"}</div>
        <button type="button" className="inflow-mobile-search" onClick={() => setSearchOpen(true)} aria-label="Search"><SearchIcon /></button>
      </header>

      {mode === "today" ? briefing ? <BriefingPanel payload={briefing} onOpen={openReader} onOpenUniverse={() => openUniverse(null)} onSelectWorld={(slug) => openUniverse(slug)} onSaveChange={setStorySaved} /> : briefingStatus === "error" ? <div className="briefing-error"><strong>Your briefing is unavailable.</strong><button type="button" onClick={() => location.reload()}>Try again</button></div> : <BriefingSkeleton /> : null}

      {mode === "universe" ? data && universeStatus === "ready" ? <UniverseRail data={data} view={view} focus={focus} onFocus={(story) => engineRef.current?.focusStory(story.id)} onOpen={openReader} onBack={() => view ? engineRef.current?.exitToGalaxy() : openToday()} onClear={() => engineRef.current?.clearFocus()} onMute={muteSource} onSaveChange={setStorySaved} /> : <div className="universe-loading" role="status"><span /><strong>{universeStatus === "error" ? "Universe unavailable" : "Charting your universe…"}</strong>{universeStatus === "error" ? <button type="button" onClick={() => location.reload()}>Retry</button> : null}</div> : null}

      {showHint && mode === "universe" ? <div className="galaxy-control-hint" role="status"><span>Drag to move · scroll or pinch to zoom · choose any story from the rail</span><button type="button" onClick={dismissHint}>Got it</button></div> : null}
      {worldTransition && mode === "universe" ? <div className="world-transition" role="status">{worldTransition}</div> : null}

      <div className="dive-cover" data-active={diving} aria-hidden />
      {reading ? <ReaderOverlay key={reading.id}
        item={reading}
        accent={accent}
        contextLabel={mode === "universe" ? (view ? VISUALS_BY_SLUG.get(view)?.label ?? "Universe" : "Universe") : "Briefing"}
        hasPrevious={readerIndex > 0}
        hasNext={readerIndex >= 0 && readerIndex < readerQueue.length - 1}
        onPrevious={() => readerIndex > 0 && void openReaderById(readerQueue[readerIndex - 1], undefined, true)}
        onNext={() => readerIndex >= 0 && readerIndex < readerQueue.length - 1 && void openReaderById(readerQueue[readerIndex + 1], undefined, true)}
        onExplore={() => { finishReaderClose(0); setTimeout(() => openUniverse(view), 0); }}
        onClose={finishReaderClose}
        onSaveChange={(saved) => setStorySaved(reading.id, saved)}
      /> : null}

      {searchOpen ? <WarpBar stories={searchIndex} onWarp={(target: WarpTarget) => {
        setSearchOpen(false);
        if (target.kind === "world") openUniverse(String(target.id));
        else void openReaderById(Number(target.id));
      }} onClose={() => setSearchOpen(false)} /> : null}

      <nav className="inflow-mobile-nav" aria-label="Primary navigation">
        <button type="button" aria-current={mode === "today" ? "page" : undefined} onClick={openToday}><BriefingIcon /><span>Today</span></button>
        <button type="button" aria-current={mode === "universe" ? "page" : undefined} onClick={() => openUniverse(null)}><UniverseIcon /><span>Universe</span></button>
        <Link href="/saved"><SavedIcon /><span>Saved</span></Link>
        <button type="button" onClick={() => setSearchOpen(true)}><SearchIcon /><span>Search</span></button>
      </nav>

      {toast ? <div className="galaxy-toast" role="status">{toast}</div> : null}
    </div>
  );
}
