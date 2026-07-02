import Parser from "rss-parser";
import type { Source } from "../../../db/schema";
import type { FetchResult, RawItem, SourceAdapter } from "../types";
import { firstImageSrc } from "../normalize";

type CustomItem = {
  "content:encoded"?: string;
  "media:content"?: { $?: { url?: string } } | { $?: { url?: string } }[];
  creator?: string;
  enclosure?: { url?: string };
};

const parser: Parser<Record<string, unknown>, CustomItem> = new Parser({
  customFields: {
    item: ["content:encoded", ["media:content", "media:content", { keepArray: true }], "creator"],
  },
});

export const USER_AGENT = "InFlowBot/0.1 (+https://github.com/cartergw01/inflow)";
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Pure parse step, separated from the network so tests run on fixtures.
 * Covers both mainstream RSS/Atom and Substack (which is RSS with
 * content:encoded full bodies).
 */
export async function parseRssFeed(xml: string): Promise<RawItem[]> {
  const feed = await parser.parseString(xml);
  const items: RawItem[] = [];
  for (const entry of feed.items ?? []) {
    const link = entry.link?.trim();
    const title = entry.title?.trim();
    const dateStr = entry.isoDate ?? entry.pubDate;
    if (!link || !title || !dateStr) continue; // no fabricated fields — skip incomplete entries
    const publishedAt = new Date(dateStr);
    if (Number.isNaN(publishedAt.getTime())) continue;

    const contentHtml = entry["content:encoded"] ?? null;
    const mediaRaw = entry["media:content"];
    const media = Array.isArray(mediaRaw) ? mediaRaw[0] : mediaRaw;
    const imageUrl =
      entry.enclosure?.url ?? media?.$?.url ?? firstImageSrc(contentHtml) ?? null;

    items.push({
      guid: (typeof entry.guid === "string" && entry.guid) || link,
      title,
      url: link,
      author: entry.creator?.trim() || (entry as { author?: string }).author?.trim() || null,
      excerpt: entry.summary?.toString() ?? (entry as { contentSnippet?: string }).contentSnippet ?? null,
      contentHtml,
      imageUrl,
      publishedAt,
    });
  }
  return items;
}

/** Conditional GET so 30+ sources polled every 10 minutes stay cheap and polite. */
export const rssAdapter: SourceAdapter = {
  async fetch(source: Source): Promise<FetchResult> {
    const headers: Record<string, string> = { "user-agent": USER_AGENT };
    if (source.etag) headers["if-none-match"] = source.etag;
    if (source.lastModified) headers["if-modified-since"] = source.lastModified;

    const res = await fetch(source.feedUrl, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (res.status === 304) {
      return { items: [], notModified: true, etag: source.etag, lastModified: source.lastModified };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.feedUrl}`);

    const xml = await res.text();
    const items = await parseRssFeed(xml);
    return {
      items,
      notModified: false,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    };
  },
};
