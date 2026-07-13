import type { CameraState } from "./engine";

export type GalaxyAppMode = "today" | "universe";

/**
 * URLs own the product mode: `/` frames Today, `/universe` frames the full
 * map, and `/g/:world` frames one world. Persisted camera orientation may be
 * reused, but it must never silently override that route-level promise.
 */
export function initialGalaxyCamera({
  initialMode,
  initialWorld,
  saved,
  isMobile,
}: {
  initialMode: GalaxyAppMode;
  initialWorld: string | null;
  saved: CameraState | null;
  isMobile: boolean;
}): CameraState {
  const theta = saved?.theta ?? 0.4;

  if (initialWorld) {
    return {
      world: initialWorld,
      theta,
      phi: saved?.phi ?? 1.25,
      radius: isMobile ? 19 : 14,
    };
  }

  if (initialMode === "today") {
    return {
      world: "today",
      theta,
      phi: 1.25,
      radius: isMobile ? 19 : 14,
    };
  }

  return {
    world: null,
    theta,
    phi: 1.12,
    radius: isMobile ? 110 : 72,
  };
}
