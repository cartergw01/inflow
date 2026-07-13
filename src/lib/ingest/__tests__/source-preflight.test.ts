import { describe, expect, it, vi } from "vitest";
import type { FeedRegistryEntry, SourcePreflightFetch } from "../source-preflight";
import {
  preflightFeedSource,
  preflightFeedSources,
  SOURCE_FRESHNESS_DAYS,
} from "../source-preflight";

const NOW = new Date("2026-07-13T12:00:00.000Z");

function source(overrides: Partial<FeedRegistryEntry> = {}): FeedRegistryEntry {
  return {
    kind: "rss",
    sourceClass: "news",
    name: "Official Test News",
    feedUrl: "https://publisher.test/feed.xml",
    homepageUrl: "https://publisher.test/news",
    topicHints: ["science"],
    qualityPrior: 0.9,
    credibilityTier: "major",
    sourceFamily: "publisher-test",
    pollIntervalMinutes: 5,
    namedAuthorRequired: false,
    ...overrides,
  };
}

function rss(date: string, link = "https://publisher.test/story", title = "A valid science story"): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><item>
    <title>${title}</title><link>${link}</link><guid>story-1</guid><pubDate>${date}</pubDate>
  </item></channel></rss>`;
}

function mockFetch(handler: (url: string) => Response | Promise<Response>): SourcePreflightFetch {
  return vi.fn(async (input: string | URL | Request) => handler(String(input))) as unknown as SourcePreflightFetch;
}

describe("source feed preflight", () => {
  it.each(["rss", "substack"] as const)("exercises the production parser for the %s adapter", async (kind) => {
    const feed = source({
      kind,
      syndicationReferenceUrl: "https://publisher.test/rss-policy",
    });
    const fetchImpl = mockFetch((url) =>
      url === feed.feedUrl
        ? new Response(rss("Sun, 12 Jul 2026 12:00:00 GMT"), { status: 200 })
        : new Response("Official RSS policy", { status: 200 }),
    );

    const result = await preflightFeedSource(feed, { fetchImpl, now: NOW });

    expect(result).toMatchObject({
      ok: true,
      adapter: kind,
      entryCount: 1,
      ageDays: 1,
      freshnessLimitDays: SOURCE_FRESHNESS_DAYS.news,
      attribution: { label: feed.name, url: feed.homepageUrl },
      syndicationReference: {
        url: feed.syndicationReferenceUrl,
        checked: true,
        ok: true,
        status: 200,
        describesSyndication: true,
      },
    });
    expect(result.newestPublishedAt).toBe("2026-07-12T12:00:00.000Z");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails feeds with no complete title/link/date entry", async () => {
    const invalid = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
      <item><title>No link</title><pubDate>Sun, 12 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><link>https://publisher.test/no-title</link><pubDate>Sun, 12 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title>Bad date</title><link>https://publisher.test/bad-date</link><pubDate>never</pubDate></item>
    </channel></rss>`;
    const result = await preflightFeedSource(source(), {
      fetchImpl: mockFetch(() => new Response(invalid, { status: 200 })),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.entryCount).toBe(0);
    expect(result.issues).toContain("feed has no complete title/link/date entries");
  });

  it("rejects parsed entries whose links are not absolute HTTP(S) URLs", async () => {
    const result = await preflightFeedSource(source(), {
      fetchImpl: mockFetch(() => new Response(rss("Sun, 12 Jul 2026 12:00:00 GMT", "ftp://publisher.test/story"), { status: 200 })),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.entryCount).toBe(1);
    expect(result.issues).toContain("1 parsed entries have an invalid title, link, or date");
  });

  it("uses the seven-day news window and fails stale feeds", async () => {
    const result = await preflightFeedSource(source(), {
      fetchImpl: mockFetch(() => new Response(rss("Mon, 29 Jun 2026 12:00:00 GMT"), { status: 200 })),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.ageDays).toBe(14);
    expect(result.issues).toContain("newest item is stale (14d; limit 7d)");
  });

  it("fails when a recorded syndication reference cannot be fetched", async () => {
    const feed = source({ syndicationReferenceUrl: "https://publisher.test/rss-policy" });
    const result = await preflightFeedSource(feed, {
      fetchImpl: mockFetch((url) =>
        url === feed.feedUrl
          ? new Response(rss("Sun, 12 Jul 2026 12:00:00 GMT"), { status: 200 })
          : new Response("Missing", { status: 404 }),
      ),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.syndicationReference).toMatchObject({ checked: true, ok: false, status: 404 });
    expect(result.issues).toContain("syndication reference returned HTTP 404");
  });

  it("fails when a reference page does not describe feed or syndication usage", async () => {
    const feed = source({ syndicationReferenceUrl: "https://publisher.test/policy" });
    const result = await preflightFeedSource(feed, {
      fetchImpl: mockFetch((url) =>
        url === feed.feedUrl
          ? new Response(rss("Sun, 12 Jul 2026 12:00:00 GMT"), { status: 200 })
          : new Response("General publisher information", { status: 200 }),
      ),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.syndicationReference?.describesSyndication).toBe(false);
    expect(result.issues).toContain("syndication reference does not describe RSS, Atom, or feed usage");
  });

  it("bounds batch work to the configured source limit", async () => {
    const feeds = [0, 1, 2].map((index) => source({
      name: `Publisher ${index}`,
      feedUrl: `https://publisher.test/feed-${index}.xml`,
    }));
    const fetchImpl = mockFetch(() => new Response(rss("Sun, 12 Jul 2026 12:00:00 GMT"), { status: 200 }));

    const results = await preflightFeedSources(feeds, { fetchImpl, now: NOW, maxSources: 2, concurrency: 1 });

    expect(results.map((result) => result.source)).toEqual(["Publisher 0", "Publisher 1"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
