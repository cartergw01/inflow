import type { SourceClass } from "../../db/schema";
import { parseRssFeed, USER_AGENT } from "./adapters/rss";
import type { RegistryEntry } from "./registry";

const DAY_MS = 86_400_000;

export const SOURCE_PREFLIGHT_TIMEOUT_MS = 15_000;
export const SOURCE_PREFLIGHT_CONCURRENCY = 6;
export const SOURCE_PREFLIGHT_MAX_SOURCES = 64;

/** Mirrors the ingestion retention window so a passing feed can yield app data. */
export const SOURCE_FRESHNESS_DAYS: Record<SourceClass, number> = {
  news: 7,
  longform: 60,
  social: 2,
};

export type FeedRegistryEntry = RegistryEntry & { kind: "rss" | "substack" };
export type SourcePreflightFetch = typeof fetch;

export interface SourceAttribution {
  label: string;
  url: string;
}

export interface SyndicationReferenceCheck {
  url: string;
  checked: boolean;
  ok: boolean | null;
  status: number | null;
  describesSyndication: boolean | null;
}

export interface SourcePreflightResult {
  source: string;
  adapter: "rss" | "substack";
  feedUrl: string;
  attribution: SourceAttribution;
  syndicationReference: SyndicationReferenceCheck | null;
  entryCount: number;
  newestPublishedAt: string | null;
  ageDays: number | null;
  freshnessLimitDays: number;
  ok: boolean;
  issues: string[];
}

export interface SourcePreflightOptions {
  fetchImpl?: SourcePreflightFetch;
  now?: Date;
  timeoutMs?: number;
  freshnessDays?: Partial<Record<SourceClass, number>>;
  checkSyndicationReference?: boolean;
}

export interface SourcePreflightBatchOptions extends SourcePreflightOptions {
  concurrency?: number;
  maxSources?: number;
}

export function isFeedRegistryEntry(source: RegistryEntry): source is FeedRegistryEntry {
  return source.kind === "rss" || source.kind === "substack";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function get(
  url: string,
  fetchImpl: SourcePreflightFetch,
  timeoutMs: number,
  accept: string,
): Promise<Response> {
  return fetchImpl(url, {
    method: "GET",
    headers: {
      accept,
      "user-agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Exercises the production RSS parser against one live (or injected) source,
 * then checks that its newest valid item survives the app's ingestion window.
 */
export async function preflightFeedSource(
  source: FeedRegistryEntry,
  {
    fetchImpl = fetch,
    now = new Date(),
    timeoutMs = SOURCE_PREFLIGHT_TIMEOUT_MS,
    freshnessDays,
    checkSyndicationReference = true,
  }: SourcePreflightOptions = {},
): Promise<SourcePreflightResult> {
  const issues: string[] = [];
  const freshnessLimitDays = freshnessDays?.[source.sourceClass] ?? SOURCE_FRESHNESS_DAYS[source.sourceClass];
  let entryCount = 0;
  let newestPublishedAt: string | null = null;
  let ageDays: number | null = null;

  if (!isHttpUrl(source.feedUrl)) {
    issues.push("feed URL is not an absolute HTTP(S) URL");
  } else {
    try {
      const response = await get(
        source.feedUrl,
        fetchImpl,
        timeoutMs,
        "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      );
      if (!response.ok) {
        issues.push(`feed returned HTTP ${response.status}`);
      } else {
        const entries = await parseRssFeed(await response.text());
        entryCount = entries.length;
        if (entries.length === 0) {
          issues.push("feed has no complete title/link/date entries");
        } else {
          const malformed = entries.filter(
            (entry) => !entry.title.trim() || !isHttpUrl(entry.url) || Number.isNaN(entry.publishedAt.getTime()),
          );
          if (malformed.length > 0) issues.push(`${malformed.length} parsed entries have an invalid title, link, or date`);

          const newest = entries.reduce(
            (latest, entry) => Math.max(latest, entry.publishedAt.getTime()),
            Number.NEGATIVE_INFINITY,
          );
          if (Number.isFinite(newest)) {
            newestPublishedAt = new Date(newest).toISOString();
            ageDays = Math.max(0, Math.floor((now.getTime() - newest) / DAY_MS));
            if (ageDays > freshnessLimitDays) {
              issues.push(`newest item is stale (${ageDays}d; limit ${freshnessLimitDays}d)`);
            }
          }
        }
      }
    } catch (error) {
      issues.push(`feed check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let syndicationReference: SyndicationReferenceCheck | null = null;
  if (source.syndicationReferenceUrl) {
    syndicationReference = {
      url: source.syndicationReferenceUrl,
      checked: false,
      ok: null,
      status: null,
      describesSyndication: null,
    };
    if (!isHttpUrl(source.syndicationReferenceUrl)) {
      issues.push("syndication reference is not an absolute HTTP(S) URL");
    } else if (checkSyndicationReference) {
      try {
        const response = await get(source.syndicationReferenceUrl, fetchImpl, timeoutMs, "text/html, application/xhtml+xml, */*;q=0.1");
        syndicationReference.checked = true;
        syndicationReference.ok = response.ok;
        syndicationReference.status = response.status;
        if (!response.ok) {
          issues.push(`syndication reference returned HTTP ${response.status}`);
        } else {
          const referenceText = await response.text();
          syndicationReference.describesSyndication = /\b(?:rss|atom|feed|syndicat(?:e|ed|ion))\b/i.test(referenceText);
          if (!syndicationReference.describesSyndication) {
            issues.push("syndication reference does not describe RSS, Atom, or feed usage");
          }
        }
      } catch (error) {
        syndicationReference.checked = true;
        syndicationReference.ok = false;
        issues.push(`syndication reference check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    source: source.name,
    adapter: source.kind,
    feedUrl: source.feedUrl,
    attribution: { label: source.name, url: source.homepageUrl },
    syndicationReference,
    entryCount,
    newestPublishedAt,
    ageDays,
    freshnessLimitDays,
    ok: issues.length === 0,
    issues,
  };
}

/** Runs a bounded worker pool; callers can filter the registry before passing it. */
export async function preflightFeedSources(
  sources: readonly FeedRegistryEntry[],
  options: SourcePreflightBatchOptions = {},
): Promise<SourcePreflightResult[]> {
  const maxSources = Math.max(1, Math.min(SOURCE_PREFLIGHT_MAX_SOURCES, Math.floor(options.maxSources ?? SOURCE_PREFLIGHT_MAX_SOURCES)));
  const selected = sources.slice(0, maxSources);
  const concurrency = Math.max(1, Math.min(SOURCE_PREFLIGHT_CONCURRENCY, Math.floor(options.concurrency ?? SOURCE_PREFLIGHT_CONCURRENCY)));
  const results = new Array<SourcePreflightResult>(selected.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < selected.length) {
      const index = cursor++;
      results[index] = await preflightFeedSource(selected[index], options);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  return results;
}
