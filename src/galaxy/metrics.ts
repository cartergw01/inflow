import { CATEGORIES } from "../lib/categories";

/**
 * The v2 visual grammar's quantitative layer — every number that drives a
 * visual channel is computed here, pure and tested, so the scene can't drift
 * from the data. See NOTES.md ("Observatory v2").
 */

export interface MetricStory {
  id: number;
  title: string;
  publishedAt: string;
  topics: string[];
  excerpt: string | null;
  sourceClass: string;
  alsoCoveredBy: { sourceName: string }[];
}

const H = 3600_000;

/**
 * Galaxy activity 0..1: recency-weighted story mass. A story counts fully
 * when new and decays with a 24h half-life, so a galaxy swells on a busy
 * news day and shrinks back over the following days.
 */
export function activityIndex(stories: { publishedAt: string }[], now = Date.now()): number {
  const mass = stories.reduce((sum, s) => {
    const ageH = Math.max(0, (now - new Date(s.publishedAt).getTime()) / H);
    return sum + Math.pow(2, -ageH / 24);
  }, 0);
  return Math.tanh(mass / 14);
}

/**
 * Breaking = the pulse channel — and it must stay rare to mean anything.
 * Routine wire trickle is NOT breaking (37 sources produce a <45min story
 * almost always, which would saturate the channel into noise). True only on
 * a genuine burst: a multi-outlet corroborated cluster under 2 hours old,
 * or an unusual density of 3+ fresh news/social stories inside 45 minutes.
 */
export function isBreaking(stories: MetricStory[], now = Date.now()): boolean {
  const corroborated = stories.some(
    (s) => s.alsoCoveredBy.length >= 2 && now - new Date(s.publishedAt).getTime() < 2 * H,
  );
  if (corroborated) return true;
  const burst = stories.filter(
    (s) =>
      now - new Date(s.publishedAt).getTime() < 45 * 60_000 &&
      (s.sourceClass === "news" || s.sourceClass === "social"),
  );
  return burst.length >= 3;
}

/** "412 points · 187 comments on Hacker News" → { points, comments }. */
export function parseHnStats(excerpt: string | null): { points: number; comments: number } | null {
  if (!excerpt) return null;
  const m = excerpt.match(/^(\d+) points · (\d+) comments on Hacker News$/);
  return m ? { points: Number(m[1]), comments: Number(m[2]) } : null;
}

/**
 * Discussion velocity 0..1 — drives orbit speed of a focused story's
 * satellites. Sources of truth: multi-outlet pickup (cluster size) and,
 * for HN stories, the live comment count. Both are real observed signals.
 */
export function discussionVelocity(story: MetricStory): number {
  const cluster = story.alsoCoveredBy.length / 4;
  const hn = parseHnStats(story.excerpt);
  const chatter = hn ? Math.min(hn.comments / 300, 1) : 0;
  return Math.min(1, Math.max(cluster, chatter, story.sourceClass === "social" ? 0.25 : 0));
}

/**
 * Controversy 0..1 — drives orbital instability (never color). Only claimed
 * where we have honest evidence: HN's comments-to-points ratio (the classic
 * "more argument than approval" heuristic). Everything else reports 0 rather
 * than faking a stance model.
 */
export function controversy(story: MetricStory): number {
  const hn = parseHnStats(story.excerpt);
  if (!hn || hn.points < 30) return 0;
  const ratio = hn.comments / hn.points;
  return Math.min(1, Math.max(0, (ratio - 0.8) / 1.2));
}

export interface Bridge {
  storyId: number;
  title: string;
  /** Galaxy slugs this story spans (exactly the first two, by tab order). */
  a: string;
  b: string;
  /** Best (lowest) rank across its galaxies — bridge prominence. */
  rank: number;
}

/**
 * Cross-topic bridges: stories whose topics span two different galaxies.
 * The most useful novelty in the concept — a tabbed UI structurally cannot
 * show these. Deduped by story, ranked by prominence, capped by the caller.
 */
export function computeBridges(
  worlds: { slug: string; entries: MetricStory[] }[],
  max = 5,
): Bridge[] {
  const topicToSlug = new Map<string, string>();
  for (const cat of CATEGORIES) {
    if (cat.topics.length === 0) continue;
    for (const t of cat.topics) topicToSlug.set(t, cat.slug);
  }

  const seen = new Map<number, Bridge>();
  for (const world of worlds) {
    world.entries.forEach((story, rank) => {
      const slugs = [...new Set(story.topics.map((t) => topicToSlug.get(t)).filter((s): s is string => !!s))];
      if (slugs.length < 2) return;
      const existing = seen.get(story.id);
      if (existing) {
        existing.rank = Math.min(existing.rank, rank);
        return;
      }
      seen.set(story.id, { storyId: story.id, title: story.title, a: slugs[0], b: slugs[1], rank });
    });
  }
  return [...seen.values()].sort((x, y) => x.rank - y.rank).slice(0, max);
}
