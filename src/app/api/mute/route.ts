import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { mutedSources } from "../../../db/schema";
import { getProfile } from "../../../lib/profile";

/**
 * Source mute toggle from the Sources page. Muting is a hard filter
 * (the ranking-level hide_source signal flows through /api/signals when
 * triggered from a feed item; this endpoint is the explicit settings path).
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 401 });

  let body: { sourceId?: unknown; muted?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const sourceId = body.sourceId;
  if (typeof sourceId !== "number" || !Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const db = getDb();
  if (body.muted) {
    await db.insert(mutedSources).values({ profileId: profile.id, sourceId }).onConflictDoNothing();
  } else {
    await db
      .delete(mutedSources)
      .where(and(eq(mutedSources.profileId, profile.id), eq(mutedSources.sourceId, sourceId)));
  }
  return NextResponse.json({ ok: true });
}
