import { normalizeSubjectIds, type SubjectId } from "../subjects";

/**
 * Deterministic leaf-topic classifier: weighted term lists over title + excerpt.
 * The rules intentionally favor precise phrases over umbrella categories so all
 * newly classified items and affinities use one of the 24 selectable subjects.
 */
export interface TopicRule {
  topic: SubjectId;
  terms: string[];
  /** Terms so unambiguous that one excerpt hit is enough (for example, "tsmc"). */
  strongTerms?: string[];
}

export const TAXONOMY: TopicRule[] = [
  {
    topic: "ai",
    strongTerms: ["ai", "artificial intelligence", "openai", "anthropic", "chatgpt", "large language model", "llm", "deepmind"],
    terms: ["machine learning", "generative ai", "ai model", "ai models", "ai agent", "ai agents", "neural network", "gemini", "claude"],
  },
  {
    topic: "startups",
    strongTerms: ["startup", "startups", "y combinator", "techstars", "500 global"],
    terms: ["founder", "founders", "co-founder", "accelerator", "bootstrapped", "entrepreneurship", "new venture"],
  },
  {
    topic: "software",
    strongTerms: ["open source", "developer tools", "software development", "software engineering", "programming language"],
    terms: ["software", "saas", "github", "developer platform", "cloud computing", "database", "operating system", "app store"],
  },
  {
    topic: "cybersecurity",
    strongTerms: ["cybersecurity", "cyberattack", "ransomware", "malware", "data breach", "security breach", "cisa", "zero-day"],
    terms: ["phishing", "vulnerability", "vulnerabilities", "botnet", "spyware", "infosec", "computer security", "threat actor"],
  },
  {
    topic: "gadgets",
    strongTerms: ["iphone", "ipad", "apple watch", "pixel phone", "galaxy phone", "playstation", "nintendo switch", "consumer electronics"],
    terms: ["smartphone", "smartwatch", "wearable", "earbuds", "headphones", "laptop review", "phone review", "gadget", "gadgets", "xbox"],
  },
  {
    topic: "world",
    strongTerms: ["united nations", "nato", "european union", "foreign minister", "geopolitics", "geopolitical"],
    terms: ["ukraine", "russia", "israel", "gaza", "iran", "ceasefire", "sanctions", "diplomacy", "diplomat", "peace talks", "summit"],
  },
  {
    topic: "taiwan",
    strongTerms: ["taiwan", "taipei", "tsmc", "taiwanese", "cross-strait", "taiwan strait", "kaohsiung", "lai ching-te"],
    terms: ["kmt", "dpp", "pla drills", "one china", "new taiwan dollar", "legislative yuan"],
  },
  {
    topic: "us-politics",
    strongTerms: ["white house", "capitol hill", "supreme court", "house of representatives", "executive order", "electoral college"],
    terms: ["congress", "senate", "gop", "democrat", "democrats", "republican", "republicans", "trump", "midterm election", "primary election", "filibuster", "impeachment"],
  },
  {
    topic: "climate",
    strongTerms: ["climate change", "global warming", "greenhouse gas", "carbon emissions", "climate crisis", "cop30"],
    terms: ["climate policy", "climate science", "emissions", "decarbonization", "renewable energy", "fossil fuel", "extreme weather", "heat wave", "sea level rise", "net zero"],
  },
  {
    topic: "markets",
    strongTerms: ["wall street", "s&p 500", "stock market", "bond market", "dow jones", "nasdaq composite"],
    terms: ["stocks", "equities", "treasury yields", "market rally", "market selloff", "shares rose", "shares fell", "commodities", "earnings season"],
  },
  {
    topic: "economy",
    strongTerms: ["federal reserve", "central bank", "gross domestic product", "jobs report", "consumer price index"],
    terms: ["global economy", "us economy", "world economy", "economic growth", "inflation", "gdp", "unemployment", "recession", "interest rates", "interest rate", "labor market", "tariffs"],
  },
  {
    topic: "vc",
    strongTerms: ["venture capital", "funding round", "series a", "series b", "series c", "seed round", "term sheet", "andreessen horowitz"],
    terms: ["vc", "fundraise", "fundraising", "valuation", "unicorn", "venture fund", "sequoia capital", "capital raise"],
  },
  {
    topic: "personal-finance",
    strongTerms: ["personal finance", "credit score", "credit card debt", "student loans", "retirement savings", "401k"],
    terms: ["mortgage rate", "mortgage rates", "home loan", "household budget", "savings account", "tax filing", "financial adviser", "retirement plan", "consumer debt", "cost of living"],
  },
  {
    topic: "media",
    strongTerms: ["press freedom", "media industry", "creator economy", "news organization", "news organizations"],
    terms: ["journalism", "journalist", "journalists", "newsroom", "newsrooms", "podcast", "newsletter", "substack", "publisher", "digital media"],
  },
  {
    topic: "film",
    strongTerms: ["box office", "academy awards", "cannes film festival", "sundance film festival", "film festival"],
    terms: ["movie", "movies", "cinema", "filmmaker", "film director", "movie review", "screenplay", "hollywood studio"],
  },
  {
    topic: "music",
    strongTerms: ["grammy awards", "record label", "music industry", "billboard hot 100", "music festival"],
    terms: ["album", "musician", "singer", "songwriter", "concert", "tour dates", "streaming music", "new single", "debut album"],
  },
  {
    topic: "books",
    strongTerms: ["book review", "literary prize", "booker prize", "national book award", "pulitzer prize for fiction"],
    terms: ["novel", "novelist", "nonfiction book", "bestseller", "literature", "literary", "book publishing", "memoir"],
  },
  {
    topic: "space",
    strongTerms: ["nasa", "spacecraft", "space station", "rocket launch", "mars rover", "james webb space telescope", "lunar mission"],
    terms: ["astronaut", "astronomy", "telescope", "orbit", "orbital", "moon landing", "spacex", "asteroid", "exoplanet"],
  },
  {
    topic: "health",
    strongTerms: ["public health", "clinical trial", "food and drug administration", "centers for disease control", "world health organization"],
    terms: ["health", "medical", "medicine", "vaccine", "cancer", "disease", "hospital", "patient", "drug approval", "mental health"],
  },
  {
    topic: "science",
    strongTerms: ["peer-reviewed", "scientific discovery", "research paper", "national science foundation"],
    terms: ["researchers", "study finds", "scientists", "physics", "biology", "chemistry", "genome", "fossil discovery", "laboratory research"],
  },
  {
    topic: "nba",
    strongTerms: ["nba", "wembanyama", "lebron", "giannis", "jokic", "all-nba"],
    // Ambiguous team names (Heat, Magic, Jazz, Thunder, and so on) are only
    // included when city-qualified so weather, culture, and business stay clean.
    terms: [
      "basketball", "lakers", "celtics", "knicks", "76ers", "sixers", "cavaliers", "cavs", "pistons", "pacers", "raptors", "mavericks", "mavs",
      "grizzlies", "pelicans", "timberwolves", "nuggets", "clippers", "trail blazers", "miami heat", "orlando magic", "utah jazz", "oklahoma city thunder",
      "okc thunder", "phoenix suns", "chicago bulls", "san antonio spurs", "sacramento kings", "brooklyn nets", "houston rockets", "charlotte hornets",
      "washington wizards", "milwaukee bucks", "golden state warriors", "atlanta hawks", "steph curry", "luka doncic", "shai gilgeous-alexander",
    ],
  },
  {
    topic: "football",
    strongTerms: ["soccer", "fifa", "uefa", "premier league", "champions league", "la liga", "bundesliga", "serie a"],
    terms: ["football club", "world cup qualifier", "europa league", "transfer window", "manchester united", "real madrid", "barcelona", "arsenal", "liverpool"],
  },
  {
    topic: "baseball",
    strongTerms: ["major league baseball", "mlb", "world series", "spring training"],
    terms: ["baseball", "home run", "pitcher", "batting average", "new york yankees", "boston red sox", "los angeles dodgers", "chicago cubs"],
  },
  {
    topic: "formula-1",
    strongTerms: ["formula 1", "formula one", "f1", "grand prix", "max verstappen", "charles leclerc", "lewis hamilton"],
    terms: ["motorsport", "red bull racing", "mclaren racing", "ferrari driver", "constructor championship", "drivers championship", "race weekend"],
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
  for (const regex of regexes) if (regex.test(text)) hits += 1;
  return hits;
}

/**
 * Returns at most three canonical leaf topics ordered by confidence. Title
 * hits weigh 3x excerpt hits; a topic qualifies with one strong hit or score
 * >= 2. Terse single-topic feeds fall back to normalized source hints.
 */
export function classify(title: string, excerpt: string | null, sourceHints: string[]): SubjectId[] {
  const scored: { topic: SubjectId; score: number }[] = [];
  for (const rule of compiled) {
    const titleScore = 3 * (2 * countHits(title, rule.strong) + countHits(title, rule.weak));
    const excerptScore = excerpt ? 2 * countHits(excerpt, rule.strong) + countHits(excerpt, rule.weak) : 0;
    const strongHit = rule.strong.some((regex) => regex.test(title) || (excerpt ? regex.test(excerpt) : false));
    const score = titleScore + excerptScore;
    if (strongHit || score >= 2) scored.push({ topic: rule.topic, score: score + (strongHit ? 3 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  const topics = scored.slice(0, 3).map((entry) => entry.topic);
  if (topics.length > 0) return topics;
  const normalizedHints = normalizeSubjectIds(sourceHints, 3);
  return normalizedHints.length === 1 ? normalizedHints : [];
}
