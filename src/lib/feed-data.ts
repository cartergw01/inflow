import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  affinities,
  items,
  mutedSources,
  saves,
  signals,
  sources,
  type CredibilityTier,
  type ItemStatus,
  type Profile,
  type SourceClass,
  type VerificationStatus,
} from "../db/schema";
import { rankFeed } from "./ranking/feed";
import { affinityKey, type AffinityMap, type FeedEntry } from "./ranking/types";
import { CATEGORIES, type Category } from "./categories";
import { activityIndex, isBreaking } from "../galaxy/metrics";

const CANDIDATE_WINDOW_MS = 7 * 24 * 3600_000;
const CANDIDATE_LIMIT = 500;
const FEED_LIMIT = 80;
const WORDS_PER_MINUTE = 230;
const LATEST_WINDOW_MS = 12 * 3600_000;
const LATEST_COUNT = 6;
const FIRST_VISIT_NEW_WINDOW_MS = 6 * 3600_000;
const WORLD_ENTRY_LIMIT = 28;
const BRIEFING_ESSENTIAL_COUNT = 8;
const BRIEFING_MORE_COUNT = 20;

/** Deliberately excludes `contentHtml`, the former multi-megabyte hot-path field. */
const ITEM_SUMMARY_FIELDS = {
  id: items.id,
  sourceId: items.sourceId,
  guid: items.guid,
  author: items.author,
  title: items.title,
  url: items.url,
  canonicalUrl: items.canonicalUrl,
  excerpt: items.excerpt,
  imageUrl: items.imageUrl,
  publishedAt: items.publishedAt,
  fetchedAt: items.fetchedAt,
  sourceUpdatedAt: items.sourceUpdatedAt,
  updatedAt: items.updatedAt,
  firstSeenAt: items.firstSeenAt,
  lastSeenAt: items.lastSeenAt,
  contentFingerprint: items.contentFingerprint,
  wordCount: items.wordCount,
  status: items.status,
  verificationStatus: items.verificationStatus,
  correctionNote: items.correctionNote,
  topics: items.topics,
  clusterId: items.clusterId,
};

export interface FeedItemDTO {
  id: number;
  title: string;
  url: string;
  excerpt: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string;
  fetchedAt: string;
  updatedAt: string;
  sourceCheckedAt: string | null;
  topics: string[];
  sourceId: number;
  sourceName: string;
  sourceHomepageUrl: string | null;
  sourceClass: SourceClass;
  credibilityTier: CredibilityTier;
  hasBody: boolean;
  readingMinutes: number | null;
  exploration: boolean;
  alsoCoveredBy: { sourceName: string; url: string }[];
  saved: boolean;
  read: boolean;
  isNew: boolean;
  status: ItemStatus;
  verificationStatus: VerificationStatus;
  correctionNote: string | null;
}

export interface FeedData {
  entries: FeedItemDTO[];
  latest: FeedItemDTO[];
  updatedAt: string | null;
}

export type GalaxyStoryDTO = Pick<
  FeedItemDTO,
  | "id"
  | "title"
  | "sourceName"
  | "author"
  | "publishedAt"
  | "sourceCheckedAt"
  | "excerpt"
  | "topics"
  | "sourceClass"
  | "url"
  | "readingMinutes"
  | "alsoCoveredBy"
  | "saved"
  | "read"
  | "credibilityTier"
  | "isNew"
  | "status"
  | "verificationStatus"
>;

function toGalaxyStory(entry: FeedItemDTO): GalaxyStoryDTO {
  return {
    id: entry.id,
    title: entry.title,
    sourceName: entry.sourceName,
    author: entry.author,
    publishedAt: entry.publishedAt,
    sourceCheckedAt: entry.sourceCheckedAt,
    excerpt: entry.excerpt,
    topics: entry.topics,
    sourceClass: entry.sourceClass,
    url: entry.url,
    readingMinutes: entry.readingMinutes,
    alsoCoveredBy: entry.alsoCoveredBy,
    saved: entry.saved,
    read: entry.read,
    credibilityTier: entry.credibilityTier,
    isNew: entry.isNew,
    status: entry.status,
    verificationStatus: entry.verificationStatus,
  };
}

