import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  affinities,
  items,
  mutedSources,
  saves,
  signals,
  sources,
  type Profile,
  type SourceClass,
} from "../db/schema";
import { rankFeed } from "./ranking/feed";
import { affinityKey, type AffinityMap, type FeedEntry } from "./ranking/types";
import { stripHtml } from "./ingest/normalize";
import { CATEGORIES, type Category } from "./categories";

const CANDIDATE_WINDOW_MS = 7 * 24 * 3600_000;
const CANDIDATE_LIMIT = 500;
const FEED_LIMIT = 80;
const WORDS_PER_MINUTE = 230;

/** Everything a feed row needs to render — no HTML bodies, JSON-safe. */
export interface FeedItemDTO {
  id: number;
  title: string;
  url: string;
  excerpt: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string;
  topics: string[];
  sourceId: number;
  sourceName: string;
  sourceClass: SourceClass;
  /** True when we hold full text and can render the in-app reader. */
  hasBody: boolean;
  readingMinutes: number | null;
  exploration: boolean;
  alsoCoveredBy: { sourceName: string; url: string }[];
  saved: boolean;
  /** True when this profile has opened the item (read state, not impressions). */
  read: boolean;
}

export interface FeedData {
  entries: FeedItemDTO[];
  /**
   * "The Latest" ticker: newest social-class items by clock, independent of
   * rank — breaking signal shouldn't have to win the ranking to be visible.
   */
  latest: FeedItemDTO[];
  /** Newest publishedAt in the feed, for the masthead "updated" line. */
  updatedAt: string | null;
}

const LATEST_WINDOW_MS = 12 * 3600_000;
const LATEST_COUNT = 6;

export async function loadAffinityMap(profileId: string): Promise<AffinityMap> {
  const db = getDb();
  const rows = await db.select().from(affinities).where(eq(affinities.profileId, profileId));
  return new Map(rows.map((r) => [affinityKey(r.dimension, r.key), { weight: r.weight, updatedAt: r.updatedAt }]));
}

function toDTO(entry: FeedEntry, savedIds: Set<number>, readIds: Set<number> = new Set()): FeedItemDTO {
  const { item, source } = entry;
  const hasBody = (item.contentHtml?.length ?? 0) > 500;
  const readingMinutes = hasBody
    ? Math.max(1, Math.round(stripHtml(item.contentHtml!).split(/\s+/).length / WORDS_PER_MINUTE))
    : null;
  return {
    id: item.id,
    // Legacy rows may hold entity-encoded titles; decoding is idempotent.
    title: stripHtml(item.title),
    url: item.url,
    excerpt: item.excerpt,
    author: item.author,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt.toISOString(),
    topics: item.topics,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.sourceClass,
    hasBody,
    readingMinutes,
    exploration: entry.exploration ?? false,
    alsoCoveredBy: entry.alsoCoveredBy ?? [],
    saved: savedIds.has(item.id),
    read: readIds.has(item.id),
  };
}

/** Ids of items this profile has opened recently — the read/unread state. */
async function loadReadIds(profileId: string): Promise<Set<number>> {
  const db = getDb();
  const since = new Date(Date.now() - 14 * 24 * 3600_000);
  const rows = await db
    .selectDistinct({ itemId: signals.itemId })
    .from(signals)
    .where(and(eq(signals.profileId, profileId), eq(signals.type, "open"), gte(signals.createdAt, since)));
  return new Set(rows.map((r) => r.itemId));
}

/**
 * "New in the last 6h" per navigation tab — a pulse, not an inbox. Deliberately
 * not per-profile "unseen" counts (those decay to zero while you read and feel
 * broken). Today gets no count: the aggregate is always large and means nothing.
 */
export async function loadTabCounts(): Promise<Record<string, number>> {
  const db = getDb();
  const since = new Date(Date.now() - 6 * 3600_000);
  const rows = await db
    .select({ topics: items.topics })
    .from(items)
    .where(gte(items.publishedAt, since));
  const counts: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    if (cat.topics.length === 0) continue; // Today: no count
    counts[cat.slug] = Math.min(
      rows.filter((r) => r.topics.some((t) => cat.topics.includes(t))).length,
      99,
    );
  }
  return counts;
}

