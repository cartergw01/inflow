import { SUBJECTS, type Subject, type SubjectFamilyId } from "../lib/subjects";

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
  /** Generated editorial portrait used as the world's luminous visual core. */
  portrait: string | null;
  /** Core construction: which builder the engine uses. */
  core: "sun" | "arena" | "lattice" | "isle" | "rotunda" | "globe" | "exchange" | "constellation" | "atom";
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

const todayVisual: WorldVisual = {
  slug: "today",
  label: "Today",
  color: 0xd9c26a,
  altColor: 0xf0e2b0,
  css: "#d9c26a",
  portrait: null,
  core: "sun",
  angle: 0,
  lanes: [{ r: 4.4, tiltX: 0 }, { r: 6.2, tiltX: 0 }],
  layout: (i, seed) => {
    const ring = Math.floor(i / 7);
    const a = ((i % 7) / 7) * TAU + seed * 0.9 + ring * 0.45;
    const r = 4.4 + ring * 1.8;
    return { x: Math.cos(a) * r, y: (seeded(seed, 3) - 0.5) * 1.4, z: Math.sin(a) * r };
  },
};

const familyPalettes: Record<SubjectFamilyId, readonly [number, string, number][]> = {
  technology: [[0x52d8c7, "#52d8c7", 0xb8f1e8], [0x6ee7ff, "#6ee7ff", 0xc7f6ff], [0x85b9f0, "#85b9f0", 0xd3e8ff], [0x62d4a7, "#62d4a7", 0xc8f4df], [0xc5b9ff, "#c5b9ff", 0xeeeaff]],
  world: [[0x9ec5e3, "#9ec5e3", 0xe8f2fa], [0x67c88e, "#67c88e", 0xe5a064], [0x8aa2ee, "#8aa2ee", 0xe3e9f8], [0x71bfa8, "#71bfa8", 0xcdebe1]],
  business: [[0xe6c56c, "#e6c56c", 0xffedb0], [0xd8a45c, "#d8a45c", 0xf5d8a4], [0xe28f64, "#e28f64", 0xf7c5ad], [0xc5bd68, "#c5bd68", 0xece7ac]],
  culture: [[0xc69ee8, "#c69ee8", 0xead8fa], [0xe98bad, "#e98bad", 0xf8c6d8], [0xa888eb, "#a888eb", 0xd8c9f7], [0xd6a6c4, "#d6a6c4", 0xf0dce8]],
  science: [[0x88a8f0, "#88a8f0", 0xd4def8], [0x70d3bc, "#70d3bc", 0xcdf2e9], [0x9bd08d, "#9bd08d", 0xdcefd6]],
  sports: [[0xe2762d, "#e2762d", 0xf3b278], [0x61b982, "#61b982", 0xbfe7ce], [0xd96c67, "#d96c67", 0xf0b6b3], [0xe35a68, "#e35a68", 0xf6abb2]],
};

const familyCore: Record<SubjectFamilyId, WorldVisual["core"]> = {
  technology: "lattice",
  world: "globe",
  business: "exchange",
  culture: "constellation",
  science: "atom",
  sports: "arena",
};

function arenaLayout(i: number, seed: number): Vec3 {
  const a = i * 2.39996 + seeded(seed, 7) * 0.4;
  const r = 3.4 + (i / 40) * 3.6 + seeded(seed, 11) * 0.5;
  const y0 = (seeded(seed, 13) - 0.5) * 0.5;
  return { x: Math.cos(a) * r, y: y0 + Math.sin(a) * r * Math.sin(ARENA_TILT), z: Math.sin(a) * r * Math.cos(ARENA_TILT) };
}

function latticeLayout(_i: number, seed: number): Vec3 {
  const point = {
    x: Math.round((seeded(seed, 17) - 0.5) * 6) * 1.7,
    y: Math.round((seeded(seed, 19) - 0.5) * 4) * 1.5,
    z: Math.round((seeded(seed, 23) - 0.5) * 6) * 1.7,
  };
  if (Math.hypot(point.x, point.y, point.z) >= 3) return point;
  const angle = seeded(seed, 27) * TAU;
  return { x: Math.cos(angle) * 3.4, y: (seeded(seed, 33) - 0.5) * 2.4, z: Math.sin(angle) * 3.4 };
}

function islandLayout(i: number, seed: number): Vec3 {
  const angle = i * 2.39996 + seeded(seed, 29) * 0.8;
  const r = 2.4 + Math.sqrt(i) * 1.15 + seeded(seed, 31) * 0.6;
  return { x: Math.cos(angle) * r, y: 0.6 + (i / 40) * 5.2 + seeded(seed, 37) * 1.6, z: Math.sin(angle) * r * 0.72 };
}

function chamberLayout(i: number, seed: number): Vec3 {
  const side = i % 2 === 0 ? -1 : 1;
  const j = Math.floor(i / 2);
  const angle = ((j % 10) / 10) * Math.PI * 0.85 - Math.PI * 0.425;
  const tier = Math.floor(j / 10);
  return { x: Math.sin(angle) * (3.6 + tier * 1.1 + seeded(seed, 41) * 0.3), y: (j % 3) * 0.55 - 0.4 + tier * 0.3, z: side * (2.8 + Math.cos(angle) * 1.7 + tier * 0.5) };
}

