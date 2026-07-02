import type { Source } from "../../../db/schema";
import type { FetchResult, RawItem, SourceAdapter } from "../types";

const HN_API = "https://hacker-news.firebaseio.com/v0";
const TOP_N = 40;
/** Quality bar: only stories the community has already vetted heavily. */
const MIN_SCORE = 100;
const FETCH_TIMEOUT_MS = 10_000;

export interface HnStory {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  by?: string;
  time?: number;
  score?: number;
  descendants?: number;
  dead?: boolean;
  deleted?: boolean;
}

/** Pure mapping step, testable on fixtures. Returns null for non-qualifying stories. */
export function parseHnStory(story: HnStory): RawItem | null {
  if (story.dead || story.deleted || story.type !== "story") return null;
  if (!story.title || !story.time) return null;
  if ((story.score ?? 0) < MIN_SCORE) return null;
  const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  return {
    guid: `hn-${story.id}`,
    title: story.title,
    url: story.url ?? hnUrl,
    author: story.by ?? null,
    // Factual metadata from the API, not generated prose.
    excerpt: `${story.score} points · ${story.descendants ?? 0} comments on Hacker News`,
    contentHtml: null,
    imageUrl: null,
    publishedAt: new Date(story.time * 1000),
  };
}

export const hnAdapter: SourceAdapter = {
  async fetch(_source: Source): Promise<FetchResult> {
    const idsRes = await fetch(`${HN_API}/topstories.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!idsRes.ok) throw new Error(`HN topstories HTTP ${idsRes.status}`);
    const ids = ((await idsRes.json()) as number[]).slice(0, TOP_N);

    const stories = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${HN_API}/item/${id}.json`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!res.ok) return null;
          return (await res.json()) as HnStory;
        } catch {
          return null; // one bad story must not sink the batch
        }
      }),
    );

    const items = stories
      .filter((s): s is HnStory => s !== null)
      .map(parseHnStory)
      .filter((i): i is RawItem => i !== null);

    return { items, notModified: false, etag: null, lastModified: null };
  },
};
