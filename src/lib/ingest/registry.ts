import type { CredibilityTier, SourceClass, SourceKind } from "../../db/schema";
import type { SubjectId } from "../subjects";

export interface RegistryEntry {
  kind: SourceKind;
  sourceClass: SourceClass;
  name: string;
  /** Feed URL for rss/substack, handle for bluesky, "topstories" for hn. */
  feedUrl: string;
  homepageUrl: string;
  topicHints: SubjectId[];
  qualityPrior: number;
  credibilityTier: CredibilityTier;
  sourceFamily: string;
  pollIntervalMinutes: number;
  namedAuthorRequired: boolean;
  /** Official publisher page describing or listing the feed/syndication contract. */
  syndicationReferenceUrl?: string;
}

type RegistrySeed = Omit<
  RegistryEntry,
  "credibilityTier" | "sourceFamily" | "pollIntervalMinutes" | "namedAuthorRequired"
> & Partial<Pick<RegistryEntry, "credibilityTier" | "sourceFamily" | "pollIntervalMinutes" | "namedAuthorRequired">>;

const MAJOR_OUTLETS = new Set([
  "AP News", "BBC Formula 1", "BBC World", "Bloomberg Markets", "Bloomberg Technology", "CBS Sports Baseball", "CBS Sports Football", "CBS Sports NBA",
  "CISA", "CNBC", "CNBC Personal Finance", "Consumer Financial Protection Bureau", "Engadget", "ESPN", "ESPN Baseball", "ESPN Football", "ESPN NBA",
  "Federal Reserve", "Guardian Books", "Guardian Film", "Guardian Music", "JPL", "NASA", "NASA Earth Observatory", "NIH MedlinePlus",
  "National Science Foundation", "NPR Books", "NPR Health", "NPR Music", "NPR Politics", "NYT Politics", "Politico", "Reuters",
  "The New York Times", "WSJ Markets", "WSJ World", "Yahoo Sports NBA",
]);

const SOURCE_FAMILIES: Record<string, string> = {
  "AP News": "ap",
  "Bloomberg Markets": "bloomberg",
  "Bloomberg Technology": "bloomberg",
  ESPN: "espn",
  "ESPN NBA": "espn",
  "Marc Stein": "marc-stein",
  "Marc Stein (Bluesky)": "marc-stein",
  "NYT Politics": "nyt",
  Reuters: "reuters",
  "Silver Bulletin": "nate-silver",
  "Nate Silver": "nate-silver",
  "The New York Times": "nyt",
  "WSJ Markets": "wsj",
  "WSJ World": "wsj",
};

/** Publisher-owned references used by source preflight and attribution QA. */
export const SYNDICATION_REFERENCES = {
  nasa: "https://www.nasa.gov/rss-feeds/",
  federalReserve: "https://www.federalreserve.gov/feeds/feeds.htm",
  nsf: "https://www.nsf.gov/rss",
  espn: "https://www.espn.com/espn/news/story?page=rssinfo",
  nih: "https://medlineplus.gov/rss.html",
} as const;

