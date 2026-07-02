import { describe, expect, it } from "vitest";
import {
  AFFINITY_WEIGHT_MAX,
  AFFINITY_WEIGHT_MIN,
  applySignal,
  decayWeight,
  signalWeight,
} from "../affinity";
import type { AffinityMap } from "../types";
import { daysAgo, makeAffinities, makeItem, makeSource, NOW } from "./fixtures";

describe("signalWeight", () => {
  it("maps each signal type to its agreed delta", () => {
    expect(signalWeight("impression", 1)).toBe(-0.05);
    expect(signalWeight("open", 1)).toBe(1);
    expect(signalWeight("save", 1)).toBe(3);
    expect(signalWeight("unsave", 1)).toBe(-3);
    expect(signalWeight("more_like", 1)).toBe(3);
    expect(signalWeight("less_like", 1)).toBe(-3);
    expect(signalWeight("hide_source", 1)).toBe(-5);
  });

  it("converts read_time seconds to points, capped at 2 points at 2 minutes", () => {
    expect(signalWeight("read_time", 30)).toBeCloseTo(0.5, 10);
    expect(signalWeight("read_time", 60)).toBeCloseTo(1, 10);
    expect(signalWeight("read_time", 120)).toBeCloseTo(2, 10);
    expect(signalWeight("read_time", 600)).toBe(2); // capped
  });
});

describe("decayWeight", () => {
  it("halves a weight over the 14-day half-life", () => {
    expect(decayWeight(4, daysAgo(14), NOW)).toBeCloseTo(2, 10);
    expect(decayWeight(4, daysAgo(28), NOW)).toBeCloseTo(1, 10);
    expect(decayWeight(-6, daysAgo(14), NOW)).toBeCloseTo(-3, 10);
  });

  it("leaves a weight untouched when no time has passed", () => {
    expect(decayWeight(4, NOW, NOW)).toBe(4);
  });
});

describe("applySignal", () => {
  const nbaSource = makeSource({ id: 7, name: "NBA Desk" });
  const nbaItem = makeItem({ topics: ["nba"], author: "LeBron James", sourceId: 7 });

  it("save on an NBA item raises topic, source (0.5x), and lowercased author (0.5x)", () => {
    const next = applySignal(new Map(), { type: "save", value: 1 }, nbaItem, nbaSource, NOW);

    expect(next.get("topic:nba")?.weight).toBeCloseTo(3, 10);
    expect(next.get("source:7")?.weight).toBeCloseTo(1.5, 10);
    expect(next.get("author:lebron james")?.weight).toBeCloseTo(1.5, 10);
    expect(next.get("topic:nba")?.updatedAt).toEqual(NOW);
  });

  it("applies the full delta to every topic on a multi-topic item", () => {
    const item = makeItem({ topics: ["taiwan", "us-politics"] });
    const next = applySignal(new Map(), { type: "more_like", value: 1 }, item, nbaSource, NOW);

    expect(next.get("topic:taiwan")?.weight).toBeCloseTo(3, 10);
    expect(next.get("topic:us-politics")?.weight).toBeCloseTo(3, 10);
  });

  it("hide_source applies the full -5 to the source (not 0.5x)", () => {
    const next = applySignal(new Map(), { type: "hide_source", value: 1 }, nbaItem, nbaSource, NOW);

    expect(next.get("source:7")?.weight).toBeCloseTo(-5, 10);
    // Topics get the full delta, author still gets the halo rate.
    expect(next.get("topic:nba")?.weight).toBeCloseTo(-5, 10);
    expect(next.get("author:lebron james")?.weight).toBeCloseTo(-2.5, 10);
  });

  it("drives the source strongly negative and clamps at the floor on repeat hides", () => {
    let map: AffinityMap = new Map();
    for (let i = 0; i < 4; i++) {
      map = applySignal(map, { type: "hide_source", value: 1 }, nbaItem, nbaSource, NOW);
    }
    expect(map.get("source:7")?.weight).toBe(AFFINITY_WEIGHT_MIN);
  });

  it("clamps positive weights at the ceiling", () => {
    let map: AffinityMap = new Map();
    for (let i = 0; i < 5; i++) {
      map = applySignal(map, { type: "save", value: 1 }, nbaItem, nbaSource, NOW);
    }
    expect(map.get("topic:nba")?.weight).toBe(AFFINITY_WEIGHT_MAX);
  });

  it("decays the existing weight to now before adding the new delta", () => {
    const existing = makeAffinities([["topic:nba", 4]], daysAgo(14));
    const next = applySignal(existing, { type: "open", value: 1 }, nbaItem, nbaSource, NOW);

    // 4 decayed one half-life -> 2, plus open (+1) -> 3.
    expect(next.get("topic:nba")?.weight).toBeCloseTo(3, 10);
  });

  it("does not mutate the input map", () => {
    const existing = makeAffinities([["topic:nba", 4]], daysAgo(14));
    applySignal(existing, { type: "save", value: 1 }, nbaItem, nbaSource, NOW);

    expect(existing.size).toBe(1);
    expect(existing.get("topic:nba")?.weight).toBe(4);
    expect(existing.get("topic:nba")?.updatedAt).toEqual(daysAgo(14));
  });

  it("skips the author dimension when the item has no author", () => {
    const item = makeItem({ topics: ["tech"], author: null });
    const next = applySignal(new Map(), { type: "open", value: 1 }, item, nbaSource, NOW);

    expect([...next.keys()].filter((k) => k.startsWith("author:"))).toHaveLength(0);
  });
});
