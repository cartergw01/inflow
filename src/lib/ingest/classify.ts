/**
 * Deterministic topic classifier: weighted term lists over title + excerpt.
 * Chosen over an LLM on purpose — it is testable, free, and cannot
 * misrepresent an article (spec: accuracy first). Terms are word-boundary
 * matched, case-insensitive; phrases allowed.
 */

export interface TopicRule {
  topic: string;
  terms: string[];
  /** Terms so unambiguous that one hit is enough (e.g. "tsmc"). */
  strongTerms?: string[];
}

export const TAXONOMY: TopicRule[] = [
  {
    topic: "nba",
    strongTerms: ["nba", "wembanyama", "lebron", "giannis", "jokic", "all-nba"],
    terms: [
      "basketball", "lakers", "celtics", "knicks", "nets", "76ers", "sixers",
      "bucks", "heat", "magic", "hawks", "cavaliers", "cavs", "pistons",
      "pacers", "bulls", "raptors", "wizards", "hornets", "mavericks", "mavs",
      "rockets", "spurs", "grizzlies", "pelicans", "thunder", "timberwolves",
      "nuggets", "jazz", "suns", "clippers", "warriors", "trail blazers",
      "sacramento kings", "steph curry", "luka doncic", "shai gilgeous-alexander",
      "playoff", "all-star", "buyout market", "trade deadline",
    ],
  },
  {
    topic: "tech",
    strongTerms: ["silicon valley", "openai", "anthropic", "big tech"],
    terms: [
      "tech", "software", "startup", "startups", "apple", "google", "microsoft",
      "meta", "amazon", "nvidia", "tesla", "spacex", "iphone", "android",
      "chip", "chips", "semiconductor", "cybersecurity", "saas", "app store",
      "cloud", "data center", "coding", "developer", "hack", "hacker", "crypto",
    ],
  },
  {
    topic: "ai",
    strongTerms: ["artificial intelligence", "chatgpt", "llm", "llms"],
    terms: ["ai", "machine learning", "claude", "gemini", "deepmind", "neural network", "model", "agents", "agentic"],
  },
  {
    topic: "vc",
    strongTerms: ["venture capital", "y combinator", "a16z", "andreessen horowitz", "sequoia"],
    terms: [
      "vc", "fundraise", "fundraising", "funding round", "series a", "series b",
      "series c", "seed round", "valuation", "unicorn", "ipo", "term sheet",
      "investors", "raised",
    ],
  },
  {
    topic: "taiwan",
    strongTerms: ["taiwan", "taipei", "tsmc", "taiwanese", "cross-strait", "taiwan strait", "kaohsiung"],
    terms: ["kmt", "dpp", "pla drills", "one china", "reunification", "semiconductors"],
  },
  {
    topic: "us-politics",
    strongTerms: ["white house", "capitol hill", "supreme court", "gop"],
    terms: [
      "congress", "senate", "house of representatives", "president", "trump",
      "democrat", "democrats", "republican", "republicans", "election",
      "campaign", "governor", "legislation", "senator", "impeachment",
      "electoral", "midterm", "primary", "ballot", "filibuster", "executive order",
    ],
  },
  {
    topic: "world",
    strongTerms: ["united nations", "nato", "european union"],
    terms: [
      "ukraine", "russia", "china", "israel", "gaza", "iran", "diplomat",
      "diplomacy", "ceasefire", "sanctions", "summit", "foreign minister",
    ],
  },
  {
    topic: "business",
    strongTerms: ["federal reserve", "wall street"],
    terms: [
      "stocks", "earnings", "inflation", "economy", "economic", "markets",
      "gdp", "tariff", "tariffs", "recession", "interest rate", "interest rates",
      "shareholders", "merger", "acquisition", "antitrust",
    ],
  },
  {
    topic: "science",
    strongTerms: ["nasa"],
    terms: ["researchers", "study finds", "climate", "physics", "biology", "spacecraft", "vaccine", "genome", "telescope"],
  },
  {
    topic: "media",
    terms: ["journalism", "journalists", "newsroom", "podcast", "newsletter", "substack", "press freedom"],
  },
];

const compiled = TAXONOMY.map((rule) => ({
  topic: rule.topic,
  strong: (rule.strongTerms ?? []).map(termRegex),
  weak: rule.terms.map(termRegex),
}));

function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
}

function countHits(text: string, regexes: RegExp[]): number {
  let hits = 0;
  for (const re of regexes) if (re.test(text)) hits += 1;
  return hits;
}

/**
 * Returns topics ordered by confidence. Title hits weigh 3x excerpt hits;
 * a topic qualifies with one strong hit or score >= 2. Falls back to the
 * source's curated topic hints when nothing matches (e.g. terse headlines
 * from a single-topic source like ESPN NBA).
 */
export function classify(title: string, excerpt: string | null, sourceHints: string[]): string[] {
  const scored: { topic: string; score: number }[] = [];
  for (const rule of compiled) {
    const titleScore = 3 * (2 * countHits(title, rule.strong) + countHits(title, rule.weak));
    const excerptScore = excerpt ? 2 * countHits(excerpt, rule.strong) + countHits(excerpt, rule.weak) : 0;
    const strongHit = rule.strong.some((re) => re.test(title) || (excerpt ? re.test(excerpt) : false));
    const score = titleScore + excerptScore;
    if (strongHit || score >= 2) scored.push({ topic: rule.topic, score: score + (strongHit ? 3 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  const topics = scored.slice(0, 3).map((s) => s.topic);
  if (topics.length === 0) return [...sourceHints];
  return topics;
}
