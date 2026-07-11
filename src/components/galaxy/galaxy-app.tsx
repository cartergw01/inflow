"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraState, GalaxyEngine, GalaxyPayload, GalaxyStory, GalaxyWirePayload, HudLabel } from "../../galaxy/engine";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";
import type { FeedItemDTO } from "../../lib/feed-data";
import { timeAgo } from "../../lib/format";
import { queueSignal, sendSignal } from "../../lib/signals-client";
import { StoryFocus } from "./focus-card";
import type { LibraryTab } from "./library-drawer";
import type { ReaderPayload } from "./reader-overlay";
import type { WarpTarget } from "./warp-bar";

const STATE_KEY = "inflow-galaxy-state-v2";
const CONTROLS_SEEN_KEY = "inflow-controls-seen";
const ReaderOverlay = dynamic(() => import("./reader-overlay").then((mod) => mod.ReaderOverlay));
const WarpBar = dynamic(() => import("./warp-bar").then((mod) => mod.WarpBar));
const LibraryDrawer = dynamic(() => import("./library-drawer").then((mod) => mod.LibraryDrawer));

type Panel = "search" | LibraryTab | null;
interface FocusState { story: GalaxyStory; world: string }

export function GalaxyApp({
  initialWorld,
  initialPanel = null,
  initialItemId = null,
}: {
  initialWorld: string | null;
  initialPanel?: LibraryTab | null;
  initialItemId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const panelRef = useRef<Panel>(initialPanel);
  const impressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressed = useRef(new Set<number>());
  const readerCache = useRef(new Map<number, Promise<ReaderPayload | null>>());

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<GalaxyPayload | null>(null);
  const [view, setView] = useState<string | null>(initialWorld);
  const [labels, setLabels] = useState<HudLabel[]>([]);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [reading, setReading] = useState<ReaderPayload | null>(null);
  const [diving, setDiving] = useState(false);
  const [panel, setPanelState] = useState<Panel>(initialPanel);
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

  const setPanel = useCallback((next: Panel) => {
    panelRef.current = next;
    setPanelState(next);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    const path = view ? `/g/${view}` : "/";
    document.title = view ? `${VISUALS_BY_SLUG.get(view)?.label ?? view} — InFlow` : "InFlow";
    if (location.pathname !== path) history.pushState({ world: view }, "", path);
  }, [setPanel, view]);

  const openSearch = useCallback(() => {
    setSearchIndex(engineRef.current?.getSearchIndex() ?? []);
    setPanel("search");
  }, [setPanel]);

  const openLibrary = useCallback((tab: LibraryTab) => {
    setPanel(tab);
    document.title = `${tab === "saved" ? "Saved" : "Sources"} — InFlow`;
    const path = `/${tab}`;
    if (location.pathname !== path) history.pushState({ panel: tab }, "", path);
  }, [setPanel]);

  const isMobile = typeof window !== "undefined" && (innerWidth < 640 || "ontouchstart" in window);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [response, engineModule] = await Promise.all([fetch("/api/galaxy"), import("../../galaxy/engine")]);
        if (response.status === 401) {
          location.href = "/welcome";
          return;
        }
        if (!response.ok) throw new Error(`galaxy ${response.status}`);
        const wirePayload = (await response.json()) as GalaxyWirePayload;
        const payload = engineModule.hydrateGalaxyPayload(wirePayload);
        if (cancelled || !canvasRef.current) return;
        setData(payload);

        let saved: CameraState | null = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null"); } catch { saved = null; }
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
              transitionTimer.current = setTimeout(() => setWorldTransition(null), 900);
            }
            if (!panelRef.current) {
              document.title = world ? `${VISUALS_BY_SLUG.get(world)?.label ?? world} — InFlow` : "InFlow";
              const path = world ? `/g/${world}` : "/";
              if (location.pathname !== path) history.pushState({ world }, "", path);
            }
          },
        }, { isMobile, initial });

        engineRef.current = engine;
        engine.setPaused(Boolean(panelRef.current || initialItemId));
        (window as unknown as { __inflow?: unknown }).__inflow = engine;
        setSearchIndex(engine.getSearchIndex());
        setStatus("ready");
        try {
          if (localStorage.getItem(CONTROLS_SEEN_KEY) !== "1") {
            setShowHint(true);
            hintTimer.current = setTimeout(() => {
              setShowHint(false);
              localStorage.setItem(CONTROLS_SEEN_KEY, "1");
            }, 9000);
          }
        } catch { /* onboarding hint is best-effort */ }

        if (initialItemId) {
          const item = await fetchReader(initialItemId);
          if (!cancelled && item) setReading(item);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
    // Engine boot is intentionally one-shot; its API handles navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.setPaused(Boolean(panel || reading)); }, [panel, reading]);

  useEffect(() => {
    const persist = () => {
      const camera = engineRef.current?.getCameraState();
      if (camera) localStorage.setItem(STATE_KEY, JSON.stringify(camera));
    };
    const onPop = () => {
      if (location.pathname === "/saved" || location.pathname === "/sources") {
        const tab = location.pathname.slice(1) as LibraryTab;
        setPanel(tab);
        document.title = `${tab === "saved" ? "Saved" : "Sources"} — InFlow`;
        return;
      }
      setPanel(null);
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
  }, [setPanel]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (reading || panel) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "/") {
        event.preventDefault();
        openSearch();
      } else if (event.key === "Escape") {
        if (focus) engineRef.current?.clearFocus();
        else if (view) engineRef.current?.exitToGalaxy();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (view) engineRef.current?.stepWorld(direction);
        else engineRef.current?.rotateOverview(direction);
      } else {
        const index = Number(event.key) - 1;
        const targetWorld = data ? [data.today, ...data.worlds][index] : null;
        if (targetWorld) engineRef.current?.enterWorld(targetWorld.slug);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [data, focus, openSearch, panel, reading, view]);

  const openReader = useCallback(async (story: GalaxyStory | FeedItemDTO) => {
    sendSignal({ itemId: story.id, type: "open" });
    setDiving(true);
    const [item] = await Promise.all([
      fetchReader(story.id),
      engineRef.current?.diveIntoStory(story.id),
    ]);
    engineRef.current?.markRead(story.id);
    setData((current) => current ? {
      ...current,
      newCount: story.isNew ? Math.max(0, current.newCount - 1) : current.newCount,
      catchUp: current.catchUp.filter((entry) => entry.id !== story.id),
    } : current);
    setDiving(false);
    if (item) setReading(item);
    else open(story.url, "_blank", "noopener");
  }, [fetchReader]);

  const closeReader = useCallback((readSeconds: number) => {
    if (reading && readSeconds >= 5) sendSignal({ itemId: reading.id, type: "read_time", value: readSeconds });
    const itemId = reading?.id;
    setReading(null);
    if (itemId) setTimeout(() => engineRef.current?.focusStory(itemId), 0);
  }, [reading]);

  const muteSource = useCallback((story: GalaxyStory) => {
    sendSignal({ itemId: story.id, type: "hide_source" });
    engineRef.current?.clearFocus();
    setToast(`${story.sourceName} muted`);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const worldData = view ? (view === "today" ? data?.today : data?.worlds.find((world) => world.slug === view)) : null;
  const accent = view ? VISUALS_BY_SLUG.get(view)?.css ?? "#8ba2ff" : "#8ba2ff";

  return (
    <div className="observatory-shell fixed inset-0 bg-[#04040a] text-white overflow-hidden">
      <canvas ref={canvasRef} onPointerDown={() => { if (showHint) dismissHint(); }} className="absolute inset-0 touch-none" aria-label="Interactive galaxy of personalized news" />
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
        {labels.map((label) => (
          <div key={label.key} className="galaxy-label" style={{ left: label.x, top: label.y, opacity: label.opacity }}>
            <strong>{label.text}</strong>
            {label.sub ? <span style={{ color: label.color }}>{label.sub}</span> : null}
          </div>
        ))}
      </div>

      <header className="galaxy-hud">
        <button type="button" className="galaxy-brand" onClick={() => engineRef.current?.exitToGalaxy()} aria-label="Galaxy overview">
          <span style={{ background: accent }} aria-hidden /><strong>INFLOW</strong>
        </button>
        <div className="galaxy-hud__status" role="status">
          {data?.freshness.staleSourceCount
            ? `${data.freshness.staleSourceCount} source${data.freshness.staleSourceCount === 1 ? "" : "s"} delayed`
            : data?.freshness.latestCheckedAt ? `Checked ${timeAgo(data.freshness.latestCheckedAt)} ago` : "Checking sources…"}
        </div>
        <nav className="galaxy-tools" aria-label="Observatory tools">
          {data?.catchUp[0] ? <button type="button" className="galaxy-tools__catchup" onClick={() => engineRef.current?.warpToStory(data.catchUp[0].id)}><span aria-hidden>●</span><b>Catch up · {data.newCount} new</b></button> : null}
          <button type="button" className="galaxy-tools__labeled" onClick={() => engineRef.current?.exitToGalaxy()} aria-label="Return to full galaxy" title="Full galaxy"><span aria-hidden>⌂</span><b>Full galaxy</b></button>
          <button type="button" className="galaxy-tools__labeled" onClick={openSearch} aria-label="Search" title="Search"><span aria-hidden>⌕</span><b>Search</b></button>
          <button type="button" onClick={() => openLibrary("saved")} aria-label="Open library" title="Library"><span aria-hidden>▣</span></button>
        </nav>
      </header>

      {showHint ? <div className="galaxy-control-hint" role="status">
        <span>Drag to move · scroll or pinch to zoom · tap a light to read</span>
        <button type="button" onClick={dismissHint}>Got it</button>
      </div> : null}

      {worldTransition ? <div className="world-transition" role="status">{worldTransition}</div> : null}
      {focus && worldData && !reading && !diving ? (
        <StoryFocus key={focus.story.id} story={focus.story} accent={accent} worldLabel={worldData.label}
          onRead={() => openReader(focus.story)} onDismiss={() => engineRef.current?.clearFocus()}
          onMuteSource={() => muteSource(focus.story)} onSaveChange={(saved) => engineRef.current?.setSaved(focus.story.id, saved)} />
      ) : null}

      <div className="dive-cover" data-active={diving} aria-hidden />
      {reading ? <ReaderOverlay item={reading} accent={accent} onClose={closeReader} onSaveChange={(saved) => engineRef.current?.setSaved(reading.id, saved)} /> : null}
      {panel === "search" ? <WarpBar stories={searchIndex} onWarp={(target: WarpTarget) => {
        closePanel();
        if (target.kind === "world") engineRef.current?.enterWorld(String(target.id));
        else engineRef.current?.warpToStory(Number(target.id));
      }} onClose={closePanel} /> : null}
      {status === "ready" && (panel === "saved" || panel === "sources") ? (
        <LibraryDrawer initialTab={panel} onTabChange={openLibrary} onClose={closePanel} onOpenStory={openReader} />
      ) : null}
      {toast ? <div className="galaxy-toast" role="status">{toast}</div> : null}
      {status !== "ready" ? (
        <div className="galaxy-splash">
          <div><span aria-hidden /><strong>INFLOW</strong></div>
          {status === "error" ? <button type="button" onClick={() => location.reload()}>Connection lost · Retry</button> : <p>Charting your galaxy…</p>}
        </div>
      ) : null}
    </div>
  );
}
