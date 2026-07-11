import type { Source } from "../../../db/schema";
import type { FetchResult, RawItem, SourceAdapter } from "../types";
import { stripUrls } from "./bluesky";

const SEARCH_URL = "https://api.x.com/2/tweets/search/recent";
const DEFAULT_USERS = ["Reuters", "business", "WSJ", "CNBC", "AP", "nytimes", "BBCWorld", "NPR"];

interface XResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    note_tweet?: { text?: string };
    entities?: { urls?: Array<{ expanded_url?: string; unwound_url?: string }> };
  }>;
  includes?: {
    users?: Array<{ id: string; name: string; username: string; verified?: boolean; verified_type?: string }>;
  };
  meta?: { newest_id?: string };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function curatedUsers(): string[] {
  const configured = process.env.X_CURATED_USERNAMES?.split(",").map((value) => value.trim()).filter(Boolean);
  return (configured?.length ? configured : DEFAULT_USERS).slice(0, 20);
}

export function parseXResponse(response: XResponse): RawItem[] {
  const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));
  const allowlist = new Set(curatedUsers().map((username) => username.toLowerCase()));

  return (response.data ?? []).flatMap((post) => {
    const user = users.get(post.author_id);
    if (!user || !allowlist.has(user.username.toLowerCase())) return [];
    const publishedAt = new Date(post.created_at);
    if (Number.isNaN(publishedAt.getTime())) return [];
    const rawText = post.note_tweet?.text?.trim() || post.text.trim();
    if (!rawText) return [];
    const text = stripUrls(rawText) || rawText;
    const external = post.entities?.urls?.map((url) => url.unwound_url ?? url.expanded_url).find((url) => url?.startsWith("http"));
    const title = text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text;
    const verification = user.verified_type && user.verified_type !== "none"
      ? user.verified_type
      : user.verified ? "verified" : "allowlisted";

    return [{
      guid: `x:${post.id}`,
      title,
      url: `https://x.com/${user.username}/status/${post.id}`,
      ...(external ? { canonicalUrl: external } : {}),
      author: `${user.name} (@${user.username}) · ${verification}`,
      excerpt: null,
      contentHtml: `<p>${escapeHtml(text)}</p>`,
      imageUrl: null,
      publishedAt,
      updatedAt: null,
    }];
  });
}

/**
 * Official X recent-search integration over a strict, code-owned allowlist.
 * Cost is bounded by X_MAX_POSTS_PER_RUN and the Developer Console spending
 * cap; no scraping or algorithmic virality feed is used.
 */
export const xAdapter: SourceAdapter = {
  async fetch(source: Source): Promise<FetchResult> {
    const token = process.env.X_BEARER_TOKEN ?? process.env.X_API_KEY;
    if (!token) return { items: [], notModified: true, etag: source.etag, lastModified: null };

    const users = curatedUsers();
    const query = `(${users.map((username) => `from:${username}`).join(" OR ")}) -is:retweet -is:reply`;
    const params = new URLSearchParams({
      query,
      max_results: String(Math.min(100, Math.max(10, Number(process.env.X_MAX_POSTS_PER_RUN ?? 25)))),
      expansions: "author_id",
      "tweet.fields": "author_id,created_at,entities,note_tweet",
      "user.fields": "id,name,username,verified,verified_type",
    });
    if (source.etag) params.set("since_id", source.etag);

    const response = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { authorization: `Bearer ${token}`, "user-agent": "InFlowBot/0.2" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`X HTTP ${response.status}`);
    const payload = await response.json() as XResponse;
    const items = parseXResponse(payload);
    return {
      items,
      notModified: items.length === 0,
      etag: payload.meta?.newest_id ?? source.etag,
      lastModified: null,
    };
  },
};
