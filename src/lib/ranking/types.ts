import type { AffinityDimension, Item, Source } from "../../db/schema";

/**
 * One learned affinity weight plus the moment it was last touched.
 * `updatedAt` is required because decay is computed lazily: weights are only
 * decayed when they are next read/updated, never on a schedule.
 */
export interface AffinityEntry {
  weight: number;
  updatedAt: Date;
}

/**
 * All of a profile's affinities keyed by `${dimension}:${key}`
 * (e.g. "topic:nba", "source:3", "author:jane chen"). A flat string-keyed map
 * keeps lookups O(1) and makes the ranking functions trivially serializable.
 */
export type AffinityMap = Map<string, AffinityEntry>;

/** A feed candidate: an item joined with its source row. */
export interface Candidate {
  item: Item;
  source: Source;
}

/** A collapsed duplicate — another outlet covering the same story. */
export interface AlsoCoveredBy {
  sourceName: string;
  url: string;
}

/** One slot in the assembled feed. */
export interface FeedEntry {
  item: Item;
  source: Source;
  /** The raw score from scoreItem (diversity penalties are not baked in). */
  score: number;
  /** True when this slot was filled by the exploration policy, not by score. */
  exploration?: boolean;
  /** Other sources covering the same clustered story. */
  alsoCoveredBy?: AlsoCoveredBy[];
}

/**
 * Builds the canonical affinity map key. Centralized so the DB layer, the
 * updater, and the scorer can never drift on the key format.
 */
export function affinityKey(dimension: AffinityDimension, key: string): string {
  return `${dimension}:${key}`;
}
