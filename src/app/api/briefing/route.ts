import { NextResponse } from "next/server";
import { loadBriefing } from "../../../lib/feed-data";
import { getProfile, profileRequiredResponse } from "../../../lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getProfile();
  if (!profile) return profileRequiredResponse();

  const briefing = await loadBriefing(profile);
  return NextResponse.json(briefing);
}
