import { describe, expect, it } from "vitest";
import { SUBJECTS, isSubjectId } from "../../subjects";
import { SOURCE_REGISTRY, SYNDICATION_REFERENCES } from "../registry";

describe("source registry policy", () => {
  it("includes the requested named major outlets on official or official-social feeds", () => {
    const names = new Set(SOURCE_REGISTRY.map((source) => source.name));
    for (const name of [
      "Reuters", "Bloomberg Markets", "WSJ World", "CNBC", "Krebs on Security", "CISA", "Engadget",
      "Carbon Brief", "NASA Earth Observatory", "Federal Reserve", "CNBC Personal Finance",
      "Consumer Financial Protection Bureau", "Nieman Lab", "Platformer", "NASA", "JPL",
      "NIH MedlinePlus", "Nature", "National Science Foundation", "ESPN Football",
      "CBS Sports Baseball", "Autosport Formula 1", "BBC Formula 1",
    ]) expect(names.has(name)).toBe(true);
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

  it("uses unique feed identifiers and canonical leaf hints only", () => {
    expect(new Set(SOURCE_REGISTRY.map((source) => source.feedUrl)).size).toBe(SOURCE_REGISTRY.length);
    for (const source of SOURCE_REGISTRY) {
      expect(source.topicHints.length, source.name).toBeGreaterThan(0);
      for (const hint of source.topicHints) expect(isSubjectId(hint), `${source.name}: ${hint}`).toBe(true);
    }
  });

  it("provides at least two independent editorial families for every leaf", () => {
    for (const subject of SUBJECTS) {
      const families = new Set(
        SOURCE_REGISTRY
          .filter((source) => source.topicHints.includes(subject.id))
          .map((source) => source.sourceFamily),
      );
      expect(families.size, subject.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers culture and expanded sports with independent dedicated feeds", () => {
    const coverage = (topic: string) => SOURCE_REGISTRY.filter((source) => source.topicHints.includes(topic as never)).map((source) => source.name);
    expect(coverage("film")).toEqual(expect.arrayContaining(["NPR Film", "Guardian Film"]));
    expect(coverage("music")).toEqual(expect.arrayContaining(["NPR Music", "Guardian Music"]));
    expect(coverage("books")).toEqual(expect.arrayContaining(["NPR Books", "Guardian Books"]));
    expect(coverage("football")).toEqual(expect.arrayContaining(["ESPN Football", "CBS Sports Football"]));
    expect(coverage("baseball")).toEqual(expect.arrayContaining(["ESPN Baseball", "CBS Sports Baseball"]));
    expect(coverage("formula-1")).toEqual(expect.arrayContaining(["Autosport Formula 1", "BBC Formula 1"]));
  });

  it("records publisher-owned syndication references for the official feed groups", () => {
    const expected = new Map([
      ["NASA", SYNDICATION_REFERENCES.nasa],
      ["JPL", SYNDICATION_REFERENCES.nasa],
      ["NASA Earth Observatory", SYNDICATION_REFERENCES.nasa],
      ["Federal Reserve", SYNDICATION_REFERENCES.federalReserve],
      ["National Science Foundation", SYNDICATION_REFERENCES.nsf],
      ["NIH MedlinePlus", SYNDICATION_REFERENCES.nih],
      ["ESPN NBA", SYNDICATION_REFERENCES.espn],
      ["ESPN Football", SYNDICATION_REFERENCES.espn],
      ["ESPN Baseball", SYNDICATION_REFERENCES.espn],
    ]);

    for (const [name, reference] of expected) {
      expect(SOURCE_REGISTRY.find((source) => source.name === name)?.syndicationReferenceUrl, name).toBe(reference);
    }
  });
});
