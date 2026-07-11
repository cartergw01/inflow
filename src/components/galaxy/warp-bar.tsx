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
    <div className="galaxy-drawer-scrim" onClick={onClose}>
      <aside
        className="galaxy-drawer search-drawer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Search"
      >
        <header className="galaxy-drawer__header">
          <div><span className="galaxy-drawer__eyebrow">Find your next signal</span><h2>Search</h2></div>
          <button type="button" onClick={onClose} aria-label="Close search" title="Close search">×</button>
        </header>
        <div className="search-drawer__input">
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
            placeholder="Search worlds and stories…"
            className="flex-1 bg-transparent outline-none text-white font-mono text-[13px] placeholder:text-[#596073]"
            aria-label="Warp search"
          />
        </div>
        <ul className="search-drawer__results">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                type="button"
                onClick={() => go(r)}
                onMouseEnter={() => setCursor(i)}
                className={i === cursor ? "is-active" : ""}
              >
                <span className="w-2 h-2 shrink-0 self-center" style={{ background: r.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-display font-semibold text-white/90 truncate">{r.title}</span>
                </span>
                <span className="font-mono text-[8.5px] tracking-[0.14em] text-[#565d78] shrink-0">{r.sub}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="galaxy-drawer__state">No matches in this sky.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
