import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  affinities,
  items,
  mutedSources,
  saves,
  sources,
  type Profile,
  type SourceClass,
} from "../db/schema";
import { rankFeed } from "./ranking/feed";
import { affinityKey, type AffinityMap, type FeedEntry } from "./ranking/types";
import { stripHtml } from "./ingest/normalize";

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

function toDTO(entry: FeedEntry, savedIds: Set<number>): FeedItemDTO {
  const { item, source } = entry;
  const hasBody = (item.contentHtml?.length ?? 0) > 500;
  const readingMinutes = hasBody
    ? Math.max(1, Math.round(stripHtml(item.contentHtml!).split(/\s+/).length / WORDS_PER_MINUTE))
    : null;
  return {
    id: item.id,
    title: item.title,
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
  };
}

/** Loads candidates, applies the profile's learned ranking, shapes for the UI. */
export async function loadFeed(profile: Profile): Promise<FeedData> {
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

  const [candidates, affinityMap, savedRows] = await Promise.all([
    db
      .select({ item: items, source: sources })
      .from(items)
      .innerJoin(sources, eq(items.sourceId, sources.id))
      .where(candidateWhere)
      .orderBy(desc(items.publishedAt))
      .limit(CANDIDATE_LIMIT),
    loadAffinityMap(profile.id),
    db.select({ itemId: saves.itemId }).from(saves).where(eq(saves.profileId, profile.id)),
  ]);

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
    .map((c) => toDTO({ item: c.item, source: c.source, score: 0 }, savedIds));

  const updatedAt = candidates.length
    ? candidates.reduce((max, c) => (c.item.fetchedAt > max ? c.item.fetchedAt : max), candidates[0].item.fetchedAt).toISOString()
    : null;

  return { entries: entries.map((e) => toDTO(e, savedIds)), latest, updatedAt };
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
