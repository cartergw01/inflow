import { describe, expect, it } from "vitest";
import { findClusterMatch, titleSimilarity } from "../cluster";

describe("titleSimilarity", () => {
  it("scores same-story headlines from different outlets high", () => {
    const sim = titleSimilarity(
      "Senate passes $1.2T spending bill in late-night vote",
      "Spending bill passes Senate in late-night vote",
    );
    expect(sim).toBeGreaterThanOrEqual(0.6);
  });

  it("scores different stories low even within a topic", () => {
    const sim = titleSimilarity(
      "Lakers beat Nuggets in overtime thriller",
      "Celtics extend winning streak against Heat",
    );
    expect(sim).toBeLessThan(0.3);
  });
});

describe("findClusterMatch", () => {
  const recent = [
    { id: 1, title: "Senate passes $1.2T spending bill in late-night vote", sourceId: 10, clusterId: null },
    { id: 2, title: "Celtics extend winning streak against Heat", sourceId: 11, clusterId: 5 },
  ];

  it("matches the same story from a different source", () => {
    const match = findClusterMatch(
      { title: "Spending bill passes Senate in late-night vote", sourceId: 12 },
      recent,
    );
    expect(match?.id).toBe(1);
  });

  it("never clusters items from the same source", () => {
    const match = findClusterMatch(
      { title: "Senate passes $1.2T spending bill in late-night vote", sourceId: 10 },
      recent,
    );
    expect(match).toBeNull();
  });

  it("returns null when nothing is similar enough", () => {
    const match = findClusterMatch({ title: "Completely unrelated story about gardening", sourceId: 12 }, recent);
    expect(match).toBeNull();
  });
});
