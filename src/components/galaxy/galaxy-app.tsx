"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraState, GalaxyEngine, GalaxyPayload, GalaxyStory, HudLabel } from "../../galaxy/engine";
import { WORLD_VISUALS, VISUALS_BY_SLUG } from "../../galaxy/worlds";
import { queueSignal, sendSignal } from "../../lib/signals-client";
import { timeAgo } from "../../lib/format";
import { FocusCard } from "./focus-card";
import { ReaderOverlay, type ReaderPayload } from "./reader-overlay";
import { WarpBar, type WarpTarget } from "./warp-bar";

const STATE_KEY = "inflow-galaxy-state";

interface FocusState {
  story: GalaxyStory;
  world: string;
  x: number;
  y: number;
  fresh: boolean;
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
            onFocus: (story, world, x, y) => {
              if (!story || !world) {
                setFocus(null);
                if (impressionTimer.current) clearTimeout(impressionTimer.current);
                return;
              }
              setFocus({ story, world, x, y, fresh: Date.now() - new Date(story.publishedAt).getTime() < 3600_000 });
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
      if (e.key === "/") {
        e.preventDefault();
        openWarp();
        return;
      }
      if (e.key === "Escape") {
        if (focus) engineRef.current?.clearFocus();
        else if (view) engineRef.current?.exitToGalaxy();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= WORLD_VISUALS.length) {
        engineRef.current?.enterWorld(WORLD_VISUALS[n - 1].slug, true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [focus, view, reading, warping, openWarp]);

  const warpTo = useCallback((t: WarpTarget) => {
    setWarping(false);
    if (t.kind === "world") engineRef.current?.enterWorld(String(t.id), true);
    else engineRef.current?.warpToStory(Number(t.id));
  }, []);

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
  const totalStories = data ? data.worlds.reduce((a, w) => a + w.entries.length, 0) + data.today.entries.length : 0;

  return (
    <div className="fixed inset-0 bg-[#04040a] text-white overflow-hidden">
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
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-white/35 mt-0.5">
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
        <button
          type="button"
          onClick={openWarp}
          className="pointer-events-auto cursor-pointer hidden md:flex items-center gap-2.5 border border-[#2a2f42] bg-[#080a12]/70 px-4 py-2 w-[300px] hover:border-[#3d445e] transition-colors"
          aria-label="Warp search"
        >
          <span className="text-[#565d78] text-[11px]" aria-hidden>⌕</span>
          <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#454b62] uppercase">Warp to a galaxy or story…</span>
          <span className="ml-auto font-mono text-[9px] text-[#565d78] border border-[#2a2f42] px-1.5">/</span>
        </button>
        <div className="flex items-center gap-4 font-mono text-[0.6rem] tracking-[0.16em] uppercase text-white/35 pointer-events-auto">
          <button
            type="button"
            onClick={openWarp}
            className="md:hidden cursor-pointer text-white/70 text-[13px] px-1"
            aria-label="Warp search"
          >
            ⌕
          </button>
          <span className="hidden sm:inline">
            {view && worldData
              ? `${worldData.entries.length} stories · ranked for you`
              : `${totalStories} stories${data?.updatedAt ? ` · synced ${timeAgo(data.updatedAt)} ago` : ""}`}
          </span>
          <Link href="/saved" className="hidden sm:inline text-white/55 hover:text-white transition-colors">
            Saved
          </Link>
          <Link href="/sources" className="hidden sm:inline text-white/55 hover:text-white transition-colors">
            Sources
          </Link>
        </div>
      </div>

      {/* bottom HUD */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-5 pb-4 pointer-events-none">
        <div className="hidden sm:block font-mono text-[0.6rem] tracking-[0.18em] uppercase text-white/25">
          {view
            ? "esc — back to galaxy · drag to look · tap a story to focus"
            : "drag to orbit — scroll to approach — tap a world to enter"}
        </div>
        <div className="flex gap-3.5 pointer-events-auto items-center" role="navigation" aria-label="Worlds">
          {WORLD_VISUALS.map((w) => (
            <button
              key={w.slug}
              type="button"
              onClick={() => engineRef.current?.enterWorld(w.slug, true)}
              aria-label={w.label}
              className="cursor-pointer flex flex-col items-center gap-1 group"
            >
              <span
                className="w-2.5 h-2.5 rounded-full transition-all"
                style={{
                  background: w.css,
                  opacity: view === w.slug ? 1 : 0.45,
                  outline: view === w.slug ? `1px solid ${w.css}77` : "none",
                  outlineOffset: 3,
                }}
              />
              <span
                className="font-mono text-[8px] tracking-[0.12em] uppercase transition-opacity"
                style={{ color: w.css, opacity: view === w.slug ? 0.9 : 0 }}
              >
                {w.slug === "politics" ? "POL" : w.slug.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* focus card */}
      {focus && !reading && !diving ? (
        <FocusCard
          story={focus.story}
          accent={VISUALS_BY_SLUG.get(focus.world)?.css ?? accent}
          x={focus.x}
          y={focus.y}
          isMobile={isMobile}
          fresh={focus.fresh}
          onRead={() => openReader(focus.story)}
          onMuteSource={() => muteSource(focus.story)}
          onSaveChange={(s) => engineRef.current?.setSaved(focus.story.id, s)}
        />
      ) : null}

      {/* dive glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: diving ? 1 : 0,
          background: `radial-gradient(circle at 50% 50%, ${accent}cc 0%, ${accent}55 35%, transparent 75%)`,
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
        <div className="absolute inset-0 bg-[#04040a] flex items-center justify-center z-50">
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
