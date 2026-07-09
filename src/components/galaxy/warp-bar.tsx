"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WORLD_VISUALS } from "../../galaxy/worlds";

export interface WarpTarget {
  kind: "world" | "story";
  id: number | string;
  title: string;
  sub: string;
  color: string;
}

/**
 * The escape hatch: type to jump anywhere without flying. 3D exploration is
 * for discovery; this is for when you already know what you want.
 * Opens with "/" (desktop) or the ⌕ HUD button (mobile).
 */
export function WarpBar({
  stories,
  onWarp,
  onClose,
}: {
  stories: { id: number; title: string; world: string; sourceName: string }[];
  onWarp: (t: WarpTarget) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo<WarpTarget[]>(() => {
    const needle = q.trim().toLowerCase();
    const worlds: WarpTarget[] = WORLD_VISUALS.filter(
      (w) => needle === "" || w.label.toLowerCase().includes(needle) || w.slug.includes(needle),
    ).map((w) => ({ kind: "world", id: w.slug, title: w.label, sub: "GALAXY", color: w.css }));
    if (needle === "") return worlds;
    const matches: WarpTarget[] = stories
      .filter((s) => s.title.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((s) => {
        const visual = WORLD_VISUALS.find((w) => w.slug === s.world);
        return {
          kind: "story" as const,
          id: s.id,
          title: s.title,
          sub: `${visual?.label.toUpperCase() ?? s.world} — ${s.sourceName.toUpperCase()}`,
          color: visual?.css ?? "#9db0cc",
        };
      });
    return [...worlds.slice(0, 3), ...matches];
  }, [q, stories]);

  const go = (t: WarpTarget | undefined) => {
    if (t) onWarp(t);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px] flex justify-center pt-[12vh] px-4" onClick={onClose}>
      <div
        className="w-full max-w-[520px] h-fit bg-[#080a12]/95 border border-[#2a2f42] animate-[card-in_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2f42]">
          <span className="text-[#565d78] text-sm" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, results.length - 1));
              if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
              if (e.key === "Enter") go(results[cursor]);
              e.stopPropagation();
            }}
            placeholder="Warp to a galaxy or story…"
            className="flex-1 bg-transparent outline-none text-white font-mono text-[13px] placeholder:text-[#454b62] placeholder:tracking-[0.1em]"
            aria-label="Warp search"
          />
          <span className="font-mono text-[9px] text-[#565d78] border border-[#2a2f42] px-1.5 py-0.5">ESC</span>
        </div>
        <ul className="max-h-[46vh] overflow-y-auto">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                type="button"
                onClick={() => go(r)}
                onMouseEnter={() => setCursor(i)}
                className={`w-full text-left px-4 py-2.5 flex items-baseline gap-3 cursor-pointer ${
                  i === cursor ? "bg-white/[0.07]" : ""
                }`}
              >
                <span className="w-2 h-2 shrink-0 self-center" style={{ background: r.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-display font-semibold text-white/90 truncate">{r.title}</span>
                </span>
                <span className="font-mono text-[8.5px] tracking-[0.14em] text-[#565d78] shrink-0">{r.sub}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-4 py-4 font-mono text-[10px] tracking-[0.16em] text-[#454b62] uppercase">No matches in this sky</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
