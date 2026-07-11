import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { getProfileId, PROFILE_COOKIE } from "../../../lib/profile";
import { eq } from "drizzle-orm";

const KNOWN_TOPICS = new Set([
  "nba", "tech", "ai", "vc", "taiwan", "us-politics", "world", "business", "science", "media",
]);

/** Creates or tunes the anonymous profile without adding an authentication gate. */
export async function POST(req: NextRequest) {
  let interests: string[] = [];
  try {
    const body = (await req.json()) as { interests?: unknown };
    if (Array.isArray(body.interests)) {
      interests = body.interests.filter((t): t is string => typeof t === "string" && KNOWN_TOPICS.has(t)).slice(0, 10);
    }
  } catch {
    // empty body → empty interests; the feed still works, just colder start
  }

  const db = getDb();
  const existingId = await getProfileId();
  const [profile] = existingId
    ? await db.update(profiles).set({ interests }).where(eq(profiles.id, existingId)).returning()
    : await db.insert(profiles).values({ interests }).returning();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROFILE_COOKIE, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