function orbitLayout(i: number, seed: number): Vec3 {
  const orbit = i % 3;
  const inclination = [0.35, 1.05, 1.9][orbit];
  const angle = seeded(seed, 43) * TAU + i * 0.7;
  const r = 3.4 + orbit * 0.9 + (i / 40) * 1.4;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * Math.sin(inclination), z: Math.sin(angle) * r * Math.cos(inclination) };
}

function exchangeLayout(i: number, seed: number): Vec3 {
  const column = i % 7;
  const tier = Math.floor(i / 7);
  const x = (column - 3) * 1.35 + (seeded(seed, 59) - 0.5) * 0.4;
  const z = (tier - 1.5) * 1.8 + (seeded(seed, 61) - 0.5) * 0.5;
  const direction = seeded(seed, 67) > 0.48 ? 1 : -1;
  return { x, y: direction * (2.4 + seeded(seed, 71) * 3.7), z };
}

function constellationLayout(i: number, seed: number): Vec3 {
  const y = 1 - ((i + 0.5) / 28) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = i * 2.39996 + seeded(seed, 73) * 0.7;
  const shell = 4.2 + seeded(seed, 79) * 2.4;
  return { x: Math.cos(angle) * radius * shell, y: y * shell, z: Math.sin(angle) * radius * shell };
}

function atomLayout(i: number, seed: number): Vec3 {
  const orbit = i % 3;
  const angle = i * 1.31 + seeded(seed, 83) * TAU;
  const radius = 3.5 + Math.floor(i / 9) * 1.1 + seeded(seed, 89) * 0.45;
  const inclinations = [0.2, 1.08, 2.04];
  const inclination = inclinations[orbit];
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * Math.sin(inclination), z: Math.sin(angle) * radius * Math.cos(inclination) };
}

function visualForSubject(subject: Subject, index: number): WorldVisual {
  const familySubjects = SUBJECTS.filter((candidate) => candidate.familyId === subject.familyId);
  const familyIndex = familySubjects.findIndex((candidate) => candidate.id === subject.id);
  const [color, css, altColor] = familyPalettes[subject.familyId][familyIndex];
  let core = familyCore[subject.familyId];
  let layout = subject.familyId === "technology" ? latticeLayout
    : subject.familyId === "world" ? orbitLayout
      : subject.familyId === "business" ? exchangeLayout
        : subject.familyId === "culture" ? constellationLayout
          : subject.familyId === "science" ? atomLayout
            : arenaLayout;
  let lanes: Lane[] = subject.familyId === "technology" || subject.familyId === "business" || subject.familyId === "culture" ? []
    : subject.familyId === "science" ? [{ r: 3.7, tiltX: 0.2 }, { r: 4.6, tiltX: 1.08 }, { r: 5.5, tiltX: 2.04 }]
      : subject.familyId === "sports" ? [{ r: 3.6, tiltX: ARENA_TILT }, { r: 5.2, tiltX: ARENA_TILT }, { r: 6.8, tiltX: ARENA_TILT }]
        : [{ r: 3.6, tiltX: 0.35 }, { r: 4.6, tiltX: 1.05 }, { r: 5.6, tiltX: 1.9 }];

  if (subject.id === "taiwan") { core = "isle"; layout = islandLayout; lanes = [{ r: 4.2, tiltX: 0.18 }]; }
  if (subject.id === "us-politics") { core = "rotunda"; layout = chamberLayout; lanes = [{ r: 4.4, tiltX: 0 }, { r: 6, tiltX: 0 }]; }

  return {
    slug: subject.id,
    label: subject.label,
    color,
    altColor,
    css,
    portrait: `/galaxy/worlds/${subject.id}.webp`,
    core,
    angle: -Math.PI / 2 + (index / SUBJECTS.length) * TAU,
    lanes,
    layout,
  };
}

export const WORLD_VISUALS: WorldVisual[] = [todayVisual, ...SUBJECTS.map(visualForSubject)];

export const VISUALS_BY_SLUG = new Map(WORLD_VISUALS.map((w) => [w.slug, w]));

/**
 * Galaxy position on the galactic plane. Affinity pulls a galaxy toward the
 * sun — the map reshapes itself as the ranking engine learns you.
 */
export function worldPosition(visual: WorldVisual, affinity: number, index?: number, count?: number): Vec3 {
  if (visual.slug === "today") return { x: 0, y: 0, z: 0 };
  const angle = typeof index === "number" && typeof count === "number" && count > 0
    ? -Math.PI / 2 + (index / count) * TAU
    : visual.angle;
  const r = 30 - affinity * 10; // 30 cold … 20 well-read
  const y = Math.sin(angle * 2.3) * 4.5;
  return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r };
}

/** Galaxy scale from activity (0..1): a busy day reads visibly larger. */
export function activityScale(activity: number): number {
  return 0.65 + activity * 0.85;
}