export async function loadAffinityMap(profileId: string): Promise<AffinityMap> {
  const rows = await getDb().select().from(affinities).where(eq(affinities.profileId, profileId));
  return new Map(rows.map((row) => [affinityKey(row.dimension, row.key), { weight: row.weight, updatedAt: row.updatedAt }]));
}

function toDTO(
  entry: FeedEntry,
  savedIds: Set<number>,
  readIds: Set<number> = new Set(),
  newSince?: Date,
): FeedItemDTO {
  const { item, source } = entry;
  const hasBody = item.wordCount > 0;
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    excerpt: item.excerpt,
    author: item.author,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt.toISOString(),
    fetchedAt: item.fetchedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    sourceCheckedAt: source.lastSuccessfulFetchAt?.toISOString() ?? null,
    topics: item.topics,
    sourceId: source.id,
    sourceName: source.name,
    sourceHomepageUrl: source.homepageUrl,
    sourceClass: source.sourceClass,
    credibilityTier: source.credibilityTier,
    hasBody,
    readingMinutes: hasBody ? Math.max(1, Math.round(item.wordCount / WORDS_PER_MINUTE)) : null,
    exploration: entry.exploration ?? false,
    alsoCoveredBy: entry.alsoCoveredBy ?? [],
    saved: savedIds.has(item.id),
    read: readIds.has(item.id),
    isNew: Boolean(newSince && item.publishedAt > newSince),
    status: item.status,
    verificationStatus: item.verificationStatus,
    correctionNote: item.correctionNote,
  };
}

async function loadReadIds(profileId: string): Promise<Set<number>> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000);
  const rows = await getDb()
    .selectDistinct({ itemId: signals.itemId })
    .from(signals)
    .where(and(eq(signals.profileId, profileId), eq(signals.type, "open"), gte(signals.createdAt, since)));
  return new Set(rows.map((row) => row.itemId));
}

async function loadCandidateBundle(profile: Profile) {
  const db = getDb();
  const since = new Date(Date.now() - CANDIDATE_WINDOW_MS);
  const [allCandidates, affinityMap, savedRows, readIds, mutedRows, activeSources] = await Promise.all([
    db
      .select({ item: ITEM_SUMMARY_FIELDS, source: sources })
      .from(items)
      .innerJoin(sources, eq(items.sourceId, sources.id))
      .where(gte(items.publishedAt, since))
      .orderBy(desc(items.publishedAt))
      .limit(CANDIDATE_LIMIT),
    loadAffinityMap(profile.id),
    db.select({ itemId: saves.itemId }).from(saves).where(eq(saves.profileId, profile.id)),
    loadReadIds(profile.id),
    db.select({ sourceId: mutedSources.sourceId }).from(mutedSources).where(eq(mutedSources.profileId, profile.id)),
    db
      .select({ id: sources.id, lastSuccessfulFetchAt: sources.lastSuccessfulFetchAt, pollIntervalMinutes: sources.pollIntervalMinutes })
      .from(sources)
      .where(eq(sources.active, true)),
  ]);
  const mutedIds = new Set(mutedRows.map((row) => row.sourceId));
  return {
    candidates: allCandidates.filter((candidate) => !mutedIds.has(candidate.source.id)),
    affinityMap,
    savedIds: new Set(savedRows.map((row) => row.itemId)),
    readIds,
    activeSources,
  };
}

export async function loadTabCounts(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 6 * 3600_000);
  const rows = await getDb().select({ topics: items.topics }).from(items).where(gte(items.publishedAt, since));
  const counts: Record<string, number> = {};
  for (const category of CATEGORIES) {
    if (category.topics.length === 0) continue;
    counts[category.slug] = Math.min(rows.filter((row) => row.topics.some((topic) => category.topics.includes(topic))).length, 99);
  }
  return counts;
}

