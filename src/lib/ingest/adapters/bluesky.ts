import type { Source } from "../../../db/schema";
import type { FetchResult, RawItem, SourceAdapter } from "../types";

const APPVIEW = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";
const FETCH_TIMEOUT_MS = 10_000;
const POST_LIMIT = 30;

export interface BlueskyFeedResponse {
  feed: {
    reason?: unknown; // present on reposts
    post: {
      uri: string;
      author: { handle: string; displayName?: string };
      record: { text?: string; createdAt?: string };
      embed?: {
        external?: { uri?: string; title?: string; description?: string; thumb?: string };
      };
    };
  }[];
}

/** app.bsky post URI → public web URL. */
function postWebUrl(uri: string, handle: string): string | null {
  const rkey = uri.split("/").pop();
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * News accounts append shortlinks (reut.rs/…, apne.ws/…) to post text; the
 * link itself is surfaced separately from the embed, so strip URLs from the
 * displayed text. Words are otherwise untouched — this removes noise, not
 * meaning.
 */
export function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[a-z0-9-]+\.[a-z]{2,6}\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Pure parse step. A post's "title" is its own text (truncated for display);
 * when a post links an article, that link is surfaced in the body. Reposts
 * are skipped — we only ingest an account's own words.
 */
export function parseBlueskyFeed(data: BlueskyFeedResponse, handle: string): RawItem[] {
  const items: RawItem[] = [];
  for (const entry of data.feed ?? []) {
    if (entry.reason) continue;
    const { post } = entry;
    if (post.author.handle !== handle) continue;
    const rawText = post.record.text?.trim();
    const createdAt = post.record.createdAt;
    if (!rawText || !createdAt) continue;
    const text = stripUrls(rawText) || rawText;
    const publishedAt = new Date(createdAt);
    if (Number.isNaN(publishedAt.getTime())) continue;
    const url = postWebUrl(post.uri, post.author.handle);
    if (!url) continue;

    const external = post.embed?.external;
    const title = text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text;
    const linkHtml = external?.uri
      ? `<p><a href="${escapeHtml(external.uri)}" rel="noopener noreferrer" target="_blank">${escapeHtml(external.title ?? external.uri)}</a></p>`
      : "";

    items.push({
      guid: post.uri,
      title,
      url,
      author: post.author.displayName ?? post.author.handle,
      excerpt: external?.description?.trim() || null,
      contentHtml: `<p>${escapeHtml(text)}</p>${linkHtml}` || null,
      imageUrl: external?.thumb ?? null,
      publishedAt,
    });
  }
  return items;
}

export const blueskyAdapter: SourceAdapter = {
  async fetch(source: Source): Promise<FetchResult> {
    const handle = source.feedUrl;
    const url = `${APPVIEW}?actor=${encodeURIComponent(handle)}&limit=${POST_LIMIT}&filter=posts_no_replies`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Bluesky HTTP ${res.status} for ${handle}`);
    const data = (await res.json()) as BlueskyFeedResponse;
    return { items: parseBlueskyFeed(data, handle), notModified: false, etag: null, lastModified: null };
  },
};
