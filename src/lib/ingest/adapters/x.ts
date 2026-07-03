import type { FetchResult, SourceAdapter } from "../types";

/**
 * X/Twitter adapter — intentionally inert until X_API_KEY is provided.
 *
 * X's API is pay-per-usage (~$0.005/post read as of 2026-07) and needs the
 * owner's developer account + payment method; scraping is against X ToS.
 * See NOTES.md. When a key is added, implement with GET /2/users/:id/tweets
 * (reverse-chronological timeline per curated handle) and map to RawItem the
 * same way the Bluesky adapter does.
 */
export const xAdapter: SourceAdapter = {
  async fetch(): Promise<FetchResult> {
    if (!process.env.X_API_KEY) {
      return { items: [], notModified: true, etag: null, lastModified: null };
    }
    throw new Error("X adapter: X_API_KEY is set but the paid integration is not implemented yet (see NOTES.md)");
  },
};
