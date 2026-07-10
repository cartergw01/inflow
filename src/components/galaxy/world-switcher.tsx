"use client";

import { useEffect, useRef } from "react";
import { WORLD_VISUALS } from "../../galaxy/worlds";

export function WorldSwitcher({
  activeWorld,
  onOverview,
  onSelect,
  onStep,
}: {
  activeWorld: string | null;
  onOverview: () => void;
  onSelect: (slug: string) => void;
  onStep: (direction: -1 | 1) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>("[aria-current='page']");
    if (!rail || !active) return;
    const left = active.offsetLeft - (rail.clientWidth - active.clientWidth) / 2;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
  }, [activeWorld]);

  return (
    <nav className="world-switcher pointer-events-auto" aria-label="Worlds">
      <button
        type="button"
        className="world-switcher__step"
        onClick={() => onStep(-1)}
        aria-label="Previous world"
        title="Previous world"
      >
        <span aria-hidden>‹</span>
      </button>

      <div ref={railRef} className="world-switcher__rail no-scrollbar">
        <button
          type="button"
          className="world-switcher__segment world-switcher__overview"
          data-active={activeWorld === null}
          aria-current={activeWorld === null ? "page" : undefined}
          onClick={onOverview}
        >
          Map
        </button>
        {WORLD_VISUALS.map((world) => {
          const active = activeWorld === world.slug;
          return (
            <button
              key={world.slug}
              type="button"
              className="world-switcher__segment"
              data-active={active}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(world.slug)}
              style={{ "--world-color": world.css } as React.CSSProperties}
            >
              <span className="world-switcher__marker" aria-hidden />
              <span>{world.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="world-switcher__step"
        onClick={() => onStep(1)}
        aria-label="Next world"
        title="Next world"
      >
        <span aria-hidden>›</span>
      </button>
    </nav>
  );
}
