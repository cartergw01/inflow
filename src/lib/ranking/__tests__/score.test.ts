import { describe, expect, it } from "vitest";
import { recencyScore, SCORE_WEIGHTS, scoreItem } from "../score";
import { hoursAgo, makeAffinities, makeItem, makeSource, NOW } from "./fixtures";

describe("recencyScore", () => {
  it("is 1 at publish time and never exceeds 1 for future-dated items", () => {
    expect(recencyScore(NOW, "news", NOW)).toBe(1);
    expect(recencyScore(new Date(NOW.getTime() + 60_000), "social", NOW)).toBe(1);
  });

  it("halves at the class half-life (social 3h, news 24h, longform 96h)", () => {
    expect(recencyScore(hoursAgo(3), "social", NOW)).toBeCloseTo(0.5, 10);
    expect(recencyScore(hoursAgo(24), "news", NOW)).toBeCloseTo(0.5, 10);
    expect(recencyScore(hoursAgo(96), "longform", NOW)).toBeCloseTo(0.5, 10);
  });

  it("keeps a 3-day-old longform piece meaningfully alive but a 3-day-old social post dead", () => {
    const longform = recencyScore(hoursAgo(72), "longform", NOW);
    const social = recencyScore(hoursAgo(72), "social", NOW);

    expect(longform).toBeGreaterThan(0.55); // > 0.55 of max (max is 1)
    expect(social).toBeLessThan(0.01);
  });
});

describe("scoreItem", () => {
  const social = makeSource({ id: 1, sourceClass: "social" });

  it("ranks a fresh social item above an old one from the same source", () => {
    const fresh = makeItem({ topics: ["nba"], publishedAt: NOW });
    const old = makeItem({ topics: ["nba"], publishedAt: hoursAgo(12) });
    const ctx = { source: social, affinities: new Map(), seedInterests: [], now: NOW };

    expect(scoreItem({ item: fresh, ...ctx })).toBeGreaterThan(scoreItem({ item: old, ...ctx }));
  });

  it("adds positive topic affinity to the score via tanh normalization", () => {
    const item = makeItem({ topics: ["nba"], publishedAt: NOW });
    const base = { item, source: social, seedInterests: [], now: NOW };

    const withAffinity = scoreItem({ ...base, affinities: makeAffinities([["topic:nba", 3]]) });
    const without = scoreItem({ ...base, affinities: new Map() });

    expect(withAffinity - without).toBeCloseTo(SCORE_WEIGHTS.topicAffinity * Math.tanh(1), 10);
  });

  it("averages topic affinity over known topics instead of summing", () => {
    const item = makeItem({ topics: ["nba", "tech"], publishedAt: NOW });
    const affinities = makeAffinities([
      ["topic:nba", 3],
      ["topic:tech", -3],
    ]);
    const score = scoreItem({ item, source: social, affinities, seedInterests: [], now: NOW });
    const neutral = scoreItem({
      item: makeItem({ topics: [], publishedAt: NOW }),
      source: social,
      affinities,
      seedInterests: [],
      now: NOW,
    });

    // tanh(1) and tanh(-1) cancel under the mean.
    expect(score).toBeCloseTo(neutral, 10);
  });

  it("applies source and author affinities at their own weights", () => {
    const item = makeItem({ topics: [], author: "Jane Chen", publishedAt: NOW });
    const affinities = makeAffinities([
      ["source:1", 3],
      ["author:jane chen", 3],
    ]);
    const base = { item, source: social, seedInterests: [], now: NOW };

    const withAffinity = scoreItem({ ...base, affinities });
    const without = scoreItem({ ...base, affinities: new Map() });

    expect(withAffinity - without).toBeCloseTo(
      (SCORE_WEIGHTS.sourceAffinity + SCORE_WEIGHTS.authorAffinity) * Math.tanh(1),
      10,
    );
  });

  it("applies the seed boost only while the seed topic has no learned affinity", () => {
    const item = makeItem({ topics: ["taiwan"], publishedAt: NOW });
    const seeds = ["taiwan"];

    const coldStart = scoreItem({
      item,
      source: social,
      affinities: new Map(),
      seedInterests: seeds,
      now: NOW,
    });
    const noSeeds = scoreItem({
      item,
      source: social,
      affinities: new Map(),
      seedInterests: [],
      now: NOW,
    });
    expect(coldStart - noSeeds).toBeCloseTo(SCORE_WEIGHTS.seedBoost, 10);

    // Once any affinity is learned for the topic, the boost disappears.
    const learned = makeAffinities([["topic:taiwan", 0.5]]);
    const afterLearning = scoreItem({
      item,
      source: social,
      affinities: learned,
      seedInterests: seeds,
      now: NOW,
    });
    const afterLearningNoSeeds = scoreItem({
      item,
      source: social,
      affinities: learned,
      seedInterests: [],
      now: NOW,
    });
    expect(afterLearning).toBeCloseTo(afterLearningNoSeeds, 10);
  });

  it("weights the source quality prior", () => {
    const item = makeItem({ topics: [], publishedAt: NOW });
    const reputable = makeSource({ id: 1, sourceClass: "news", qualityPrior: 1 });
    const sketchy = makeSource({ id: 2, sourceClass: "news", qualityPrior: 0.4 });
    const ctx = { item, affinities: new Map(), seedInterests: [], now: NOW };

    expect(scoreItem({ ...ctx, source: reputable }) - scoreItem({ ...ctx, source: sketchy })).toBeCloseTo(
      SCORE_WEIGHTS.qualityPrior * 0.6,
      10,
    );
  });
});
