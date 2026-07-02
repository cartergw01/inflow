import { affinityKey, type AffinityMap, type AlsoCoveredBy, type Candidate, type FeedEntry } from "./types";
import { scoreItem } from "./score";

/**
 * Feed assembly knobs. Defaults live here (not inline) so tests and tuning
 * reference one place, mirroring SCORE_WEIGHTS.
 * - sameTopicPenalty/sameSourcePenalty: subtracted from a candidate's score
 *   when it repeats the previous pick's primary topic/source — enough to
 *   interleave near-ties, not enough to bury a clearly better item.
 * - explorationInterval: every Nth slot is reserved for widening the feed
 *   beyond known tastes (~10% of slots).
 */
export const FEED_DEFAULTS = {
  sameTopicPenalty: 0.35,
  sameSourcePenalty: 0.25,
  explorationInterval: 10,
} as const;

export interface RankFeedOptions {
  /** Maximum number of feed entries to return (default: all candidates). */
  limit?: number;
  sameTopicPenalty?: number;
  sameSourcePenalty?: number;
  explorationInterval?: number;
}

export interface RankFeedInput {
  candidates: Candidate[];
  affinities: AffinityMap;
  seedInterests: readonly string[];
  now: Date;
  opts?: RankFeedOptions;
}

interface ScoredCandidate extends Candidate {
  score: number;
  alsoCoveredBy?: AlsoCoveredBy[];
}

/**
 * True when an item is genuinely outside the profile's known tastes: none of
 * its topics has a positive learned affinity and none is a seed interest.
 * (Negatively-learned topics are still "known" territory, but exploration is
 * about widening — resurfacing disliked topics is the score's job to prevent.)
 */
function isExplorationCandidate(
  candidate: ScoredCandidate,
  affinities: AffinityMap,
  seedInterests: readonly string[],
): boolean {
  return candidate.item.topics.every((topic) => {
    if (seedInterests.includes(topic)) return false;
    const entry = affinities.get(affinityKey("topic", topic));
    return !entry || entry.weight <= 0;
  });
}

/**
 * Collapses items sharing a clusterId (same story, multiple outlets) into one
 * entry — the highest-scoring take wins, the rest become alsoCoveredBy links
 * so corroborating coverage is visible without occupying feed slots.
 */
function collapseClusters(scored: ScoredCandidate[]): ScoredCandidate[] {
  const byCluster = new Map<number, ScoredCandidate[]>();
  const collapsed: ScoredCandidate[] = [];

  for (const candidate of scored) {
    const clusterId = candidate.item.clusterId;
    if (clusterId === null) {
      collapsed.push(candidate);
    } else {
      const group = byCluster.get(clusterId);
      if (group) group.push(candidate);
      else byCluster.set(clusterId, [candidate]);
    }
  }

  for (const group of byCluster.values()) {
    group.sort((a, b) => b.score - a.score || a.item.id - b.item.id);
    const [winner, ...losers] = group;
    collapsed.push(
      losers.length === 0
        ? winner
        : {
            ...winner,
            alsoCoveredBy: losers.map((l) => ({ sourceName: l.source.name, url: l.item.url })),
          },
    );
  }

  return collapsed;
}

/**
 * Assembles the ranked feed: score → cluster-collapse → greedy diversity pick
 * with periodic exploration slots.
 *
 * The pick loop is greedy rather than a global optimization because the
 * penalties only relate adjacent slots — greedy is optimal enough here and
 * keeps the result explainable ("why is this #3?" has a one-line answer).
 *
 * Deterministic given identical inputs: no randomness anywhere. "Epsilon-
 * greedy" exploration means greedy-within-the-exploration-pool — every
 * explorationInterval-th slot (indexes 9, 19, ...) takes the highest-scoring
 * remaining item wholly outside known tastes, falling back to a normal pick
 * when none exists. Ties break by score desc, then item id asc.
 */
export function rankFeed({ candidates, affinities, seedInterests, now, opts }: RankFeedInput): FeedEntry[] {
  const sameTopicPenalty = opts?.sameTopicPenalty ?? FEED_DEFAULTS.sameTopicPenalty;
  const sameSourcePenalty = opts?.sameSourcePenalty ?? FEED_DEFAULTS.sameSourcePenalty;
  const explorationInterval = opts?.explorationInterval ?? FEED_DEFAULTS.explorationInterval;

  const scored: ScoredCandidate[] = candidates.map((c) => ({
    ...c,
    score: scoreItem({ item: c.item, source: c.source, affinities, seedInterests, now }),
  }));

  // Stable order (score desc, id asc) so every "take the first/best" below is
  // deterministic even among exact ties.
  const pool = collapseClusters(scored).sort((a, b) => b.score - a.score || a.item.id - b.item.id);

  const limit = Math.min(opts?.limit ?? pool.length, pool.length);
  const feed: FeedEntry[] = [];
  let prevPrimaryTopic: string | undefined;
  let prevSourceId: number | undefined;
  let havePrev = false;

  while (feed.length < limit) {
    let picked: ScoredCandidate | undefined;
    let exploration = false;

    if ((feed.length + 1) % explorationInterval === 0) {
      const idx = pool.findIndex((c) => isExplorationCandidate(c, affinities, seedInterests));
      if (idx >= 0) {
        picked = pool.splice(idx, 1)[0];
        exploration = true;
      }
    }

    if (!picked) {
      let bestIdx = 0;
      let bestAdjusted = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i];
        let adjusted = c.score;
        if (havePrev) {
          const primaryTopic: string | undefined = c.item.topics[0];
          if (primaryTopic !== undefined && primaryTopic === prevPrimaryTopic) {
            adjusted -= sameTopicPenalty;
          }
          if (c.source.id === prevSourceId) {
            adjusted -= sameSourcePenalty;
          }
        }
        if (adjusted > bestAdjusted) {
          bestAdjusted = adjusted;
          bestIdx = i;
        }
      }
      picked = pool.splice(bestIdx, 1)[0];
    }

    feed.push({
      item: picked.item,
      source: picked.source,
      score: picked.score,
      ...(exploration ? { exploration: true } : {}),
      ...(picked.alsoCoveredBy ? { alsoCoveredBy: picked.alsoCoveredBy } : {}),
    });
    prevPrimaryTopic = picked.item.topics[0];
    prevSourceId = picked.source.id;
    havePrev = true;
  }

  return feed;
}
