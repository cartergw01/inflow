import { describe, expect, it } from "vitest";
import {
  activityIndex,
  computeBridges,
  controversy,
  discussionVelocity,
  isBreaking,
  parseHnStats,
  type MetricStory,
} from "../metrics";

const NOW = Date.parse("2026-07-08T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function story(over: Partial<MetricStory> = {}): MetricStory {
  return {
    id: over.id ?? 1,
    title: over.title ?? "T",
    publishedAt: over.publishedAt ?? ago(1),
    topics: over.topics ?? ["tech"],
    excerpt: over.excerpt ?? null,
    sourceClass: over.sourceClass ?? "news",
    alsoCoveredBy: over.alsoCoveredBy ?? [],
  };
}

describe("activityIndex", () => {
  it("is larger for a busy fresh galaxy than a quiet stale one", () => {
    const busy = Array.from({ length: 40 }, (_, i) => ({ publishedAt: ago(i % 6) }));
    const stale = Array.from({ length: 12 }, (_, i) => ({ publishedAt: ago(100 + i) }));
    expect(activityIndex(busy, NOW)).toBeGreaterThan(activityIndex(stale, NOW) + 0.3);
  });

  it("shrinks over time with no new stories (galaxies breathe)", () => {
    const stories = Array.from({ length: 20 }, () => ({ publishedAt: ago(2) }));
    const today = activityIndex(stories, NOW);
    const threeDaysLater = activityIndex(stories, NOW + 72 * 3600_000);
    expect(threeDaysLater).toBeLessThan(today * 0.5);
  });
});

describe("isBreaking", () => {
  it("fires on a young multi-outlet cluster", () => {
    expect(
      isBreaking([story({ publishedAt: ago(1.5), alsoCoveredBy: [{ sourceName: "A" }, { sourceName: "B" }] })], NOW),
    ).toBe(true);
  });
  it("fires on a burst of 3+ fresh wire stories", () => {
    const burst = [1, 2, 3].map((i) => story({ id: i, publishedAt: ago(0.4), sourceClass: "news" }));
    expect(isBreaking(burst, NOW)).toBe(true);
  });
  it("does NOT fire on routine trickle — one fresh story is not breaking", () => {
    expect(isBreaking([story({ publishedAt: ago(0.5), sourceClass: "news" })], NOW)).toBe(false);
    expect(
      isBreaking([story({ id: 1, publishedAt: ago(0.4) }), story({ id: 2, publishedAt: ago(0.6) })], NOW),
    ).toBe(false);
  });
  it("stays quiet for old or longform-only content", () => {
    expect(isBreaking([story({ publishedAt: ago(6) })], NOW)).toBe(false);
    expect(isBreaking([story({ publishedAt: ago(0.2), sourceClass: "longform" })], NOW)).toBe(false);
  });
});

describe("HN stats / velocity / controversy", () => {
  it("parses the ingest excerpt format exactly", () => {
    expect(parseHnStats("412 points · 187 comments on Hacker News")).toEqual({ points: 412, comments: 187 });
    expect(parseHnStats("A normal publisher dek")).toBeNull();
    expect(parseHnStats(null)).toBeNull();
  });

  it("velocity rises with pickup and chatter", () => {
    const quiet = story();
    const picked = story({ alsoCoveredBy: [{ sourceName: "A" }, { sourceName: "B" }, { sourceName: "C" }] });
    const hot = story({ excerpt: "500 points · 290 comments on Hacker News" });
    expect(discussionVelocity(picked)).toBeGreaterThan(discussionVelocity(quiet));
    expect(discussionVelocity(hot)).toBeGreaterThan(0.8);
  });

  it("controversy responds to comment/point ratio, never fakes elsewhere", () => {
    const argued = story({ excerpt: "100 points · 220 comments on Hacker News" });
    const loved = story({ excerpt: "400 points · 80 comments on Hacker News" });
    const nonHn = story({ excerpt: "A publisher dek", alsoCoveredBy: [{ sourceName: "A" }] });
    expect(controversy(argued)).toBeGreaterThan(0.5);
    expect(controversy(loved)).toBe(0);
    expect(controversy(nonHn)).toBe(0);
  });
});

describe("computeBridges", () => {
  it("finds stories spanning two galaxies and dedupes across worlds", () => {
    const tsmc = story({ id: 7, title: "TSMC export rules tighten", topics: ["tech", "taiwan"] });
    const worlds = [
      { slug: "tech", entries: [story({ id: 1 }), tsmc] },
      { slug: "taiwan", entries: [tsmc, story({ id: 9, topics: ["taiwan"] })] },
    ];
    const bridges = computeBridges(worlds);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({ storyId: 7, a: "tech", b: "taiwan", rank: 0 });
  });

  it("ranks by prominence and caps the count", () => {
    const mk = (id: number) => story({ id, topics: ["us-politics", "world"], title: `S${id}` });
    const entries = [mk(1), mk(2), mk(3), mk(4), mk(5), mk(6)];
    const bridges = computeBridges([{ slug: "politics", entries }], 3);
    expect(bridges).toHaveLength(3);
    expect(bridges[0].storyId).toBe(1);
  });

  it("ignores single-galaxy stories", () => {
    expect(computeBridges([{ slug: "nba", entries: [story({ topics: ["nba"] })] }])).toHaveLength(0);
  });
});
