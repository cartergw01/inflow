import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import {
  clusters,
  items,
  itemVersions,
  sources,
  type NewItem,
  type Source,
  type SourceKind,
  type VerificationStatus,
} from "../../db/schema";
import { SOURCE_REGISTRY } from "./registry";
import { classify } from "./classify";
import {
  canonicalizeUrl,
  countWords,
  fingerprintContent,
  makeExcerpt,
  sanitizeContent,
  stripHtml,
} from "./normalize";
import { clusterKey, findClusterMatch, type Clusterable } from "./cluster";
import { verificationForGroup } from "./credibility";
import { rssAdapter } from "./adapters/rss";
import { hnAdapter } from "./adapters/hn";
import { blueskyAdapter } from "./adapters/bluesky";
import { xAdapter } from "./adapters/x";
import type { IngestSourceStat, IngestStats, RawItem, SourceAdapter } from "./types";

const ADAPTERS: Record<SourceKind, SourceAdapter> = {
  rss: rssAdapter,
  substack: rssAdapter,
  hn: hnAdapter,
  bluesky: blueskyAdapter,
  x: xAdapter,
};

const MAX_AGE_MS: Record<string, number> = {
  social: 48 * 3600_000,
  news: 7 * 24 * 3600_000,
  longform: 60 * 24 * 3600_000,
};

const FETCH_CONCURRENCY = 6;
const CLUSTER_WINDOW_MS = 72 * 3600_000;

export function sourceIsDue(source: Pick<Source, "nextFetchAt">, now: Date, force = false): boolean {
  return force || !source.nextFetchAt || source.nextFetchAt <= now;
}

async function syncRegistry(db: Db): Promise<void> {
  for (const entry of SOURCE_REGISTRY) {
    await db
      .insert(sources)
      .values(entry)
      .onConflictDoUpdate({
        target: sources.feedUrl,
        set: {
          kind: entry.kind,
          sourceClass: entry.sourceClass,
          name: entry.name,
          homepageUrl: entry.homepageUrl,
          topicHints: entry.topicHints,
          qualityPrior: entry.qualityPrior,
          credibilityTier: entry.credibilityTier,
          sourceFamily: entry.sourceFamily,
          pollIntervalMinutes: entry.pollIntervalMinutes,
          namedAuthorRequired: entry.namedAuthorRequired,
        },
      });
  }
}

function toNewItem(raw: RawItem, source: Source, now: Date): NewItem | null {
  if (source.namedAuthorRequired && !raw.author?.trim()) return null;
  const maxAge = MAX_AGE_MS[source.sourceClass] ?? MAX_AGE_MS.news;
  if (now.getTime() - raw.publishedAt.getTime() > maxAge) return null;

  let publishedAt = raw.publishedAt;
  if (publishedAt.getTime() > now.getTime()) {
    if (publishedAt.getTime() > now.getTime() + 26 * 3600_000) return null;
    publishedAt = now;
  }

  const excerpt = makeExcerpt(raw.excerpt, raw.contentHtml);
  const contentHtml = raw.contentHtml ? sanitizeContent(raw.contentHtml) : null;
  const title = stripHtml(raw.title);
  const url = raw.url.trim();
  const canonicalUrl = canonicalizeUrl(raw.canonicalUrl ?? url);
  const status = raw.statusHint ?? "active";
  const verificationStatus: VerificationStatus = source.credibilityTier === "social" ? "unconfirmed" : "reported";
  const fingerprint = fingerprintContent([title, excerpt, contentHtml, canonicalUrl, status, raw.updatedAt?.toISOString()]);

  return {
    sourceId: source.id,
    guid: raw.guid,
    author: raw.author?.trim() || null,
    title,
    url,
    canonicalUrl,
    excerpt,
    contentHtml,
    imageUrl: raw.imageUrl,
    publishedAt,
    sourceUpdatedAt: raw.updatedAt ?? null,
    updatedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    contentFingerprint: fingerprint,
    wordCount: countWords(contentHtml),
    status,
    verificationStatus,
    correctionNote: raw.correctionNote ?? null,
    topics: classify(raw.title, excerpt, source.topicHints),
  };
}

