import { NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { loadGalaxy } from "../../../lib/feed-data";
import { runIngest } from "../../../lib/ingest/run";
import { getProfile, profileRequiredResponse } from "../../../lib/profile";

export const dynamic = "force-dynamic";

/** The galaxy's single data payload. Freshness backstop mirrors the old feed. */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return profileRequiredResponse();

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

  return NextResponse.json(galaxy);
}
