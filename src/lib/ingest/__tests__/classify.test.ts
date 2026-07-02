import { describe, expect, it } from "vitest";
import { classify } from "../classify";

/** Labeled headlines — realistic shapes, checked against expected topics. */
const CASES: { title: string; excerpt: string | null; expect: string; hints?: string[] }[] = [
  { title: "Lakers rally past Nuggets behind Doncic's 41-point night", excerpt: null, expect: "nba" },
  { title: "NBA trade deadline: winners and losers", excerpt: null, expect: "nba" },
  { title: "Wembanyama posts historic stat line in Spurs win", excerpt: null, expect: "nba" },
  { title: "OpenAI launches new enterprise tier as competition heats up", excerpt: null, expect: "tech" },
  { title: "The startup raised a $40M Series B led by Sequoia", excerpt: null, expect: "vc" },
  { title: "Y Combinator's newest batch is smaller and more focused", excerpt: null, expect: "vc" },
  { title: "TSMC's Arizona fab hits volume production milestone", excerpt: null, expect: "taiwan" },
  { title: "Taipei responds to latest round of PLA drills near the strait", excerpt: null, expect: "taiwan" },
  { title: "Senate passes spending bill after marathon session", excerpt: "The White House signaled support.", expect: "us-politics" },
  { title: "Supreme Court to hear landmark case on executive power", excerpt: null, expect: "us-politics" },
  { title: "EU and NATO allies meet over Black Sea security", excerpt: null, expect: "world" },
  { title: "Federal Reserve holds rates steady as inflation cools", excerpt: null, expect: "business" },
];

describe("classify", () => {
  for (const c of CASES) {
    it(`labels "${c.title.slice(0, 50)}" as ${c.expect}`, () => {
      expect(classify(c.title, c.excerpt, c.hints ?? [])).toContain(c.expect);
    });
  }

  it("falls back to source hints for terse headlines with no signal", () => {
    expect(classify("Sources: deal expected within days", null, ["nba"])).toEqual(["nba"]);
  });

  it("returns multiple topics for genuinely cross-topic stories", () => {
    const topics = classify(
      "TSMC warns chip tariffs would hit Taiwan's economy",
      "Semiconductor giant flags risks from proposed US tariffs.",
      [],
    );
    expect(topics).toContain("taiwan");
    expect(topics.length).toBeGreaterThan(1);
  });

  it("does not label unrelated content with seed topics", () => {
    const topics = classify("Local bakery wins regional croissant award", null, []);
    expect(topics).not.toContain("nba");
    expect(topics).not.toContain("taiwan");
    expect(topics).not.toContain("us-politics");
  });
});
