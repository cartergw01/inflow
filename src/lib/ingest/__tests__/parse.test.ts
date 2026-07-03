import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRssFeed } from "../adapters/rss";
import { parseHnStory, type HnStory } from "../adapters/hn";
import { parseBlueskyFeed, stripUrls, type BlueskyFeedResponse } from "../adapters/bluesky";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseRssFeed — Substack", () => {
  it("parses full-content items with all required fields", async () => {
    const items = await parseRssFeed(fixture("substack-marcstein.xml"));
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.publishedAt.getTime()).not.toBeNaN();
    }
    // Substack feeds carry the full article body in content:encoded.
    const withBody = items.filter((i) => (i.contentHtml?.length ?? 0) > 1000);
    expect(withBody.length).toBeGreaterThan(0);
  });
});

describe("parseRssFeed — mainstream", () => {
  it("parses TechCrunch entries with authors and dates", async () => {
    const items = await parseRssFeed(fixture("rss-techcrunch.xml"));
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.author)).toBe(true);
    for (const item of items) expect(item.publishedAt.getTime()).not.toBeNaN();
  });

  it("parses NPR politics entries", async () => {
    const items = await parseRssFeed(fixture("rss-npr-politics.xml"));
    expect(items.length).toBeGreaterThan(3);
    for (const item of items) {
      expect(item.guid.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https?:\/\//);
    }
  });

  it("skips entries missing link, title, or date rather than fabricating them", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>No link</title><pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate></item>
      <item><link>https://x.test/a</link><pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate></item>
      <item><title>Bad date</title><link>https://x.test/b</link><pubDate>not a date</pubDate></item>
      <item><title>Good</title><link>https://x.test/c</link><pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = await parseRssFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Good");
  });
});

describe("parseHnStory", () => {
  it("maps a real story fixture with factual metadata excerpt", () => {
    const story = JSON.parse(fixture("hn-item.json")) as HnStory;
    const item = parseHnStory(story);
    expect(item).not.toBeNull();
    expect(item!.title).toContain("LUKS");
    expect(item!.excerpt).toMatch(/^\d+ points · \d+ comments on Hacker News$/);
    expect(item!.publishedAt.getTime()).toBe(story.time! * 1000);
  });

  it("rejects low-score, dead, and non-story items", () => {
    const base: HnStory = { id: 1, type: "story", title: "T", time: 1_700_000_000, score: 200 };
    expect(parseHnStory({ ...base, score: 50 })).toBeNull();
    expect(parseHnStory({ ...base, dead: true })).toBeNull();
    expect(parseHnStory({ ...base, type: "job" })).toBeNull();
  });

  it("links to the HN thread when a story has no external URL", () => {
    const item = parseHnStory({ id: 42, type: "story", title: "Ask HN", time: 1_700_000_000, score: 150 });
    expect(item!.url).toBe("https://news.ycombinator.com/item?id=42");
  });
});

describe("parseBlueskyFeed", () => {
  it("parses real posts, skipping reposts and other authors", () => {
    const data = JSON.parse(fixture("bluesky-atrupar.json")) as BlueskyFeedResponse;
    const items = parseBlueskyFeed(data, "atrupar.com");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.url).toMatch(/^https:\/\/bsky\.app\/profile\/atrupar\.com\/post\//);
      expect(item.publishedAt.getTime()).not.toBeNaN();
      expect(item.title.length).toBeLessThanOrEqual(141);
    }
  });

  it("strips shortlinks from post text without touching words", () => {
    expect(stripUrls("ICC has no jurisdiction over Americans reut.rs/4eQIh9B")).toBe(
      "ICC has no jurisdiction over Americans",
    );
    expect(stripUrls("Read this: https://example.com/story and more")).toBe("Read this: and more");
    expect(stripUrls("No links here, version 2.5 shipped")).toBe("No links here, version 2.5 shipped");
  });

  it("escapes post text in generated HTML", () => {
    const data: BlueskyFeedResponse = {
      feed: [
        {
          post: {
            uri: "at://did:plc:x/app.bsky.feed.post/abc",
            author: { handle: "h.test" },
            record: { text: "a <script>alert(1)</script> post", createdAt: "2026-07-01T00:00:00Z" },
          },
        },
      ],
    };
    const [item] = parseBlueskyFeed(data, "h.test");
    expect(item.contentHtml).not.toContain("<script>");
    expect(item.contentHtml).toContain("&lt;script&gt;");
  });
});
