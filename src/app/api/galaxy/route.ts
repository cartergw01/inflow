import { NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { loadGalaxy } from "../../../lib/feed-data";
import { runIngest } from "../../../lib/ingest/run";
import { createDefaultProfile, getProfile, PROFILE_COOKIE } from "../../../lib/profile";

export const dynamic = "force-dynamic";

/** The galaxy's single data payload. Freshness backstop mirrors the old feed. */
export async function GET() {
  const existingProfile = await getProfile();
  const profile = existingProfile ?? await createDefaultProfile();
  const openedAt = new Date();

  const galaxy = await loadGalaxy(profile);

  if (galaxy.freshness.staleSourceCount > 0) {
    after(async () => {
      try {
        await runIngest();
      } catch (err) {
        console.error("background ingest failed", err);
      }
    });
  }

  after(async () => {
    await getDb()
      .update(profiles)
      .set({ lastSeenAt: openedAt, lastFeedOpenedAt: openedAt })
      .where(eq(profiles.id, profile.id));
  });

  const response = NextResponse.json(galaxy);
  if (!existingProfile) {
    response.cookies.set(PROFILE_COOKIE, profile.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
