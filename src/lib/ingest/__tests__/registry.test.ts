import { describe, expect, it } from "vitest";
import { SOURCE_REGISTRY } from "../registry";

describe("source registry policy", () => {
  it("includes the requested named major outlets on official or official-social feeds", () => {
    const names = new Set(SOURCE_REGISTRY.map((source) => source.name));
    for (const name of ["Reuters", "Bloomberg Markets", "WSJ World", "CNBC"]) expect(names.has(name)).toBe(true);
  });

  it("polls major and social signals faster than long-form writers", () => {
    expect(SOURCE_REGISTRY.find((source) => source.name === "Bloomberg Markets")?.pollIntervalMinutes).toBe(5);
    expect(SOURCE_REGISTRY.find((source) => source.name === "Reuters")?.pollIntervalMinutes).toBe(5);
    expect(SOURCE_REGISTRY.find((source) => source.name === "Marc Stein")?.pollIntervalMinutes).toBe(30);
  });

  it("requires identity for curated social and long-form sources", () => {
    expect(SOURCE_REGISTRY.find((source) => source.name === "X — Curated Journalists")?.namedAuthorRequired).toBe(true);
    expect(SOURCE_REGISTRY.find((source) => source.name === "Slow Boring")?.namedAuthorRequired).toBe(true);
  });
});
