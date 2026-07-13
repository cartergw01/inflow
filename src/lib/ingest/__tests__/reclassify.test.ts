import { describe, expect, it } from "vitest";
import { planReclassification, RECLASSIFICATION_WINDOW_DAYS } from "../reclassify";

describe("recent-topic reclassification", () => {
  it("uses a seven-day candidate window", () => {
    expect(RECLASSIFICATION_WINDOW_DAYS).toBe(7);
  });

  it("replaces umbrella topics with precise leaves and omits unchanged rows", () => {
    const updates = planReclassification([
      { id: 1, title: "OpenAI launches a new reasoning model", excerpt: null, topics: ["tech"], sourceHints: ["tech"] },
      { id: 2, title: "Lakers clinch a playoff berth", excerpt: null, topics: ["nba"], sourceHints: ["nba"] },
      { id: 3, title: "Update expected this afternoon", excerpt: null, topics: ["business"], sourceHints: ["business"] },
    ]);
    expect(updates).toEqual([
      { id: 1, topics: ["ai"] },
      { id: 3, topics: ["markets"] },
    ]);
  });

  it("is idempotent after applying its first plan", () => {
    const rows = [
      { id: 1, title: "CISA warns of an active ransomware campaign", excerpt: null, topics: ["tech"], sourceHints: ["cybersecurity"] },
      { id: 2, title: "Federal Reserve holds rates steady", excerpt: null, topics: ["business"], sourceHints: ["economy"] },
    ];
    const first = planReclassification(rows);
    const applied = rows.map((row) => ({ ...row, topics: first.find((update) => update.id === row.id)?.topics ?? row.topics }));
    expect(first).toHaveLength(2);
    expect(planReclassification(applied)).toEqual([]);
  });
});
