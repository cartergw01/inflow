import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  affinities,
  mutedSources,
  profiles,
  saves,
  signals,
  type AffinityDimension,
  type SignalType,
} from "../../../db/schema";
import { getProfile } from "../../../lib/profile";
import { loadItemsByIds, loadAffinityMap } from "../../../lib/feed-data";
import { applySignal } from "../../../lib/ranking/affinity";

const VALID_TYPES = new Set<SignalType>([
  "impression", "open", "read_time", "save", "unsave", "more_like", "less_like", "hide_source",
]);
const MAX_BATCH = 100;

interface IncomingSignal {
  itemId: number;
  type: SignalType;
  value?: number;
}

function parseBatch(raw: unknown): IncomingSignal[] {
  if (typeof raw !== "object" || raw === null) return [];
  const list = (raw as { signals?: unknown }).signals;
  if (!Array.isArray(list)) return [];
  const out: IncomingSignal[] = [];
  for (const s of list.slice(0, MAX_BATCH)) {
    if (typeof s !== "object" || s === null) continue;
    const { itemId, type, value } = s as Record<string, unknown>;
    if (typeof itemId !== "number" || !Number.isInteger(itemId)) continue;
    if (typeof type !== "string" || !VALID_TYPES.has(type as SignalType)) continue;
    const v = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 3600)) : 1;
    out.push({ itemId, type: type as SignalType, value: v });
  }
  return out;
}

/**
 * Behavioral signal sink. Accepts batches from the client (sendBeacon posts
 * text/plain, so the body is parsed manually), appends to the signal log,
 * folds each signal into the profile's affinities via the ranking engine,
 * and maintains saves/mutes.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const batch = parseBatch(body);
  if (batch.length === 0) return NextResponse.json({ ok: true, applied: 0 });

  const db = getDb();
  const now = new Date();
  const rows = await loadItemsByIds([...new Set(batch.map((s) => s.itemId))]);
  const byId = new Map(rows.map((r) => [r.item.id, r]));

  let affinityMap = await loadAffinityMap(profile.id);
  const before = affinityMap;
  const signalRows: (typeof signals.$inferInsert)[] = [];

  for (const s of batch) {
    const row = byId.get(s.itemId);
    if (!row) continue;
    signalRows.push({ profileId: profile.id, itemId: s.itemId, type: s.type, value: s.value ?? 1, createdAt: now });
    affinityMap = applySignal(affinityMap, { type: s.type, value: s.value ?? 1 }, row.item, row.source, now);

    if (s.type === "save") {
      await db.insert(saves).values({ profileId: profile.id, itemId: s.itemId }).onConflictDoNothing();
    } else if (s.type === "unsave") {
      await db.delete(saves).where(and(eq(saves.profileId, profile.id), eq(saves.itemId, s.itemId)));
    } else if (s.type === "hide_source") {
      await db
        .insert(mutedSources)
        .values({ profileId: profile.id, sourceId: row.source.id })
        .onConflictDoNothing();
    }
  }

  if (signalRows.length > 0) {
    await db.insert(signals).values(signalRows);
  }

  // Persist only affinity keys the batch actually touched.
  for (const [key, entry] of affinityMap) {
    if (before.get(key) === entry) continue;
    const sep = key.indexOf(":");
    const dimension = key.slice(0, sep) as AffinityDimension;
    const dimKey = key.slice(sep + 1);
    await db
      .insert(affinities)
      .values({ profileId: profile.id, dimension, key: dimKey, weight: entry.weight, updatedAt: entry.updatedAt })
      .onConflictDoUpdate({
        target: [affinities.profileId, affinities.dimension, affinities.key],
        set: { weight: entry.weight, updatedAt: entry.updatedAt },
      });
  }

  await db.update(profiles).set({ lastSeenAt: now }).where(eq(profiles.id, profile.id));
  return NextResponse.json({ ok: true, applied: signalRows.length });
}