/**
 * Loads candidates, applies the profile's learned ranking, shapes for the UI.
 * With a category, both the ranked list and the ticker are scoped to that
 * tab's topics — same ranking engine, narrower candidate pool.
 */
export async function loadFeed(profile: Profile, category?: Category): Promise<FeedData> {
  const db = getDb();
  const since = new Date(Date.now() - CANDIDATE_WINDOW_MS);

  const muted = await db
    .select({ sourceId: mutedSources.sourceId })
    .from(mutedSources)
    .where(eq(mutedSources.profileId, profile.id));
  const mutedIds = muted.map((m) => m.sourceId);

  const candidateWhere = mutedIds.length
    ? and(gte(items.publishedAt, since), notInArray(items.sourceId, mutedIds))
    : gte(items.publishedAt, since);

  const [allCandidates, affinityMap, savedRows, readIds] = await Promise.all([
    db
      .select({ item: items, source: sources })
      .from(items)
      .innerJoin(sources, eq(items.sourceId, sources.id))
      .where(candidateWhere)
      .orderBy(desc(items.publishedAt))
      .limit(CANDIDATE_LIMIT),
    loadAffinityMap(profile.id),
    db.select({ itemId: saves.itemId }).from(saves).where(eq(saves.profileId, profile.id)),
    loadReadIds(profile.id),
  ]);

  const topics = category?.topics ?? [];
  const candidates =
    topics.length === 0
      ? allCandidates
      : allCandidates.filter((c) => c.item.topics.some((t) => topics.includes(t)));

  const savedIds = new Set(savedRows.map((s) => s.itemId));
  const now = new Date();
  const entries = rankFeed({
    candidates,
    affinities: affinityMap,
    seedInterests: profile.interests,
    now,
    opts: { limit: FEED_LIMIT },
  });

  const latest = candidates
    .filter(
      (c) =>
        c.source.sourceClass === "social" &&
        now.getTime() - c.item.publishedAt.getTime() < LATEST_WINDOW_MS,
    )
    .sort((a, b) => b.item.publishedAt.getTime() - a.item.publishedAt.getTime())
    .slice(0, LATEST_COUNT)
    .map((c) => toDTO({ item: c.item, source: c.source, score: 0 }, savedIds, readIds));

  const updatedAt = allCandidates.length
    ? allCandidates.reduce((max, c) => (c.item.fetchedAt > max ? c.item.fetchedAt : max), allCandidates[0].item.fetchedAt).toISOString()
    : null;

  return { entries: entries.map((e) => toDTO(e, savedIds, readIds)), latest, updatedAt };
}

export interface WorldData {
  slug: string;
  label: string;
  /** Normalized learned affinity 0..1 — drives orbital distance in the galaxy. */
  affinity: number;
  newCount: number;
  entries: FeedItemDTO[];
}

export interface GalaxyData {
  worlds: WorldData[];
  /** The Today briefing — the sun at the center. */
  today: WorldData;
  updatedAt: string | null;
}

const WORLD_ENTRY_LIMIT = 40;

/**
 * Everything the galaxy renders, in one payload: one candidate fetch, then
 * the same pure ranking engine run once per world over its topic-scoped
 * subset. Affinity per world is the profile's decayed topic weights summed
 * and squashed — it moves worlds closer to the sun as you read them.
 */
