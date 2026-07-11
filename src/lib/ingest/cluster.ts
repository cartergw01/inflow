/**
 * Same-story detection so one event doesn't fill the feed five times.
 * Cheap and transparent: Jaccard similarity over distinctive title tokens.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "his", "her", "their", "will", "would", "could",
  "should", "has", "have", "had", "not", "no", "new", "after", "before",
  "over", "under", "about", "into", "out", "up", "down", "how", "why", "what",
  "who", "when", "where", "says", "say", "said", "report", "reports",
]);

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  return intersection / union;
}

/** Stable key for a cluster: sorted distinctive tokens of the lead title. */
export function clusterKey(title: string): string {
  return [...titleTokens(title)].sort().join("-").slice(0, 200);
}

/**
 * Threshold below which two headlines are considered different stories.
 * 0.5 Jaccard on distinctive tokens: outlets word the same story differently,
 * so 0.6+ almost never fired on real data; below ~0.45 false-positives rise.
 */
export const CLUSTER_THRESHOLD = 0.5;

export interface Clusterable {
  id: number;
  title: string;
  sourceId: number;
  clusterId: number | null;
  canonicalUrl?: string;
}

/**
 * Finds the best same-story match for `candidate` among `recent` items.
 * Same-source items never cluster (duplicates within a source are handled
 * by canonical-URL uniqueness; a source revisiting a story is an update).
 */
export function findClusterMatch(
  candidate: { title: string; sourceId: number; canonicalUrl?: string },
  recent: Clusterable[],
): Clusterable | null {
  let best: Clusterable | null = null;
  let bestSim = CLUSTER_THRESHOLD;
  for (const other of recent) {
    if (other.sourceId === candidate.sourceId) continue;
    const exactCanonical = Boolean(
      candidate.canonicalUrl &&
      other.canonicalUrl &&
      candidate.canonicalUrl === other.canonicalUrl,
    );
    const sim = exactCanonical ? 1 : titleSimilarity(candidate.title, other.title);
    if (sim >= bestSim) {
      bestSim = sim;
      best = other;
    }
  }
  return best;
}
