import { describe, expect, it } from "vitest";
import { applySignal } from "../affinity";
import { rankFeed } from "../feed";
import type { AffinityMap, Candidate } from "../types";
import { daysAgo, hoursAgo, makeAffinities, makeItem, makeSource, NOW } from "./fixtures";

describe("rankFeed", () => {
  it("ignoring NBA demotes it: weeks of un-opened impressions push NBA below equally-fresh tech", () => {
    const nbaSource = makeSource({ id: 1, sourceClass: "news", name: "NBA Desk" });
    const techSource = makeSource({ id: 2, sourceClass: "news", name: "Tech Wire" });

    // Three weeks of scrolling past NBA items without ever opening one:
    // two skipped impressions per day, applied through the real updater.
    let affinities: AffinityMap = new Map();
    for (let day = 21; day >= 1; day--) {
      for (let i = 0; i < 2; i++) {
        affinities = applySignal(
          affinities,
          { type: "impression", value: 1 },
          makeItem({ topics: ["nba"] }),
          nbaSource,
          daysAgo(day),
        );
      }
    }
    const nbaWeight = affinities.get("topic:nba")?.weight ?? 0;
    expect(nbaWeight).toBeLessThan(-1);

    const nbaItem = makeItem({ topics: ["nba"], publishedAt: NOW });
    const techItem = makeItem({ topics: ["tech"], publishedAt: NOW });
    const candidates: Candidate[] = [
      { item: nbaItem, source: nbaSource },
      { item: techItem, source: techSource },
    ];

    const feed = rankFeed({ candidates, affinities, seedInterests: [], now: NOW });

    expect(feed[0].item.id).toBe(techItem.id);
    expect(feed[1].item.id).toBe(nbaItem.id);
    // "Measurably below": more than a diversity penalty's worth of score.
    expect(feed[1].score).toBeLessThan(feed[0].score - 0.3);
  });

  it("saving Taiwan longform promotes the author's next piece above a baseline peer", () => {
    const taiwanWeekly = makeSource({ id: 3, sourceClass: "longform", name: "Taiwan Weekly" });
    const otherLetter = makeSource({ id: 4, sourceClass: "longform", name: "Some Newsletter" });

    let affinities: AffinityMap = new Map();
    for (let i = 0; i < 2; i++) {
      affinities = applySignal(
        affinities,
        { type: "save", value: 1 },
        makeItem({ topics: ["taiwan"], author: "Jane Chen" }),
        taiwanWeekly,
        daysAgo(7 - i),
      );
    }

    const janesNext = makeItem({ topics: ["taiwan"], author: "Jane Chen", publishedAt: hoursAgo(6) });
    const baselinePeer = makeItem({ topics: ["climate"], author: "Bob Lee", publishedAt: hoursAgo(6) });
    const feed = rankFeed({
      candidates: [
        { item: baselinePeer, source: otherLetter },
        { item: janesNext, source: taiwanWeekly },
      ],
      affinities,
      seedInterests: [],
      now: NOW,
    });

    expect(feed[0].item.id).toBe(janesNext.id);
    expect(feed[0].score).toBeGreaterThan(feed[1].score);
  });

  it("cluster-collapse: items sharing a clusterId become one entry with alsoCoveredBy", () => {
    const wireA = makeSource({ id: 1, sourceClass: "news", name: "Wire A" });
    const wireB = makeSource({ id: 2, sourceClass: "news", name: "Wire B" });

    const winner = makeItem({ topics: ["us-politics"], publishedAt: NOW, clusterId: 5 });
    const loser = makeItem({
      topics: ["us-politics"],
      publishedAt: hoursAgo(12),
      clusterId: 5,
      url: "https://wire-b.example.com/the-story",
    });
    const bystander = makeItem({ topics: ["tech"], publishedAt: NOW });

    const feed = rankFeed({
      candidates: [
        { item: winner, source: wireA },
        { item: loser, source: wireB },
        { item: bystander, source: wireA },
      ],
      affinities: new Map(),
      seedInterests: [],
      now: NOW,
    });

    expect(feed).toHaveLength(2);
    expect(feed.some((e) => e.item.id === loser.id)).toBe(false);

    const clustered = feed.find((e) => e.item.id === winner.id);
    expect(clustered?.alsoCoveredBy).toEqual([
      { sourceName: "Wire B", url: "https://wire-b.example.com/the-story" },
    ]);
    expect(feed.find((e) => e.item.id === bystander.id)?.alsoCoveredBy).toBeUndefined();
  });

  it("diversity: five equally-scored items from one source do not occupy the top five slots", () => {
    const sourceA = makeSource({ id: 1, sourceClass: "news", name: "Monoculture Daily" });
    const sourceB = makeSource({ id: 2, sourceClass: "news", name: "Other Outlet" });

    const candidates: Candidate[] = [];
    for (let i = 0; i < 5; i++) {
      candidates.push({ item: makeItem({ topics: ["tech"], publishedAt: NOW }), source: sourceA });
    }
    for (let i = 0; i < 5; i++) {
      candidates.push({ item: makeItem({ topics: ["nba"], publishedAt: NOW }), source: sourceB });
    }

    const feed = rankFeed({ candidates, affinities: new Map(), seedInterests: [], now: NOW });

    const topFiveSources = feed.slice(0, 5).map((e) => e.source.id);
    expect(new Set(topFiveSources).size).toBeGreaterThan(1);
    // Stronger: never five consecutive picks from the same source anywhere.
    for (let i = 0; i + 5 <= feed.length; i++) {
      const window = feed.slice(i, i + 5).map((e) => e.source.id);
      expect(new Set(window).size).toBeGreaterThan(1);
    }
  });

  it("exploration: with strong seed affinities, an off-seed item fills index 9 and is flagged", () => {
    const seeds = ["nba", "tech"];
    const affinities = makeAffinities([
      ["topic:nba", 4],
      ["topic:tech", 4],
    ]);

    const inTaste = makeSource({ id: 1, sourceClass: "news", name: "In-Taste News" });
    const outThere = makeSource({ id: 2, sourceClass: "news", name: "Garden Gazette" });

    const candidates: Candidate[] = [];
    for (let i = 0; i < 12; i++) {
      candidates.push({
        item: makeItem({ topics: [i % 2 === 0 ? "nba" : "tech"], publishedAt: NOW }),
        source: inTaste,
      });
    }
    const gardening = makeItem({ topics: ["gardening"], publishedAt: hoursAgo(36) });
    candidates.push({ item: gardening, source: outThere });

    const feed = rankFeed({ candidates, affinities, seedInterests: seeds, now: NOW });

    // The gardening item scores lowest, yet the exploration slot surfaces it.
    expect(feed[9].item.id).toBe(gardening.id);
    expect(feed[9].exploration).toBe(true);
    for (let i = 0; i < 9; i++) {
      expect(feed[i].exploration).toBeUndefined();
    }
  });

  it("exploration falls back to a normal pick when nothing is outside known tastes", () => {
    const affinities = makeAffinities([["topic:nba", 4]]);
    const source = makeSource({ id: 1, sourceClass: "news" });
    const candidates: Candidate[] = Array.from({ length: 12 }, () => ({
      item: makeItem({ topics: ["nba"], publishedAt: NOW }),
      source,
    }));

    const feed = rankFeed({ candidates, affinities, seedInterests: ["nba"], now: NOW });

    expect(feed).toHaveLength(12);
    expect(feed.every((e) => e.exploration === undefined)).toBe(true);
  });

  it("respects the limit option", () => {
    const source = makeSource({ id: 1 });
    const candidates: Candidate[] = Array.from({ length: 8 }, () => ({
      item: makeItem({ topics: ["tech"], publishedAt: NOW }),
      source,
    }));

    const feed = rankFeed({
      candidates,
      affinities: new Map(),
      seedInterests: [],
      now: NOW,
      opts: { limit: 3 },
    });
    expect(feed).toHaveLength(3);
  });

  it("is deterministic: identical inputs produce an identical feed, ties break by item id", () => {
    const sourceA = makeSource({ id: 1, sourceClass: "news", name: "A" });
    const sourceB = makeSource({ id: 2, sourceClass: "social", name: "B" });
    const affinities = makeAffinities([
      ["topic:nba", 2],
      ["source:2", -1],
    ]);

    const candidates: Candidate[] = [
      { item: makeItem({ id: 101, topics: ["nba"], publishedAt: hoursAgo(2) }), source: sourceA },
      { item: makeItem({ id: 102, topics: ["tech"], publishedAt: NOW }), source: sourceB },
      { item: makeItem({ id: 103, topics: ["nba"], publishedAt: hoursAgo(2) }), source: sourceA },
      { item: makeItem({ id: 104, topics: ["taiwan"], publishedAt: hoursAgo(30), clusterId: 9 }), source: sourceA },
      { item: makeItem({ id: 105, topics: ["taiwan"], publishedAt: hoursAgo(40), clusterId: 9 }), source: sourceB },
    ];

    const run = () => rankFeed({ candidates, affinities, seedInterests: ["taiwan"], now: NOW });
    expect(run()).toEqual(run());

    // Items 101 and 103 are exact ties; the lower id must come first.
    const feed = run();
    const pos101 = feed.findIndex((e) => e.item.id === 101);
    const pos103 = feed.findIndex((e) => e.item.id === 103);
    expect(pos101).toBeLessThan(pos103);
  });
});