export async function loadGalaxy(profile: Profile): Promise<GalaxyData> {
  const db = getDb();
  const since = new Date(Date.now() - CANDIDATE_WINDOW_MS);

  const muted = await db
    .select({ sourceId: mutedSources.sourceId })
    .from(mutedSources)
    .where(eq(mutedSources.profileId, profile.id));
  const mutedIds = muted.map((m) => m.sourceId);
  const candidateWhere = mutedIds.length
    ? and(gte(items.publishedAt, since), notInArray(items.sourceId, mutedIds))
    : gte(items.publishedAt, since);

  const [candidates, affinityMap, savedRows, readIds] = await Promise.all([
    db
      .select({ item: items, source: sources })
      .from(items)
      .innerJoin(sources, eq(items.sourceId, sources.id))
      .where(candidateWhere)
      .orderBy(desc(items.publishedAt))
      .limit(CANDIDATE_LIMIT),
    loadAffinityMap(profile.id),
    db.select({ itemId: saves.itemId }).from(saves).where(eq(saves.profileId, profile.id)),
    loadReadIds(profile.id),
  ]);

  const savedIds = new Set(savedRows.map((s) => s.itemId));
  const now = new Date();
  const dayAgo = now.getTime() - 24 * 3600_000;

  const buildWorld = (cat: Category): WorldData => {
    const scoped =
      cat.topics.length === 0
        ? candidates
        : candidates.filter((c) => c.item.topics.some((t) => cat.topics.includes(t)));
    const entries = rankFeed({
      candidates: scoped,
      affinities: affinityMap,
      seedInterests: profile.interests,
      now,
      opts: { limit: WORLD_ENTRY_LIMIT },
    }).map((e) => toDTO(e, savedIds, readIds));
    const weight = cat.topics.reduce((sum, t) => {
      const entry = affinityMap.get(affinityKey("topic", t));
      return sum + Math.max(0, entry?.weight ?? 0);
    }, 0);
    return {
      slug: cat.slug,
      label: cat.label,
      affinity: Math.tanh(weight / 6),
      // Count within the ranked set the user will actually see, not the
      // whole candidate pool — "40 stories · 197 new" reads as a bug.
      newCount: entries.filter((e) => new Date(e.publishedAt).getTime() > dayAgo).length,
      entries,
    };
  };

  const [todayCat, ...worldCats] = CATEGORIES;
  const updatedAt = candidates.length
    ? candidates
        .reduce((max, c) => (c.item.fetchedAt > max ? c.item.fetchedAt : max), candidates[0].item.fetchedAt)
        .toISOString()
    : null;

  const today = buildWorld(todayCat);
  return {
    today: { ...today, entries: today.entries.slice(0, 14) },
    worlds: worldCats.map(buildWorld),
    updatedAt,
  };
}

/** Saved-for-later list, newest first. */
export async function loadSaved(profile: Profile): Promise<FeedItemDTO[]> {
  const db = getDb();
  const rows = await db
    .select({ item: items, source: sources, savedAt: saves.createdAt })
    .from(saves)
    .innerJoin(items, eq(saves.itemId, items.id))
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(eq(saves.profileId, profile.id))
    .orderBy(desc(saves.createdAt));
  const savedIds = new Set(rows.map((r) => r.item.id));
  return rows.map((r) => toDTO({ item: r.item, source: r.source, score: 0 }, savedIds));
}

export interface SourceWithState {
  id: number;
  name: string;
  homepageUrl: string | null;
  sourceClass: SourceClass;
  kind: string;
  topicHints: string[];
  muted: boolean;
}

export async function loadSources(profile: Profile): Promise<SourceWithState[]> {
  const db = getDb();
  const [all, muted] = await Promise.all([
    db.select().from(sources).where(eq(sources.active, true)).orderBy(sources.name),
    db.select({ sourceId: mutedSources.sourceId }).from(mutedSources).where(eq(mutedSources.profileId, profile.id)),
  ]);
  const mutedIds = new Set(muted.map((m) => m.sourceId));
  return all.map((s) => ({
    id: s.id,
    name: s.name,
    homepageUrl: s.homepageUrl,
    sourceClass: s.sourceClass,
    kind: s.kind,
    topicHints: s.topicHints,
    muted: mutedIds.has(s.id),
  }));
}

/** Single item + source for the reader page. */
export async function loadItem(id: number) {
  const db = getDb();
  const [row] = await db
    .select({ item: items, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(eq(items.id, id))
    .limit(1);
  return row ?? null;
}

/** Items by ids with sources, for the signals endpoint. */
export async function loadItemsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  return db
    .select({ item: items, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(inArray(items.id, ids));
}
