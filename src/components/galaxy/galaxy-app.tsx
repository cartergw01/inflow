"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraState, GalaxyEngine, GalaxyPayload, GalaxyStory, HudLabel } from "../../galaxy/engine";
import { WORLD_VISUALS, VISUALS_BY_SLUG } from "../../galaxy/worlds";
import { queueSignal, sendSignal } from "../../lib/signals-client";
import { StoryBriefing } from "./focus-card";
import type { ReaderPayload } from "./reader-overlay";
import type { WarpTarget } from "./warp-bar";
import { WorldSwitcher } from "./world-switcher";

const STATE_KEY = "inflow-galaxy-state";
const ReaderOverlay = dynamic(() => import("./reader-overlay").then((mod) => mod.ReaderOverlay));
const WarpBar = dynamic(() => import("./warp-bar").then((mod) => mod.WarpBar));

interface FocusState {
  story: GalaxyStory;
  world: string;
}

/**
 * The Observatory — InFlow's interface. Owns the engine lifecycle, HUD,
 * focus card, reader overlay, URL/localStorage persistence, and the mapping
 * of spatial interactions onto the existing personalization signals.
 */
export function GalaxyApp({ initialWorld }: { initialWorld: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<GalaxyPayload | null>(null);
  const [view, setView] = useState<string | null>(initialWorld);
  const [labels, setLabels] = useState<HudLabel[]>([]);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [reading, setReading] = useState<ReaderPayload | null>(null);
  const [diving, setDiving] = useState(false);
  const [warping, setWarping] = useState(false);
  const [searchIndex, setSearchIndex] = useState<{ id: number; title: string; world: string; sourceName: string }[]>([]);

  const openWarp = useCallback(() => {
    setSearchIndex(engineRef.current?.getSearchIndex() ?? []);
    setWarping(true);
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const impressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressed = useRef(new Set<number>());
  const isMobile = typeof window !== "undefined" && (innerWidth < 640 || "ontouchstart" in window);

  const enterWorld = useCallback((slug: string) => {
    engineRef.current?.enterWorld(slug, true);
  }, []);

  const stepWorld = useCallback(
    (direction: -1 | 1) => {
      const current = WORLD_VISUALS.findIndex((world) => world.slug === view);
      const next = current === -1
        ? direction === 1 ? 0 : WORLD_VISUALS.length - 1
        : (current + direction + WORLD_VISUALS.length) % WORLD_VISUALS.length;
      enterWorld(WORLD_VISUALS[next].slug);
    },
    [enterWorld, view],
  );

  /* ── boot: fetch data, then dynamically import three + engine ───── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, mod] = await Promise.all([fetch("/api/galaxy"), import("../../galaxy/engine")]);
        if (res.status === 401) {
          location.href = "/welcome";
          return;
        }
        if (!res.ok) throw new Error(`galaxy ${res.status}`);
        const payload = (await res.json()) as GalaxyPayload;
        if (cancelled || !canvasRef.current) return;
        setData(payload);

        let saved: CameraState | null = null;
        try {
          saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
        } catch {
          saved = null;
        }
        const initial: CameraState | null = initialWorld
          ? { world: initialWorld, theta: saved?.theta ?? 0.4, phi: saved?.phi ?? 1.25, radius: isMobile ? 19 : 14 }
          : saved;

        const engine = new mod.GalaxyEngine(
          canvasRef.current,
          payload,
          {
            onFocus: (story, world) => {
              if (!story || !world) {
                setFocus(null);
                if (impressionTimer.current) clearTimeout(impressionTimer.current);
                return;
              }
              setFocus({ story, world });
              // A deliberate focus held ≥1s = the spatial impression.
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
              const path = world ? `/g/${world}` : "/";
              if (location.pathname !== path) history.pushState({ world }, "", path);
            },
          },
          { isMobile, initial },
        );
        engineRef.current = engine;
        // QA/debug handle — lets automated vision checks introspect the scene.
        (window as unknown as { __inflow?: unknown }).__inflow = engine;
        setStatus("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── persistence + browser navigation ───────────────────────────── */
  useEffect(() => {
    const persist = () => {
      const s = engineRef.current?.getCameraState();
      if (s) localStorage.setItem(STATE_KEY, JSON.stringify(s));
    };
    const onPop = () => {
      const m = location.pathname.match(/^\/g\/([a-z-]+)/);
      if (m) engineRef.current?.enterWorld(m[1], true);
      else engineRef.current?.exitToGalaxy();
    };
    const iv = setInterval(persist, 4000);
    addEventListener("pagehide", persist);
    addEventListener("popstate", onPop);
    return () => {
      clearInterval(iv);
      removeEventListener("pagehide", persist);
      removeEventListener("popstate", onPop);
    };
  }, []);

  /* ── keyboard ────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reading || warping) return; // overlays handle their own keys
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "/") {
        e.preventDefault();
        openWarp();
        return;
      }
      if (e.key === "Escape") {
        if (focus) engineRef.current?.clearFocus();
        else if (view) engineRef.current?.exitToGalaxy();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        stepWorld(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= WORLD_VISUALS.length) {
        enterWorld(WORLD_VISUALS[n - 1].slug);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [focus, view, reading, warping, openWarp, enterWorld, stepWorld]);

  const warpTo = useCallback((t: WarpTarget) => {
    setWarping(false);
    if (t.kind === "world") enterWorld(String(t.id));
    else engineRef.current?.warpToStory(Number(t.id));
  }, [enterWorld]);

  /* ── actions ─────────────────────────────────────────────────────── */

  const openReader = useCallback(
    async (story: GalaxyStory) => {
      sendSignal({ itemId: story.id, type: "open" });
      if (!story.hasBody) {
        // No full text: record the open and hand off to the source.
        engineRef.current?.markRead(story.id);
        open(story.url, "_blank", "noopener");
        return;
      }
      setDiving(true);
      const [payload] = await Promise.all([
        fetch(`/api/item/${story.id}`).then((r) => (r.ok ? (r.json() as Promise<ReaderPayload>) : null)),
        engineRef.current?.diveIntoStory(story.id),
      ]);
      engineRef.current?.markRead(story.id);
      setDiving(false);
      if (payload) setReading(payload);
      else open(story.url, "_blank", "noopener");
    },
    [],
  );

  const closeReader = useCallback(
    (readSeconds: number) => {
      if (reading && readSeconds >= 5) {
        sendSignal({ itemId: reading.id, type: "read_time", value: readSeconds });
      }
      setReading(null);
      engineRef.current?.clearFocus();
      engineRef.current?.pullBackFromStory();
    },
    [reading],
  );

  const muteSource = useCallback((story: GalaxyStory) => {
    sendSignal({ itemId: story.id, type: "hide_source" });
    engineRef.current?.clearFocus();
    setToast(`${story.sourceName} muted — feed updates on next sync`);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const worldData = view ? (view === "today" ? data?.today : data?.worlds.find((w) => w.slug === view)) : null;
  const accent = view ? (VISUALS_BY_SLUG.get(view)?.css ?? "#8ba2ff") : "#8ba2ff";
  const activeStory = focus?.world === view ? focus.story : worldData?.entries[0] ?? null;
  const activeStoryIndex = activeStory && worldData
    ? Math.max(0, worldData.entries.findIndex((story) => story.id === activeStory.id))
    : 0;
  const stepStory = (direction: -1 | 1) => {
    if (!worldData?.entries.length) return;
    const next = (activeStoryIndex + direction + worldData.entries.length) % worldData.entries.length;
    engineRef.current?.focusStory(worldData.entries[next].id);
  };

  return (
    <div className="observatory-shell fixed inset-0 bg-[#04040a] text-white overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* labels layer */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {labels.map((l) => (
          <div
            key={l.key}
            className="absolute -translate-x-1/2 text-center transition-opacity duration-200"
            style={{ left: l.x, top: l.y, opacity: l.opacity }}
          >
            {l.kind === "world" ? (
              <>
                <div className="font-display font-bold text-[13px] tracking-[0.14em]" style={{ color: "#d9dcea" }}>
                  {l.text}
                </div>
                <div className="font-mono text-[9px] tracking-[0.18em] mt-0.5" style={{ color: l.color }}>
                  {l.sub}
                </div>
              </>
            ) : l.kind === "bridge" ? (
              <button
                type="button"
                onClick={() => l.storyId && engineRef.current?.focusStory(l.storyId)}
                className="pointer-events-auto cursor-pointer border px-2.5 py-1.5 text-left backdrop-blur-sm hover:border-white/50 transition-colors"
                style={{ background: "rgba(8,10,18,0.78)", borderColor: "#2a3550" }}
              >
                <span className="block font-mono text-[9.5px] text-[#d8e4f4]">{l.text}</span>
                <span className="block font-mono text-[8px] tracking-[0.14em] mt-0.5" style={{ color: l.color }}>
                  {l.sub}
                </span>
              </button>
            ) : (
              <div
                className="font-display font-semibold text-[11.5px] tracking-[0.01em] max-w-[240px] leading-tight"
                style={{ color: l.color, textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
              >
                {l.text}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* top HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-5 pt-4 pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.exitToGalaxy()}
            className="flex items-center gap-2.5 cursor-pointer"
            aria-label="Back to galaxy"
          >
            <span className="w-3 h-3 inline-block" style={{ background: accent }} aria-hidden />
            <span className="font-display font-black text-[19px] leading-none tracking-[-0.02em]">INFLOW</span>
          </button>
          <span className="observatory-breadcrumb font-mono text-[0.6rem] tracking-[0.2em] uppercase text-white/35 mt-0.5">
            {view ? (
              <>
                <button
                  type="button"
                  onClick={() => engineRef.current?.exitToGalaxy()}
                  className="cursor-pointer hover:text-white/70 pointer-events-auto"
                >
                  OBSERVATORY
                </button>{" "}
                / <span style={{ color: accent }}>{worldData?.label.toUpperCase()}</span>
              </>
            ) : (
              "— OBSERVATORY"
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.6rem] tracking-[0.16em] uppercase text-white/35 pointer-events-auto">
          <button
            type="button"
            onClick={openWarp}
            className="cursor-pointer text-white/70 hover:text-white border border-white/15 bg-black/30 px-2.5 py-1.5 transition-colors"
            aria-label="Warp search"
          >
            <span aria-hidden>⌕</span><span className="hidden sm:inline ml-2">Search</span>
          </button>
          <Link href="/saved" className="hidden sm:inline text-white/55 hover:text-white transition-colors">
            Saved
          </Link>
          <Link href="/sources" className="hidden sm:inline text-white/55 hover:text-white transition-colors">
            Sources
          </Link>
        </div>
      </div>

      {/* bottom HUD */}
      <div className="observatory-bottom-hud absolute bottom-0 left-0 right-0 flex justify-center px-3 sm:px-5 pointer-events-none">
        <WorldSwitcher
          activeWorld={view}
          onOverview={() => engineRef.current?.exitToGalaxy()}
          onSelect={enterWorld}
          onStep={stepWorld}
        />
      </div>

      {/* ranked briefing */}
      {activeStory && worldData && !reading && !diving ? (
        <StoryBriefing
          key={activeStory.id}
          story={activeStory}
          accent={accent}
          worldLabel={worldData.label}
          position={activeStoryIndex}
          total={worldData.entries.length}
          onRead={() => openReader(activeStory)}
          onPrevious={() => stepStory(-1)}
          onNext={() => stepStory(1)}
          onMuteSource={() => muteSource(activeStory)}
          onSaveChange={(s) => engineRef.current?.setSaved(activeStory.id, s)}
        />
      ) : null}

      {/* dive glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: diving ? 1 : 0,
          background: `rgba(4, 5, 9, 0.82)`,
        }}
        aria-hidden
      />

      {/* reader */}
      {reading ? (
        <ReaderOverlay
          item={reading}
          accent={accent}
          onClose={closeReader}
          onSaveChange={(s) => engineRef.current?.setSaved(reading.id, s)}
        />
      ) : null}

      {/* warp */}
      {warping && data ? (
        <WarpBar
          stories={searchIndex}
          onWarp={warpTo}
          onClose={() => setWarping(false)}
        />
      ) : null}

      {/* toast */}
      {toast ? (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-16 font-mono text-[0.65rem] tracking-[0.14em] uppercase bg-black/70 border border-white/15 px-4 py-2 text-white/80">
          {toast}
        </div>
      ) : null}

      {/* splash / error */}
      {status !== "ready" ? (
        <div className="absolute inset-0 bg-[#04040a]/[0.84] backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2.5">
              <span className="w-3.5 h-3.5 bg-[#6b8cff] inline-block animate-pulse" aria-hidden />
              <span className="font-display font-black text-[26px] tracking-[-0.02em]">INFLOW</span>
            </div>
            <div className="mt-3 font-mono text-[0.65rem] tracking-[0.22em] uppercase text-white/35">
              {status === "error" ? (
                <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => location.reload()}>
                  Connection lost — retry
                </button>
              ) : (
                "Charting your galaxy…"
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