function defaultFamily(entry: RegistrySeed): string {
  const explicit = SOURCE_FAMILIES[entry.name];
  if (explicit) return explicit;
  try {
    return new URL(entry.homepageUrl).hostname.replace(/^www\./, "").split(".").slice(0, -1).join("-");
  } catch {
    return entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}

function withPolicy(entry: RegistrySeed): RegistryEntry {
  const tier = entry.credibilityTier ?? (MAJOR_OUTLETS.has(entry.name) ? "major" : entry.sourceClass === "social" ? "social" : "independent");
  return {
    ...entry,
    credibilityTier: tier,
    sourceFamily: entry.sourceFamily ?? defaultFamily(entry),
    pollIntervalMinutes: entry.pollIntervalMinutes ?? (entry.sourceClass === "longform" ? 30 : tier === "major" || entry.sourceClass === "social" ? 5 : 10),
    namedAuthorRequired: entry.namedAuthorRequired ?? (entry.sourceClass === "longform" || (entry.sourceClass === "social" && tier === "social")),
  };
}

/**
 * Curated seed sources. Every URL/handle here was verified live before being
 * added (latest expanded-source preflight: 2026-07-12). Publisher feeds are
 * ingested as attributed headline/excerpt/link records; feed-provided content
 * is never rewritten. The registry is code-owned and synced into the `sources`
 * table on each ingest run; fetch state and `active` live only in the DB.
 */
const SOURCE_SEEDS: RegistrySeed[] = [
  // ── NBA ──────────────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "ESPN NBA", feedUrl: "https://www.espn.com/espn/rss/nba/news", homepageUrl: "https://www.espn.com/nba/", topicHints: ["nba"], qualityPrior: 0.85, syndicationReferenceUrl: SYNDICATION_REFERENCES.espn },
  { kind: "rss", sourceClass: "news", name: "Yahoo Sports NBA", feedUrl: "https://sports.yahoo.com/nba/rss/", homepageUrl: "https://sports.yahoo.com/nba/", topicHints: ["nba"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "CBS Sports NBA", feedUrl: "https://www.cbssports.com/rss/headlines/nba/", homepageUrl: "https://www.cbssports.com/nba/", topicHints: ["nba"], qualityPrior: 0.8 },
  { kind: "substack", sourceClass: "longform", name: "Marc Stein", feedUrl: "https://marcstein.substack.com/feed", homepageUrl: "https://marcstein.substack.com", topicHints: ["nba"], qualityPrior: 0.9 },

  // ── Technology / startups / venture capital ───────────────────────────
  { kind: "rss", sourceClass: "news", name: "TechCrunch", feedUrl: "https://techcrunch.com/feed/", homepageUrl: "https://techcrunch.com", topicHints: ["startups", "vc"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "TechCrunch AI", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", homepageUrl: "https://techcrunch.com/category/artificial-intelligence/", topicHints: ["ai"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "MIT Technology Review AI", feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed", homepageUrl: "https://www.technologyreview.com/topic/artificial-intelligence/", topicHints: ["ai"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "The Verge", feedUrl: "https://www.theverge.com/rss/index.xml", homepageUrl: "https://www.theverge.com", topicHints: ["gadgets", "software"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "Engadget", feedUrl: "https://www.engadget.com/rss.xml", homepageUrl: "https://www.engadget.com", topicHints: ["gadgets"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "Ars Technica", feedUrl: "https://feeds.arstechnica.com/arstechnica/index", homepageUrl: "https://arstechnica.com", topicHints: ["software", "science", "space"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "longform", name: "Stratechery", feedUrl: "https://stratechery.com/feed/", homepageUrl: "https://stratechery.com", topicHints: ["software", "media"], qualityPrior: 0.95 },
  { kind: "substack", sourceClass: "longform", name: "Noahpinion", feedUrl: "https://www.noahpinion.blog/feed", homepageUrl: "https://www.noahpinion.blog", topicHints: ["economy", "us-politics", "startups"], qualityPrior: 0.85 },
  { kind: "substack", sourceClass: "longform", name: "Lenny's Newsletter", feedUrl: "https://www.lennysnewsletter.com/feed", homepageUrl: "https://www.lennysnewsletter.com", topicHints: ["startups", "software"], qualityPrior: 0.8 },
  { kind: "substack", sourceClass: "longform", name: "The Pragmatic Engineer", feedUrl: "https://newsletter.pragmaticengineer.com/feed", homepageUrl: "https://newsletter.pragmaticengineer.com", topicHints: ["software"], qualityPrior: 0.85 },
  { kind: "substack", sourceClass: "longform", name: "Not Boring", feedUrl: "https://www.notboring.co/feed", homepageUrl: "https://www.notboring.co", topicHints: ["startups", "vc"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "longform", name: "Platformer", feedUrl: "https://www.platformer.news/rss/", homepageUrl: "https://www.platformer.news", topicHints: ["software", "media"], qualityPrior: 0.85 },
  { kind: "substack", sourceClass: "longform", name: "Newcomer", feedUrl: "https://www.newcomer.co/feed", homepageUrl: "https://www.newcomer.co", topicHints: ["vc", "startups"], qualityPrior: 0.85 },

  // ── Cybersecurity ─────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "Krebs on Security", feedUrl: "https://krebsonsecurity.com/feed/", homepageUrl: "https://krebsonsecurity.com", topicHints: ["cybersecurity"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "CISA", feedUrl: "https://www.cisa.gov/cybersecurity-advisories/all.xml", homepageUrl: "https://www.cisa.gov/news-events/cybersecurity-advisories", topicHints: ["cybersecurity"], qualityPrior: 0.95 },

  // ── Taiwan ───────────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "Taipei Times", feedUrl: "https://www.taipeitimes.com/xml/index.rss", homepageUrl: "https://www.taipeitimes.com", topicHints: ["taiwan"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "longform", name: "Frozen Garlic", feedUrl: "https://frozengarlic.wordpress.com/feed/", homepageUrl: "https://frozengarlic.wordpress.com", topicHints: ["taiwan"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "longform", name: "Taiwan Insight", feedUrl: "https://www.taiwaninsight.org/feed", homepageUrl: "https://www.taiwaninsight.org", topicHints: ["taiwan"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "longform", name: "Ketagalan Media", feedUrl: "https://ketagalanmedia.com/feed/", homepageUrl: "https://ketagalanmedia.com", topicHints: ["taiwan"], qualityPrior: 0.75 },
  { kind: "rss", sourceClass: "longform", name: "Global Taiwan Institute", feedUrl: "https://globaltaiwan.org/feed/", homepageUrl: "https://globaltaiwan.org", topicHints: ["taiwan"], qualityPrior: 0.8 },

  // ── US politics ──────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "Politico", feedUrl: "https://rss.politico.com/politics-news.xml", homepageUrl: "https://www.politico.com", topicHints: ["us-politics"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "NPR Politics", feedUrl: "https://feeds.npr.org/1014/rss.xml", homepageUrl: "https://www.npr.org/sections/politics/", topicHints: ["us-politics"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "NYT Politics", feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", homepageUrl: "https://www.nytimes.com/section/politics", topicHints: ["us-politics"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "The Hill", feedUrl: "https://thehill.com/homenews/feed/", homepageUrl: "https://thehill.com", topicHints: ["us-politics"], qualityPrior: 0.75 },
  { kind: "substack", sourceClass: "longform", name: "Slow Boring", feedUrl: "https://www.slowboring.com/feed", homepageUrl: "https://www.slowboring.com", topicHints: ["us-politics"], qualityPrior: 0.85 },
  { kind: "substack", sourceClass: "longform", name: "Silver Bulletin", feedUrl: "https://www.natesilver.net/feed", homepageUrl: "https://www.natesilver.net", topicHints: ["us-politics"], qualityPrior: 0.85 },
  { kind: "substack", sourceClass: "longform", name: "The Bulwark", feedUrl: "https://www.thebulwark.com/feed", homepageUrl: "https://www.thebulwark.com", topicHints: ["us-politics"], qualityPrior: 0.75 },

  // ── World / general / business ───────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "BBC World", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", homepageUrl: "https://www.bbc.com/news/world", topicHints: ["world"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "The New York Times", feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", homepageUrl: "https://www.nytimes.com", topicHints: ["world", "us-politics"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "Bloomberg Markets", feedUrl: "https://feeds.bloomberg.com/markets/news.rss", homepageUrl: "https://www.bloomberg.com/markets", topicHints: ["markets", "economy", "world"], qualityPrior: 0.96 },
  { kind: "rss", sourceClass: "news", name: "Bloomberg Technology", feedUrl: "https://feeds.bloomberg.com/technology/news.rss", homepageUrl: "https://www.bloomberg.com/technology", topicHints: ["software", "gadgets", "markets"], qualityPrior: 0.96 },
  { kind: "rss", sourceClass: "news", name: "WSJ World", feedUrl: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews", homepageUrl: "https://www.wsj.com/world", topicHints: ["world", "us-politics"], qualityPrior: 0.95 },
  { kind: "rss", sourceClass: "news", name: "WSJ Markets", feedUrl: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", homepageUrl: "https://www.wsj.com/finance", topicHints: ["markets", "economy"], qualityPrior: 0.95 },
  { kind: "rss", sourceClass: "news", name: "CNBC", feedUrl: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", homepageUrl: "https://www.cnbc.com", topicHints: ["markets", "economy", "world"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "Federal Reserve", feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml", homepageUrl: "https://www.federalreserve.gov", topicHints: ["economy", "markets"], qualityPrior: 0.95, syndicationReferenceUrl: SYNDICATION_REFERENCES.federalReserve },
  { kind: "rss", sourceClass: "news", name: "CNBC Personal Finance", feedUrl: "https://www.cnbc.com/id/10000664/device/rss/rss.html", homepageUrl: "https://www.cnbc.com/personal-finance/", topicHints: ["personal-finance"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "Consumer Financial Protection Bureau", feedUrl: "https://www.consumerfinance.gov/about-us/newsroom/feed/", homepageUrl: "https://www.consumerfinance.gov/consumer-tools/", topicHints: ["personal-finance"], qualityPrior: 0.9 },

  // ── Climate ──────────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "Carbon Brief", feedUrl: "https://www.carbonbrief.org/feed/", homepageUrl: "https://www.carbonbrief.org", topicHints: ["climate"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "NASA Earth Observatory", feedUrl: "https://science.nasa.gov/feed/earth-observatory/image-of-the-day/", homepageUrl: "https://science.nasa.gov/earth/earth-observatory/", topicHints: ["climate", "science"], qualityPrior: 0.9, syndicationReferenceUrl: SYNDICATION_REFERENCES.nasa },

  // ── Culture ──────────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "Nieman Lab", feedUrl: "https://www.niemanlab.org/feed/", homepageUrl: "https://www.niemanlab.org", topicHints: ["media"], qualityPrior: 0.9 },
  { kind: "rss", sourceClass: "news", name: "NPR Film", feedUrl: "https://feeds.npr.org/1045/rss.xml", homepageUrl: "https://www.npr.org/sections/movies/", topicHints: ["film"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "Guardian Film", feedUrl: "https://www.theguardian.com/film/rss", homepageUrl: "https://www.theguardian.com/film", topicHints: ["film"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "NPR Music", feedUrl: "https://feeds.npr.org/1039/rss.xml", homepageUrl: "https://www.npr.org/music/", topicHints: ["music"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "Guardian Music", feedUrl: "https://www.theguardian.com/music/rss", homepageUrl: "https://www.theguardian.com/music", topicHints: ["music"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "NPR Books", feedUrl: "https://feeds.npr.org/1032/rss.xml", homepageUrl: "https://www.npr.org/books/", topicHints: ["books"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "Guardian Books", feedUrl: "https://www.theguardian.com/books/rss", homepageUrl: "https://www.theguardian.com/books", topicHints: ["books"], qualityPrior: 0.85 },

  // ── Science / space / health ─────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "NASA", feedUrl: "https://www.nasa.gov/feed/", homepageUrl: "https://www.nasa.gov", topicHints: ["space", "science"], qualityPrior: 0.95, syndicationReferenceUrl: SYNDICATION_REFERENCES.nasa },
  { kind: "rss", sourceClass: "news", name: "JPL", feedUrl: "https://www.nasa.gov/centers-and-facilities/jpl/feed/", homepageUrl: "https://www.jpl.nasa.gov", topicHints: ["space", "science"], qualityPrior: 0.95, syndicationReferenceUrl: SYNDICATION_REFERENCES.nasa },
  { kind: "rss", sourceClass: "news", name: "NPR Health", feedUrl: "https://feeds.npr.org/1128/rss.xml", homepageUrl: "https://www.npr.org/sections/health-shots/", topicHints: ["health"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "NIH MedlinePlus", feedUrl: "https://medlineplus.gov/groupfeeds/new.xml", homepageUrl: "https://medlineplus.gov/rss.html", topicHints: ["health", "science"], qualityPrior: 0.95, syndicationReferenceUrl: SYNDICATION_REFERENCES.nih },
  { kind: "rss", sourceClass: "news", name: "Nature", feedUrl: "https://www.nature.com/nature.rss", homepageUrl: "https://www.nature.com", topicHints: ["science"], qualityPrior: 0.95 },
  { kind: "rss", sourceClass: "news", name: "National Science Foundation", feedUrl: "https://www.nsf.gov/rss/rss_www_news.xml", homepageUrl: "https://www.nsf.gov/news", topicHints: ["science"], qualityPrior: 0.95, syndicationReferenceUrl: SYNDICATION_REFERENCES.nsf },

  // ── More sports ──────────────────────────────────────────────────────
  { kind: "rss", sourceClass: "news", name: "ESPN Football", feedUrl: "https://www.espn.com/espn/rss/soccer/news", homepageUrl: "https://www.espn.com/soccer/", topicHints: ["football"], qualityPrior: 0.85, syndicationReferenceUrl: SYNDICATION_REFERENCES.espn },
  { kind: "rss", sourceClass: "news", name: "CBS Sports Football", feedUrl: "https://www.cbssports.com/rss/headlines/soccer/", homepageUrl: "https://www.cbssports.com/soccer/", topicHints: ["football"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "ESPN Baseball", feedUrl: "https://www.espn.com/espn/rss/mlb/news", homepageUrl: "https://www.espn.com/mlb/", topicHints: ["baseball"], qualityPrior: 0.85, syndicationReferenceUrl: SYNDICATION_REFERENCES.espn },
  { kind: "rss", sourceClass: "news", name: "CBS Sports Baseball", feedUrl: "https://www.cbssports.com/rss/headlines/mlb/", homepageUrl: "https://www.cbssports.com/mlb/", topicHints: ["baseball"], qualityPrior: 0.8 },
  { kind: "rss", sourceClass: "news", name: "Autosport Formula 1", feedUrl: "https://www.autosport.com/rss/f1/news/", homepageUrl: "https://www.autosport.com/f1/", topicHints: ["formula-1"], qualityPrior: 0.85 },
  { kind: "rss", sourceClass: "news", name: "BBC Formula 1", feedUrl: "https://feeds.bbci.co.uk/sport/formula1/rss.xml", homepageUrl: "https://www.bbc.com/sport/formula1", topicHints: ["formula-1"], qualityPrior: 0.85 },

  // ── Social / real-time ───────────────────────────────────────────────
  { kind: "hn", sourceClass: "social", name: "Hacker News", feedUrl: "topstories", homepageUrl: "https://news.ycombinator.com", topicHints: ["software", "startups"], qualityPrior: 0.7 },
  { kind: "x", sourceClass: "social", name: "X — Curated Journalists", feedUrl: "curated:inflow-v1", homepageUrl: "https://x.com", topicHints: ["world", "us-politics", "markets", "software"], qualityPrior: 0.78, credibilityTier: "social", sourceFamily: "x-curated", pollIntervalMinutes: 5, namedAuthorRequired: true },
  { kind: "bluesky", sourceClass: "social", name: "AP News", feedUrl: "apnews.com", homepageUrl: "https://bsky.app/profile/apnews.com", topicHints: ["world", "us-politics"], qualityPrior: 0.85 },
  { kind: "bluesky", sourceClass: "social", name: "Reuters", feedUrl: "reuters.com", homepageUrl: "https://bsky.app/profile/reuters.com", topicHints: ["world"], qualityPrior: 0.85 },
  { kind: "bluesky", sourceClass: "social", name: "Aaron Rupar", feedUrl: "atrupar.com", homepageUrl: "https://bsky.app/profile/atrupar.com", topicHints: ["us-politics"], qualityPrior: 0.6 },
  { kind: "bluesky", sourceClass: "social", name: "Casey Newton", feedUrl: "caseynewton.bsky.social", homepageUrl: "https://bsky.app/profile/caseynewton.bsky.social", topicHints: ["software", "media"], qualityPrior: 0.75 },
  { kind: "bluesky", sourceClass: "social", name: "ESPN", feedUrl: "espn.com", homepageUrl: "https://bsky.app/profile/espn.com", topicHints: ["nba"], qualityPrior: 0.7 },
  { kind: "bluesky", sourceClass: "social", name: "Nate Silver", feedUrl: "natesilver.bsky.social", homepageUrl: "https://bsky.app/profile/natesilver.bsky.social", topicHints: ["us-politics"], qualityPrior: 0.75 },
  { kind: "bluesky", sourceClass: "social", name: "Marc Stein (Bluesky)", feedUrl: "steinline.bsky.social", homepageUrl: "https://bsky.app/profile/steinline.bsky.social", topicHints: ["nba"], qualityPrior: 0.8 },
];

/** Fully policy-annotated registry used by ingestion and source-health UI. */
export const SOURCE_REGISTRY: RegistryEntry[] = SOURCE_SEEDS.map(withPolicy);
