import type { Item, Source } from "../../../db/schema";
import type { AffinityEntry, AffinityMap } from "../types";

/** Fixed "now" for deterministic tests. */
export const NOW = new Date("2026-07-02T12:00:00Z");

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export function daysAgo(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

export function hoursAgo(hours: number, from: Date = NOW): Date {
  return new Date(from.getTime() - hours * HOUR_MS);
}

let nextItemId = 1;

export function makeSource(overrides: Partial<Source> = {}): Source {
  const id = overrides.id ?? 1;
  return {
    id,
    kind: "rss",
    sourceClass: "news",
    name: `Source ${id}`,
    feedUrl: `https://example.com/${id}/feed`,
    homepageUrl: null,
    topicHints: [],
    qualityPrior: 0.7,
    credibilityTier: "independent",
    sourceFamily: `source-${id}`,
    pollIntervalMinutes: 10,
    namedAuthorRequired: false,
    active: true,
    etag: null,
    lastModified: null,
    lastFetchedAt: null,
    lastSuccessfulFetchAt: null,
    nextFetchAt: null,
    lastStatus: null,
    ...overrides,
  };
}

export function makeItem(overrides: Partial<Item> = {}): Item {
  const id = overrides.id ?? nextItemId++;
  return {
    id,
    sourceId: 1,
    guid: `guid-${id}`,
    author: null,
    title: `Item ${id}`,
    url: `https://example.com/items/${id}`,
    canonicalUrl: `https://example.com/items/${id}`,
    excerpt: null,
    contentHtml: null,
    imageUrl: null,
    publishedAt: NOW,
    fetchedAt: NOW,
    sourceUpdatedAt: null,
    updatedAt: NOW,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    contentFingerprint: "fixture",
    wordCount: 0,
    status: "active",
    verificationStatus: "reported",
    correctionNote: null,
    topics: [],
    clusterId: null,
    ...overrides,
  };
}

/** Builds an AffinityMap from `[key, weight]` pairs, all updated at `at`. */
export function makeAffinities(entries: Array<[string, number]>, at: Date = NOW): AffinityMap {
  const map = new Map<string, AffinityEntry>();
  for (const [key, weight] of entries) {
    map.set(key, { weight, updatedAt: at });
  }
  return map;
}
