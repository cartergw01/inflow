import { NextResponse } from "next/server";
import { after } from "next/server";
import { loadGalaxy } from "../../../lib/feed-data";
import { isStale, runIngest } from "../../../lib/ingest/run";
import { getProfile } from "../../../lib/profile";

export const dynamic = "force-dynamic";

/** The galaxy's single data payload. Freshness backstop mirrors the old feed. */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 401 });

  const galaxy = await loadGalaxy(profile);

  if (await isStale(15)) {
    after(async () => {
      try {
        await runIngest();
      } catch (err) {
        console.error("background ingest failed", err);
      }
    });
  }

  return NextResponse.json(galaxy);
}
