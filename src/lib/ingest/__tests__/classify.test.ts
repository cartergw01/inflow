import { describe, expect, it } from "vitest";
import { SUBJECTS, type SubjectId } from "../../subjects";
import { classify, TAXONOMY } from "../classify";

const POSITIVE_CASES: ReadonlyArray<{ topic: SubjectId; title: string; excerpt?: string }> = [
  { topic: "ai", title: "OpenAI launches a faster reasoning model for ChatGPT" },
  { topic: "startups", title: "Robotics startup opens a second factory in Detroit" },
  { topic: "software", title: "Open source database adds a new developer platform" },
  { topic: "cybersecurity", title: "CISA warns hospitals about a new ransomware campaign" },
  { topic: "gadgets", title: "iPhone camera overhaul leads Apple's fall hardware lineup" },
  { topic: "world", title: "NATO foreign ministers begin ceasefire talks" },
  { topic: "taiwan", title: "TSMC expands advanced packaging capacity in Taiwan" },
  { topic: "us-politics", title: "Senate leaders meet the White House over spending bill" },
  { topic: "climate", title: "Climate change is accelerating global sea level rise" },
  { topic: "markets", title: "S&P 500 climbs as Wall Street weighs earnings" },
  { topic: "economy", title: "Federal Reserve holds interest rates as inflation cools" },
  { topic: "vc", title: "Fintech closes Series B funding round led by venture capital firms" },
  { topic: "personal-finance", title: "How mortgage rates affect your household budget" },
  { topic: "media", title: "Newsrooms rethink the creator economy and digital media" },
  { topic: "film", title: "Cannes Film Festival winner surprises the box office" },
  { topic: "music", title: "Singer announces debut album and summer concert dates" },
  { topic: "books", title: "Booker Prize shortlist puts three debut novelists in contention" },
  { topic: "space", title: "NASA schedules lunar mission after spacecraft test" },
  { topic: "health", title: "Clinical trial finds vaccine protects high-risk patients" },
  { topic: "science", title: "Researchers publish peer-reviewed fossil discovery" },
  { topic: "nba", title: "Lakers rally past Nuggets behind Doncic's 41-point night" },
  { topic: "football", title: "Premier League clubs prepare for the transfer window" },
  { topic: "baseball", title: "MLB pitcher throws the season's first no-hitter" },
  { topic: "formula-1", title: "Max Verstappen takes pole for the Monaco Grand Prix" },
];

describe("leaf topic taxonomy", () => {
  it("has one rule for each canonical subject and no umbrella legacy rules", () => {
    expect(TAXONOMY.map((rule) => rule.topic)).toEqual(SUBJECTS.map((subject) => subject.id));
    expect(TAXONOMY.some((rule) => (rule.topic as string) === "tech" || (rule.topic as string) === "business")).toBe(false);
  });

  for (const testCase of POSITIVE_CASES) {
    it(`labels ${testCase.topic} stories`, () => {
      expect(classify(testCase.title, testCase.excerpt ?? null, [])).toContain(testCase.topic);
    });
  }

  it("recognizes bare AI in a generic-feed headline", () => {
    expect(classify("AI chips reshape the data-center market", null, [])).toContain("ai");
  });

  it("normalizes legacy hints only when a terse headline has no content signal", () => {
    expect(classify("Sources: deal expected within days", null, ["tech"])).toEqual(["startups"]);
    expect(classify("Update expected this afternoon", null, ["business"])).toEqual(["markets"]);
    expect(classify("Details to follow", null, ["nba", "nba"])).toEqual(["nba"]);
  });

  it("does not guess when a terse headline comes from a multi-topic source", () => {
    expect(classify("Details to follow", null, ["software", "startups"])).toEqual([]);
    expect(classify("Details to follow", null, ["tech", "business"])).toEqual([]);
  });

  it("returns multiple leaves for genuinely cross-topic stories", () => {
    const topics = classify(
      "TSMC warns chip tariffs would hit Taiwan's economy",
      "The company says proposed tariffs could slow economic growth.",
      [],
    );
    expect(topics).toContain("taiwan");
    expect(topics).toContain("economy");
  });

  const COLLISION_CASES: ReadonlyArray<{ title: string; absent: SubjectId }> = [
    { title: "Local agent helps buyers navigate a quiet housing market", absent: "ai" },
    { title: "Veteran pitcher makes his first start after injury", absent: "startups" },
    { title: "Clouds gather before a weekend of heavy rain", absent: "software" },
    { title: "Ten clever life hacks for a calmer morning", absent: "cybersecurity" },
    { title: "Apple harvest forecast points to a record crop", absent: "gadgets" },
    { title: "World Series opener draws a record television audience", absent: "world" },
    { title: "China glaze gives the pottery a deep blue finish", absent: "taiwan" },
    { title: "The company president unveils a new factory", absent: "us-politics" },
    { title: "An office climate of trust improves retention", absent: "climate" },
    { title: "Farmers market opens for the summer season", absent: "markets" },
    { title: "Fuel economy improves in the latest phone-sized car", absent: "economy" },
    { title: "Cardinals raised three chicks in the city park", absent: "vc" },
    { title: "Quarterback scores on a late mortgage-themed trick play", absent: "personal-finance" },
    { title: "New filter media removes particles from drinking water", absent: "media" },
    { title: "Scientists develop a thin film for more efficient solar cells", absent: "film" },
    { title: "Can the oceans absorb more carbon?", absent: "music" },
    { title: "Accountant books record revenue for the quarter", absent: "books" },
    { title: "Parking space disappears during downtown construction", absent: "space" },
    { title: "Bank reports healthy profit growth", absent: "health" },
    { title: "Political campaign tests laboratory-style message discipline", absent: "science" },
    { title: "Extreme heat strains the power grid", absent: "nba" },
    { title: "NFL football team prepares for the Super Bowl", absent: "football" },
    { title: "Researchers map the base ball structure of a new molecule", absent: "baseball" },
    { title: "The company updates its F-1 regulatory filing", absent: "formula-1" },
  ];

  for (const testCase of COLLISION_CASES) {
    it(`does not confuse “${testCase.title}” with ${testCase.absent}`, () => {
      expect(classify(testCase.title, null, [])).not.toContain(testCase.absent);
    });
  }

  it("still recognizes city-qualified NBA team names", () => {
    expect(classify("Miami Heat close out the series in six", null, [])).toContain("nba");
    expect(classify("Jazz musicians gather for New Orleans festival", null, [])).not.toContain("nba");
  });
});
