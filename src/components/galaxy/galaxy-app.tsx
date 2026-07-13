"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CameraState, GalaxyEngine, GalaxyPayload, GalaxyStory, GalaxyWirePayload, HudLabel } from "../../galaxy/engine";
import { initialGalaxyCamera, type GalaxyAppMode } from "../../galaxy/navigation-state";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import type { BriefingPayload, FeedItemDTO, GalaxyStoryDTO } from "../../lib/feed-data";
import { timeAgo } from "../../lib/format";
import { queueSignal, sendSignal } from "../../lib/signals-client";
import { BriefingPanel, BriefingSkeleton } from "./briefing-panel";
import type { ReaderNeighbor, ReaderPayload } from "./reader-overlay";
import { UniverseRail } from "./universe-rail";
import type { WarpTarget } from "./warp-bar";

const STATE_KEY = "inflow-galaxy-state-v2";
const CONTROLS_SEEN_KEY = "inflow-controls-seen";
const ReaderOverlay = dynamic(() => import("./reader-overlay").then((mod) => mod.ReaderOverlay));
const WarpBar = dynamic(() => import("./warp-bar").then((mod) => mod.WarpBar));

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
  initialMode?: GalaxyAppMode;
  initialItemId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const modeRef = useRef<GalaxyAppMode>(initialMode);
  const impressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressed = useRef(new Set<number>());
  const readerCache = useRef(new Map<number, Promise<ReaderPayload | null>>());
  const readerReturnPath = useRef(initialWorld ? `/g/${initialWorld}` : initialMode === "universe" ? "/universe" : "/");
  const readerRestoresFocus = useRef(false);
  const readerNavigationLock = useRef(false);

  const [mode, setMode] = useState<GalaxyAppMode>(initialMode);
  const [briefingStatus, setBriefingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null);
  const [universeStatus, setUniverseStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<GalaxyPayload | null>(null);
  const [view, setView] = useState<string | null>(initialWorld);
  const [labels, setLabels] = useState<HudLabel[]>([]);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [reading, setReading] = useState<ReaderPayload | null>(null);
  const [readerPending, setReaderPending] = useState(false);
  const [diving, setDiving] = useState(false);
  const [compactUniverse, setCompactUniverse] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState<{ id: number; title: string; world: string; sourceName: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const query = matchMedia("(max-width: 900px)");
    const update = () => setCompactUniverse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  const pathForContext = useCallback(() => mode === "today" ? "/" : view ? `/g/${view}` : "/universe", [mode, view]);

  const openToday = useCallback(() => {
    setSearchOpen(false);
    modeRef.current = "today";
    engineRef.current?.showWorldSnapshot("today");
    setMode("today");
    document.title = "Today — InFlow";
    if (location.pathname !== "/") history.pushState({ mode: "today" }, "", "/");
  }, []);

  const openUniverse = useCallback((world?: string | null) => {
    setSearchOpen(false);
    modeRef.current = "universe";
    setMode("universe");
    const engine = engineRef.current;
    if (engine) {
      if (world) engine.enterWorld(world, { origin: "interactive" });
      else engine.exitToGalaxy({ origin: "interactive" });
    } else {
      const path = world ? `/g/${world}` : "/universe";
      if (location.pathname !== path) history.pushState({ mode: "universe", world: world ?? null }, "", path);
    }
    try {
      if (localStorage.getItem(CONTROLS_SEEN_KEY) !== "1") {
        setShowHint(true);
        hintTimer.current = setTimeout(dismissHint, 9000);
      }
    } catch { /* hint is optional */ }
  }, [dismissHint]);

  useEffect(() => {
    let cancelled = false;
    const loadUniverse = async () => {
      try {
        const [response, engineModule] = await Promise.all([fetch("/api/galaxy"), import("../../galaxy/engine")]);
        if (response.status === 401) {
          location.replace(`/welcome?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
          return;
        }
        if (!response.ok) throw new Error(`galaxy ${response.status}`);
        const payload = engineModule.hydrateGalaxyPayload(await response.json() as GalaxyWirePayload);
        if (cancelled || !canvasRef.current) return;
        setData(payload);

        let saved: CameraState | null = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null"); } catch { saved = null; }
        const isMobile = innerWidth < 900 || "ontouchstart" in window;
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const initial: CameraState = initialGalaxyCamera({ initialMode, initialWorld, saved, isMobile });
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
          onView: (world, origin) => {
            setView(world);
            if (modeRef.current !== "universe") return;
            if (location.pathname.startsWith("/item/")) return;
            const path = world ? `/g/${world}` : "/universe";
            document.title = world ? `${VISUALS_BY_SLUG.get(world)?.label ?? world} — InFlow` : "Universe — InFlow";
            if (location.pathname !== path) {
              const state = { mode: "universe", world };
              if (origin === "interactive") history.pushState(state, "", path);
              else history.replaceState(state, "", path);
            }
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
        if (response.status === 401) {
          location.replace(`/welcome?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
          return;
        }
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
      today: {
        ...current.today,
        newCount: current.today.entries.some((story) => story.id === storyId && story.isNew) ? Math.max(0, current.today.newCount - 1) : current.today.newCount,
        entries: current.today.entries.map((story) => story.id === storyId ? { ...story, read: true, isNew: false } : story),
      },
      worlds: current.worlds.map((world) => ({
        ...world,
        newCount: world.entries.some((story) => story.id === storyId && story.isNew) ? Math.max(0, world.newCount - 1) : world.newCount,
        entries: world.entries.map((story) => story.id === storyId ? { ...story, read: true, isNew: false } : story),
      })),
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
    setReaderPending(false);
    setDiving(false);
    if (history.state?.inflowReader) history.back();
    if (itemId && mode === "universe" && readerRestoresFocus.current) setTimeout(() => engineRef.current?.focusStory(itemId), 0);
    readerRestoresFocus.current = false;
  }, [mode, reading]);

  const openReaderById = useCallback(async (storyId: number, storyUrl?: string, replaceHistory = false, restoreFocus = false) => {
    if (readerNavigationLock.current) return;
    readerNavigationLock.current = true;
    const sequential = Boolean(reading);
    const shouldDive = !sequential && mode === "universe" && restoreFocus;
    readerRestoresFocus.current = sequential ? readerRestoresFocus.current : restoreFocus;
    sendSignal({ itemId: storyId, type: "open" });
    setReaderPending(true);
    setDiving(shouldDive && Boolean(engineRef.current));
    try {
      const [item] = await Promise.all([
        fetchReader(storyId),
        shouldDive ? engineRef.current?.diveIntoStory(storyId) : Promise.resolve(),
      ]);
      markStoryRead(storyId);
      setDiving(false);
      if (item) {
        setReading(item);
        const returnPath = sequential ? readerReturnPath.current : (readerReturnPath.current = pathForContext());
        const state = { inflowReader: true, itemId: storyId, returnPath };
        if (replaceHistory || sequential) history.replaceState(state, "", `/item/${storyId}`);
        else if (!location.pathname.startsWith("/item/")) history.pushState(state, "", `/item/${storyId}`);
      } else if (storyUrl) open(storyUrl, "_blank", "noopener");
    } finally {
      setDiving(false);
      setReaderPending(false);
      readerNavigationLock.current = false;
    }
  }, [fetchReader, markStoryRead, mode, pathForContext, reading]);

  const openReader = useCallback((story: GalaxyStory | GalaxyStoryDTO | FeedItemDTO, restoreFocus = false) => {
    void openReaderById(story.id, story.url, false, restoreFocus);
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
        modeRef.current = "today";
        setMode("today");
        return;
      }
      modeRef.current = "universe";
      setMode("universe");
      const match = location.pathname.match(/^\/g\/([a-z-]+)/);
      if (match) engineRef.current?.enterWorld(match[1], { fast: true, origin: "restore" });
      else engineRef.current?.exitToGalaxy({ fast: true, origin: "restore" });
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

  const previewStory = useCallback((story: GalaxyStory | null) => {
    engineRef.current?.previewStory(story?.id ?? null);
  }, []);

  const readerQueue = useMemo(() => {
    if (mode === "today" && briefing) return [...briefing.essentialIds, ...briefing.moreIds];
    if (!data) return [];
    const world = view === "today" ? data.today : data.worlds.find((candidate) => candidate.slug === view);
    return (world ?? data.today).entries.map((story) => story.id);
  }, [briefing, data, mode, view]);
  const readerIndex = reading ? readerQueue.indexOf(reading.id) : -1;
  const readerNeighbors = useMemo(() => {
    const findStory = (id: number): ReaderNeighbor | null => {
      const briefingStory = briefing?.stories[String(id)];
      if (briefingStory) return { id, title: briefingStory.title, sourceName: briefingStory.sourceName };
      const galaxyStory = [data?.today, ...(data?.worlds ?? [])].filter(Boolean).flatMap((world) => world?.entries ?? []).find((story) => story.id === id);
      return galaxyStory ? { id, title: galaxyStory.title, sourceName: galaxyStory.sourceName } : null;
    };
    return {
      previous: readerIndex > 0 ? findStory(readerQueue[readerIndex - 1]) : null,
      next: readerIndex >= 0 && readerIndex < readerQueue.length - 1 ? findStory(readerQueue[readerIndex + 1]) : null,
    };
  }, [briefing, data, readerIndex, readerQueue]);
  const readerQueueLabel = mode === "today" ? "Today" : view ? VISUALS_BY_SLUG.get(view)?.label ?? "Universe" : "Overview";

  useEffect(() => {
    if (!reading) return;
    if (readerNeighbors.previous) void fetchReader(readerNeighbors.previous.id);
    if (readerNeighbors.next) void fetchReader(readerNeighbors.next.id);
  }, [fetchReader, readerNeighbors, reading]);

  const accent = view ? VISUALS_BY_SLUG.get(view)?.css ?? "#8ba2ff" : "#8ba2ff";
  const visibleLabels = labels.filter((label) => label.kind === "world" || (focus && label.kind === "story" && label.storyId === focus.story.id));
  const freshness = briefing?.freshness ?? data?.freshness;

  return (
    <div className="observatory-shell fixed inset-0 bg-[#04040a] text-white overflow-hidden" data-mode={mode}>
      <div className="contents" inert={reading ? true : undefined} aria-hidden={reading ? true : undefined}>
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

      {mode === "universe" ? data && universeStatus === "ready" ? <UniverseRail data={data} view={view} focus={focus} activationMode={compactUniverse ? "read" : "preview"} onSelectWorld={openUniverse} onFocus={(story) => engineRef.current?.focusStory(story.id)} onPreview={previewStory} onOpen={openReader} onBack={() => view ? engineRef.current?.exitToGalaxy({ origin: "interactive" }) : openToday()} onClear={() => engineRef.current?.clearFocus()} onMute={muteSource} onSaveChange={setStorySaved} /> : <div className="universe-loading" role="status"><span /><strong>{universeStatus === "error" ? "Universe unavailable" : "Charting your universe…"}</strong>{universeStatus === "error" ? <button type="button" onClick={() => location.reload()}>Retry</button> : null}</div> : null}

      {showHint && mode === "universe" ? <div className="galaxy-control-hint" role="status"><span>Drag to move · scroll or pinch to zoom · choose any story from the rail</span><button type="button" onClick={dismissHint}>Got it</button></div> : null}
      <div className="dive-cover" data-active={diving} aria-hidden />

      {searchOpen ? <WarpBar stories={searchIndex} worlds={data?.worlds ?? briefing?.worlds ?? []} onWarp={(target: WarpTarget) => {
        setSearchOpen(false);
        if (target.kind === "world" && target.id === "today") openToday();
        else if (target.kind === "world") openUniverse(String(target.id));
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

      {reading ? <ReaderOverlay key={reading.id}
        item={reading}
        accent={accent}
        contextLabel={readerQueueLabel}
        queueLabel={readerQueueLabel}
        position={readerIndex >= 0 ? readerIndex + 1 : 1}
        total={Math.max(1, readerQueue.length)}
        previous={readerNeighbors.previous}
        next={readerNeighbors.next}
        pending={readerPending}
        onPrevious={() => readerNeighbors.previous && void openReaderById(readerNeighbors.previous.id, undefined, true)}
        onNext={() => readerNeighbors.next && void openReaderById(readerNeighbors.next.id, undefined, true)}
        onExplore={() => { finishReaderClose(0); setTimeout(() => openUniverse(view), 0); }}
        onClose={finishReaderClose}
        onSaveChange={(saved) => setStorySaved(reading.id, saved)}
      /> : null}
    </div>
  );
}
