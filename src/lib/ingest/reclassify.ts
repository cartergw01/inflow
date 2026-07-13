import { eq, gte } from "drizzle-orm";
import type { Db } from "../../db";
import { items, sources } from "../../db/schema";
import type { SubjectId } from "../subjects";
import { classify } from "./classify";

export const RECLASSIFICATION_WINDOW_DAYS = 7;

export interface ReclassifiableItem {
  id: number;
  title: string;
  excerpt: string | null;
  topics: readonly string[];
  sourceHints: readonly string[];
}

export interface ReclassificationUpdate {
  id: number;
  topics: SubjectId[];
}

function sameTopics(current: readonly string[], next: readonly string[]): boolean {
  return current.length === next.length && current.every((topic, index) => topic === next[index]);
}

/** Pure planning step: unchanged rows are omitted, making repeated runs a no-op. */
export function planReclassification(rows: readonly ReclassifiableItem[]): ReclassificationUpdate[] {
  const updates: ReclassificationUpdate[] = [];
  for (const row of rows) {
    const topics = classify(row.title, row.excerpt, [...row.sourceHints]);
    if (!sameTopics(row.topics, topics)) updates.push({ id: row.id, topics });
  }
  return updates;
}

export async function reclassifyRecentItems(
  db: Db,
  { now = new Date(), windowDays = RECLASSIFICATION_WINDOW_DAYS }: { now?: Date; windowDays?: number } = {},
): Promise<{ scanned: number; updated: number; since: Date }> {
  if (!Number.isFinite(windowDays) || windowDays <= 0) throw new Error("windowDays must be a positive number");
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      excerpt: items.excerpt,
      topics: items.topics,
      sourceHints: sources.topicHints,
    })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(gte(items.publishedAt, since));

  const updates = planReclassification(rows);
  for (const update of updates) {
    await db.update(items).set({ topics: update.topics }).where(eq(items.id, update.id));
  }

  return { scanned: rows.length, updated: updates.length, since };
}
