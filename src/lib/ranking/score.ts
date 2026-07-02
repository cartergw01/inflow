import type { Item, Source, SourceClass } from "../../db/schema";
import { affinityKey, type AffinityMap } from "./types";

/**
 * The scoring formula's term weights, in one place so tests and future
 * tuning reference a single source of truth. Recency carries the largest
 * weight because a news feed's first job is freshness; topic affinity is the
 * strongest personalization term; source/author are supporting halos.
 * qualityPrior keeps reputable outlets slightly ahead on cold start, and
 * seedBoost bridges the gap until real signals exist.
 */
export const SCORE_WEIGHTS = {
  topicAffinity: 1.2,
  sourceAffinity: 0.6,
  authorAffinity: 0.6,
  recency: 1.5,
  qualityPrior: 0.5,
  seedBoost: 0.4,
} as const;

/**
 * Recency half-life per editorial class. A tweet is stale in hours, a news
 * story in a day, an essay stays relevant for days — one decay curve for all
 * three would either bury longform or let social zombies linger.
 */
export const RECENCY_HALF_LIFE_HOURS: Record<SourceClass, number> = {
  social: 3,
  news: 24,
  longform: 96,
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Divisor for tanh normalization of raw affinity weights. tanh(w/3) maps the
 * unbounded-ish accumulated weight into (-1, 1) smoothly: early signals move
 * the score a lot (learning is fast), but the 50th save on a topic barely
 * moves it (saturation), so no single obsession can dominate the formula.
 * At w=3 (one save) the norm is ~0.76 — one strong action gets most of the
 * available boost.
 */
const AFFINITY_TANH_SCALE = 3;

function normalizeAffinity(weight: number): number {
  return Math.tanh(weight / AFFINITY_TANH_SCALE);
}

/**
 * Exponential freshness decay in [0, 1]: 1 at publish time, 0.5 after one
 * class-specific half-life. Future-dated items clamp to 1 rather than
 * exceeding it (feeds sometimes emit slightly-future timestamps).
 */
export function recencyScore(publishedAt: Date, sourceClass: SourceClass, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / HOUR_MS);
  return Math.pow(2, -ageHours / RECENCY_HALF_LIFE_HOURS[sourceClass]);
}

export interface ScoreInput {
  item: Pick<Item, "topics" | "author" | "publishedAt">;
  source: Pick<Source, "id" | "sourceClass" | "qualityPrior">;
  affinities: AffinityMap;
  seedInterests: readonly string[];
  now: Date;
}

/**
 * Scores one candidate item for one profile. Pure and transparent: the score
 * is a weighted sum of normalized affinity terms, freshness, a source quality
 * prior, and a cold-start seed boost — no engagement objective anywhere.
 *
 * The seed boost only applies to seed topics with NO learned affinity entry,
 * so it fades automatically the moment real behavior starts teaching us about
 * that topic (including negative lessons — a learned dislike must not be
 * papered over by the onboarding checklist).
 */
export function scoreItem({ item, source, affinities, seedInterests, now }: ScoreInput): number {
  // Topic affinity: mean of normalized weights over topics we know anything
  // about. Mean (not sum) so multi-topic items aren't advantaged by breadth.
  let topicNormSum = 0;
  let topicCount = 0;
  for (const topic of item.topics) {
    const entry = affinities.get(affinityKey("topic", topic));
    if (entry) {
      topicNormSum += normalizeAffinity(entry.weight);
      topicCount += 1;
    }
  }
  const topicNorm = topicCount > 0 ? topicNormSum / topicCount : 0;

  const sourceEntry = affinities.get(affinityKey("source", String(source.id)));
  const sourceNorm = sourceEntry ? normalizeAffinity(sourceEntry.weight) : 0;

  const authorEntry = item.author
    ? affinities.get(affinityKey("author", item.author.toLowerCase()))
    : undefined;
  const authorNorm = authorEntry ? normalizeAffinity(authorEntry.weight) : 0;

  const recency = recencyScore(item.publishedAt, source.sourceClass, now);

  const hasColdStartSeedTopic = item.topics.some(
    (topic) => seedInterests.includes(topic) && !affinities.has(affinityKey("topic", topic)),
  );
  const seedBoost = hasColdStartSeedTopic ? SCORE_WEIGHTS.seedBoost : 0;

  return (
    SCORE_WEIGHTS.topicAffinity * topicNorm +
    SCORE_WEIGHTS.sourceAffinity * sourceNorm +
    SCORE_WEIGHTS.authorAffinity * authorNorm +
    SCORE_WEIGHTS.recency * recency +
    SCORE_WEIGHTS.qualityPrior * source.qualityPrior +
    seedBoost
  );
}