async function mapPool<T, R>(inputs: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const index = next++;
      results[index] = await fn(inputs[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

async function upsertRows(db: Db, source: Source, rows: NewItem[], now: Date): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const guids = [...new Set(rows.map((row) => row.guid))];
  const existing = await db
    .select()
    .from(items)
    .where(and(eq(items.sourceId, source.id), inArray(items.guid, guids)));
  const byGuid = new Map(existing.map((item) => [item.guid, item]));
  const newRows = rows.filter((row) => !byGuid.has(row.guid));
  let inserted = 0;

  if (newRows.length > 0) {
    const result = await db
      .insert(items)
      .values(newRows)
      .onConflictDoNothing({ target: [items.sourceId, items.guid] })
      .returning({ id: items.id });
    inserted = result.length;
  }

  await db
    .update(items)
    .set({ lastSeenAt: now })
    .where(and(eq(items.sourceId, source.id), inArray(items.guid, guids)));

  const changed = rows.filter((row) => {
    const previous = byGuid.get(row.guid);
    return previous && previous.contentFingerprint !== row.contentFingerprint;
  });

  if (changed.length > 0) {
    const versioned = changed.filter((row) => byGuid.get(row.guid)!.contentFingerprint !== "");
    if (versioned.length > 0) await db.insert(itemVersions).values(versioned.map((row) => {
      const previous = byGuid.get(row.guid)!;
      return {
        itemId: previous.id,
        title: previous.title,
        excerpt: previous.excerpt,
        contentFingerprint: previous.contentFingerprint,
        status: previous.status,
        capturedAt: now,
      };
    }));

    for (const row of changed) {
      const previous = byGuid.get(row.guid)!;
      const status = previous.contentFingerprint === "" ? row.status : row.status === "active" ? "updated" : row.status;
      await db
        .update(items)
        .set({
          author: row.author,
          title: row.title,
          url: row.url,
          canonicalUrl: row.canonicalUrl,
          excerpt: row.excerpt,
          contentHtml: row.contentHtml,
          imageUrl: row.imageUrl,
          publishedAt: row.publishedAt,
          sourceUpdatedAt: row.sourceUpdatedAt,
          updatedAt: now,
          lastSeenAt: now,
          contentFingerprint: row.contentFingerprint,
          wordCount: row.wordCount,
          status,
          correctionNote: row.correctionNote,
          topics: row.topics,
          clusterId: null,
        })
        .where(eq(items.id, previous.id));
    }
  }

  return { inserted, updated: changed.length };
}

async function ingestSource(db: Db, source: Source, now: Date): Promise<IngestSourceStat> {
  const adapter = ADAPTERS[source.kind];
  try {
    const result = await adapter.fetch(source);
    const rows = result.notModified
      ? []
      : result.items.map((raw) => toNewItem(raw, source, now)).filter((row): row is NewItem => row !== null);
    const counts = await upsertRows(db, source, rows, now);
    const nextFetchAt = new Date(now.getTime() + source.pollIntervalMinutes * 60_000);

    await db
      .update(sources)
      .set({
        etag: result.etag,
        lastModified: result.lastModified,
        lastFetchedAt: now,
        lastSuccessfulFetchAt: now,
        nextFetchAt,
        lastStatus: result.notModified ? "not-modified" : `ok:${counts.inserted}+${counts.updated}u`,
      })
      .where(eq(sources.id, source.id));

    return { source: source.name, fetched: result.items.length, inserted: counts.inserted, updated: counts.updated, status: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(sources)
      .set({
        lastFetchedAt: now,
        nextFetchAt: new Date(now.getTime() + Math.min(5, source.pollIntervalMinutes) * 60_000),
        lastStatus: `error: ${message.slice(0, 200)}`,
      })
      .where(eq(sources.id, source.id));
    return { source: source.name, fetched: 0, inserted: 0, updated: 0, status: `error: ${message}` };
  }
}

async function clusterAndVerifyRecent(db: Db, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - CLUSTER_WINDOW_MS);
  const recent = await db
    .select({ item: items, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(gte(items.publishedAt, windowStart));

  const pool: Clusterable[] = recent.map(({ item }) => ({
    id: item.id,
    title: item.title,
    sourceId: item.sourceId,
    clusterId: item.clusterId,
    canonicalUrl: item.canonicalUrl,
  }));
  let clustered = 0;

  for (const item of pool) {
    if (item.clusterId !== null) continue;
    const match = findClusterMatch(item, pool.filter((candidate) => candidate.id !== item.id));
    if (!match) continue;

    let clusterId = match.clusterId;
    if (clusterId === null) {
      const [created] = await db
        .insert(clusters)
        .values({ key: clusterKey(match.title), title: match.title })
        .returning({ id: clusters.id });
      clusterId = created.id;
      await db.update(items).set({ clusterId }).where(eq(items.id, match.id));
      match.clusterId = clusterId;
      clustered += 1;
    }
    await db.update(items).set({ clusterId }).where(eq(items.id, item.id));
    item.clusterId = clusterId;
    clustered += 1;
  }

  const refreshed = await db
    .select({ item: items, source: sources })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(gte(items.publishedAt, windowStart));
  const groups = new Map<number, typeof refreshed>();
  for (const row of refreshed) {
    if (row.item.clusterId === null) continue;
    const group = groups.get(row.item.clusterId) ?? [];
    group.push(row);
    groups.set(row.item.clusterId, group);
  }

  const idsByVerification: Record<VerificationStatus, number[]> = {
    reported: [],
    corroborated: [],
    unconfirmed: [],
  };
  for (const row of refreshed) {
    const group = row.item.clusterId === null ? [row] : groups.get(row.item.clusterId) ?? [row];
    const verification = verificationForGroup(row.source, group.map((entry) => entry.source));
    idsByVerification[verification].push(row.item.id);
  }
  for (const [verification, ids] of Object.entries(idsByVerification) as Array<[VerificationStatus, number[]]>) {
    if (ids.length > 0) await db.update(items).set({ verificationStatus: verification }).where(inArray(items.id, ids));
  }

  return clustered;
}

export async function runIngest({ force = false }: { force?: boolean } = {}): Promise<IngestStats> {
  const started = Date.now();
  const now = new Date();
  const db = getDb();

  await syncRegistry(db);
  const activeSources = await db.select().from(sources).where(eq(sources.active, true));
  const dueSources = activeSources.filter((source) => sourceIsDue(source, now, force));
  const perSource = await mapPool(dueSources, FETCH_CONCURRENCY, (source) => ingestSource(db, source, now));
  const changed = perSource.some((source) => source.inserted > 0 || source.updated > 0);
  const clustered = changed ? await clusterAndVerifyRecent(db, now) : 0;

  return {
    sources: dueSources.length,
    fetched: perSource.reduce((total, source) => total + source.fetched, 0),
    inserted: perSource.reduce((total, source) => total + source.inserted, 0),
    updated: perSource.reduce((total, source) => total + source.updated, 0),
    clustered,
    errors: perSource.filter((source) => source.status.startsWith("error")).map((source) => `${source.source}: ${source.status}`),
    perSource,
    ms: Date.now() - started,
  };
}

/** True when any active source has missed two expected poll windows. */
export async function isStale(minimumMinutes = 15): Promise<boolean> {
  const db = getDb();
  const activeSources = await db.select().from(sources).where(eq(sources.active, true));
  const now = Date.now();
  return activeSources.some((source) => {
    if (!source.lastSuccessfulFetchAt) return true;
    const allowance = Math.max(minimumMinutes, source.pollIntervalMinutes * 2) * 60_000;
    return now - source.lastSuccessfulFetchAt.getTime() > allowance;
  });
}