export async function loadFeed(profile: Profile, category?: Category): Promise<FeedData> {
  const { candidates: allCandidates, affinityMap, savedIds, readIds } = await loadCandidateBundle(profile);
  const topics = category?.topics ?? [];
  const candidates = topics.length === 0
    ? allCandidates
    : allCandidates.filter((candidate) => candidate.item.topics.some((topic) => topics.includes(topic)));
  const now = new Date();
  const entries = rankFeed({ candidates, affinities: affinityMap, seedInterests: profile.interests, now, opts: { limit: FEED_LIMIT } });
  const latest = candidates
    .filter((candidate) => candidate.source.sourceClass === "social" && now.getTime() - candidate.item.publishedAt.getTime() < LATEST_WINDOW_MS)
    .sort((a, b) => b.item.publishedAt.getTime() - a.item.publishedAt.getTime())
    .slice(0, LATEST_COUNT)
    .map((candidate) => toDTO({ item: candidate.item, source: candidate.source, score: 0 }, savedIds, readIds));
  const updatedAt = allCandidates.length > 0
    ? allCandidates.reduce((max, candidate) => candidate.item.updatedAt > max ? candidate.item.updatedAt : max, allCandidates[0].item.updatedAt).toISOString()
    : null;
  return { entries: entries.map((entry) => toDTO(entry, savedIds, readIds)), latest, updatedAt };
}

export interface WorldData {
  slug: string;
  label: string;
  affinity: number;
  activity: number;
  breaking: boolean;
  newCount: number;
  entries: FeedItemDTO[];
}

export interface GalaxyWorldWireData extends Omit<WorldData, "entries"> {
  entryIds: number[];
}

export interface GalaxyData {
  worlds: GalaxyWorldWireData[];
  today: GalaxyWorldWireData;
  stories: Record<string, GalaxyStoryDTO>;
  updatedAt: string | null;
  lastVisitAt: string | null;
  newCount: number;
  catchUpIds: number[];
  freshness: {
    latestCheckedAt: string | null;
    oldestCheckedAt: string | null;
    staleSourceCount: number;
    totalSources: number;
  };
}

export interface BriefingWorldSummary {
  slug: string;
  label: string;
  affinity: number;
  activity: number;
  breaking: boolean;
  newCount: number;
}

/** Lightweight first paint payload. The universe hydrates independently. */
export interface BriefingPayload {
  essentialIds: number[];
  moreIds: number[];
  stories: Record<string, GalaxyStoryDTO>;
  worlds: BriefingWorldSummary[];
  updatedAt: string | null;
  lastVisitAt: string | null;
  newCount: number;
  freshness: GalaxyData["freshness"];
}

function sourceFreshness(activeSources: Array<{ lastSuccessfulFetchAt: Date | null; pollIntervalMinutes: number }>, now: Date) {
  const successfulChecks = activeSources.flatMap((source) => source.lastSuccessfulFetchAt ? [source.lastSuccessfulFetchAt] : []);
  return {
    latestCheckedAt: successfulChecks.length > 0 ? new Date(Math.max(...successfulChecks.map((date) => date.getTime()))).toISOString() : null,
    oldestCheckedAt: successfulChecks.length > 0 ? new Date(Math.min(...successfulChecks.map((date) => date.getTime()))).toISOString() : null,
    staleSourceCount: activeSources.filter((source) => {
      if (!source.lastSuccessfulFetchAt) return true;
      return now.getTime() - source.lastSuccessfulFetchAt.getTime() > Math.max(15, source.pollIntervalMinutes * 2) * 60_000;
    }).length,
    totalSources: activeSources.length,
  };
}

