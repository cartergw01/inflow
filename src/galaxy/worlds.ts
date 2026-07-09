/**
 * Galaxy visual identities. Each galaxy is a place: its own palette, core
 * construction, orbital-lane arrangement, and story formation — not a
 * recolored template. v2 palette is desaturated toward astronomical-
 * instrument restraint (Stellarium, not sci-fi). Layouts are pure and
 * deterministic (seeded by item id) so the map is stable across visits;
 * rank still drives size/ordering.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Lane {
  /** Lane radius before activity scaling. */
  r: number;
  /** Tilt from the horizontal plane (radians). */
  tiltX: number;
  tiltZ?: number;
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
  /** Thin orbital reference lanes (astronomical chart feel). */
  lanes: Lane[];
  /** Story formation. index = rank (0 = most relevant). */
  layout: (index: number, seed: number) => Vec3;
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
const ARENA_TILT = 0.42;

export const WORLD_VISUALS: WorldVisual[] = [
  {
    slug: "today",
    label: "Today",
    color: 0xd9c26a,
    altColor: 0xf0e2b0,
    css: "#d9c26a",
    core: "sun",
    angle: 0,
    lanes: [
      { r: 4.4, tiltX: 0 },
      { r: 6.2, tiltX: 0 },
    ],
    // Close orbit around the sun; rank = closer ring.
    layout: (i, seed) => {
      const ring = Math.floor(i / 7);
      const a = ((i % 7) / 7) * TAU + seed * 0.9 + ring * 0.45;
      const r = 4.4 + ring * 1.8;
      return { x: Math.cos(a) * r, y: (seeded(seed, 3) - 0.5) * 1.4, z: Math.sin(a) * r };
    },
  },
  {
    slug: "nba",
    label: "NBA",
    color: 0xd98d4f,
    altColor: 0xf2c9a0,
    css: "#d98d4f",
    core: "arena",
    angle: (210 / 360) * TAU,
    lanes: [
      { r: 3.6, tiltX: ARENA_TILT },
      { r: 5.2, tiltX: ARENA_TILT },
      { r: 6.8, tiltX: ARENA_TILT },
    ],
    // Stories race around the arena ring plane; higher rank = inner lane.
    // Golden-angle spacing keeps the ring evenly populated instead of clumped.
    layout: (i, seed) => {
      const a = i * 2.39996 + seeded(seed, 7) * 0.4;
      const r = 3.4 + (i / 40) * 3.6 + seeded(seed, 11) * 0.5;
      const y0 = (seeded(seed, 13) - 0.5) * 0.5;
      return {
        x: Math.cos(a) * r,
        y: y0 + Math.sin(a) * r * Math.sin(ARENA_TILT),
        z: Math.sin(a) * r * Math.cos(ARENA_TILT),
      };
    },
  },
  {
    slug: "tech",
    label: "Tech / VC",
    color: 0x4fc9ae,
    altColor: 0xbfeee2,
    css: "#4fc9ae",
    core: "lattice",
    angle: (30 / 360) * TAU,
    lanes: [], // the grid is the identity — no circular lanes
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
    color: 0x5fbf8a,
    altColor: 0xd88a63,
    css: "#5fbf8a",
    core: "isle",
    angle: (330 / 360) * TAU,
    lanes: [{ r: 4.2, tiltX: 0.18 }],
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
    color: 0x7d96e8,
    altColor: 0xdde3f5,
    css: "#7d96e8",
    core: "rotunda",
    angle: (150 / 360) * TAU,
    lanes: [
      { r: 4.4, tiltX: 0 },
      { r: 6.0, tiltX: 0 },
    ],
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
    color: 0x9db0cc,
    altColor: 0xe8eefc,
    css: "#9db0cc",
    core: "globe",
    angle: (90 / 360) * TAU,
    lanes: [
      { r: 3.6, tiltX: 0.35 },
      { r: 4.6, tiltX: 1.05 },
      { r: 5.6, tiltX: 1.9 },
    ],
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
 * Galaxy position on the galactic plane. Affinity pulls a galaxy toward the
 * sun — the map reshapes itself as the ranking engine learns you.
 */
export function worldPosition(visual: WorldVisual, affinity: number): Vec3 {
  if (visual.slug === "today") return { x: 0, y: 0, z: 0 };
  const r = 30 - affinity * 10; // 30 cold … 20 well-read
  const y = Math.sin(visual.angle * 2.3) * 4.5;
  return { x: Math.cos(visual.angle) * r, y, z: Math.sin(visual.angle) * r };
}

/** Galaxy scale from activity (0..1): a busy day reads visibly larger. */
export function activityScale(activity: number): number {
  return 0.65 + activity * 0.85;
}
