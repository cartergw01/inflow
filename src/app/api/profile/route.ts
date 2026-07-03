import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { PROFILE_COOKIE } from "../../../lib/profile";

const KNOWN_TOPICS = new Set([
  "nba", "tech", "ai", "vc", "taiwan", "us-politics", "world", "business", "science", "media",
]);

/** Creates the anonymous profile at onboarding and sets the identity cookie. */
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
  const [profile] = await db.insert(profiles).values({ interests }).returning();

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