export async function loadBriefing(profile: Profile): Promise<BriefingPayload> {
  const { candidates, affinityMap, savedIds, readIds, activeSources } = await loadCandidateBundle(profile);
  const now = new Date();
  const newSince = profile.lastFeedOpenedAt ?? new Date(now.getTime() - FIRST_VISIT_NEW_WINDOW_MS);
  const ranked = rankFeed({
    candidates,
    affinities: affinityMap,
    seedInterests: profile.interests,
    now,
    opts: { limit: BRIEFING_ESSENTIAL_COUNT + BRIEFING_MORE_COUNT },
  }).map((entry) => toDTO(entry, savedIds, readIds, newSince));
  const readingOrder = [...ranked.filter((entry) => !entry.read), ...ranked.filter((entry) => entry.read)];
  const essential = readingOrder.slice(0, BRIEFING_ESSENTIAL_COUNT);
  const more = readingOrder.slice(BRIEFING_ESSENTIAL_COUNT);
  const visible = [...essential, ...more];

  const worlds = CATEGORIES.slice(1).map((category) => {
    const scopedCandidates = candidates.filter((candidate) => candidate.item.topics.some((topic) => category.topics.includes(topic)));
    const scopedEntries = visible.filter((entry) => entry.topics.some((topic) => category.topics.includes(topic)));
    const weight = category.topics.reduce((sum, topic) => {
      const affinity = affinityMap.get(affinityKey("topic", topic));
      return sum + Math.max(0, affinity?.weight ?? 0);
    }, 0);
    return {
      slug: category.slug,
      label: category.label,
      affinity: Math.tanh(weight / 6),
      activity: activityIndex(scopedCandidates.map((candidate) => ({ publishedAt: candidate.item.publishedAt })), now.getTime()),
      breaking: isBreaking(scopedEntries, now.getTime()),
      newCount: scopedEntries.filter((entry) => entry.isNew && !entry.read).length,
    };
  });

  const updatedAt = candidates.length > 0
    ? candidates.reduce((max, candidate) => candidate.item.updatedAt > max ? candidate.item.updatedAt : max, candidates[0].item.updatedAt).toISOString()
    : null;
  const newCount = candidates.filter((candidate) => candidate.item.publishedAt > newSince && !readIds.has(candidate.item.id)).length;

  return {
    essentialIds: essential.map((entry) => entry.id),
    moreIds: more.map((entry) => entry.id),
    stories: Object.fromEntries(visible.map((entry) => [String(entry.id), toGalaxyStory(entry)])),
    worlds,
    updatedAt,
    lastVisitAt: profile.lastFeedOpenedAt?.toISOString() ?? null,
    newCount,
    freshness: sourceFreshness(activeSources, now),
  };
}

export async function searchFeed(profile: Profile, query: string, limit = 20): Promise<FeedItemDTO[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const { candidates, affinityMap, savedIds, readIds } = await loadCandidateBundle(profile);
  const matches = candidates.filter(({ item, source }) => [
    item.title,
    item.author ?? "",
    source.name,
    ...item.topics,
  ].some((value) => value.toLowerCase().includes(needle)));
  const now = new Date();
  return rankFeed({
    candidates: matches,
    affinities: affinityMap,
    seedInterests: profile.interests,
    now,
    opts: { limit },
  }).map((entry) => toDTO(entry, savedIds, readIds));
}

export async function loadGalaxy(profile: Profile): Promise<GalaxyData> {
  const { candidates, affinityMap, savedIds, readIds, activeSources } = await loadCandidateBundle(profile);
  const now = new Date();
  const newSince = profile.lastFeedOpenedAt ?? new Date(now.getTime() - FIRST_VISIT_NEW_WINDOW_MS);

  const buildWorld = (category: Category): WorldData => {
    const scoped = category.topics.length === 0
      ? candidates
      : candidates.filter((candidate) => candidate.item.topics.some((topic) => category.topics.includes(topic)));
    const entries = rankFeed({
      candidates: scoped,
      affinities: affinityMap,
      seedInterests: profile.interests,
      now,
      opts: { limit: WORLD_ENTRY_LIMIT },
    }).map((entry) => toDTO(entry, savedIds, readIds, newSince));
    const weight = category.topics.reduce((sum, topic) => {
      const entry = affinityMap.get(affinityKey("topic", topic));
      return sum + Math.max(0, entry?.weight ?? 0);
    }, 0);
    return {
      slug: category.slug,
      label: category.label,
      affinity: Math.tanh(weight / 6),
      activity: activityIndex(scoped.map((candidate) => ({ publishedAt: candidate.item.publishedAt })), now.getTime()),
      breaking: isBreaking(entries, now.getTime()),
      newCount: entries.filter((entry) => entry.isNew && !entry.read).length,
      entries,
    };
  };

  const [todayCategory, ...worldCategories] = CATEGORIES;
  const todayFull = buildWorld(todayCategory);
  const today = { ...todayFull, entries: todayFull.entries.slice(0, 14) };
  const worlds = worldCategories.map(buildWorld);
  const visible = [today, ...worlds].flatMap((world) => world.entries);
  const uniqueNew = new Map(visible.filter((entry) => entry.isNew && !entry.read).map((entry) => [entry.id, entry]));
  const updatedAt = candidates.length > 0
    ? candidates.reduce((max, candidate) => candidate.item.updatedAt > max ? candidate.item.updatedAt : max, candidates[0].item.updatedAt).toISOString()
    : null;

  const stories = Object.fromEntries(new Map(visible.map((entry) => [String(entry.id), toGalaxyStory(entry)])));
  const toWireWorld = ({ entries, ...world }: WorldData): GalaxyWorldWireData => ({
    ...world,
    entryIds: entries.map((entry) => entry.id),
  });
  const catchUp = [...uniqueNew.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 8);

  return {
    today: toWireWorld(today),
    worlds: worlds.map(toWireWorld),
    stories,
    updatedAt,
    lastVisitAt: profile.lastFeedOpenedAt?.toISOString() ?? null,
    newCount: uniqueNew.size,
    catchUpIds: catchUp.map((entry) => entry.id),
    freshness: sourceFreshness(activeSources, now),
  };
}

