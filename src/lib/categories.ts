/**
 * Navigation categories — the app's primary structure. Each tab groups one or
 * more classifier topics; "today" is the unfiltered ranked briefing.
 * Order here is tab order.
 */
export interface Category {
  slug: string;
  label: string;
  /** Short label for narrow viewports. */
  shortLabel?: string;
  /** Classifier topics folded into this tab. Empty = all topics. */
  topics: string[];
}

export const CATEGORIES: Category[] = [
  { slug: "today", label: "Today", topics: [] },
  { slug: "nba", label: "NBA", topics: ["nba"] },
  { slug: "tech", label: "Tech / VC", shortLabel: "Tech", topics: ["tech", "ai", "vc"] },
  { slug: "taiwan", label: "Taiwan", topics: ["taiwan"] },
  { slug: "politics", label: "US Politics", shortLabel: "Politics", topics: ["us-politics"] },
  { slug: "world", label: "World", topics: ["world", "business", "science", "media"] },
];

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

/** Which tab an item's topics belong to (first match in tab order wins). */
export function categoryForTopics(topics: string[]): Category | undefined {
  return CATEGORIES.slice(1).find((c) => c.topics.some((t) => topics.includes(t)));
}
