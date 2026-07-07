/**
 * World visual identities. Each world is a place: its own palette, core
 * geometry, and story-layout formation — not a recolored template.
 * Layouts are pure and deterministic (seeded by item id) so the map is
 * stable across visits; rank still drives size/ordering.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WorldVisual {
  slug: string;
  /** Display name in HUD. */
  label: string;
  /** Primary emissive color. */
  color: number;
  /** Secondary accent (mixed into some story nodes). */
  altColor: number;
  /** CSS color strings for HUD elements. */
  css: string;
  /** Core construction: which builder the engine uses. */
  core: "sun" | "arena" | "lattice" | "isle" | "rotunda" | "globe";
  /** Fixed bearing on the galactic plane (radians) — a stable mental map. */
  angle: number;
  /** Story formation. index = rank (0 = most relevant). */
  layout: (index: number, seed: number) => Vec3;
  /** Ambient motion style applied by the engine. */
  motion: "orbit-fast" | "orbit-slow" | "rise" | "shimmer" | "still";
}

/** Deterministic 0..1 from item id + salt — keeps layouts stable. */
export function seeded(id: number, salt: number): number {
  let h = (Math.imul(id, 374761393) + Math.imul(salt, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const TAU = Math.PI * 2;

export const WORLD_VISUALS: WorldVisual[] = [
  {
    slug: "today",
    label: "Today",
    color: 0xffd66b,
    altColor: 0xfff2cc,
    css: "#ffd66b",
    core: "sun",
    angle: 0,
    motion: "orbit-slow",
    // Close orbit around the sun; rank = closer ring.
    layout: (i, seed) => {
      const ring = Math.floor(i / 7);
      const a = ((i % 7) / 7) * TAU + seed * 0.9 + ring * 0.45;
      const r = 5.4 + ring * 1.8;
      return { x: Math.cos(a) * r, y: (seeded(seed, 3) - 0.5) * 2.2, z: Math.sin(a) * r };
    },
  },
  {
    slug: "nba",
    label: "NBA",
    color: 0xff8c3b,
    altColor: 0xffc49b,
    css: "#ff8c3b",
    core: "arena",
    angle: (210 / 360) * TAU,
    motion: "orbit-fast",
    // Stories race around the arena ring plane; higher rank = inner lane.
    // Golden-angle spacing keeps the ring evenly populated instead of clumped.
    layout: (i, seed) => {
      const a = i * 2.39996 + seeded(seed, 7) * 0.4;
      const r = 3.4 + (i / 40) * 3.6 + seeded(seed, 11) * 0.5;
      const tilt = 0.42; // matches the ring's tilt
      const y0 = (seeded(seed, 13) - 0.5) * 0.5;
      return {
        x: Math.cos(a) * r,
        y: y0 + Math.sin(a) * r * Math.sin(tilt),
        z: Math.sin(a) * r * Math.cos(tilt),
      };
    },
  },
  {
    slug: "tech",
    label: "Tech / VC",
    color: 0x38e8c8,
    altColor: 0x9ff5e6,
    css: "#38e8c8",
    core: "lattice",
    angle: (30 / 360) * TAU,
    motion: "shimmer",
    // Snapped to a loose grid — circuitry, not a cloud.
    layout: (i, seed) => {
      const gx = Math.round((seeded(seed, 17) - 0.5) * 6) * 1.7;
      const gy = Math.round((seeded(seed, 19) - 0.5) * 4) * 1.5;
      const gz = Math.round((seeded(seed, 23) - 0.5) * 6) * 1.7;
      const len = Math.hypot(gx, gy, gz);
      if (len < 3) {
        // Too close to the core: push outward along a seeded direction.
        const a = seeded(seed, 27) * TAU;
        const y = (seeded(seed, 33) - 0.5) * 2.4;
        return { x: Math.cos(a) * 3.4, y, z: Math.sin(a) * 3.4 };
      }
      return { x: gx, y: gy, z: gz };
    },
  },
  {
    slug: "taiwan",
    label: "Taiwan",
    color: 0x4ade8a,
    altColor: 0xff6b4a,
    css: "#4ade8a",
    core: "isle",
    angle: (330 / 360) * TAU,
    motion: "rise",
    // Lanterns rising off the island on a loose golden spiral.
    layout: (i, seed) => {
      const a = i * 2.39996 + seeded(seed, 29) * 0.8; // golden angle
      const r = 2.4 + Math.sqrt(i) * 1.15 + seeded(seed, 31) * 0.6;
      return { x: Math.cos(a) * r, y: 0.6 + (i / 40) * 5.2 + seeded(seed, 37) * 1.6, z: Math.sin(a) * r * 0.72 };
    },
  },
  {
    slug: "politics",
    label: "US Politics",
    color: 0x6b8cff,
    altColor: 0xdde3f5,
    css: "#6b8cff",
    core: "rotunda",
    angle: (150 / 360) * TAU,
    motion: "still",
    // Two opposing chamber arcs around the rotunda.
    layout: (i, seed) => {
      const side = i % 2 === 0 ? -1 : 1;
      const j = Math.floor(i / 2);
      const a = ((j % 10) / 10) * Math.PI * 0.85 - Math.PI * 0.425;
      const tier = Math.floor(j / 10);
      return {
        x: Math.sin(a) * (3.6 + tier * 1.1 + seeded(seed, 41) * 0.3),
        y: (j % 3) * 0.55 - 0.4 + tier * 0.3,
        z: side * (2.8 + Math.cos(a) * 1.7 + tier * 0.5),
      };
    },
  },
  {
    slug: "world",
    label: "World",
    color: 0x9db4d8,
    altColor: 0xe8eefc,
    css: "#9db4d8",
    core: "globe",
    angle: (90 / 360) * TAU,
    motion: "orbit-slow",
    // Satellites on three inclined great-circle orbits.
    layout: (i, seed) => {
      const orbit = i % 3;
      const incl = [0.35, 1.05, 1.9][orbit];
      const a = seeded(seed, 43) * TAU + i * 0.7;
      const r = 3.4 + orbit * 0.9 + (i / 40) * 1.4;
      const p = { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r };
      return {
        x: p.x,
        y: p.z * Math.sin(incl),
        z: p.z * Math.cos(incl),
      };
    },
  },
];

export const VISUALS_BY_SLUG = new Map(WORLD_VISUALS.map((w) => [w.slug, w]));

/**
 * World position on the galactic plane. Affinity pulls a world toward the
 * sun — the galaxy reshapes itself as the ranking engine learns you.
 */
export function worldPosition(visual: WorldVisual, affinity: number): Vec3 {
  if (visual.slug === "today") return { x: 0, y: 0, z: 0 };
  const r = 30 - affinity * 10; // 30 cold … 20 well-read
  const y = Math.sin(visual.angle * 2.3) * 4.5;
  return { x: Math.cos(visual.angle) * r, y, z: Math.sin(visual.angle) * r };
}