export async function loadSaved(profile: Profile): Promise<FeedItemDTO[]> {
  const db = getDb();
  const [rows, readIds] = await Promise.all([
    db
      .select({ item: ITEM_SUMMARY_FIELDS, source: sources, savedAt: saves.createdAt })
      .from(saves)
      .innerJoin(items, eq(saves.itemId, items.id))
      .innerJoin(sources, eq(items.sourceId, sources.id))
      .where(eq(saves.profileId, profile.id))
      .orderBy(desc(saves.createdAt)),
    loadReadIds(profile.id),
  ]);
  const savedIds = new Set(rows.map((row) => row.item.id));
  return rows.map((row) => toDTO({ item: row.item, source: row.source, score: 0 }, savedIds, readIds));
}

export interface SourceWithState {
  id: number;
  name: string;
  homepageUrl: string | null;
  sourceClass: SourceClass;
  kind: string;
  topicHints: string[];
  credibilityTier: CredibilityTier;
  pollIntervalMinutes: number;
  lastSuccessfulFetchAt: string | null;
  lastStatus: string | null;
  muted: boolean;
}

export async function loadSources(profile: Profile): Promise<SourceWithState[]> {
  const db = getDb();
  const [all, muted] = await Promise.all([
    db.select().from(sources).where(eq(sources.active, true)).orderBy(sources.name),
    db.select({ sourceId: mutedSources.sourceId }).from(mutedSources).where(eq(mutedSources.profileId, profile.id)),
  ]);
  const mutedIds = new Set(muted.map((row) => row.sourceId));
  return all.map((source) => ({
    id: source.id,
    name: source.name,
    homepageUrl: source.homepageUrl,
    sourceClass: source.sourceClass,
    kind: source.kind,
    topicHints: source.topicHints,
    credibilityTier: source.credibilityTier,
    pollIntervalMinutes: source.pollIntervalMinutes,
    lastSuccessfulFetchAt: source.lastSuccessfulFetchAt?.toISOString() ?? null,
    lastStatus: source.lastStatus,
    muted: mutedIds.has(source.id),
  }));
}

export async function loadItem(id: number) {
  const [row] = await getDb()
    .select({ item: items, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(eq(items.id, id))
    .limit(1);
  return row ?? null;
}

/** One database request for article, source, and saved state. */
export async function loadReaderItem(id: number, profileId: string | null) {
  const savedExpression = profileId
    ? sql<boolean>`exists (select 1 from ${saves} where ${saves.profileId} = ${profileId} and ${saves.itemId} = ${items.id})`
    : sql<boolean>`false`;
  const [row] = await getDb()
    .select({ item: items, source: sources, saved: savedExpression })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(eq(items.id, id))
    .limit(1);
  return row ?? null;
}

export async function loadItemsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  return getDb()
    .select({ item: ITEM_SUMMARY_FIELDS, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(inArray(items.id, ids));
}
