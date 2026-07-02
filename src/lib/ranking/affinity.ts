import type { Item, Signal, SignalType, Source } from "../../db/schema";
import { affinityKey, type AffinityMap } from "./types";

/**
 * Half-life for learned affinity weights. Two weeks means a taste you stop
 * feeding fades to noise in about a month — fast enough to track shifting
 * interests, slow enough that a vacation doesn't reset the profile.
 */
export const AFFINITY_HALF_LIFE_DAYS = 14;

/**
 * Hard bounds on any single affinity weight. Caps the influence any one
 * dimension can accumulate so a binge on one topic can't permanently drown
 * out everything else (tanh normalization in scoring saturates well before
 * this anyway; the clamp is a backstop).
 */
export const AFFINITY_WEIGHT_MAX = 10;
export const AFFINITY_WEIGHT_MIN = -10;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Maps a behavioral signal to a raw affinity delta.
 *
 * The scale is deliberate: explicit actions (save, more/less like) are worth
 * ~3x an open, because they are unambiguous statements of preference, while
 * an un-opened impression is only a whisper of disinterest (-0.05) — it takes
 * weeks of consistent skipping to equal one "less like this". `read_time`
 * converts seconds to points linearly and caps at 2 so a tab left open
 * doesn't read as enthusiasm.
 *
 * NOTE: the impression penalty must only be applied to impressions that never
 * led to an open — deciding that is the caller's job (it has the signal log).
 */
export function signalWeight(type: SignalType, value = 1): number {
  switch (type) {
    case "impression":
      return -0.05;
    case "open":
      return 1;
    case "read_time":
      return Math.min(value / 60, 2);
    case "save":
      return 3;
    case "unsave":
      return -3;
    case "more_like":
      return 3;
    case "less_like":
      return -3;
    case "hide_source":
      return -5;
  }
}

/**
 * Exponentially decays a stored weight from when it was last updated to `now`
 * with a {@link AFFINITY_HALF_LIFE_DAYS}-day half-life. Applied lazily at
 * read/update time so no background job is needed to keep tastes fresh.
 */
export function decayWeight(weight: number, lastUpdatedAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - lastUpdatedAt.getTime();
  if (elapsedMs <= 0) return weight;
  return weight * Math.pow(2, -elapsedMs / (AFFINITY_HALF_LIFE_DAYS * DAY_MS));
}

function clampWeight(weight: number): number {
  return Math.min(AFFINITY_WEIGHT_MAX, Math.max(AFFINITY_WEIGHT_MIN, weight));
}

/**
 * Applies one signal to a profile's affinity map and returns a new map
 * (the input is never mutated, so callers can diff old vs. new to decide
 * which rows to persist).
 *
 * Every dimension the item touches learns from the signal:
 * - each of the item's topics ("topic" dimension) gets the full delta,
 * - the item's source ("source" dimension, keyed by source id) and author
 *   ("author" dimension, key lowercased) get 0.5x — topics are the primary
 *   taste vocabulary; source/author halos should build more slowly so one
 *   great article doesn't over-commit us to everything an outlet publishes.
 * - EXCEPT `hide_source`, which applies fully to the source: it is literally
 *   a statement about the source, so it must not be softened.
 *
 * Existing weights are decayed to `now` before the delta lands, then clamped
 * to [{@link AFFINITY_WEIGHT_MIN}, {@link AFFINITY_WEIGHT_MAX}].
 */
export function applySignal(
  existing: AffinityMap,
  signal: Pick<Signal, "type" | "value">,
  item: Pick<Item, "topics" | "author">,
  source: Pick<Source, "id">,
  now: Date,
): AffinityMap {
  const delta = signalWeight(signal.type, signal.value);
  const next: AffinityMap = new Map(existing);

  const bump = (key: string, d: number): void => {
    const prev = next.get(key);
    const decayed = prev ? decayWeight(prev.weight, prev.updatedAt, now) : 0;
    next.set(key, { weight: clampWeight(decayed + d), updatedAt: now });
  };

  for (const topic of item.topics) {
    bump(affinityKey("topic", topic), delta);
  }

  const sourceDelta = signal.type === "hide_source" ? delta : delta * 0.5;
  bump(affinityKey("source", String(source.id)), sourceDelta);

  if (item.author) {
    bump(affinityKey("author", item.author.toLowerCase()), delta * 0.5);
  }

  return next;
}
