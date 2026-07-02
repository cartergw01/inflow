import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { clusters, items, sources, type NewItem, type Source, type SourceKind } from "../../db/schema";
import { SOURCE_REGISTRY } from "./registry";
import { classify } from "./classify";
import { canonicalizeUrl, makeExcerpt, sanitizeContent } from "./normalize";
import { clusterKey, findClusterMatch, type Clusterable } from "./cluster";
import { rssAdapter } from "./adapters/rss";
import { hnAdapter } from "./adapters/hn";
import { blueskyAdapter } from "./adapters/bluesky";
import { xAdapter } from "./adapters/x";
import type { IngestSourceStat, IngestStats, RawItem, SourceAdapter } from "./types";

const ADAPTERS: Record<SourceKind, SourceAdapter> = {
  rss: rssAdapter,
  substack: rssAdapter, // Substack is RSS with content:encoded full bodies
  hn: hnAdapter,
  bluesky: blueskyAdapter,
  x: xAdapter,
};

/**
 * Backfill window per source class: enough history that a fresh deploy has a
 * feed, without resurrecting months-old news as "new".
 */
const MAX_AGE_MS: Record<string, number> = {
  social: 48 * 3600_000,
  news: 7 * 24 * 3600_000,
  longform: 60 * 24 * 3600_000,
};

const FETCH_CONCURRENCY = 6;
/** How far back we look when matching a new item to an existing story cluster. */
const CLUSTER_WINDOW_MS = 72 * 3600_000;

/** Upserts the code-owned registry; DB keeps fetch state and `active` flags. */
async function syncRegistry(db: Db): Promise<void> {
  for (const entry of SOURCE_REGISTRY) {
    await db
      .insert(sources)
      .values({
        kind: entry.kind,
        sourceClass: entry.sourceClass,
        name: entry.name,
        feedUrl: entry.feedUrl,
        homepageUrl: entry.homepageUrl,
        topicHints: entry.topicHints,
        qualityPrior: entry.qualityPrior,
      })
      .onConflictDoUpdate({
        target: sources.feedUrl,
        set: {
          name: entry.name,
          sourceClass: entry.sourceClass,
          topicHints: entry.topicHints,
          qualityPrior: entry.qualityPrior,
        },
      });
  }
}

function toNewItem(raw: RawItem, source: Source, now: Date): NewItem | null {
  const maxAge = MAX_AGE_MS[source.sourceClass] ?? MAX_AGE_MS.news;
  if (now.getTime() - raw.publishedAt.getTime() > maxAge) return null;
  // Feeds that date by local publication day (e.g. Taipei Times, UTC+8) can
  // parse up to a day into the future; clamp those to now. Beyond that the
  // feed is broken — drop rather than fabricate a timestamp.
  let publishedAt = raw.publishedAt;
  if (publishedAt.getTime() > now.getTime()) {
    if (publishedAt.getTime() > now.getTime() + 26 * 3600_000) return null;
    publishedAt = now;
  }

  const excerpt = makeExcerpt(raw.excerpt, raw.contentHtml);
  const contentHtml = raw.contentHtml ? sanitizeContent(raw.contentHtml) : null;
  return {
    sourceId: source.id,
    guid: raw.guid,
    author: raw.author,
    title: raw.title,
    url: raw.url,
    canonicalUrl: canonicalizeUrl(raw.url),
    excerpt,
    contentHtml,
    imageUrl: raw.imageUrl,
    publishedAt,
    topics: classify(raw.title, excerpt, source.topicHints),
  };
}

/** Simple promise pool — avoids a dependency for one loop. */
async function mapPool<T, R>(inputs: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const i = next++;
      results[i] = await fn(inputs[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

async function ingestSource(db: Db, source: Source, now: Date): Promise<IngestSourceStat> {
  const adapter = ADAPTERS[source.kind];
  try {
    const result = await adapter.fetch(source);
    let inserted = 0;

    if (!result.notModified) {
      const rows = result.items
        .map((raw) => toNewItem(raw, source, now))
        .filter((r): r is NewItem => r !== null);
      for (const row of rows) {
        const res = await db
          .insert(items)
          .values(row)
          .onConflictDoNothing({ target: items.canonicalUrl })
          .returning({ id: items.id });
        inserted += res.length;
      }
    }

    await db
      .update(sources)
      .set({
        etag: result.etag,
        lastModified: result.lastModified,
        lastFetchedAt: now,
        lastStatus: result.notModified ? "not-modified" : `ok:${inserted}`,
      })
      .where(eq(sources.id, source.id));

    return { source: source.name, fetched: result.items.length, inserted, status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastFetchedAt: now, lastStatus: `error: ${message.slice(0, 200)}` })
      .where(eq(sources.id, source.id));
    return { source: source.name, fetched: 0, inserted: 0, status: `error: ${message}` };
  }
}

/**
 * Groups new unclustered items into same-story clusters against the recent
 * window. Runs after inserts so clustering sees all of this batch too.
 */
async function clusterRecentItems(db: Db, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - CLUSTER_WINDOW_MS);
  const recent = await db
    .select({ id: items.id, title: items.title, sourceId: items.sourceId, clusterId: items.clusterId })
    .from(items)
    .where(gte(items.publishedAt, windowStart));

  const pool: Clusterable[] = recent.map((r) => ({ ...r }));
  let clustered = 0;

  for (const item of pool) {
    if (item.clusterId !== null) continue;
    const match = findClusterMatch(item, pool.filter((p) => p.id !== item.id));
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
  return clustered;
}

export async function runIngest(): Promise<IngestStats> {
  const started = Date.now();
  const now = new Date();
  const db = getDb();

  await syncRegistry(db);
  const activeSources = await db.select().from(sources).where(eq(sources.active, true));

  const perSource = await mapPool(activeSources, FETCH_CONCURRENCY, (s) => ingestSource(db, s, now));
  const clustered = await clusterRecentItems(db, now);

  return {
    sources: activeSources.length,
    fetched: perSource.reduce((a, s) => a + s.fetched, 0),
    inserted: perSource.reduce((a, s) => a + s.inserted, 0),
    clustered,
    errors: perSource.filter((s) => s.status.startsWith("error")).map((s) => `${s.source}: ${s.status}`),
    perSource,
    ms: Date.now() - started,
  };
}

/** True when the newest successful fetch is older than the freshness window. */
export async function isStale(maxAgeMinutes = 15): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ latest: sql<string | null>`max(${sources.lastFetchedAt})` })
    .from(sources)
    .where(and(eq(sources.active, true)));
  if (!row?.latest) return true;
  return Date.now() - new Date(row.latest).getTime() > maxAgeMinutes * 60_000;
}
